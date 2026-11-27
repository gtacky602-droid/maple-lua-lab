import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const camp='chasm-camp', connector='chasm-wp-25267', north='chasm-wp-25268';
const south='chasm-wp-25269', wetland='chasm-wp-25270', narrowPass='chasm-wp-25271';
const survey='chasm-wetland-survey';
const output=process.env.LAB_CHASM_OUTPUT||'work/chasm-snowfield';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:940}});
const drive=waypointDriver(page,nodes,{walkTimeout:22000});
const atlas=page.locator('#worldAtlas');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{
  if(response.url().endsWith('/api/frame')&&!response.ok())errors.push(`Frame HTTP ${response.status()}`);
});

try{
  await fs.mkdir(output,{recursive:true});
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8862/');
  await page.waitForFunction(()=>window.lab?.frame);
  await page.locator('#importSave').setInputFiles('work/chasm-waypoint-fixture.json');
  await drive.waitNode(camp);
  await drive.accept(survey);
  for(const id of ['chasm-depth','chasm-wp-25264',connector,north])await drive.cross(id);
  assert.equal(await page.evaluate(()=>window.lab.frame.total),20);
  await page.keyboard.press('KeyM');
  await atlas.waitFor();
  await page.waitForFunction(()=>window.lab.frame.worldMap?.region==='official-area-6');
  await page.selectOption('#atlasLayer','hunt');
  await page.waitForFunction(()=>window.lab.frame.worldMap?.layer==='hunt');
  await page.selectOption('#atlasField',north);
  await page.waitForFunction(id=>window.lab.frame.worldMap.layer==='hunt'
    &&window.lab.frame.worldMap.selected?.id===id,north);
  const selected=await page.evaluate(()=>window.lab.frame.worldMap.selected);
  assert.equal(selected.huntKind,'field');
  const routes=await page.evaluate(()=>window.lab.frame.worldMap.routes);
  assert.ok(routes.some(route=>route.id===south&&route.label==='徒歩'));
  assert.equal(await page.locator(`#atlasField option[value="${wetland}"]`).count(),0);
  await atlas.screenshot({path:`${output}/chasm-hunt-map.png`});
  await page.keyboard.press('Escape');
  await atlas.waitFor({state:'hidden'});
  await drive.cross(south);
  assert.equal(await page.evaluate(()=>window.lab.frame.total),20);
  await drive.warp(north);
  const warp=await drive.actor();
  assert.deepEqual([warp.x,warp.y],[800,480]);
  for(const id of [connector,wetland,narrowPass,wetland])await drive.cross(id);
  const returnPoint=await drive.actor();
  assert.deepEqual([returnPoint.x,returnPoint.y],[234,480]);
  await drive.count(survey,1);
  await page.getByRole('button',{name:/^拠点へ：層岩巨淵/}).click();
  await drive.waitNode(camp);
  await drive.report(survey);
  await page.click('#saveProgress');
  await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
  await page.reload();
  await page.waitForFunction(()=>window.lab?.frame);
  await page.click('#loadProgress');
  await drive.waitNode(camp);
  await page.waitForFunction(id=>window.lab.frame.story.quests[id]?.status==='complete',survey);
  assert.deepEqual(errors,[]);
  const proof={huntNodes:[north,south],population:20,wetlandExcludedFromHunts:true,
    journeys:drive.journeys,warp:[warp.x,warp.y],returnPoint:[returnPoint.x,returnPoint.y],
    surveyReportedAndRestored:true,errors};
  await fs.writeFile(`${output}/chasm-browser.json`,JSON.stringify(proof,null,2)+'\n');
  console.log('Chasm M-map hunt filter, roads, waypoint return and saved survey passed.');
}finally{await browser.close()}
