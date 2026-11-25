import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const region=process.argv[2] || 'sumeru';
const settings={
 snezhnaya:['snezhnaya-hub','sne-domains-terrain-fixture.json','daily-sne-elites',4,'sites-hunt-100705-pocket-1'],
 'nod-krai':['nod-town','nod-islands-terrain-fixture.json','daily-nod-rumored-elites',6,'sites-hunt-88122-pocket-1'],
 liyue:['liyue-harbor','li-north-terrain-fixture.json','daily-liyue-relics',35,'sites-hunt-7114-pocket-1'],
 'mond-slimes':['mond-town','mond-temples-terrain-fixture.json','daily-mond-slimes',17,'sites-hunt-7206'],
 mondstadt:['mond-town','mond-ruins-terrain-fixture.json','daily-mond-elites',9,'sites-hunt-7111-pocket-1'],
 sumeru:['sumeru-hub','sumeru-domain-terrain-fixture.json','daily-sum-elites',11,'sites-hunt-36704-pocket-1'],
 natlan:['natlan-hub','natlan-eastern-rooms-fixture.json','daily-nat-elite-hunt',6,'sites-hunt-73159-pocket-1'],
 inazuma:['inazuma-town','inazuma-domain-terrain-fixture.json','daily-ina-trial',9,'sites-hunt-12778-pocket-1'],
};
assert.ok(Object.hasOwn(settings,region));
const [hub,fixture,id,targetCount,room]=settings[region];
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1240,height:900}});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(process.env.LAB_URL || 'http://127.0.0.1:9101/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/'+fixture);
 await page.waitForFunction(id=>window.lab?.frame.story?.node===id,hub);
 const board=page.locator('#dailyBoard');
 if(!await board.evaluate(e=>e.open))await board.locator('summary').click();
 const card=mode=>page.locator('[data-daily-id="'+id+'"][data-daily-mode="'+mode+'"]');
 await card('offer').getByRole('button').click();
 const select=card('active').locator('select');
 await select.waitFor();
 const targets=await select.locator('option').evaluateAll(opts=>opts.map(o=>o.value).filter(Boolean));
 assert.equal(targets.length,targetCount);
 if(region==='liyue'){
  const labels=await select.locator('option:enabled').allTextContents();
  assert.equal(new Set(labels).size,labels.length);
  assert.ok(labels.some(label=>label.includes('西岸の道') && label.includes('玄文獣')));
 }
 await select.selectOption(room);
 await page.waitForFunction(room=>window.lab.frame.worldMap?.selected?.id===room,room);
 const link=page.locator('#atlasBackgroundCompare');
 const [comparison]=await Promise.all([page.waitForEvent('popup'),link.click()]);
 await comparison.waitForFunction(room=>window.mapArt?.node===room && window.mapArt.decodedBackgroundRectangles===6144,room);
 assert.equal(await comparison.evaluate(()=>window.mapArt.liveView),true);
 assert.equal(await comparison.locator('#matchSpritePng').isChecked(),true);
 await comparison.selectOption('#backgroundTier','4096');
 const actual=await comparison.locator('#sceneryDownload[download$="-4096.lua"]').getAttribute('download');
 await comparison.close();
 await page.keyboard.press('Escape');
 await page.locator('#worldAtlas').waitFor({state:'hidden'});
 assert.equal(await page.evaluate(()=>window.lab.frame.story.node),hub);
 assert.ok(await card('active').isVisible());
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/'+region+'-daily-spur-map.json',JSON.stringify({quest:id,targets,selected:room,download:actual,returnNode:hub},null,2)+'\n');
 console.log('Opened the selected quest location on the atlas from the daily card, compared its art and returned to the board.');
} finally {await browser.close();}
