import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({channel:'chrome'});
try {
 const page=await browser.newPage();
 await page.addInitScript(()=>{
  window.landmarkDraws=[];
  const draw=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
   if(image.src?.endsWith('-roadside-props.png'))window.landmarkDraws.push({canvas:this.canvas.id,tile:args[0],file:image.src.split('/').pop()});
   return draw.call(this,image,...args);
  };
 });
 const guide=JSON.parse(await readFile(new URL('./content/daily-field-guide.json',import.meta.url)));
 const regions={'モンド':'mondstadt','璃月':'liyue','稲妻':'inazuma','スメール':'sumeru','フォンテーヌ':'fontaine','ナタ':'natlan','ナド・クライ':'nod','スネージナヤ':'snezhnaya'};
 const destinations=new Map(guide.quests.map(quest=>[quest.node,regions[quest.region]]));
 const knownTiles=new Map([['liyue-entry',[95]],['liyue-loading-yard',[65,0]],['liyue-river-trail',[0]],['inazuma-road',[0]],['inazuma-shore-hunt',[135,55]],['sumeru-entry',[0]],['sumeru-field',[85]],['sum-kaveh-timberyard',[134,210]]]);
 for(const [node,region] of destinations){
  assert.ok(region,node);
  const tiles=knownTiles.get(node)??[];
  await page.goto((process.env.LAB_URL??'http://127.0.0.1:19743/')+'map-art.html?placements=live&node='+node+'&tier=4096');
  await page.waitForFunction(({tiles,file})=>['png','rect'].every(canvas=>{
   const seen=window.landmarkDraws.filter(draw=>draw.canvas===canvas && draw.file===file);
   return seen.length && tiles.every(tile=>seen.some(draw=>draw.tile===tile));
  }),{tiles,file:region+'-roadside-props.png'});
  const paths=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>r.name.endsWith('-roadside-props.png')).length);
  assert.equal(paths,1,node);
  if(['fontaine-outskirts-loading','white-pass-cut','natlan-riverside-range','nod-tide-scrapyard','mond-old-ground'].includes(node))await page.locator('#rect').screenshot({path:'evidence/'+node+'-landmarks.png'});
  console.log(node,'PNG and compressed scenery; atlas requests',paths);
 }
}finally{await browser.close()}
