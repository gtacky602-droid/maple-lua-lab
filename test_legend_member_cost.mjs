import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const scenes=JSON.parse(await fs.readFile('content/group-legend-openings.json','utf8'));
const browser=await chromium.launch({channel:'chrome',args:['--disable-gpu']});
try {
 const page=await browser.newPage();
 const base=process.env.LAB_URL||'http://127.0.0.1:9125/';
 const panel=page.locator('#legendMemberCost');
 const counts=()=>panel.locator('tbody tr').evaluateAll(rows=>rows.map(row=>({
  name:row.cells[0].textContent,standard:Number(row.cells[1].textContent.replaceAll(',','')),
  current:Number(row.cells[2].textContent.replaceAll(',',''))
 })));
 for(const [node,{parts}] of Object.entries(scenes).filter(([,scene])=>scene.parts.length>1)){
  await page.goto(new URL('map-art.html?placements=live&node='+node,base).href);
  await page.waitForFunction(()=>window.mapArt?.ready);
  await panel.locator('summary').click();
  let standard;
  for(const profile of ['legacy','h48c32','h32c16']){
   await page.locator('#profile').selectOption(profile);
   const rows=await counts();
   assert.deepEqual(rows.map(r=>r.name).sort(),parts.map(p=>p.name).sort());
   const sum=rows.reduce((n,r)=>n+r.current,0);
   const display=await page.locator('#viewportCost').textContent();
   assert.ok(display.includes(sum.toLocaleString('ja-JP')+'個'),display);
   if(!standard)standard=rows.map(r=>r.current);
   assert.deepEqual(rows.map(r=>r.standard),standard);
   console.log(node,profile,rows.map(r=>r.current).join('+'));
  }
  await page.locator('#liveSubject').selectOption(parts[0].id);
  assert.equal((await counts()).length,1);
  await page.locator('#matchSpritePng').check();
  assert.ok(await panel.isHidden());
 }
} finally {await browser.close()}
