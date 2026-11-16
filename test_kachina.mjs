import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('[data-action="campaign"]').click();await page.waitForFunction(()=>window.lab.frame.campaign?.zone==='town');
 await page.locator('[data-action="companion:kachina"]').click();await page.waitForFunction(()=>window.lab.frame.companion.id==='kachina');
 await page.locator('#saveProgress').click();await page.waitForFunction(()=>document.getElementById('saveStatus').textContent.includes('保存しました'));
 await page.reload();await page.waitForFunction(()=>window.lab?.frame);await page.locator('#loadProgress').click();await page.waitForFunction(()=>window.lab.frame.companion.id==='kachina');
 await page.locator('[data-action="swap"]').click();await page.waitForFunction(()=>window.lab.frame.active===2);
 await page.locator('[data-action="skill1"]').click();await page.waitForFunction(()=>window.lab.frame.drillTop && window.lab.frame.actors[1].lock===0);
 await page.locator('[data-action="skill3"]').click();await page.waitForFunction(()=>window.lab.frame.companion.climbBoostSeconds>0);
 await page.locator('canvas').first().screenshot({path:'evidence/kachina-browser.png'});
 if(errors.length)throw Error(errors.join('\n'));
 await fs.writeFile('evidence/kachina-browser.json',JSON.stringify({errors,selected:true,persisted:true,controlled:true,topAndClimbBoost:true},null,2));console.log('Companion selected, saved, controlled and support cast');
}finally{await browser.close()}
