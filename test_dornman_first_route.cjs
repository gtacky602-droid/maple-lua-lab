const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({channel:'chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:9118');
  await page.waitForFunction(()=>window.lab?.frame);
  await page.locator('#importSave').setInputFiles('work/dornman-first-ascent.json');
  await page.waitForFunction(()=>window.lab.frame.story?.node==='dornman-camp');
  await page.evaluate(()=>document.activeElement.blur());
  await page.keyboard.press('KeyM');
  await page.locator('#worldAtlas').waitFor();
  await page.locator('#atlasField').selectOption('dornman-flag-trestle');
  await page.waitForFunction(()=>window.lab.frame.worldMap?.selected?.id==='dornman-flag-trestle');
  await page.locator('#atlasItineraryStops li button').first().waitFor();
  const list=page.locator('#atlasItineraryStops li button');
  assert.equal(await list.count(),2);
  assert.match(await list.nth(0).innerText(),/潮風の見晴らし道.*必要Lv160/);
  assert.match(await list.nth(1).innerText(),/合図旗の渡り廊下.*昇降機.*必要Lv168/);
  await page.locator('#atlasItinerary').screenshot({path:'evidence/dornman-first-ascent.png'});
  console.log('M map shows staircase and lift with the two entry levels.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
