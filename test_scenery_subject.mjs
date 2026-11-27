import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const base=process.env.LAB_URL || 'http://127.0.0.1:9101/';
const stage='branch-hunt-64842';
const id=stage+'-1';
const browser=await chromium.launch({channel:'chrome'});
try {
  const page=await browser.newPage({viewport:{width:1420,height:1000}});
  await page.goto(base+'map-art.html?node='+stage+'&placements=live&background=original&profile=h32c16#sceneryDetail');
  await page.waitForFunction(()=>window.mapArt?.count===36);
  assert.equal(await page.locator('#liveSubject option').count(),37);
  const placements=await page.evaluate(()=>window.mapArt.placements);
  assert.equal(placements.filter(e=>e.species==='fatui-skirmisher-cryogunner').length,24);

  await page.selectOption('#liveSubject',id);
  assert.equal(await page.evaluate(()=>window.mapArt.shownCount),1);
  assert.match(await page.locator('#viewportCost').innerText(),/957/);
  const sample=async tab=>tab.evaluate(()=>({
    camera:window.mapArt.camera,x:detailX.value,y:detailY.value,
    png:pngDetail.toDataURL(),rect:rectDetail.toDataURL()
  }));
  const expected=await sample(page);
  assert.notEqual(expected.png,expected.rect);
  await page.locator('#sceneryDetail').screenshot({path:'evidence/chenyu-ferry-gunner-zoom.png'});
  await page.locator('main').screenshot({path:'evidence/chenyu-ferry-gunner-solo.png'});
  const shared=await page.locator('#detailLink').getAttribute('href');
  const other=await browser.newPage();
  await other.goto(new URL(shared,page.url()).href);
  await other.waitForFunction(()=>window.mapArt?.shownCount===1 && window.mapArt.backgroundState==='ready');
  assert.equal(await other.inputValue('#liveSubject'),id);
  assert.deepEqual(await sample(other),expected);
  await other.close();

  await page.selectOption('#profile','legacy');
  assert.match(await page.locator('#viewportCost').innerText(),/3,207/);
  await page.selectOption('#liveSubject','');
  assert.equal(await page.evaluate(()=>window.mapArt.shownCount),36);
  assert.deepEqual(await page.evaluate(()=>window.mapArt.placements),placements);
  await page.selectOption('#liveSubject',id);
  await page.selectOption('#node','branch-hunt-64842-pocket-1');
  assert.equal(await page.inputValue('#liveSubject'),'');
  assert.equal(await page.isVisible('#liveSubjectControl'),false);
  assert.equal(await page.evaluate(()=>window.mapArt.count),1);
  console.log('A single Fatui pose, two drawing budgets, a shared crop, and restoring the crowd passed.');
} finally {await browser.close();}
