import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1200,height:900}});
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9118/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('evidence/mond-liyue-survey-save.json');
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('再開'));
 await page.waitForFunction(()=>window.lab?.frame.story?.node==='liyue-harbor'&&!document.querySelector('#atlasOpen').disabled);
 await page.locator('#atlasOpen').focus();
 await page.keyboard.press('KeyM');
 await page.locator('#worldAtlas').waitFor();
 await page.selectOption('#atlasVisits','unvisited');
 assert.deepEqual(await page.locator('#atlasField option').evaluateAll(opts=>opts.slice(1).map(o=>o.value)),['liyue-cart-lift']);
 await page.selectOption('#atlasField','liyue-cart-lift');
 await page.waitForFunction(()=>window.lab.frame.worldMap.selected.id==='liyue-cart-lift');
 assert.match(await page.evaluate(()=>window.lab.frame.worldMap.guide.reason),/もう一方/);
 await page.selectOption('#atlasRegion','region-01');
 await page.waitForFunction(()=>window.lab.frame.worldMap.region==='region-01');
 assert.equal(await page.locator('#atlasField option').count(),1);
 await page.selectOption('#atlasVisits','visited');
 assert.equal(await page.locator('#atlasField option').count(),69);
 console.log('Atlas filters show all 68 Mondstadt visits and the exclusive Liyue lift.');
}finally{await browser.close();}
