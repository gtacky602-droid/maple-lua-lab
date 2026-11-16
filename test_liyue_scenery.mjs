import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 const panel=page.locator('#encountersPanel');await panel.locator('summary').click();await panel.getByLabel('ボス名で検索').fill('無相の岩');await panel.getByRole('button',{name:'試作に挑戦'}).click();await page.waitForFunction(()=>window.lab.frame.boss?.name?.startsWith('無相の岩'));
 await page.evaluate(()=>window.lab.action('pause'));await page.waitForFunction(()=>window.lab.frame.paused);
 await page.locator('canvas').first().screenshot({path:'evidence/liyue-scenery-browser.png'});
 const boss=await page.evaluate(()=>window.lab.frame.boss);if(errors.length)throw Error(errors.join('/'));await fs.writeFile('evidence/liyue-scenery-browser.json',JSON.stringify({errors,boss,method:'UI launch Geo Hypostasis with Liyue background; visual smoke only'},null,2));console.log('Liyue scenery UI smoke passed');
}finally{await browser.close()}

