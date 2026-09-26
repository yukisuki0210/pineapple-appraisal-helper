import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const root=new URL('./',import.meta.url);
const files=['index.html','manifest.webmanifest','service-worker.js','icon-192.png','icon-512.png','apple-touch-icon.png'];
const data=await Promise.all(files.map(file=>readFile(new URL(file,root))));
const hash=createHash('sha256');data.forEach(content=>hash.update(content));
const version=hash.digest('hex').slice(0,16);
const output=new URL('dist/',root);await mkdir(output,{recursive:true});
for(const [i,file] of files.entries()){
  const content=file==='service-worker.js'?data[i].toString('utf8').replace(/const CACHE_NAME = '[^']+';/,`const CACHE_NAME = 'pineapple-appraisal-${version}';`):data[i];
  await writeFile(new URL(file,output),content);
}
console.log(`Built ${files.length} files; PWA cache ${version}`);
