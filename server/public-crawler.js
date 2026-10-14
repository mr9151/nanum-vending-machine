import {RETENTION_MS,pruneExternal} from './retention.js';
import robotsParser from 'robots-parser';
import {parseJoongnaIndex,parseProduct} from './public-content.js';

export function createPublicCrawler(listings,{request=fetch,enabled=true,maxPages=10,intervalMs=600000}={}){
  const origin='https://web.joongna.com',agent='NanumVending/0.1';
  let policy=null,policyAt=0,nextRequestAt=0,busy=false,pausedUntil=0,queueTail=Promise.resolve();
  const state={source:'joongna',label:'중고나라',state:enabled?'waiting':'disabled',scope:'최근 7일 · 최대 '+Math.min(10,maxPages)+'페이지',intervalSeconds:Math.max(600,intervalMs/1000),lastSuccessAt:null,lastError:null};
  const details=new Map();
  async function raw(url){
    let release;const previous=queueTail;queueTail=new Promise(r=>release=r);await previous;
    try {
    if(Date.now()<pausedUntil)throw Error('수집 일시 중단');
    if(new URL(url).origin!==origin)throw Error('허용되지 않은 출처');
    const delay=nextRequestAt-Date.now();if(delay>0)await new Promise(r=>setTimeout(r,delay));
    nextRequestAt=Date.now()+1500;
    const r=await request(url,{headers:{'User-Agent':agent,Accept:'text/html,text/plain'},redirect:'manual',signal:AbortSignal.timeout(10000)});
    if(r.status===403||r.status===429){pausedUntil=Date.now()+10*60*1000;throw Error('접근 제한으로 수집 대기');}
    if(!r.ok)throw Error('공개 페이지 응답 오류 ('+r.status+')');
    let size=0;const chunks=[];
    for await(const chunk of r.body){size+=chunk.length;if(size>2_000_000)throw Error('페이지 용량 초과');chunks.push(chunk);}
    return Buffer.concat(chunks).toString('utf8');
    } finally {release();}
  }
  async function get(url){
    if(!policy||Date.now()-policyAt>3600000){
      const robotUrl=origin+'/robots.txt';const robots=await raw(robotUrl);
      policy=robotsParser(robotUrl,robots);policyAt=Date.now();
    }
    if(policy.isAllowed(url,agent)!==true)throw Error('robots 수집 제한');
    return raw(url);
  }
  async function run(){
    if(!enabled||busy)return;
    busy=true;pruneExternal(listings);state.state='collecting';
    try{
      const queue=[origin+'/search?category=21'];const seen=new Set();
      for(let n=0;queue.length&&n<Math.min(10,maxPages);n++){
        const url=queue.shift();if(seen.has(url)){n--;continue;}seen.add(url);
        const parsed=parseJoongnaIndex(await get(url));
        if(!parsed.items.length)throw Error('무료나눔 목록 구조 확인 필요');
        for(const row of parsed.items){
          if(row.publishedAt&&row.publishedAt<Date.now()-RETENTION_MS)continue;
          const id='crawl_joongna_'+row.externalId,old=listings.get(id);
          listings.set(id,{...old,...row,id,source:'joongna',sourceLabel:'중고나라',
            region:old?.region||'지역은 원문에서 확인',desc:old?.desc||'',
            image:old?.image||row.image,images:old?.images||(row.image?[row.image]:[]),
            status:old?.status||'open',size:old?.size||'M',emoji:'🎁',
            firstSeenAt:old?.firstSeenAt||Date.now(),createdAt:row.publishedAt||old?.createdAt||Date.now(),syncedAt:Date.now(),crawled:true,
            detailStatus:old?.detailStatus||'pending',contentComplete:old?.contentComplete||false});
        }
        queue.push(...parsed.pages.filter(p=>!seen.has(p)));
      }
      state.state='connected';state.lastSuccessAt=Date.now();state.lastError=null;
    }catch(error){state.state='error';state.lastError=error instanceof Error?error.message:'공개 목록 수집 지연';}
    finally{busy=false;}
  }
  async function enrich(id){
    const item=listings.get(id);if(!item?.crawled||item.source!=='joongna')return item;
    if(item.detailFetchedAt&&Date.now()-item.detailFetchedAt<60000)return item;
    if(details.has(id))return details.get(id);
    const promise=(async()=>{
      try{
        const parsed=parseProduct(await get(item.url));if(!parsed)throw Error('Product 없음');
        item.title=parsed.title||item.title;item.desc=parsed.description;
        item.images=parsed.images;item.image=parsed.image||item.image;
        if(!parsed.free||!parsed.available)item.status='done';
        item.detailStatus='available';item.contentComplete=true;item.detailFetchedAt=Date.now();
      }catch{item.detailStatus='unavailable';item.contentComplete=false;}
      return item;
    })().finally(()=>details.delete(id));
    details.set(id,promise);return promise;
  }
  function status(){pruneExternal(listings);return {...state,count:[...listings.values()].filter(l=>l.crawled&&l.status==='open').length};}
  function install(app){
    app.get('/api/crawl-status',(_req,res)=>res.json(status()));
    if(enabled){void run();const timer=setInterval(run,Math.max(600000,intervalMs));timer.unref();}
  }
  return {run,enrich,status,install};
}
