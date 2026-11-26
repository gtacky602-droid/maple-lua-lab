import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const groups={
 fontaine:['fontaine-entry','fontaine-hub','fontaine-field'],
 fontaineBerylCoast:['fon-wp-50035','fontaine-beryl-bank','fon-wp-50041','fon-wp-50046'],
 fontaineBerylSluice:['fon-wp-50047'],
 fontaineNorthTidegate:['fon-wp-53858'],
 fontaineNorthHeadland:['fon-wp-53862','fon-wp-55770'],
 fontaineBackstage:['fontaine-stage-watch'],
 fontaineDelivery:['fon-wp-53852','fon-wp-55775','sites-lumidouce-landing'],
 nostoiIslandPier:['fon-wp-68341']
};
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:980,height:1210}});
 await page.goto(new URL('scenery.js',process.env.LAB_URL||'http://127.0.0.1:19745/').href);
 const results=await page.evaluate(async(groups)=>{
  const {drawPlayScenery,sceneryKey,sceneryDefinitions,loadScenery,sceneryStatus}=await import('./scenery.js');
  const {backgroundMeasurements}=await import('./scenery-measurements.js');
  const graph=await (await fetch('content/story-graph.json')).json();
  const examples=new Set(['fon-wp-50035','fon-wp-50047','fontaine-stage-watch','fon-wp-68341']);
  document.body.replaceChildren();
  document.body.style='margin:0;padding:16px;width:900px;background:#17232c;color:white;font:16px sans-serif';
  const header=document.createElement('div');
  header.style='display:grid;grid-template-columns:1fr 1fr;text-align:center';
  for(const title of ['元の背景画像','軽量表示（4,096矩形）']){
   const label=document.createElement('span');label.textContent=title;header.append(label);
  }
  document.body.append(header);
  const results=[];
  for(const [key,ids] of Object.entries(groups))for(const id of ids){
   const node=graph.nodes.find(n=>n.id===id);
   const frame={story:{active:true,node:id},campaign:{zone:node.hub?'town':'story:'+id},storyGraph:graph,platforms:node.platforms,camera:0};
   if(sceneryKey(frame)!==key)throw Error(id+' wrong scene');
   const def=sceneryDefinitions[key],measure=backgroundMeasurements[id];
   if(!measure||!def.decodedPreview||!def.decodedTiers)throw Error(id+' missing measurement or raster');
   const renders=[];
   for(const tier of [0,4096,6144]){
    const file=tier===0?def.file:tier===4096?def.decodedTiers:def.decodedPreview;
    await loadScenery(frame,file);
    if(sceneryStatus(frame,file).state!=='ready')throw Error(id+' failed to load '+file);
    const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;
    const context=canvas.getContext('2d');
    if(drawPlayScenery(context,frame,tier))throw Error(id+' fallback at '+tier);
    const bytes=context.getImageData(0,0,960,540).data;
    if(!bytes.some((v,i)=>i%4===0&&v!==bytes[0]))throw Error(id+' empty canvas');
    renders.push(canvas);
   }
   if(examples.has(id)){
    const title=document.createElement('p');title.textContent=node.name;title.style='margin:12px 0 4px';
    const row=document.createElement('div');row.style='display:flex;gap:4px';
    for(const canvas of renders.slice(0,2)){canvas.style='width:448px;height:252px';row.append(canvas)}
    document.body.append(title,row);
   }
   results.push({id,key,file:def.file,bundle:measure.bundle,packedBytes:measure.bytes});
  }
  return results;
 },groups);
 assert.equal(results.length,16);
 await page.locator('body').screenshot({path:'evidence/fontaine-terrain-comparison.png'});
 await fs.writeFile('evidence/fontaine-terrain-scenes.json',JSON.stringify({tiers:['source',4096,6144],results},null,2)+'\n');
 console.log(results.length+' maps rendered at three settings');
}finally{await browser.close()}
