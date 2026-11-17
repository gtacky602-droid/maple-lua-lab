import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1600,height:1200}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const base=new URL(process.env.LAB_URL||'http://127.0.0.1:8769/');
await page.goto(new URL('compare.html',base).href);await page.waitForFunction(()=>window.compareLab?.samples.length>=3);
const initial=await page.evaluate(()=>({t:compareLab.frame.t,a:compareLab.frame.comparisons[0].commands,b:compareLab.frame.comparisons[1].commands}));if(initial.t!==0||initial.b>=initial.a)throw Error('frozen comparison failed');
await page.screenshot({path:'evidence/comparison-48px.png',fullPage:true});
const profiles=['h32c16','h32c32','h48c16','h48c32','h64c16','h64c32','lossless','legacy','png'];
for(const key of profiles){await page.selectOption('#right',key);await page.waitForFunction(k=>compareLab.frame.comparisons[1].profile===k,key);if(await page.evaluate(()=>compareLab.frame.t)!==0)throw Error('profile switch changed simulation')}
await page.selectOption('#right','h32c16');await page.waitForFunction(()=>compareLab.frame.comparisons[1].profile==='h32c16');await page.screenshot({path:'evidence/comparison-32px.png',fullPage:true});
await page.selectOption('#asset','4');await page.selectOption('#zoom','1');await page.screenshot({path:'evidence/comparison-actual-size.png',fullPage:true});
await page.click('#freeze');await page.keyboard.down('KeyD');try{await page.waitForFunction(()=>compareLab.frame.actors[0].x>250,null,{timeout:8000})}finally{await page.keyboard.up('KeyD')};
const moved=await page.evaluate(()=>compareLab.frame.actors[0].x);if(moved<=250)throw Error('movement failed');
await page.click('#auto');await page.waitForTimeout(500);await page.click('#freeze');await page.waitForFunction(()=>compareLab.frozen&&compareLab.requestedSteps===0);const t=await page.evaluate(()=>compareLab.frame.t);await page.waitForTimeout(300);if(await page.evaluate(()=>compareLab.frame.t)!==t)throw Error('freeze failed');
const times=await page.evaluate(()=>compareLab.frame.comparisons.map(f=>f.t));if(times[0]!==times[1])throw Error('not same state');
await page.selectOption('#density','12');await page.waitForFunction(()=>compareLab.frame.total===36);await page.click('#reset');await page.waitForFunction(()=>compareLab.frame.t===0);
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'evidence/comparison-mobile.png',fullPage:true});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('overflow');
await fs.writeFile('evidence/comparison-test.json',JSON.stringify({errors,initial,moved,times,profiles,checks:['same state','frozen profile switching','eight profiles','original and two variant close-ups','movement','auto','pause','density','reset','mobile width']},null,2));console.log({errors,initial,moved,times});await browser.close();if(errors.length)process.exit(1);
