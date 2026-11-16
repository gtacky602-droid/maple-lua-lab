import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 await page.waitForFunction(()=>window.lab.frame.auras?.length>0,{},{timeout:15000});
 await page.evaluate(()=>window.lab.action('skill1'));
 await page.waitForFunction(()=>window.lab.frame.reactions?.length>0,{},{timeout:45000});
 const reactions=await page.evaluate(()=>window.lab.frame.reactions);
 await page.locator('canvas').first().screenshot({path:'evidence/reactions-browser.png'});
 if(errors.length)throw Error(errors.join('\n'));
 await fs.writeFile('evidence/reactions-browser.json',JSON.stringify({errors,reactions,livePartyCombat:true},null,2));console.log('Live party combat triggered swirl');
}finally{await browser.close()}
