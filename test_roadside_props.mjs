import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({channel:'chrome'});
try {
 const page=await browser.newPage();
 await page.addInitScript(()=>{
  window.landmarkDraws=[];
  const draw=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
   if(image.src?.endsWith('-roadside-props.png'))window.landmarkDraws.push({canvas:this.canvas.id,tile:args[0]});
   return draw.call(this,image,...args);
  };
 });
 for(const [node,tiles] of [['liyue-entry',[95]],['liyue-loading-yard',[65,0]],['liyue-river-trail',[0]],['inazuma-road',[0]],['inazuma-shore-hunt',[135,55]],['sumeru-entry',[0]],['sumeru-field',[85]],['sum-kaveh-timberyard',[134,210]]]){
  await page.goto((process.env.LAB_URL??'http://127.0.0.1:19743/')+'map-art.html?placements=live&node='+node+'&tier=4096');
  await page.waitForFunction(tiles=>['png','rect'].every(canvas=>tiles.every(tile=>window.landmarkDraws.some(draw=>draw.canvas===canvas&&draw.tile===tile))),tiles);
  const paths=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>r.name.endsWith('-roadside-props.png')).length);
  assert.equal(paths,1,node);
  if(['inazuma-shore-hunt','sum-kaveh-timberyard'].includes(node))await page.locator('#rect').screenshot({path:'evidence/'+node+'-landmarks.png'});
  console.log(node,'PNG and compressed scenery; atlas requests',paths);
 }
}finally{await browser.close()}
