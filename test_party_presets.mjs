import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const url = process.env.LAB_URL || 'http://127.0.0.1:9076/';
const graph = JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes = Object.fromEntries(graph.nodes.map(node => [node.id,node]));
const browser = await chromium.launch({channel:'chrome',headless:true});
const page = await browser.newPage({viewport:{width:1280,height:930}});
const errors = [];
page.on('pageerror',error => errors.push(error.message));
const panel = page.locator('#partyPresets');
const status = page.locator('#partyPresetStatus');
const row = number => panel.locator(`[data-preset="${number}"]`);
const register = number => row(number).getByRole('button',{name:`枠${number}を登録`,exact:true});
const apply = number => row(number).getByRole('button',{name:`枠${number}を適用`,exact:true});
const gear = number => page.locator('#inventoryRows > div').filter({hasText:new RegExp(`^#${number} `)});
const driver = waypointDriver(page,nodes);

function waitParty(partner, gearId, firstSkill) {
 return page.waitForFunction(([partner, gearId, firstSkill]) => {
  const frame = window.lab.frame;
  return frame.companion?.id === partner &&
   frame.inventory?.items.find(item => item.id === gearId)?.owner === 1 &&
   frame.loadout?.[0]?.[0] === firstSkill;
 }, [partner, gearId, firstSkill]);
}

try {
 await page.goto(url);
 await page.waitForFunction(() => window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/party-presets-opening.json');
 await waitParty('amber',1,'SK01');
 await panel.locator('summary').click();
 assert.equal(await panel.locator('[data-preset]').count(),3);
 await register(1).click();
 await status.getByText('枠1に現在の編成を登録しました。',{exact:true}).waitFor();
 assert.match(await row(1).textContent(),/アンバー.*聖遺物1点.*旋風斬り/);

 await page.locator('[data-action="companion:beidou"]').first().click();
 await page.waitForFunction(() => window.lab.frame.companion.id === 'beidou');
 await page.getByText('聖遺物バッグ・5部位装備',{exact:true}).click();
 await gear(2).getByRole('button',{name:'操作中キャラに装備',exact:true}).click();
 await page.getByText('スキル装着・全100技の制作状況',{exact:true}).click();
 const fields = page.locator('#skillEditor select');
 await fields.nth(0).selectOption('SK03');
 await fields.nth(1).selectOption('SK02');
 await page.locator('#applySlots').click();
 await waitParty('beidou',2,'SK03');
 await register(2).click();
 await status.getByText('枠2に現在の編成を登録しました。',{exact:true}).waitFor();
 assert.match(await row(2).textContent(),/北斗.*風の加速 → 竜巻/);

 await apply(1).click();
 await waitParty('amber',1,'SK01');
 await page.locator('#saveProgress').click();
 await page.waitForFunction(() => document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
 await page.reload();
 await page.waitForFunction(() => window.lab?.frame);
 const response = page.waitForResponse(response => response.url().endsWith('/api/frame') &&
  Boolean(response.request().postDataJSON()?.restore));
 await page.locator('#loadProgress').click();
 assert.equal((await response).status(),200);
 await waitParty('amber',1,'SK01');
 await panel.locator('summary').click();
 await apply(2).click();
 await waitParty('beidou',2,'SK03');
 assert.deepEqual(await page.evaluate(() => window.lab.frame.loadout[0]),['SK03','SK02']);
 await apply(1).click();
 await waitParty('amber',1,'SK01');
 await page.getByText('聖遺物バッグ・5部位装備',{exact:true}).click();
 await gear(2).getByRole('button',{name:/売却/}).click();
 await row(2).getByText(/装備 #2 が見つかりません/).waitFor();
 assert.equal(await apply(2).isDisabled(),true);
 await waitParty('amber',1,'SK01');

 await page.setViewportSize({width:390,height:844});
 await panel.screenshot({path:'evidence/party-presets-mobile.png'});
 assert.ok(await panel.evaluate(el => el.getBoundingClientRect().right<=390 && el.scrollWidth<=el.clientWidth));
 await page.setViewportSize({width:1280,height:930});
 await driver.cross('mond-road');
 await page.waitForFunction(() => !window.lab.frame.partyPresetsEditable);
 assert.ok(await row(1).getByRole('button',{name:'枠1を上書き'}).isDisabled());
 assert.ok(await apply(1).isDisabled());
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/party-presets-browser.json',JSON.stringify({
  browser:'Chrome', threeSlotControls:true, changedCompanionEquipmentAndMacro:true,
  restoredAfterReload:true, soldGearAppliesDisabled:true, fieldEditsDisabled:true,
  mobileWidth:390, noPanelOverflow:true, errors,
 },null,2)+'\n');
 console.log('Chrome verified party switching, save persistence, sold gear handling, and a 390px layout.');
} finally {
 await browser.close();
}
