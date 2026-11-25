import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.LAB_URL||'http://127.0.0.1:9101/';
const browser=await chromium.launch({channel:'chrome'});
try{
  const node='branch-hunt-66769';
  const file='chenyu-cargo-wharf-background-v1.png';
  const compression=JSON.parse(await fs.readFile('evidence/chenyu-south-background-compression.json','utf8'));
  const tiers=compression.scenes[file].tiers;
  const page=await browser.newPage();
  await page.goto(base+'map-art.html?node='+node+'&placements=live&compare=background&camera=200&sampleX=314&sampleY=230#sceneryDetail');
  await page.waitForFunction(()=>window.mapArt?.decodedBackgroundRectangles===6144);
  await page.locator('#sceneryBudget summary').click();
  const results=[];
  for(const limit of [255,tiers[2].meanAbsoluteRgbErrorToReference,0]){
    const eligible=tiers.filter(t=>t.meanAbsoluteRgbErrorToReference<=limit);
    const expected=eligible.length?eligible[0]:tiers.reduce((a,b)=>a.meanAbsoluteRgbErrorToReference<=b.meanAbsoluteRgbErrorToReference?a:b);
    await page.fill('#colorLimit',String(limit));
    await page.locator('#fitBackground button').click();
    await page.waitForFunction(t=>window.mapArt.decodedBackgroundRectangles===t,expected.rectangles);
    await page.locator('#sceneryDownload[download$="-'+expected.rectangles+'.lua"]').waitFor();
    const label=await page.locator('#colorResult').innerText();
    assert.ok(label.includes(eligible.length?'上限内で最少':'上限内の段階がない'));
    assert.deepEqual(await page.evaluate(()=>[window.mapArt.camera,detailX.value,detailY.value]),[200,'314','230']);
    results.push({limit,rectangles:expected.rectangles,label});
  }
  await page.fill('#colorLimit','-1');
  await page.locator('#fitBackground button').click();
  assert.equal(await page.locator('#colorLimit').evaluate(e=>e.validity.rangeUnderflow),true);
  assert.equal(await page.locator('#colorResult').innerText(),'');
  await page.selectOption('#backgroundTier','4608');
  assert.equal(await page.locator('#colorResult').innerText(),'');
  await page.uncheck('#decodedBackground');
  assert.equal(await page.isVisible('#sceneryBudget'),false);
  await page.check('#decodedBackground');
  await page.selectOption('#node','mond-road');
  assert.equal(await page.isVisible('#sceneryBudget'),false);
  await page.goto(base+'map-art.html?node='+node+'&placements=live&compare=background&colorLimit=2.2#sceneryBudget');
  await page.waitForFunction(()=>window.mapArt?.decodedBackgroundRectangles===5120);
  assert.equal(await page.locator('#colorLimit').inputValue(),'2.2');
  assert.equal(await page.locator('#sceneryBudget details').evaluate(e=>e.open),true);
  assert.match(await page.locator('#colorResult').innerText(),/上限内で最少/);
  await fs.writeFile('evidence/scenery-color-budget.json',JSON.stringify({node,results},null,2)+'\n');
  console.log('Color limits select the smallest qualifying tier and keep the shared camera and sample.');
}finally{await browser.close()}
