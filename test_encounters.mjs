import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 const panel=page.locator('#encountersPanel');await panel.locator('summary').click();await page.waitForFunction(()=>document.querySelectorAll('[data-encounter]').length===66);
 await panel.getByLabel('ボス名で検索').fill('氷風組曲');if(await panel.locator('[data-encounter]').count()!==2)throw Error('suite variants missing');
 if(await panel.getByRole('button',{name:'制作中'}).count()!==2)throw Error('unimplemented state missing');
 for(const b of await panel.getByRole('button',{name:'制作中'}).all())if(await b.isEnabled())throw Error('unimplemented battle enabled');
 await panel.getByLabel('ボス名で検索').fill('');await panel.getByLabel('ボスの分類').selectOption('stygian');if(await panel.locator('[data-encounter]').count()!==3)throw Error('stygian missing');
 await panel.getByLabel('挑戦可能のみ').check();if(await panel.locator('[data-encounter]').count()!==1)throw Error('playable filter');
 await panel.getByRole('button',{name:'試作に挑戦'}).click();await page.waitForFunction(()=>window.lab.frame.boss?.name==='ファルカ模擬戦');
 await panel.screenshot({path:'evidence/encounters-browser.png'});if(errors.length)throw Error(errors.join('/'));
 await fs.writeFile('evidence/encounters-browser.json',JSON.stringify({errors,allCandidates:66,suiteVariants:2,stygianCandidates:3,disabledUnimplemented:true,launchVerified:'boss_farka'},null,2));console.log('Encounter filters and launch verified');
}finally{await browser.close()}
