import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 const panel=page.locator('#encountersPanel');await panel.locator('summary').click();await panel.getByLabel('ボス名で検索').fill('爆炎樹');await panel.getByRole('button',{name:'試作に挑戦'}).click();
 await page.waitForFunction(()=>window.lab.frame.boss?.name==='爆炎樹（仮素材）');
 await page.waitForFunction(()=>window.lab.frame.boss?.phase==='slam_warning');await page.locator('#pause').click();await page.locator('canvas').first().screenshot({path:'evidence/pyro-regisvine-warning.png'});
 const f=await page.evaluate(()=>window.lab.frame.boss);if(f.core!==6)throw Error('unexpected initial core');if(errors.length)throw Error(errors.join('/'));
 await fs.writeFile('evidence/pyro-regisvine-browser.json',JSON.stringify({errors,enteredFromRegistry:true,warning:f},null,2));console.log('Regisvine entry and telegraph verified');
}finally{await browser.close()}
