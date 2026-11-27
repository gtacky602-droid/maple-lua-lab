import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { waypointDriver } from './tools/browser_waypoint_test.mjs';

const browser = await chromium.launch({headless:true, channel:'chrome'});
const page = await browser.newPage({viewport:{width:1280,height:900}});
const failures = [];
page.on('pageerror', error=>failures.push(error.message));
const start='sne-wp-106182', end='sne-wp-106204';
try {
 const {nodes}=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
 const drive=waypointDriver(page,Object.fromEntries(nodes.map(node=>[node.id,node])));
 await page.goto(process.env.LAB_URL || 'http://127.0.0.1:19747/');
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await page.locator('#importSave').setInputFiles('evidence/remaining-survey-save.json');
 await page.waitForFunction(()=>window.lab.frame.progression?.level===200);
 await drive.warp(start);
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await page.locator('#worldAtlas').waitFor();
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,start);
 const map=()=>page.evaluate(()=>window.lab.frame.worldMap);
 assert.equal((await map()).routes.find(r=>r.id===end)?.label,'特別な道');
 const options=await page.locator('#atlasRegion').locator('option').allTextContents();
 assert.equal(options.some(r=>r.includes('ナド・クライ特別地域')),false);
 await page.locator('#atlasField').selectOption(end);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,end);
 assert.deepEqual((await map()).guide.stops.map(({id,label})=>[id,label]),[[end,'特別な道']]);
 await page.locator('#worldAtlas').screenshot({path:'work/field-studio-special-road.png'});
 await page.keyboard.press('Escape');
 await page.locator('#worldAtlas').waitFor({state:'hidden'});
 await page.evaluate(()=>document.activeElement.blur());
 await drive.cross(end);
 await drive.cross(start);
 assert.deepEqual(failures,[]);
 const proof={opened_with:'M',label:'特別な道',path:[start,end],suspended_region_absent:true,round_trip:drive.journeys};
 await fs.writeFile('evidence/field-studio-20261127-browser.json',JSON.stringify(proof,null,2)+'\n');
 console.log(proof);
} finally {
 await browser.close();
}
