import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('[data-action="campaign"]').click();await page.waitForFunction(()=>window.lab.frame.campaign?.zone==='town');
 await page.getByText('スキル装着・全100技の制作状況',{exact:true}).click();
 for(const [i,id] of ['SK60','SK03','SK09'].entries())await page.getByLabel(`枠1の${i+1}番目`,{exact:true}).selectOption(id);
 await page.locator('#applySlots').click();await page.waitForFunction(()=>window.lab.frame.loadout[0][2]==='SK09');
 await page.locator('#saveProgress').click();await page.waitForFunction(()=>document.getElementById('saveStatus').textContent.includes('保存しました'));
 await page.locator('#skillSlots button').first().click();await page.waitForFunction(()=>window.lab.frame.skillNotice?.includes('100'));
 await page.evaluate(()=>{const key='maple-lua-lab.checkpoint.v1';const saved=JSON.parse(localStorage.getItem(key));saved.gauge=100;localStorage.setItem(key,JSON.stringify(saved));});
 await page.reload();await page.waitForFunction(()=>window.lab?.frame);await page.locator('#loadProgress').click();await page.waitForFunction(()=>window.lab.frame.loadout[0][2]==='SK09');
 await page.locator('#skillSlots button').first().click();await page.waitForFunction(()=>window.lab.frame.ultimate?.seconds>0 && window.lab.frame.gauge===0 && window.lab.frame.draws.some(d=>d.color==='#fff2c4'));
 await page.locator('canvas').first().screenshot({path:'evidence/ultimate-browser.png'});
 if(errors.length)throw Error(errors.join('\n'));
 await fs.writeFile('evidence/ultimate-browser.json',JSON.stringify({errors,macroAssigned:true,persisted:true,ultimateRendered:true,gaugeFixture:100},null,2));console.log('Fusion skills assigned, persisted, cast and rendered');
}finally{await browser.close()}