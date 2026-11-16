import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('[data-action="campaign"]').click();await page.waitForFunction(()=>window.lab.frame.progression);
 await page.locator('[data-action="field"]').click();await page.waitForFunction(()=>window.lab.frame.campaign.zone==='field');
 await page.locator('#auto').click();await page.waitForFunction(()=>window.lab.frame.progression.total>=100,null,{timeout:40000});
 await page.locator('[data-action="town"]').click();await page.waitForFunction(()=>window.lab.frame.campaign.zone==='town');
 const progress=await page.evaluate(()=>window.lab.frame.progression);
 await page.locator('#saveProgress').click();await page.waitForFunction(()=>document.getElementById('saveStatus').textContent.includes('保存しました'));
 await page.reload();await page.waitForFunction(()=>window.lab?.frame);await page.locator('#loadProgress').click();
 await page.waitForFunction(total=>window.lab.frame.progression?.total===total,progress.total);
 if(!await page.locator('#progressionStatus').textContent().then(s=>s.includes('共通Lv')))throw Error('missing UI');
 if(errors.length)throw Error(errors.join('\n'));
 await fs.writeFile('evidence/progression-browser.json',JSON.stringify({errors,progress,killLevelUp:true,saveReload:true},null,2));
 console.log('Shared EXP, level-up, save/reload passed');
}finally{await browser.close()}
