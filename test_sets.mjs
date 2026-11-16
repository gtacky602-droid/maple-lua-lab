import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('[data-action="campaign"]').click();await page.waitForFunction(()=>window.lab.frame.campaign?.zone==='town');
 await page.getByText('聖遺物バッグ・5部位装備',{exact:true}).click();
 await page.locator('[data-action="target_set:troupe"]').click();await page.waitForFunction(()=>window.lab.frame.inventory.targetSet==='troupe');
 await page.locator('[data-action="artifact_samples"]').click();await page.waitForFunction(()=>window.lab.frame.inventory.items.length===5);
 for(let i=0;i<4;i++){await page.locator('#inventoryRows > div').nth(i).getByRole('button',{name:'操作中キャラに装備'}).click();await page.waitForFunction(n=>window.lab.frame.inventory.items[n].owner===1,i)}
 await page.waitForFunction(()=>window.lab.frame.actors[0].troupe4&&window.lab.frame.actors[0].critRate>.1);
 await page.locator('#saveProgress').click();await page.waitForFunction(()=>document.getElementById('saveStatus').textContent.includes('保存しました'));
 await page.reload();await page.waitForFunction(()=>window.lab?.frame);await page.locator('#loadProgress').click();await page.waitForFunction(()=>window.lab.frame.actors[0].troupe4);
 if(errors.length)throw Error(errors.join('\n'));
 await fs.writeFile('evidence/sets-browser.json',JSON.stringify({errors,targetedSet:true,fourPiece:true,criticalRate:true,saveReload:true},null,2));console.log('Target set, four piece, crit rate and save restore passed');
}finally{await browser.close()}
