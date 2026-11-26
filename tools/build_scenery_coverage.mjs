import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 const base=process.env.LAB_URL || 'http://127.0.0.1:9125/';
 await page.goto(new URL('scenery.js',base).href);
 const result=await page.evaluate(async()=>{
  const {sceneryKey,sceneryDefinitions}=await import('./scenery.js');
  const graph=await (await fetch('content/story-graph.json')).json();
  const files=new Set();
  const scenes=new Set();
  const nodes=graph.nodes.map(n=>{
   const frame={campaign:{zone:n.hub?'town':'story:'+n.id},story:{active:true,node:n.id},storyGraph:graph,
    storyLocalLight:n.localLight?{mode:'bright'}:undefined};
   const scenery=sceneryKey(frame);
   const status=scenery==='mondstadt' && n.region!=='モンド'?'fallback_mondstadt':
    ['ナド・クライ特別地域（仮）','ノヴォキッチェヴ（仮構造）'].includes(n.region)?'unconfirmed_concept_image':'regional_temporary_image';
   scenes.add(scenery);
   return {id:n.id,name:n.name,region:n.region,status,scenery};
  });
  for(const [key,d] of Object.entries(sceneryDefinitions)){
   for(const file of [d.file,d.decodedPreview,d.decodedTiers]){
    if(!file)throw Error('Missing background assignment: '+key);
    files.add(file);
   }
  }
  const queue=[...files];
  async function decode(){
   while(queue.length){
    const file=queue.pop();
    const response=await fetch('assets/'+file);
    if(!response.ok)throw Error(file+' '+response.status);
    const image=await createImageBitmap(await response.blob());
    image.close();
   }
  }
  await Promise.all(Array.from({length:3},decode));
  const baseFiles=Object.fromEntries(nodes.map(n=>[n.id,sceneryDefinitions[n.scenery].file]));
  return {nodes,baseFiles,keys:scenes.size,files:files.size,definitions:Object.keys(sceneryDefinitions).length};
 });
 const graph=JSON.parse(await fs.readFile(new URL('../content/story-graph.json',import.meta.url)));
 assert.deepEqual(result.nodes.map(n=>n.id),graph.nodes.map(n=>n.id));
 const assets=new URL('../assets/',import.meta.url);
 const measuredFiles={};
 for(const file of (await fs.readdir(assets)).filter(name=>name.endsWith('-background-generation.json'))){
  const manifest=JSON.parse(await fs.readFile(new URL(file,assets)));
  for(const scene of manifest.scenes??[]){
   if(scene.phase || !scene.node)continue;
   for(const id of [scene.node,...scene.sharedNodes??[]]){
    assert.ok(!Object.hasOwn(measuredFiles,id),'Duplicate background binding: '+id);
    measuredFiles[id]=scene.source;
   }
  }
 }
 assert.deepEqual(measuredFiles,result.baseFiles,'Measured sources must match the displayed base scenery');
 const counts=Object.fromEntries(['regional_temporary_image','fallback_mondstadt','unconfirmed_concept_image'].map(k=>[k,result.nodes.filter(n=>n.status===k).length]));
 const data={
  updated:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date()),
  basis:'tools/build_scenery_coverage.mjs resolves host backgrounds for every authored node and decodes every registered PNG/WebP in Chrome.',
  scope:'Base entry scenery only. Shared lab images are temporary. Story-state overrides, canonical map completeness and production 3D are outside this inventory.',
  ...counts,registered_scenes:result.definitions,base_scenes_used:result.keys,decoded_files:result.files,nodes:result.nodes
 };
 await fs.writeFile(new URL('../content/scenery-coverage.json',import.meta.url),JSON.stringify(data,null,2)+'\n');
 console.log(result.nodes.length,result.keys,result.definitions,result.files,counts);
}finally{await browser.close()}
