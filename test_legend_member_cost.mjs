import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const scenes={};
for(const name of ['group-legend-openings','field-boss-openings','weekly-opening-parts','stygian-openings']){
 Object.assign(scenes,JSON.parse(await fs.readFile('content/'+name+'.json','utf8')));
}
const browser=await chromium.launch({channel:'chrome',args:['--disable-gpu']});
try {
 const page=await browser.newPage();
 const base=process.env.LAB_URL||'http://127.0.0.1:9125/';
 await page.goto(new URL('sprite-fidelity.js',base).href);
 const known=await page.evaluate(async()=>{
  const {compareMasks}=await import('/sprite-fidelity.js');
  const width=160,height=90;
  const a=new Uint8ClampedArray(width*height*4),b=a.slice();
  // Distinguish top-right color changes from bottom-left silhouette loss.
  for(const x of [82,83]){a.set([80,0,0,255],x*4);b.set([20,0,0,255],x*4)}
  a.set([0,0,0,255],(50*width+10)*4);
  return [compareMasks(a,b,width).locations,compareMasks(a,a,width).locations];
 });
 assert.deepEqual(known,[{shape:{x:0,y:45},color:{x:80,y:0}},{}]);
 const panel=page.locator('#legendMemberCost');
 const counts=()=>panel.locator('tbody tr').evaluateAll(rows=>rows.map(row=>({
  name:row.cells[0].textContent,standard:Number(row.cells[1].textContent.replaceAll(',','')),
  current:Number(row.cells[2].textContent.replaceAll(',','')),savings:row.cells[3].textContent
 })));
 for(const [node,{parts}] of Object.entries(scenes).filter(([,scene])=>scene.parts.length>1)){
  await page.goto(new URL('map-art.html?placements=live&node='+node,base).href);
  await page.waitForFunction(()=>window.mapArt?.ready);
  await panel.locator('summary').click();
  let standard;
  const totals=[];
  for(const profile of ['legacy','h48c32','h32c16']){
   await page.locator('#profile').selectOption(profile);
   const rows=await counts();
   assert.deepEqual(rows.map(r=>r.name).sort(),parts.map(p=>p.name).sort());
   for(const row of rows)assert.equal(row.savings,row.standard?((row.standard-row.current)*100/row.standard).toFixed(1)+'%':'—');
   const sum=rows.reduce((n,r)=>n+r.current,0);
   totals.push(sum);
   const display=await page.locator('#viewportCost').textContent();
   assert.ok(display.includes(sum.toLocaleString('ja-JP')+'個'),display);
   if(!standard)standard=rows.map(r=>r.current);
   assert.deepEqual(rows.map(r=>r.standard),standard);
   console.log(node,profile,rows.map(r=>r.current).join('+'));
  }
  await page.locator('#compareSpriteProfiles').click();
  const measured=await page.locator('#spriteProfileTable tbody tr').evaluateAll(rows=>rows.map(r=>Number(r.cells[1].textContent.replaceAll(',',''))));
  assert.deepEqual(measured,totals,node);
  await page.locator('#measureSprite').click();
  const result=await page.locator('#spriteFidelity').evaluate(el=>JSON.parse(el.dataset.result));
  for(const [kind,point] of Object.entries(result.locations)){
   await page.locator('#differenceCrops [data-crop="'+kind+'"]').click();
   assert.equal(await page.locator('#detailX').inputValue(),String(point.x));
   assert.equal(await page.locator('#detailY').inputValue(),String(point.y));
   const link=new URL(await page.locator('#detailLink').getAttribute('href'),base);
   assert.equal(link.searchParams.get('sampleX'),String(point.x));
   assert.equal(link.searchParams.get('sampleY'),String(point.y));
  }
  if(node==='mond-stygian-dual-court'){
   await page.locator('#differenceCrops [data-crop="color"]').click();
   await page.locator('#sceneryDetail .detail-pair').screenshot({path:'evidence/farka-color-crop-16.png'});
  }
  console.log(node,'16-color crops',JSON.stringify(result.locations),result.meanRgbError);
  await page.locator('#liveSubject').selectOption(parts[0].id);
  assert.equal((await counts()).length,1);
  await page.locator('#matchSpritePng').check();
  assert.ok(await panel.isHidden());
 }
} finally {await browser.close()}
