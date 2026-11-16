import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 if(await page.locator('#skillCatalog tr').count()!==100)throw Error('catalog count');
 await page.locator('[data-action="campaign"]').click();await page.waitForFunction(()=>window.lab.frame.campaign?.zone==='town');
 await page.getByText('スキル装着・全100技の制作状況',{exact:true}).click();
 await page.getByLabel('枠1の2番目',{exact:true}).selectOption('SK02');await page.locator('#applySlots').click();
 await page.waitForFunction(()=>window.lab.frame.loadout[0].length===2);
 await page.locator('#saveProgress').click();await page.waitForFunction(()=>document.getElementById('saveStatus').textContent.includes('保存しました'));
 await page.reload();await page.waitForFunction(()=>window.lab?.frame);await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>window.lab.frame.loadout[0].length===2&&window.lab.frame.campaign?.zone==='town');
 await page.locator('[data-action="field"]').click();await page.waitForFunction(()=>window.lab.frame.campaign?.zone==='field');
 await page.locator('#skillSlots button').first().click();
 await page.waitForFunction(()=>window.lab.frame.events.some(e=>e.actor===1&&e.kind==='cast:skill2'));
 await page.screenshot({path:'evidence/loadout-browser.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 if(errors.length||overflow)throw Error(JSON.stringify({errors,overflow}));
 await fs.writeFile('evidence/loadout-browser.json',JSON.stringify({errors,catalogRows:100,equipAndReload:true,macroCast:true,mobileOverflow:overflow},null,2));
 console.log('100 skill rows, equip/save/reload, macro execution, mobile width passed');
}finally{await browser.close()}
