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
 assert.equal(Object.keys(seen).length,56);
 await fs.writeFile('evidence/sprite-profile-comparison.json',JSON.stringify({scope:'On-screen sprite and attached rectangles, with opening-pose mask and color compared to PNG at the default camera.',arenas:seen},null,2)+'\n');
 const survey=page.locator('#legendProfileSurvey');
 await survey.locator('summary').click();
 for(const path of ['legend-outline-20261128.png','calamitous-tree-outline-20261128.png']){
  const link=survey.locator(`a[href="evidence/${path}"]`);
  assert.ok(await link.isVisible());
  const screenshot=await page.request.get(new URL(await link.getAttribute('href'),page.url()).href);
  assert.equal(screenshot.status(),200);
  assert.match(screenshot.headers()['content-type'],/^image\/png/);
 }
 const links=survey.locator('li a');
 await links.first().waitFor();
 assert.match(await survey.locator('output').textContent(),/56会場.*10会場/);
 const light=Object.entries(seen).map(([node,rows])=>[node,rows.find(row=>row.profile==='h32c16')]);
 for(const [order,compare] of [
  ['rectangles',(a,b)=>b.rectangles-a.rectangles],
  ['overlap',(a,b)=>parseFloat(a.overlap)-parseFloat(b.overlap)],
 ]){
  await survey.locator('select').selectOption(order);
  const expected=[...light].sort((a,b)=>compare(a[1],b[1])).slice(0,10).map(([id])=>id);
  const urls=await links.evaluateAll(anchors=>anchors.map(a=>a.href));
  assert.deepEqual(urls.map(url=>new URL(url).searchParams.get('node')),expected);
 }
 await links.first().click();
 await page.waitForFunction(()=>window.mapArt?.ready&&window.mapArt.backgroundState==='ready');
 await page.locator('#compareSpriteProfiles').click();
 assert.equal(await page.locator('#spriteComparisonStrip canvas').count(),4);
 assert.deepEqual(errors,[]);
 console.log('Three measured profiles at all 56 legend openings, same camera and position.');
} finally {await browser.close();}
