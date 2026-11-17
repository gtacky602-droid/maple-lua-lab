import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {encounterArtGalleries,encounterArtItems,encounterArtReferences} from './encounter-art.js';
const data=JSON.parse(await fs.readFile('content/encounters.json','utf8'));
const catalogs=Object.fromEntries(await Promise.all(Object.entries(encounterArtGalleries).map(async ([key,{catalog}])=>[
 key,JSON.parse(await fs.readFile(catalog,'utf8')).items,
])));
const expected=data.encounters.map(e=>({id:e.id,items:encounterArtItems(e,catalogs)}));
for(const encounter of data.encounters){
 for(const art of encounterArtReferences(encounter)){
  assert(catalogs[art.gallery??'bosses']?.some(item=>'assets/'+item.file===art.encoding),'Missing registered art '+art.encoding);
 }
}
assert.deepEqual(expected.filter(e=>!e.items.length).map(e=>e.id),['stygian-rerir','stygian-ronova']);
assert.equal(expected.find(e=>e.id==='bathysmal-herd').items.length,2);
assert.deepEqual(encounterArtItems({art_candidate:{encoding:'javascript:alert(1)'}},catalogs),[]);
const browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext({viewport:{width:1440,height:1080}}),p=await context.newPage(),errors=[];
p.on('pageerror',e=>errors.push(e.message));
const base=process.env.LAB_URL||'http://127.0.0.1:8771';
try{
 await p.goto(base);await p.waitForFunction(count=>window.lab?.frame&&document.querySelectorAll('[data-encounter]').length===count,expected.length);
 const panel=p.locator('#encountersPanel');await panel.locator('summary').click();
 for(const e of expected){
  const row=panel.locator(`[data-encounter="${e.id}"]`),links=row.locator('.encounter-art a');assert.equal(await links.count(),e.items.length);
  for(let i=0;i<e.items.length;i++){
   const {page,id}=e.items[i];
   assert.equal(await links.nth(i).getAttribute('href'),`${page}?${new URLSearchParams({q:id})}`);
  }
 }
 async function verifyPopup(link,page,id){
  const popupPromise=context.waitForEvent('page');await link.click();const popup=await popupPromise;
  await popup.waitForFunction(()=>window.charactersGallery?.ready);
  assert.equal(new URL(popup.url()).pathname,`/${page}`);
  assert.equal(await popup.locator(`#cards article[data-id="${id}"]`).isVisible(),true);
  assert.equal(await popup.evaluate(()=>window.charactersGallery.visibleCount),1);
  await popup.close();
 }
 await panel.getByLabel('ボス名で検索').fill('アビサルヴィシャップの群れ');
 assert(await panel.getByRole('button',{name:'制作中',exact:true}).isDisabled());
 for(const id of ['rimebiter','bolteater']){
  await verifyPopup(panel.locator(`a[href$="q=${id}"]`),'bosses-art.html',id);
 }
 await panel.getByLabel('ボス名で検索').fill('');
 await panel.getByLabel('ボスの分類').selectOption('stygian');
 for(const id of ['beidou','wanderer']){
  const row=panel.locator(`[data-encounter="stygian-${id}"]`);
  assert(await row.getByRole('button',{name:'制作中',exact:true}).isDisabled());
  assert.match(await row.locator('.encounter-art').innerText(),/同行キャラの待機絵を共用/);
  await verifyPopup(row.locator('.encounter-art a'),'characters-art.html',id);
 }
 for(const [id,asset] of [['capitano','capitano-coat'],['xbalanque','xbalanque']]){
  const row=panel.locator(`[data-encounter="stygian-${id}"]`);
  assert(await row.getByRole('button',{name:'制作中',exact:true}).isDisabled());
  await verifyPopup(row.locator('.encounter-art a'),'bosses-art.html',asset);
 }
 await panel.screenshot({path:'evidence/encounter-art-desktop.png'});
 await p.setViewportSize({width:390,height:844});await panel.screenshot({path:'evidence/encounter-art-mobile.png'});
 assert.equal(await panel.evaluate(el=>el.scrollWidth>el.clientWidth),false);
 for(const [key,{catalog}] of Object.entries(encounterArtGalleries)){
  const routePattern=`**/${catalog}`;
  await p.route(routePattern,route=>route.fulfill({status:503,body:'unavailable'}));await p.reload();
  await p.waitForFunction(count=>window.lab?.frame&&document.querySelectorAll('[data-encounter]').length===count,expected.length);
  if(!await panel.evaluate(el=>el.open))await panel.locator('summary').click();
  const remaining=expected.flatMap(e=>e.items).filter(item=>item.gallery!==key);
  assert.equal(await panel.locator('.encounter-art a').count(),remaining.length);
  await panel.getByLabel('ボス名で検索').fill('ファルカ');await panel.getByRole('button',{name:'試作に挑戦'}).click();await p.waitForFunction(()=>window.lab.frame.boss?.name==='ファルカ模擬戦');
  await p.unroute(routePattern);
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/encounter-art-test.json',JSON.stringify({rows:expected.length,rowsWithArt:expected.filter(e=>e.items.length).length,artLinks:expected.reduce((n,e)=>n+e.items.length,0),bossPopupsVerified:4,characterPopupsVerified:2,mobilePanelOverflow:false,catalogFailuresPreserveOtherLinksAndLaunch:true,errors},null,2));
 console.log('Encounter art links, boss and character navigation, mobile and catalog failures passed');
}finally{await browser.close()}
