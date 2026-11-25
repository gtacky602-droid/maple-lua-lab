import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const prior=JSON.parse(await fs.readFile('evidence/group-legend-openings-browser.json','utf8')).verified;
const base=process.env.LAB_URL||'http://127.0.0.1:9117/';
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try {
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 const seen={},errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'map-art.html?node=ninianne-legend-bank&placements=live');
 const exact=['legacy','h48c32','h32c16'];
 for(const [node,reference] of Object.entries(prior)){
  await page.selectOption('#node',node);
  await page.waitForFunction(n=>window.mapArt?.node===n&&window.mapArt.backgroundState==='ready',node);
  assert.ok(await page.locator('#spriteProfileTable').isHidden());
  await page.locator('#compareSpriteProfiles').click();
  const rows=await page.locator('#spriteProfileTable tbody tr').evaluateAll(lines=>lines.map(tr=>({
   profile:tr.querySelector('button').value,rectangles:Number(tr.cells[1].textContent.replaceAll(',','')),
   overlap:tr.cells[2].textContent,error:tr.cells[3].textContent,
  })));
  assert.deepEqual(rows.map(r=>r.profile),exact);
  for(const row of rows){
   const expected=reference.fidelity[row.profile];
   assert.equal(row.overlap,expected.overlapPercent.toFixed(1)+'%',node);
   assert.equal(row.error,expected.meanRgbError.toFixed(2)+' / 255',node);
   assert.ok(row.rectangles>0);
  }
  const camera=await page.locator('#camera').inputValue();
  const selected=page.locator('#spriteProfileTable button[value="h48c32"]');
  await selected.click();
  assert.equal(await selected.getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#profile').inputValue(),'h48c32');
  assert.equal(await page.locator('#camera').inputValue(),camera);
  seen[node]=rows;
 }
 const camera=page.locator('#camera');
 await camera.evaluate(el=>{el.value=Number(el.value)>0?'0':el.max;el.dispatchEvent(new Event('input'))});
 assert.ok(await page.locator('#spriteProfileTable').isHidden());
 assert.deepEqual(errors,[]);
 assert.equal(Object.keys(seen).length,56);
 await fs.writeFile('evidence/sprite-profile-comparison.json',JSON.stringify({scope:'On-screen body rectangles and opening-pose mask/color comparison to PNG; the camera is centered on the default subject group.',arenas:seen},null,2)+'\n');
 console.log('Three measured profiles at all 56 legend openings, same camera and position.');
} finally {await browser.close();}
