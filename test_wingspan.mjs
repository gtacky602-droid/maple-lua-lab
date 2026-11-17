import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.LAB_URL || 'http://127.0.0.1:8769';
const browser = await chromium.launch({headless:true, channel:'chrome'});
const page = await browser.newPage({viewport:{width:1440,height:1000}});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const canvas = page.locator('canvas').first();
const row = page.locator('[data-quest="wingspan-survey"]');
const location = id => page.waitForFunction(node => window.lab?.frame.story.node === node, id);
const frame = () => page.evaluate(() => window.lab.frame);
const gate = name => page.getByRole('button', {name:'門：'+name+' Lv140',exact:true});

async function walk(key, x, right) {
 await canvas.scrollIntoViewIfNeeded();
 await canvas.click();
 await page.keyboard.down(key);
 try {
  await page.waitForFunction(({x,right}) => {
   const actor = window.lab.frame.actors[0];
   return right ? actor.x >= x : actor.x <= x;
  }, {x,right}, {timeout:15000});
 } finally {
  await page.keyboard.up(key);
 }
}

try {
 await page.goto(base);
 await page.waitForFunction(() => window.lab?.frame);
 await page.evaluate(raw => localStorage.setItem('maple-lua-lab.checkpoint.v1', raw),
                     await fs.readFile('work/wingspan-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await location('snezhnaya-hub');
 await walk('KeyD',1310,true);
 await gate('スネージナヤ・凍った街道').click();
 await location('snezhnaya-field');
 await gate('翼の峰・入口拠点').click();
 await page.waitForFunction(() => window.lab.frame.storyNotice?.includes('歩いて'));
 await walk('KeyD',1310,true);
 await gate('翼の峰・入口拠点').click();
 await location('wingspan-camp');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await page.waitForSelector('[data-quest="wingspan-survey"][data-status="active"]');
 await row.getByRole('button',{name:'この依頼を追跡',exact:true}).click();
 assert.match(await page.locator('#trackedQuestText').innerText(),/0\/1/);
 await walk('KeyD',1150,true);
 await gate('翼の峰・峡谷の展望路').click();
 await location('wingspan-lookout');
 await page.waitForSelector('[data-quest="wingspan-survey"][data-status="ready"]');
 assert.match(await page.locator('#trackedQuestText').innerText(),/1\/1/);
 assert.equal(await row.getByRole('button',{name:'報告',exact:true}).isEnabled(),false);
 assert.equal((await frame()).total,0);
 const popupEvent = page.waitForEvent('popup');
 await page.getByRole('link',{name:'この地点の配置比較を開く',exact:true}).click();
 const comparison = await popupEvent;
 comparison.on('pageerror', error => errors.push(error.message));
 await comparison.waitForFunction(() => window.mapArt?.ready);
 assert.equal(await comparison.locator('#node').inputValue(),'wingspan-lookout');
 assert.deepEqual(await comparison.evaluate(() => {
  const {backgroundState,backgroundFallback} = window.mapArt;
  return [backgroundState,backgroundFallback];
 }), ['ready',false]);
 await comparison.selectOption('#profile','h32c16');
 await comparison.selectOption('#species','character-traveler');
 for (const position of [{x:220,y:320},{x:442,y:208}]) {
  const preview = comparison.locator('#png');
  const {width,height} = await preview.boundingBox();
  await preview.click({position:{x:position.x*width/960,y:position.y*height/540}});
 }
 assert.equal(await comparison.evaluate(() => window.mapArt.count),2);
 await comparison.locator('main').screenshot({path:'evidence/wingspan-map-comparison.png'});
 await comparison.close();
 await walk('KeyA',118,false);
 await gate('翼の峰・入口拠点').click();
 await location('wingspan-camp');
 const before = await frame();
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForSelector('[data-quest="wingspan-survey"][data-status="complete"]');
 const reported = await frame();
 assert.equal(reported.mora-before.mora,700);
 assert.equal(reported.progression.questXp-before.progression.questXp,6000);
 assert.equal(reported.story.quests['wingspan-survey'].cycles,1);
 assert.equal(await row.getByRole('button',{name:'報告',exact:true}).count(),0);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(() => document.getElementById('saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(() => window.lab?.frame);
 await page.locator('#loadProgress').click();
 await location('wingspan-camp');
 const resumed = await frame();
 assert.equal(resumed.mora,reported.mora);
 assert.equal(resumed.story.quests['wingspan-survey'].status,'complete');
 await walk('KeyA',118,false);
 await gate('スネージナヤ・凍った街道').click();
 await location('snezhnaya-field');
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/wingspan-quest-browser.json',JSON.stringify({
  errors, start:'level 140 checkpoint at snezhnaya-hub',
  walkedRoute:['snezhnaya-hub','snezhnaya-field','wingspan-camp','wingspan-lookout','wingspan-camp','snezhnaya-field'],
  remoteGateRejected:true, rewardMora:700, rewardXp:6000, reports:1, saveRestoredQuest:true,
  comparison:['PNG','h32c16']
 },null,2)+'\n');
 console.log('Wingspan walk, quest report, save, return, and sprite comparison passed');
} finally {
 await browser.close();
}
