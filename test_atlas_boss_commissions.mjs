import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:19745/');
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await page.waitForFunction(()=>window.lab?.frame.story.active);
 const action=key=>page.evaluate(key=>window.lab.action(key),key);
 const panel=page.locator('#atlasBossCommissions');
 async function open(id){
  await action('world_map_boss:'+id);
  await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,id);
 }
 await open('anemo-field-basin');
 assert.match(await panel.innerText(),/無相の風の討伐調査.*未受注/s);
 await panel.getByRole('button',{name:'モンド・城門広場までの道順'}).click();
 await page.waitForFunction(()=>window.lab.frame.worldMap?.selected?.id==='mond-town');
 assert(await panel.isHidden());
 await action('world_map_close');
 await action('story_accept:anemo-commission');
 await page.waitForFunction(()=>window.lab.frame.story.quests['anemo-commission']?.status==='active');
 await open('anemo-field-basin');
 assert.match(await panel.innerText(),/無相の風の討伐調査.*進行中/s);
 await open('mond-stygian-dual-court');
 assert.match(await panel.innerText(),/双剣の鍛錬.*未解放.*受注Lv12/s);
 await open('andrius-wolf-ring');
 assert.match(await panel.innerText(),/王狼の再現戦・氷と北風.*未受注/s);
 await open('sumeru-observatory-terrace');
 assert.match(await panel.innerText(),/空の観測所へ！.*未解放.*受注Lv60.*枝傘の大キノコン/s);
 await open('tide-calibration-hall');
 assert(await panel.isVisible());
 const finished=await readFile('evidence/remaining-survey-save.json','utf8');
 await action('world_map_close');
 await page.evaluate(save=>localStorage.setItem('maple-lua-lab.checkpoint.v1',save),finished);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>window.lab.frame.progression.level===200);
 await open('andrius-wolf-ring');
 assert.match(await panel.innerText(),/王狼の再現戦・氷と北風.*完了/s);
 await panel.getByRole('button',{name:'モンド・城門広場までの道順'}).click();
 await page.waitForFunction(()=>window.lab.frame.worldMap?.selected?.id==='mond-town');
 assert(await panel.isHidden());

 await open('frost-mushteshir-inner-chamber');
 const access=await panel.locator('li').allTextContents();
 assert.equal(access.length,2);
 assert(access.every(row=>row.includes('完了')&&row.includes('入口に関わる依頼')));
 await open('vivianne-legend-bank');
 assert(await panel.isHidden());

 const earlier=await readFile('evidence/legend-expedition-save.json','utf8');
 await action('world_map_close');
 await page.evaluate(save=>localStorage.setItem('maple-lua-lab.checkpoint.v1',save),earlier);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>!window.lab.frame.story.quests['natlan-rainbow-cave-keys']);
 await open('toyac-balachko-inner-cave');
 assert.match(await panel.innerText(),/秘境脇の二つの鍵.*未受注.*入口に関わる依頼/s);
 await action('world_map_close');
 await action('story_fast:natlan-hub');
 await page.waitForFunction(()=>window.lab.frame.story.node==='natlan-hub');
 await action('story_accept:natlan-rainbow-cave-keys');
 await page.waitForFunction(()=>window.lab.frame.story.quests['natlan-rainbow-cave-keys']?.status==='active');
 await open('toyac-balachko-inner-cave');
 assert.match(await panel.innerText(),/進行中.*南西の秘境周辺から鍵の洞窟へ入る/s);
 await panel.getByRole('button',{name:/次の目的地/}).click();
 await page.waitForFunction(()=>window.lab.frame.worldMap?.selected?.id==='sites-hunt-73160');
 await open('night-trial-tlatzacuilotl');
 assert.match(await panel.innerText(),/共鳴晶岩の順番.*入口に関わる依頼/s);
 console.log('Atlas boss commissions, local legend access and live quest routing passed.');
}finally{await browser.close()}
