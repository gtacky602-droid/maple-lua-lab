import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769/compare.html');await page.waitForFunction(()=>window.compareLab?.frame);
 await page.locator('#maguuCompare').click();await page.waitForFunction(()=>window.compareLab.frame.boss?.name==='魔偶剣鬼');
 await page.locator('#freeze').click();await page.waitForFunction(()=>window.compareLab.frame.boss?.phase==='mask_warning');await page.locator('#freeze').click();
 await page.locator('#left').selectOption('png');await page.locator('#right').selectOption('h32c16');await page.waitForFunction(()=>window.compareLab.frame.comparisons[0].profile==='png'&&window.compareLab.frame.comparisons[1].profile==='h32c16');
 await page.locator('.scenes').screenshot({path:'evidence/maguu-mask-compare.png'});
 const result=await page.evaluate(()=>({t:window.compareLab.frame.t,comparisons:window.compareLab.frame.comparisons.map(f=>({profile:f.profile,commands:f.commands})),pngBoss:window.compareLab.frame.comparisons[0].draws.some(d=>d.kind==='boss_sprite'&&d.source==='maguu-mask-source-v1.png')}));
 if(!result.pngBoss||errors.length)throw Error(JSON.stringify({result,errors}));await fs.writeFile('evidence/maguu-mask-browser.json',JSON.stringify({errors,...result},null,2));console.log('Boss source PNG and light rectangles rendered at identical tick');
}finally{await browser.close()}