import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const {nodes} = JSON.parse(await fs.readFile('content/story-graph.json', 'utf8'));
const browser = await chromium.launch({headless:true, channel:'chrome'});
const graph = Object.fromEntries(nodes.map(node => [node.id,node]));
const boss = 'boss-25135202';
const hub = 'snezhnaya-hub';
const errors = [];

async function observe(url, payload, screenshot) {
 const page = await browser.newPage({viewport:{width:1200,height:940}});
 page.on('pageerror', error => errors.push(error.message));
 await page.goto(url);
 await page.waitForFunction(() => window.lab?.frame);
 await page.locator('#importSave').setInputFiles({
  name:'field-hp-checkpoint.json', mimeType:'application/json', buffer:Buffer.from(payload),
 });
 const drive = waypointDriver(page, graph);
 await drive.waitNode(hub);
 await drive.cross('snezhnaya-field');
 await drive.cross('drifting-snow-court');
 await page.waitForFunction(boss => window.lab.frame.fieldBoss?.id === boss, boss);
 const {hp,maxhp,draftHp,driftingSnow:{coffinUsed}} = await page.evaluate(() => window.lab.frame.fieldBoss);
 assert.equal(coffinUsed,true);
 if(screenshot) await page.locator('#fieldBoss').screenshot({path:screenshot, timeout:8000});
 return {page, hp, maxhp, draftHp:Boolean(draftHp)};
}

try {
 const fixture = await fs.readFile('work/earned-drifting-snow-base-partial.json','utf8');
 const baseUrl = process.env.BASE_LAB_URL || 'http://127.0.0.1:9097/';
 const draftUrl = process.env.DRAFT_LAB_URL || 'http://127.0.0.1:9096/';
 const base = await observe(baseUrl,fixture,'evidence/snez-field-hp-base.png');
 await base.page.close();
 const draft = await observe(draftUrl,fixture,'evidence/snez-field-hp-draft.png');
 assert.equal(base.maxhp,1200);
 assert.ok(!base.draftHp && draft.draftHp && draft.maxhp > base.maxhp);
 assert.equal(draft.hp,Math.round(base.hp*draft.maxhp/base.maxhp));
 assert.match(await draft.page.locator('#fieldBossLabel').textContent(),/比較版HP/);

 await draft.page.locator('#saveProgress').click();
 await draft.page.waitForFunction(() => document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const exported = await draft.page.evaluate(() => localStorage.getItem('maple-lua-lab.checkpoint.v1'));
 assert.equal(JSON.parse(exported).fieldBosses[boss].maxHp,draft.maxhp);
 await draft.page.close();
 const restored = await observe(baseUrl,exported);
 assert.deepEqual([restored.hp,restored.maxhp],[base.hp,base.maxhp]);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/draft-snezhnaya-boss-hp-browser.json',JSON.stringify({
  boss, base:[base.hp,base.maxhp], draft:[draft.hp,draft.maxhp],
  restored:[restored.hp,restored.maxhp], coffinUsedPreserved:true, errors,
 },null,2)+'\n');
 console.log('Chrome: the same checkpoint retained its HP percentage and coffin flag across both balance profiles.');
} catch(error) {
 console.error(errors);
 throw error;
} finally {
 await browser.close();
}
