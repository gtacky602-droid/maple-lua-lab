import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const route=JSON.parse(await readFile('evidence/quest-legend-expedition-route.json','utf8'));
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage();
 await page.goto((process.env.LAB_URL || 'http://127.0.0.1:9118')+'/theater-preview.html#legendPassages');
 const menu=page.locator('#passageBoss');
 await menu.locator('option').first().waitFor({state:'attached'});
 assert.equal(await menu.locator('option').count(),route.newClears.length);
 for(const win of route.newClears){
  await menu.selectOption(win.id);
  assert.equal(new URL(await page.locator('#passageMap').evaluate(a=>a.href)).searchParams.get('node'),win.node);
  assert.deepEqual(await page.locator('#passageSteps li').allTextContents(),route.guides[win.quest].steps);
 }
 console.log('All destinations and itineraries match the playable routes.');
}finally{await browser.close();}
