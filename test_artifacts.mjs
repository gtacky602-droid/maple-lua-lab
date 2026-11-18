import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('[data-action="campaign"]').click();await page.waitForFunction(()=>window.lab.frame.campaign?.zone==='town');
 await page.getByText('聖遺物バッグ・5部位装備',{exact:true}).click();
 await page.locator('[data-action="artifact_samples"]').click();await page.waitForFunction(()=>window.lab.frame.inventory.items.length===5);
 await page.locator('#inventoryRows > div').nth(1).getByRole('button',{name:'操作中キャラに装備'}).click();
 await page.waitForFunction(()=>window.lab.frame.actors[0].atk>4);
 const attack=await page.evaluate(()=>window.lab.frame.actors[0].atk);
 await page.locator('#saveProgress').click();await page.waitForFunction(()=>document.getElementById('saveStatus').textContent.includes('保存しました'));
 await page.reload();await page.waitForFunction(()=>window.lab?.frame);await page.locator('#loadProgress').click();
 await page.waitForFunction(n=>window.lab.frame.actors[0].atk===n,attack);
 await page.getByText('聖遺物バッグ・5部位装備',{exact:true}).click();
 await page.screenshot({path:'evidence/artifacts-browser.png',fullPage:true});
 const row=page.locator('#inventoryRows > div').first();
 await row.getByRole('button',{name:'ロック',exact:true}).click();
 await page.waitForFunction(()=>window.lab.frame.inventory.items[0].locked===true);
 if(!await row.getByRole('button',{name:/売却/}).isDisabled())throw Error('locked sale enabled');
 await row.getByRole('button',{name:'ロック解除',exact:true}).click();
 await page.waitForFunction(()=>window.lab.frame.inventory.items[0].locked===false);
 const before=await page.evaluate(()=>window.lab.frame.mora);
 await row.getByRole('button',{name:/売却/}).click();
 await page.waitForFunction(()=>window.lab.frame.inventory.items.length===4);
 const after=await page.evaluate(()=>window.lab.frame.mora);
 if(after-before!==630)throw Error('sale price mismatch');
 // Load a legal checkpoint with loot waiting far from the field entrance.
 await page.evaluate(()=>{
  const key='maple-lua-lab.checkpoint.v1',save=JSON.parse(localStorage.getItem(key));
  save.inventory.ground=Array.from({length:16},(_,offset)=>({
   item:{...save.inventory.items[0],id:save.inventory.nextId+offset,owner:0},x:2580,y:480,zone:'field',
  }));
  save.inventory.nextId+=16;
  localStorage.setItem(key,JSON.stringify(save));
 });
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.click('#loadProgress');
 await page.waitForFunction(()=>window.lab.frame.artifactAttackBlocked===true);
 await page.locator('[data-action="field"]').click();
 await page.waitForFunction(()=>window.lab.frame.campaign?.zone==='field');
 const warning=page.locator('#artifactAttackBlock');
 if(!await warning.isVisible()||!(await warning.textContent()).includes('16個'))throw Error('loot stop not visible in field');
 await page.getByRole('button',{name:'拠点へ戻って整理',exact:true}).click();
 await page.waitForFunction(()=>window.lab.frame.campaign?.zone==='town');
 const recover=page.locator('[data-action="artifact_recover"]');
 if(!await recover.isVisible())throw Error('loot bag panel remained closed');
 await recover.click();
 await page.waitForFunction(()=>{
  const f=window.lab.frame;
  return !f.artifactAttackBlocked&&f.inventory.ground.length===0&&f.inventory.items.length===21;
 });
 if(await warning.isVisible())throw Error('loot warning remained after recovery');

 // A capped feather in a legal checkpoint isolates the browser imprint action from ordinary upgrade costs.
 await page.evaluate(()=>{
  const key='maple-lua-lab.checkpoint.v1',save=JSON.parse(localStorage.getItem(key));
  save.mora=400000;
  save.inventory.items[1].enhance=12;
  save.inventory.ground=[];
  localStorage.setItem(key,JSON.stringify(save));
 });
 await page.click('#loadProgress');
 await page.waitForFunction(()=>window.lab.frame.mora===400000);
 await page.locator('[data-action="swap"]').click();
 await page.waitForFunction(()=>window.lab.frame.active===2);
 const feather=page.locator('#inventoryRows > div').nth(1);
 await feather.getByRole('button',{name:'操作中キャラに装備'}).click();
 await page.waitForFunction(()=>window.lab.frame.inventory.items[1].companionId==='amber');
 const armorBefore=await page.evaluate(()=>window.lab.frame.actors[1].atk);
 await feather.getByRole('button',{name:/刻印 1星/}).click();
 await page.waitForFunction(before=>{
  const f=window.lab.frame;
  return f.imprintGrowth.total===1&&f.imprintTrial===1&&f.mora===200000&&f.actors[1].atk>before;
 },armorBefore);
 await page.locator('[data-action="companion:columbina"]').click();
 await page.waitForFunction(()=>window.lab.frame.companion?.id==='columbina'&&window.lab.frame.imprintGrowth.total===0);
 await page.locator('[data-action="companion:amber"]').click();
 await page.waitForFunction(()=>window.lab.frame.companion?.id==='amber'&&window.lab.frame.imprintGrowth.total===1);
 if(errors.length)throw Error(errors.join('\n'));
 await fs.writeFile('evidence/artifacts-browser.json',JSON.stringify({errors,kitItems:5,equippedAttack:attack,saveReload:true,lockAndSale:true,
  fieldLootStop:true,returnedByInventoryAction:true,allDropsRecovered:true,imprintFee:200000,
  imprintChangesStats:true,companionsKeepSeparateEquipment:true},null,2));
 console.log('Artifact kit, equip stat change and persisted equipment passed');
}finally{await browser.close()}
