import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 if(!await page.locator('[data-action="skill3"]').isDisabled())throw Error('traveler exposes Amber skills');
 await page.locator('[data-action="swap"]').click();await page.waitForFunction(()=>window.lab.frame.active===2);
 // Companion may already have placed a decoy before the swap; start the actual
 // manual cast only once her own cooldown and lock are clear.
 await page.waitForFunction(()=>!(window.lab.frame.actors[1].cd.skill3>0)&&window.lab.frame.actors[1].lock===0,null,{timeout:25000});
 await page.locator('[data-action="skill3"]').click();await page.waitForFunction(()=>window.lab.frame.actors[1].cd.skill3>12);
 await page.screenshot({path:'evidence/amber-decoy.png',fullPage:true});
 await page.waitForFunction(()=>window.lab.frame.actors[1].lock===0);
 await page.locator('[data-action="skill4"]').click();await page.waitForFunction(()=>window.lab.frame.actors[1].cd.skill4>8);
 await page.screenshot({path:'evidence/amber-leap.png',fullPage:true});
 if(errors.length)throw Error(errors.join('\n'));
 await fs.writeFile('evidence/amber-browser.json',JSON.stringify({errors,manualDecoy:true,manualLeap:true,travelerButtonsDisabled:true},null,2));
 console.log('Amber manual decoy / leap / actor-specific UI passed');
}finally{await browser.close()}
