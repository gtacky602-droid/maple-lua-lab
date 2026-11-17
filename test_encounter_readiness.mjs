import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'chrome'}),p=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];
p.on('pageerror',e=>errors.push(e.message));
const base=process.env.LAB_URL||'http://127.0.0.1:8771';
let release,requests=0;const gate=new Promise(resolve=>release=resolve);
try{
 await p.route('**/api/frame',async route=>{
  requests++;if(requests===1){await route.fulfill({status:503,body:'starting'});return}
  if(requests===2)await gate;
  await route.continue();
 });
 await p.goto(base);await p.waitForFunction(()=>document.querySelectorAll('[data-encounter]').length===70);
 const panel=p.locator('#encountersPanel');await panel.locator('summary').click();
 await p.waitForFunction(()=>document.querySelector('#status').textContent.includes('通信に失敗'));
 assert.equal(await p.evaluate(()=>Boolean(window.lab)),false);
 assert.equal(await panel.locator('[data-runtime-action]:enabled').count(),0);
 assert.equal(await panel.locator('[data-runtime-action]:disabled').count(),11);
 assert(await panel.locator('.encounter-art a').count()>0,'Art comparisons remain available during boot');
 await panel.getByLabel('ボス名で検索').fill('エンシェントヴィシャップ');
 const variant=panel.locator('select').last();const values=await variant.locator('option').evaluateAll(nodes=>nodes.map(n=>n.value));
 await variant.selectOption(values.at(-1));
 await panel.screenshot({path:'evidence/encounter-loading.png'});
 // Even a synthetic click cannot call an absent runtime.
 await panel.locator('[data-runtime-action]').evaluate(b=>b.dispatchEvent(new MouseEvent('click')));
 release();await p.waitForFunction(()=>window.lab?.frame);
 await p.waitForFunction(()=>!document.querySelector('[data-runtime-action]').disabled);
 assert.equal(await variant.inputValue(),values.at(-1));
 await panel.getByLabel('ボス名で検索').fill('ファルカ');await panel.getByRole('button',{name:'試作に挑戦'}).click();await p.waitForFunction(()=>window.lab.frame.boss?.name==='ファルカ模擬戦');
 // The opposite load order: runtime becomes ready before encounter metadata arrives.
 let unlock;const delayed=new Promise(resolve=>unlock=resolve);
 await p.route('**/content/encounters.json',async route=>{await delayed;await route.continue()});
 await p.reload();await p.waitForFunction(()=>window.lab?.frame);unlock();await p.waitForFunction(()=>document.querySelectorAll('[data-encounter]').length===70);
 if(!await panel.evaluate(el=>el.open))await panel.locator('summary').click();
 assert.equal(await panel.locator('[data-runtime-action]:enabled').count(),11);
 assert.equal(await panel.getByRole('button',{name:'制作中',exact:true}).count(),59);
 assert.equal(await panel.locator('button:enabled:not([data-runtime-action])').count(),0);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/encounter-readiness-test.json',JSON.stringify({earlyFailureDisabled:true,syntheticEarlyClickSafe:true,variantPreserved:true,recoveredLaunch:'boss_farka',lateCatalogEnabled:11,unimplementedDisabled:59,errors},null,2));
 console.log('Both boot orders, first-frame failure/recovery and guarded launch passed');
}finally{release();await browser.close()}
