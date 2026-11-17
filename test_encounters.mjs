import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 const panel=page.locator('#encountersPanel');await panel.locator('summary').click();await page.waitForFunction(()=>document.querySelectorAll('[data-encounter]').length===70);
 if(!await panel.getByText(/Ver\.7\.2.*通常48系統・週ボス14戦/).isVisible())throw Error('roster review missing');
 for(const query of ['博士','ドットーレ']){
  await panel.getByLabel('ボス名で検索').fill(query);
  const ids=await panel.locator('[data-encounter]').evaluateAll(rows=>rows.map(row=>row.dataset.encounter).sort());
  if(ids.join(',')!=='boss-29130201,boss-29150101')throw Error('Dottore domains not independently searchable');
  const buttons=await panel.getByRole('button',{name:'制作中'}).all();
  if(buttons.length!==2)throw Error('unimplemented state missing');
  for(const b of buttons)if(await b.isEnabled())throw Error('unimplemented battle enabled');
 }
 await panel.getByLabel('ボス名で検索').fill('氷風組曲');if(await panel.locator('[data-encounter]').count()!==2)throw Error('suite variants missing');
 if(await panel.locator('[data-encounter] a[href^="map-art.html?node=icewind-"]').count()!==2)throw Error('suite field routes missing');
 await panel.getByLabel('ボス名で検索').fill('機巧デバイス');
 const workshop=panel.locator('[data-encounter="boss-24090201"]').getByRole('link',{name:/秘源の機構室/});
 if(await workshop.getAttribute('href')!=='map-art.html?node=config-device-field-workshop')throw Error('workshop route missing');
 await panel.getByLabel('ボス名で検索').fill('恒常からくり陣形');
 await panel.getByLabel('恒常からくり陣形の弱点個体').selectOption('boss_array_3');
 await panel.getByRole('button',{name:'模擬戦に挑戦'}).click();
 await page.waitForFunction(()=>window.lab.frame.boss?.markedName==='巡航型');
 await panel.getByLabel('ボス名で検索').fill('エンシェントヴィシャップ');
 await panel.getByLabel(/エンシェントヴィシャップ.*の元素/).selectOption('boss_primo_electro');
 await panel.getByRole('button',{name:'模擬戦に挑戦'}).click();
 await page.waitForFunction(()=>window.lab.frame.boss?.element==='electro');
 await panel.getByLabel('ボス名で検索').fill('');await panel.getByLabel('ボスの分類').selectOption('stygian');if(await panel.locator('[data-encounter]').count()!==7)throw Error('stygian missing');
 await panel.getByLabel('挑戦可能のみ').check();if(await panel.locator('[data-encounter]').count()!==1)throw Error('playable filter');
 await panel.getByRole('button',{name:'試作に挑戦'}).click();await page.waitForFunction(()=>window.lab.frame.boss?.name==='ファルカ模擬戦');
 await panel.screenshot({path:'evidence/encounters-browser.png'});if(errors.length)throw Error(errors.join('/'));
 await fs.writeFile('evidence/encounters-browser.json',JSON.stringify({errors,allCandidates:70,fieldBossFamilies:48,weeklyChallenges:14,dottoreAliasMatches:2,suiteVariants:2,configDeviceFieldRoute:true,stygianCandidates:7,disabledUnimplemented:true,launchesVerified:['boss_array_3','boss_primo_electro','boss_farka']},null,2));console.log('Encounter roster, alias search, variants and launch verified');
}finally{await browser.close()}
