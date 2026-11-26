import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 for(const [save,node,objective] of [
  ['natlan-high-second-target-save','natlan-high-trial-steps','上段へ跳んで'],
  ['natlan-river-partial-sweep-save','natlan-river-float-run','残り2体']
 ]){
  await page.goto(process.env.LAB_URL??'http://127.0.0.1:19743/');
  await page.waitForFunction(()=>window.lab?.frame);
  await page.locator('#importSave').setInputFiles('evidence/'+save+'.json');
  await page.waitForFunction(()=>window.lab.frame.story?.quests?.['natlan-two-trials']?.status==='active');
  await page.evaluate(()=>document.activeElement.blur());
  await page.keyboard.press('KeyM');
  await page.locator('#atlasField').selectOption(node);
  const item=page.locator('#atlasRoutes li').filter({hasText:objective});
  await item.waitFor();
  assert.match(await item.innerText(),/1\/2/);
  if(objective==='残り2体')await item.screenshot({path:'evidence/natlan-river-gate-hint.png'});
  console.log(await item.innerText());
  await page.keyboard.press('Escape');
 }
}finally{await browser.close()}
