// 중고나라 공개 무료나눔 목록을 일반 서버/PC에서 수집해 출시 서버(Cloudflare Worker)로 올립니다.
// 중고나라는 Cloudflare Worker 발신 요청만 403으로 막기 때문에 수집 위치만 옮긴 것이며,
// 수집 규칙은 server/public-crawler.js 그대로입니다(robots 준수, 요청 간 1.5초, 10분 주기, 403/429 시 중단).
//
// 사용법 (나눔자판기 폴더에서):
//   node scripts/joongna-collector.mjs          # 1회 수집 후 업로드
//   node scripts/joongna-collector.mjs --loop   # 10분마다 반복
//   SKIP_IF_RECENT_MIN=8 node scripts/joongna-collector.mjs
//       → 다른 기기(갤럭시 폰 등)가 8분 안에 이미 올렸으면 이번 회차는 건너뜀 (PC를 예비로 둘 때)
// 설정: .env.collector 파일에 INGEST_URL, INGEST_TOKEN (토큰은 Worker 비밀값과 동일)
import {readFileSync} from 'node:fs';
import {createPublicCrawler} from '../server/public-crawler.js';

const env={...Object.fromEntries(
  (()=>{try{return readFileSync(new URL('../.env.collector',import.meta.url),'utf8');}catch{return '';}})()
    .split(/\r?\n/).map(l=>l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map(m=>[m[1],m[2]])),...process.env};
const INGEST_URL=env.INGEST_URL||'https://nanum-vending-api.crypto-sim-cloudflare-pilot.workers.dev/api/ingest/joongna';
if(!env.INGEST_TOKEN){console.error('INGEST_TOKEN 이 없어요 (.env.collector 확인)');process.exit(1);}

const listings=new Map();
const crawler=createPublicCrawler(listings,{enabled:true,maxPages:10,intervalMs:600000});

const SKIP_MIN=Number(env.SKIP_IF_RECENT_MIN)||0;
const STATUS_URL=INGEST_URL.replace(/\/api\/ingest\/joongna$/,'/api/crawl-status');

/** 다른 수집기가 최근에 올렸는지 (중고나라에 같은 요청을 두 번 보내지 않기 위해) */
async function recentlyCollected(){
  if(!SKIP_MIN)return false;
  try{
    const s=await (await fetch(STATUS_URL,{signal:AbortSignal.timeout(10000)})).json();
    return s.via==='collector'&&Date.now()-(Number(s.lastAttemptAt)||0)<SKIP_MIN*60000;
  }catch{return false;}
}

async function once(){
  if(await recentlyCollected()){console.log(new Date().toLocaleString('ko-KR'),`다른 기기가 ${SKIP_MIN}분 안에 수집함 → 건너뜀`);return;}
  await crawler.run();
  const status=crawler.status();
  const items=[...listings.values()].filter(l=>l.crawled&&l.source==='joongna');
  const r=await fetch(INGEST_URL,{method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.INGEST_TOKEN},
    body:JSON.stringify({items,status:{state:status.state,lastSuccessAt:status.lastSuccessAt,lastError:status.lastError}}),
    signal:AbortSignal.timeout(30000)});
  const body=await r.text();
  console.log(new Date().toLocaleString('ko-KR'),`수집 ${status.state} · ${items.length}건 → 업로드 ${r.status} ${body.slice(0,80)}`);
}

await once().catch(e=>console.error('실패:',e.message));
if(process.argv.includes('--loop'))setInterval(()=>once().catch(e=>console.error('실패:',e.message)),600000);
