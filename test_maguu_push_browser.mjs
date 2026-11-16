import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 const panel=page.locator('#encountersPanel');await panel.locator('summary').click();await panel.getByLabel('ボス名で検索').fill('魔偶剣鬼');await panel.getByRole('button',{name:'試作に挑戦'}).click();await page.waitForFunction(()=>window.lab.frame.boss?.phase==='push');
 await page.evaluate(()=>window.lab.action('pause'));await page.waitForFunction(()=>window.lab.frame.paused);
 await page.locator('canvas').first().screenshot({path:'evidence/maguu-push-browser.png'});
 const boss=await page.evaluate(()=>window.lab.frame.boss);if(errors.length)throw Error(errors.join('/'));await fs.writeFile('evidence/maguu-push-browser.json',JSON.stringify({errors,boss,method:'UI launch and moving mask display; not a complete playthrough'},null,2));console.log('Maguu UI smoke passed');
}finally{await browser.close()}
