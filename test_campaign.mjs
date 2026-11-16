import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1080}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:8769');
await page.waitForFunction(()=>window.lab?.frame);
for(const [action,field,value] of [['campaign','zone','town'],['accept','quest','hunt'],['field','zone','field']]){
 await page.locator(`[data-action="${action}"]`).click();
 await page.waitForFunction(([k,v])=>window.lab.frame.campaign?.[k]===v,[field,value]);
}
await page.locator('#auto').click();
await page.waitForFunction(()=>window.lab.frame.campaign?.quest==='boss',null,{timeout:60000});
await page.locator('[data-action="arena"]').click();
await page.waitForFunction(()=>window.lab.frame.boss?.hp>0);
await page.screenshot({path:'evidence/campaign-arena.png',fullPage:true});
const result={errors,quest:await page.locator('#quest').textContent(),autoHuntPassed:true};
await page.locator('[data-action="town"]').click();
await page.waitForFunction(()=>window.lab.frame.campaign?.zone==='town');
await page.setViewportSize({width:390,height:844});
await page.screenshot({path:'evidence/campaign-mobile.png',fullPage:true});
if(errors.length)throw Error(errors.join('\n'));
await fs.writeFile('evidence/campaign-browser.json',JSON.stringify(result,null,2));
await browser.close();console.log(JSON.stringify(result));
