import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('[data-action="campaign"]').click();await page.waitForFunction(()=>window.lab.frame.campaign?.zone==='town');
 await page.getByText('スキル装着・全100技の制作状況',{exact:true}).click();
 await page.getByLabel('枠1の1番目',{exact:true}).selectOption('SK06');
 await page.locator('#applySlots').click();await page.waitForFunction(()=>window.lab.frame.loadout[0][0]==='SK06');
 await page.locator('#skillSlots button').first().click();await page.waitForFunction(()=>window.lab.frame.rockWall?.hp>0);
 const wall=await page.evaluate(()=>window.lab.frame.rockWall);
 await page.screenshot({path:'evidence/wall-browser.png',fullPage:true});
 if(errors.length)throw Error(errors.join('\n'));
 await fs.writeFile('evidence/wall-browser.json',JSON.stringify({errors,equipped:true,cast:true,wall},null,2));
 console.log('Wall equipped, cast and rendered');
}finally {await browser.close()}
