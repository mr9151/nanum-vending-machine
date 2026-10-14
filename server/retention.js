export const RETENTION_MS=7*24*60*60*1000;
export function parseRelativePublishedAt(text,now=Date.now()){
 const matches=[...String(text).matchAll(/(\d+)\s*(분|시간|일|주|개월)\s*전/g)];
 const m=matches.at(-1);if(m){const unit={분:60000,시간:3600000,일:86400000,주:604800000,개월:2592000000}[m[2]];return now-Number(m[1])*unit;}
 if(/방금/.test(text))return now;
 return null;
}
export function pruneExternal(listings,now=Date.now()){
 let removed=0;
 for(const [id,l]of listings){
   if((!l.external&&!l.crawled)||l.orderId||l.status==='reserved')continue;
   const at=l.publishedAt||l.firstSeenAt||l.createdAt;
   if(Number.isFinite(at)&&at<now-RETENTION_MS){listings.delete(id);removed++;}
 }
 return removed;
}
