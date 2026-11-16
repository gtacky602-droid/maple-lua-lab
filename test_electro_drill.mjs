import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 const panel=page.locator('#encountersPanel');await panel.locator('summary').click();await panel.getByLabel('ボス名で検索').fill('無相の雷');
 await panel.getByRole('button',{name:'試作に挑戦'}).click();await page.waitForFunction(()=>window.lab.frame.boss?.phase==='drill_warning',null,{timeout:60000});
 await page.evaluate(()=>window.lab.action('pause'));await page.waitForFunction(()=>window.lab.frame.paused);
 await page.locator('canvas').first().screenshot({path:'evidence/electro-drill-browser.png'});
 const boss=await page.evaluate(()=>window.lab.frame.boss);
 if(boss.name!=='無相の雷（試作素材）'||errors.length)throw Error(JSON.stringify({boss,errors}));
 await fs.writeFile('evidence/electro-drill-browser.json',JSON.stringify({errors,boss,launchedFromCatalog:true},null,2));console.log('Electro drill telegraph rendered');
}finally{await browser.close()}
