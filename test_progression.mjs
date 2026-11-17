import {chromium} from 'playwright';import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('[data-action="campaign"]').click();await page.waitForFunction(()=>window.lab.frame.progression);
 await page.locator('[data-action="field"]').click();await page.waitForFunction(()=>window.lab.frame.campaign.zone==='field');
 await page.locator('#auto').click();await page.waitForFunction(()=>window.lab.frame.progression.level>=2,null,{timeout:40000});
 await page.locator('[data-action="town"]').click();await page.waitForFunction(()=>window.lab.frame.campaign.zone==='town');
 const progress=await page.evaluate(()=>window.lab.frame.progression);
 await page.locator('#saveProgress').click();await page.waitForFunction(()=>document.getElementById('saveStatus').textContent.includes('保存しました'));
 await page.reload();await page.waitForFunction(()=>window.lab?.frame);await page.locator('#loadProgress').click();
 await page.waitForFunction(total=>window.lab.frame.progression?.total===total,progress.total);
 assert.match(await page.locator('#progressionStatus').textContent(),/共通Lv.*累計EXP.*基礎/);
 const capFixture=await fs.readFile('work/progression-cap-fixture.json','utf8');
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),capFixture);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>window.lab.frame.progression?.level===200);
 const cap=await page.evaluate(()=>window.lab.frame.progression);
 assert.equal(cap.total,JSON.parse(capFixture).progression.total);
 assert.equal(cap.total-cap.baseXp,4);
 assert.match(await page.locator('#progressionStatus').textContent(),/共通Lv 200.*上限後のEXP.*累計EXP 11,/);
 await page.locator('[data-action="field"]').click();
 await page.waitForFunction(()=>window.lab.frame.campaign.zone==='field');
 await page.locator('#auto').click();
 await page.waitForFunction(total=>window.lab.frame.progression.total>total,cap.total);
 await page.locator('[data-action="town"]').click();
 await page.waitForFunction(()=>window.lab.frame.campaign.zone==='town');
 const after=await page.evaluate(()=>window.lab.frame.progression);
 assert.equal(after.level,200);
 assert.equal(after.overflowXp-cap.overflowXp,after.total-cap.total);
 assert.equal(after.baseXp-cap.baseXp,after.total-cap.total);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.getElementById('saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(total=>window.lab.frame.progression?.total===total,after.total);
 assert.deepEqual(await page.evaluate(()=>window.lab.frame.progression),after);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/progression-browser.json',JSON.stringify({
  errors,killLevelUp:true,saveReload:true,level200ContinuesEarning:true,capRoundtrip:after
 },null,2)+'\n');
 console.log('Shared EXP, real kills, Lv200 overflow and save/reload passed');
}finally{await browser.close()}
