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
 console.log('Atlas boss commissions, progress states and hub routing passed.');
}finally{await browser.close()}
