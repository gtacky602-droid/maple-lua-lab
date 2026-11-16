import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769/compare.html');await page.waitForFunction(()=>window.compareLab?.frame);
 await page.locator('#primoCompare').click();await page.waitForFunction(()=>window.compareLab.frame.boss?.name==='エンシェントヴィシャップ（試作素材）');
 await page.locator('#left').selectOption('png');await page.locator('#right').selectOption('h32c16');await page.waitForFunction(()=>window.compareLab.frame.comparisons[0].profile==='png'&&window.compareLab.frame.comparisons[1].profile==='h32c16');
 await page.locator('.scenes').screenshot({path:'evidence/primo-art-compare.png'});
 const result=await page.evaluate(()=>({t:window.compareLab.frame.t,comparisons:window.compareLab.frame.comparisons.map(f=>({profile:f.profile,commands:f.commands})),pngBoss:window.compareLab.frame.comparisons[0].draws.some(d=>d.kind==='boss_sprite')}));
 if(!result.pngBoss||errors.length)throw Error(JSON.stringify({result,errors}));await fs.writeFile('evidence/primo-art-browser.json',JSON.stringify({errors,...result},null,2));console.log('Boss source PNG and light rectangles rendered at identical tick');
}finally{await browser.close()}