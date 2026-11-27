import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const base=process.env.LAB_URL||'http://127.0.0.1:19745/';
const graph=JSON.parse(await readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const catalog=JSON.parse(await readFile('content/weapon-settings.json','utf8'));
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1180,height:880}});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 const panel=page.locator('#weaponPanel');
 const row=id=>panel.locator('[data-weapon="'+id+'"]');
 const send=key=>page.evaluate(key=>window.lab.action(key),key);
 const getView=()=>page.evaluate(()=>window.lab.frame.weaponView);
 async function load(file){
  const raw=await readFile('evidence/'+file+'.json','utf8');
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),raw);
  const response=page.waitForResponse(r=>r.url().endsWith('/api/frame')&&r.request().postDataJSON()?.restore);
  await page.locator('#loadProgress').click();
  assert.equal((await response).status(),200);
  const node=JSON.parse(raw).story.node;
  await page.waitForFunction(node=>window.lab.frame.progression?.level===200&&window.lab.frame.story.node===node,node);
 }
 await load('cap-revisit-save');
 await panel.locator('summary').click();
 assert.match(await row('SW06').innerText(),/古壁の調査剣.*未受注.*受注Lv110/s);
 await page.setViewportSize({width:390,height:840});
 assert(await panel.evaluate(node=>node.scrollWidth<=node.clientWidth));
 await page.setViewportSize({width:1180,height:880});
 await row('SW06').getByRole('button',{name:'受注・報告先・ナタ・谷の集落'}).click();
 await page.waitForFunction(()=>window.lab.frame.worldMap?.selected?.id==='natlan-hub');
 await send('world_map_close');
 await send('story_fast:natlan-hub');
 await page.waitForFunction(()=>window.lab.frame.story.node==='natlan-hub');
 await send('story_accept:natlan-ancient-excavation-wall');
 await row('SW06').getByText(/進行中/).waitFor();
 await row('SW06').getByRole('button',{name:/次の目的地/}).click();
 await page.waitForFunction(()=>window.lab.frame.worldMap?.selected?.id==='tepeacac-waterfall-wall');
 await send('world_map_close');

 await load('remaining-survey-save');
 const weaponIds=catalog.items.filter(item=>item.id.startsWith('SW')).map(item=>item.id);
 assert.deepEqual((await getView()).options.filter(item=>item.traveler&&item.owned).map(item=>item.id),weaponIds);
 for(const item of catalog.items.filter(item=>item.bound&&item.bound!=='traveler')){
  await page.locator('[data-action="companion:'+item.bound+'"]').first().click();
  await page.waitForFunction(id=>window.lab.frame.weaponView?.companion===id,item.bound);
  assert((await getView()).options.some(option=>option.id===item.id&&option.owned&&option.partner),item.id);
 }
 const finalRow=row('SW08');
 const before=(await getView()).options.find(option=>option.id==='SW08');
 const stats=()=>page.evaluate(()=>({atk:window.lab.frame.actors[0].atk,mora:window.lab.frame.mora}));
 await finalRow.getByRole('button',{name:'旅人に装備',exact:true}).click();
 await page.waitForFunction(()=>window.lab.frame.weaponView.traveler==='SW08');
 const equipped=await stats();
 await finalRow.getByRole('button',{name:/^強化/}).click();
 await page.waitForFunction(before=>window.lab.frame.weaponView.options.find(option=>option.id==='SW08').level===before+1,before.level);
 const upgraded=await stats();
 assert(upgraded.atk>equipped.atk);
 assert.equal(equipped.mora-upgraded.mora,before.cost);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 const loaded=page.waitForResponse(r=>r.url().endsWith('/api/frame')&&r.request().postDataJSON()?.restore);
 await page.locator('#loadProgress').click();
 assert.equal((await loaded).status(),200);
 await page.waitForFunction(()=>window.lab.frame.weaponView?.traveler==='SW08');
 assert.deepEqual(await stats(),upgraded);
 await panel.locator('summary').click();
 await waypointDriver(page,nodes).cross('liyue-field');
 assert(await finalRow.getByRole('button',{name:/^強化/}).isDisabled());
 const field=await getView();
 assert.equal(field.traveler,'SW08');
 const after=field.options.find(option=>option.id==='SW08');
 assert.deepEqual(errors,[]);
 await writeFile('evidence/weapon-quest-routes-browser.json',JSON.stringify({
  beforeReport:'cap-revisit-save.json',afterReport:'remaining-survey-save.json',
  unacceptedRoute:'natlan-hub',activeRoute:'tepeacac-waterfall-wall',
  verifiedFixedRewards:catalog.items.filter(item=>item.quest).length,
  upgrade:{id:'SW08',before:before.atk,after:after.atk,cost:before.cost},
  restoredUpgradeAndEquippedWeapon:true,fieldEditsLocked:true,mobileWidth:390,
 },null,2)+'\n');
 console.log('Weapon quest routes, 15 earned weapons, real equip/upgrade, checkpoint reload and field edit lock passed.');
}finally{await browser.close()}
