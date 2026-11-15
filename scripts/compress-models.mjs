import fs from 'node:fs';
import {gzipSync} from 'node:zlib';
// optimize-anatomy leaves uncompressed chunks. The viewer ships gzip only, so this
// step writes .bin.gz, points the manifest at those files, and deletes the raw bins.
// mtime is pinned so a rebuild from the same bytes does not churn the gzip header.
const base=new URL('../public/models/',import.meta.url);
for(const name of fs.readdirSync(base).filter(n=>n==='atlas.json')){
 const path=new URL(name,base),atlas=JSON.parse(fs.readFileSync(path));
 let bytes=0;
 for(const c of atlas.chunks){
  const published=c.url.split('/').pop();
  const rawName=published.endsWith('.gz')?published.slice(0,-3):published;
  const rawUrl=new URL(rawName,base);
  if(!fs.existsSync(rawUrl))throw new Error(`Missing uncompressed ${rawName}. Run optimize-anatomy first; compress-models will not recompress an already published chunk.`);
  const raw=fs.readFileSync(rawUrl),compressed=gzipSync(raw,{level:9,mtime:0});
  const gzName=`${rawName}.gz`;
  fs.writeFileSync(new URL(gzName,base),compressed);
  fs.unlinkSync(rawUrl);
  c.url=`/models/${gzName}`;c.bytes=raw.length;c.gzipBytes=compressed.length;delete c.gzip;bytes+=compressed.length;
 }
 if(typeof atlas.partCount!=='number')atlas.partCount=atlas.parts.length;
 if(typeof atlas.conceptCount!=='number')atlas.conceptCount=atlas.concepts.length;
 fs.writeFileSync(path,JSON.stringify(atlas));
 console.log(`${name}: ${(bytes/1e6).toFixed(1)} MB gzip payload, raw chunks removed`);
}
