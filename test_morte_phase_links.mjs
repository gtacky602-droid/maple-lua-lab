import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({channel:'chrome'});
const room='chassanion-legend-bubble-room',quest='fon-morte-sluice-survey';
try{
 const page=await browser.newPage();
 for(const phase of ['before','after']){
  const after=phase==='after',source=after?'morte-tower-sluice':'fon-wp-55765';
  await page.goto(process.env.LAB_URL??'http://127.0.0.1:19743/');
  await page.waitForFunction(()=>window.lab?.frame);
  await page.locator('#importSave').setInputFiles('work/morte-phase-'+phase+'.json');
  await page.waitForFunction(({q,after})=>window.lab.frame.story?.quests?.[q]?.status===(after?'complete':'active'),{q:quest,after});
  await page.evaluate(()=>document.activeElement.blur());
  await page.keyboard.press('KeyM');
  await page.locator('#atlasField').selectOption(room);
  const entrance=page.locator('#atlasBossEntrances li a');
  await page.locator('#atlasBossEntrances summary').click();
  await entrance.waitFor();
  assert.equal(await entrance.count(),1);
  const gateUrl=new URL(await entrance.getAttribute('href'),page.url());
  assert.equal(gateUrl.searchParams.get('node'),source);
  assert.equal(gateUrl.searchParams.get('afterArrival'),after?room:null);
  const boss=page.locator('#atlasBossCompare');
  const [pose]=await Promise.all([page.waitForEvent('popup'),boss.click()]);
  const background=after?'bygone-resonance-background-v1.png':'morte-bubble-room-background-v1.png';
  await pose.waitForFunction(bg=>window.mapArt?.backgroundFile===bg&&window.mapArt.ready,background);
  assert.equal(await pose.locator('#profile').inputValue(),'h32c16');
  await pose.close();
  const [gate]=await Promise.all([page.waitForEvent('popup'),entrance.click()]);
  const arrival=gate.locator('#gatePreview a');
  await arrival.waitFor();
  const href=await arrival.getAttribute('href');
  await gate.goto(new URL(href,gate.url()).href);
  await gate.waitForFunction(bg=>window.mapArt?.ready&&window.mapArt.backgroundFile===bg,background);
  assert.equal(await gate.locator('#sceneryPhase').inputValue(),phase);
  const exits=gate.locator('#gatePreview select option[data-to]');
  assert.deepEqual(await exits.evaluateAll(items=>items.map(o=>o.dataset.to)),[source]);
  await gate.locator('#sceneryPhase').selectOption(after?'before':'after');
  assert.deepEqual(await exits.evaluateAll(items=>items.map(o=>o.dataset.to)),[after?'fon-wp-55765':'morte-tower-sluice']);
  await gate.close();
  console.log(phase,source,background);
 }
}finally{await browser.close()}
