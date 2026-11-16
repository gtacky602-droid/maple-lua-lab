import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage();const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:8769');
await page.waitForFunction(()=>window.lab?.frame);
await page.locator('#saveProgress').click();
await page.waitForFunction(()=>document.getElementById('saveStatus').textContent.includes('冒険を開始'));
await page.locator('[data-action="campaign"]').click();
await page.waitForFunction(()=>window.lab.frame.campaign);
await page.locator('[data-action="accept"]').click();
await page.waitForFunction(()=>window.lab.frame.campaign.quest==='hunt');
await page.locator('#saveProgress').click();
await page.waitForFunction(()=>document.getElementById('saveStatus').textContent.includes('保存しました'));
const saved=await page.evaluate(()=>localStorage.getItem('maple-lua-lab.checkpoint.v1'));
await page.reload();await page.waitForFunction(()=>window.lab?.frame);
await page.locator('#loadProgress').click();
await page.waitForFunction(()=>window.lab.frame.campaign?.quest==='hunt'&&window.lab.frame.campaign.zone==='town');
// Rejected corrupted data must not replace the live session.
const result=await page.evaluate(async()=>{
 const session=window.lab.frame.session;
 const response=await fetch('/api/frame',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session,restore:{version:99}})});
 const valid=await fetch('/api/frame',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session,steps:0})});
 return {rejected:response.status,stillSame:(await valid.json()).session===session};
});
if(result.rejected!==400||!result.stillSame||errors.length)throw Error(JSON.stringify({result,errors}));
await fs.writeFile('evidence/savegame-browser.json',JSON.stringify({reloadResumed:true,saved:JSON.parse(saved),...result,errors},null,2));
await browser.close();console.log('Browser save / reload / invalid restore passed');
