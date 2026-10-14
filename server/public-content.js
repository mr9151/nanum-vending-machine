import {parseRelativePublishedAt} from './retention.js';
import {load} from 'cheerio';
export function safeImage(raw) {
  try {const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password?u.toString():null;}catch{return null;}
}
export function parseProduct(html) {
  const $=load(html);let product;
  for(const el of $('script[type="application/ld+json"]').toArray()){
    try{
      const data=JSON.parse($(el).text());
      const nodes=Array.isArray(data)?data:[data,...(data['@graph']||[])];
      product=nodes.find(n=>n?.['@type']==='Product');if(product)break;
    }catch{}
  }
  if(!product)return null;
  const offers=Array.isArray(product.offers)?product.offers[0]:product.offers;
  const price=offers?.price;
  const images=[...new Set((Array.isArray(product.image)?product.image:[product.image]).map(safeImage).filter(Boolean))].slice(0,20);
  const description=String(product.description||'').slice(0,1000);
  return {
    title:String(product.name||'').slice(0,100),description,images,image:images[0]||null,
    free:(price===0||price==='0')&&offers?.priceCurrency==='KRW',
    available:/\/InStock$/.test(String(offers?.availability||'')),
    // Only the published Product fields; no seller names, phones or hidden app state.
  };
}
export function parseJoongnaIndex(html,now=Date.now()) {
  const $=load(html),items=[],pages=[];
  for(const el of $('a[href]').toArray()){
    const href=$(el).attr('href');let url;
    try{url=new URL(href,'https://web.joongna.com');}catch{continue;}
    if(url.hostname!=='web.joongna.com')continue;
    if(url.pathname==='/search'&&url.searchParams.get('category')==='21'&&/^\d+$/.test($(el).text().trim()))pages.push(url.toString());
    if(!/^\/product\/\d+$/.test(url.pathname)||!$(el).text().includes('무료나눔'))continue;
    const image=safeImage($(el).find('img').first().attr('src'));
    const title=($(el).find('img').first().attr('alt')||'').replace(/ 이미지$/,'').trim();
    if(!title)continue;
    items.push({publishedAt:parseRelativePublishedAt($(el).text(),now),externalId:url.pathname.split('/').pop(),url:url.toString(),title,image});
  }
  return {items,pages:[...new Set(pages)]};
}
