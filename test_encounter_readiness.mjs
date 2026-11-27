import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const data=JSON.parse(await fs.readFile('content/encounters.json','utf8'));
const live=data.encounters.filter(row=>!row.suspendedRegion);
const destinations=live.filter(row=>row.fieldNode||row.weeklyNode||row.stygianNode);
const trials=live.filter(row=>row.action);
const suspended=data.encounters.filter(row=>row.suspendedRegion);
const expectedIds=data.encounters.map(row=>row.id);
assert.equal(new Set(expectedIds).size,expectedIds.length);

const base=process.env.LAB_URL||'http://127.0.0.1:8771/';
const evidence=process.env.ENCOUNTER_EVIDENCE_PREFIX||'evidence/encounter-readiness';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1100,height:900}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
let releaseFrame,releaseGallery,releaseCatalog;
const frameGate=new Promise(resolve=>{releaseFrame=resolve});
const galleryGate=new Promise(resolve=>{releaseGallery=resolve});
const catalogGate=new Promise(resolve=>{releaseCatalog=resolve});

try{
 let requests=0;
 await page.route('**/api/frame',async route=>{
  requests++;
  if(requests===1){await route.fulfill({status:503,body:'starting'});return}
  if(requests===2)await frameGate;
  await route.continue();
 });
 await page.route('**/content/boss-art-gallery.json',async route=>{
  await galleryGate;
  await route.continue();
 });
 await page.goto(base);
 const panel=page.locator('#encountersPanel');
 const search=panel.getByRole('textbox',{name:'ボス名で検索'});
 const entries=panel.locator('[data-encounter]');
 const mapLinks=panel.locator('[data-boss-route]');
 const actionButtons=panel.locator('[data-runtime-action]');
 await entries.last().waitFor({state:'attached'});
 assert.deepEqual(await entries.evaluateAll(nodes=>nodes.map(node=>node.dataset.encounter)),expectedIds);
 assert.equal(await mapLinks.count(),destinations.length);
 assert.equal(await actionButtons.count(),trials.length);
 await panel.locator('summary').click();
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('通信に失敗'));
 assert.equal(await page.evaluate(()=>Boolean(window.lab)),false);
 assert.equal(await panel.locator('[data-boss-route]:enabled,[data-runtime-action]:enabled').count(),0);

 await panel.getByLabel('挑戦可能のみ').check();
 await entries.last().waitFor({state:'attached'});
 assert.equal(await entries.count(),live.filter(row=>row.action||row.fieldNode||row.weeklyNode||row.stygianNode).length);
 for(const row of suspended)assert.equal(await panel.locator('[data-encounter="'+row.id+'"]').count(),0);
 await panel.getByLabel('挑戦可能のみ').uncheck();
 await search.fill('北斗・反撃読み合い');
 const characterLink=entries.locator('.encounter-art a');
 await characterLink.first().waitFor();
 assert.ok((await characterLink.first().getAttribute('href')).startsWith('characters-art.html?'));

 await search.fill('エンシェントヴィシャップ');
 const variant=entries.getByRole('combobox');
 const options=await variant.locator('option').evaluateAll(nodes=>nodes.map(node=>node.value));
 const chosen=options.at(-1);
 await variant.selectOption(chosen);
 await entries.getByText('美術：比較一覧を読み込み中').waitFor();
 await panel.screenshot({path:evidence+'-loading.png'});
 await actionButtons.evaluate(button=>button.dispatchEvent(new MouseEvent('click')));

 releaseFrame();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await page.waitForFunction(()=>window.lab.frame.story?.active);
 const waitingRoute=entries.getByRole('button',{name:'ゲーム内の地図で案内'});
 await waitingRoute.click();
 const target=live.find(row=>row.id==='boss-26050101').fieldNode;
 await page.waitForFunction(node=>window.lab.frame.worldMap?.selected?.id===node,target);
 assert.equal(await variant.inputValue(),chosen);
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!window.lab.frame.worldMap);

 releaseGallery();
 const bossArt=entries.locator('.encounter-art a');
 await bossArt.first().waitFor();
 assert.ok((await bossArt.first().getAttribute('href')).startsWith('bosses-art.html?'));
 assert.equal(await variant.inputValue(),chosen);

 await search.fill('ファルカ');
 await entries.getByRole('button',{name:'試作に挑戦'}).click();
 await page.waitForFunction(()=>window.lab.frame.boss?.name==='ファルカ模擬戦');

 await page.unroute('**/content/boss-art-gallery.json');
 await page.route('**/content/boss-art-gallery.json',route=>route.fulfill({status:503,body:'unavailable'}));
 await page.route('**/content/encounters.json',async route=>{await catalogGate;await route.continue()});
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 assert.equal(await entries.count(),0);
 releaseCatalog();
 await entries.last().waitFor({state:'attached'});
 assert.deepEqual(await entries.evaluateAll(nodes=>nodes.map(node=>node.dataset.encounter)),expectedIds);
 await panel.locator('summary').click();
 await panel.getByText('ボスの美術一覧を読み込めませんでした。',{exact:false}).waitFor();
 assert.equal(await panel.locator('[data-boss-route]:enabled').count(),destinations.length);
 assert.equal(await panel.locator('[data-runtime-action]:enabled').count(),trials.length);
 for(const row of suspended){
  const closed=panel.locator('[data-encounter="'+row.id+'"]');
  await closed.getByText(/現行の冒険では休止中/).waitFor();
  assert.equal(await closed.locator('button').count(),0);
 }
 await page.setViewportSize({width:390,height:844});
 assert.ok(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth),'The encounter panel fits a narrow screen');
 assert.deepEqual(errors,[]);
 await fs.writeFile(evidence+'-test.json',JSON.stringify({
  catalogEntries:expectedIds.length,adventureDestinations:destinations.length,directTrials:trials.length,
  suspended:suspended.map(row=>row.id),firstFrameFailureGuarded:true,
  routeOpenedDuringGalleryDelay:target,otherGalleryAvailableDuringDelay:true,variantPreserved:true,
  recoveredLaunch:'boss_farka',mapLinksSurviveGalleryFailure:true,viewport390:true,errors
 },null,2)+'\n');
 console.log(`Chrome: ${expectedIds.length} encounters, ${destinations.length} map links, ${trials.length} direct trials; loading and recovery passed`);
}finally{
 releaseFrame();
 releaseGallery();
 releaseCatalog();
 await browser.close();
}
