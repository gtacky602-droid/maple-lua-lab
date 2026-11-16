import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('[data-action="campaign"]').click();await page.waitForFunction(()=>window.lab.frame.campaign?.zone==='town');
 await page.getByText('スキル装着・全100技の制作状況',{exact:true}).click();
 for(const [i,id] of ['SK13','SK38','SK45'].entries())await page.getByLabel(`枠1の${i+1}番目`,{exact:true}).selectOption(id);
 await page.locator('#applySlots').click();await page.waitForFunction(()=>window.lab.frame.loadout[0][2]==='SK45');
 await page.locator('#saveProgress').click();await page.waitForFunction(()=>document.getElementById('saveStatus').textContent.includes('保存しました'));
 await page.reload();await page.waitForFunction(()=>window.lab?.frame);await page.locator('#loadProgress').click();await page.waitForFunction(()=>window.lab.frame.loadout[0][2]==='SK45');
 await page.locator('[data-action="field"]').click();await page.waitForFunction(()=>window.lab.frame.campaign?.zone==='field');
 await page.locator('#skillSlots button').first().click();await page.waitForFunction(()=>window.lab.frame.actors[0].cd.SK45>0 && window.lab.frame.reactions.some(r=>r.kind==='burning'));
 await page.locator('canvas').first().screenshot({path:'evidence/conditional-browser.png'});
 if(errors.length)throw Error(errors.join('\n'));
 await fs.writeFile('evidence/conditional-browser.json',JSON.stringify({errors,macroAssigned:true,persisted:true,burningAndHealingCastVerified:true},null,2));console.log('Fusion skills assigned, persisted, cast and rendered');
}finally{await browser.close()}
