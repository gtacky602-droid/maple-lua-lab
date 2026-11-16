import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 await page.getByRole('button',{name:'幽境：ファルカ模擬戦',exact:true}).click();
 await page.waitForFunction(()=>window.lab.frame.boss?.phase==='charge_warning');
 await page.getByRole('button',{name:/一時停止/}).click();
 await page.locator('canvas').first().screenshot({path:'evidence/farka-warning.png'});
 const f=await page.evaluate(()=>({boss:window.lab.frame.boss,location:window.lab.frame.location,story:window.lab.frame.story.active}));
 if(f.story||f.boss.name!=='ファルカ模擬戦')throw Error('wrong encounter');
 if(errors.length)throw Error(errors.join('/'));
 await fs.writeFile('evidence/farka-browser.json',JSON.stringify({errors,...f},null,2));console.log('Farka browser entry and warning verified');
}finally{await browser.close()}
