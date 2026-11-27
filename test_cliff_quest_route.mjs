import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const folder='work/cliff-quest-routes',cliff='liyue-cliff-planks',hub='liyue-harbor';
const herbQuest='liyue-harbor-meal';
const base=process.env.LAB_URL||'http://127.0.0.1:8862/';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1300,height:930}});
const drive=waypointDriver(page,nodes);
const atlas=page.locator('#worldAtlas');
const objectives=page.locator('#atlasQuestObjectives');
const links=objectives.locator('a[href*="worksite="]');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));

async function openMap(){
  await page.locator('#game').click();
  await page.keyboard.press('KeyM');
  await atlas.waitFor();
  await page.waitForFunction(()=>window.lab.frame.worldMap?.region==='region-02');
  await page.selectOption('#atlasField',cliff);
  await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,cliff);
  assert.match(await page.locator('#atlasPlaceLevel').innerText(),/依頼の進行地点/);
  return page.evaluate(()=>window.lab.frame.worldMap);
}

async function closeMap(){
  await page.keyboard.press('Escape');
  await atlas.waitFor({state:'hidden'});
}

async function restore(fixture){
  await page.goto(base);
  await page.waitForFunction(()=>window.lab?.frame);
  await page.locator('#importSave').setInputFiles(`${folder}/${fixture}.json`);
  await drive.waitNode(hub);
  await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('このブラウザにも保存'));
}

async function pointIds(){
  return links.evaluateAll(anchors=>anchors.map(a=>new URL(a.href).searchParams.get('worksite')).sort());
}

try{
  await restore('cliff-before');
  const closed=await openMap();
  assert.equal(closed.guide.status,'blocked');
  assert.match(closed.guide.reason,/山道に消えた商隊.*山のごちそう、港の一皿/);
  assert.deepEqual(await pointIds(),[]);
  await closeMap();

  await restore('cliff-active');
  assert.equal((await openMap()).guide.status,'ready');
  const active=await pointIds();
  assert.deepEqual(active,['herb','rest-tag']);
  assert.match(await objectives.innerText(),/西の低い足場を経由し、二段目へ上がる/);
  await atlas.screenshot({path:`${folder}/cliff-caravan-and-meal-map.png`});
  await closeMap();
  await drive.cross(cliff);
  await drive.walk(520);
  await drive.changeHeight(395);
  await drive.changeHeight(305);
  await drive.walk(560);
  await page.waitForFunction(()=>window.lab.frame.storyNearbyIngredient?.name==='山の香草');
  await page.keyboard.press('KeyG');
  await drive.count(herbQuest,1);
  await openMap();
  assert.deepEqual(await pointIds(),['rest-tag']);
  await closeMap();

  await restore('cliff-surveys');
  const surveys=(await openMap()).selected;
  assert.equal(surveys.entryEnemyCount,4);
  assert.deepEqual(await pointIds(),['herb','tool-mark']);
  const target=objectives.locator('a[href*="worksite=tool-mark"]');
  const [preview]=await Promise.all([page.waitForEvent('popup'),target.click()]);
  preview.on('pageerror',error=>errors.push(error.message));
  await preview.waitForFunction(()=>window.mapArt?.ready);
  const point=preview.locator('#surveyPointNote');
  assert.equal(await point.getAttribute('data-worksite'),'tool-mark');
  assert.match(await point.innerText(),/905, 305.*二段目/);
  assert.match(await preview.locator('#context').innerText(),/依頼の進行地点/);
  await preview.locator('main').screenshot({path:`${folder}/cliff-tool-mark-preview.png`});
  await preview.close();
  await page.bringToFront();
  await closeMap();

  await restore('cliff-after');
  const reopened=await openMap();
  assert.equal(reopened.guide.status,'ready');
  assert.equal(reopened.selected.entryEnemyCount,4);
  assert.deepEqual(await pointIds(),[]);
  assert.deepEqual(errors,[]);
  const record={closedReason:closed.guide.reason,active,afterCaravan:['herb','tool-mark'],
    herbCollectedAfterTwoJumps:true,afterReports:[],toolMark:[905,305],errors};
  await fs.writeFile(`${folder}/cliff-browser.json`,JSON.stringify(record,null,2)+'\n');
  console.log('Cliff M-map gates, two jumps, live objectives and restored reports passed.');
}finally{await browser.close()}
