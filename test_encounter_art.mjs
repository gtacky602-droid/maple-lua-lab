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
assert.equal(expected.filter(e=>!e.items.length).length,0);
assert.equal(expected.find(e=>e.id==='bathysmal-herd').items.length,2);
assert.deepEqual(encounterArtItems({art_candidate:{encoding:'javascript:alert(1)'}},catalogs),[]);
const browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext({viewport:{width:1440,height:1080}}),p=await context.newPage(),errors=[];
p.on('pageerror',e=>errors.push(e.message));
const base=process.env.LAB_URL||'http://127.0.0.1:8771';
const evidence=process.env.ENCOUNTER_ART_EVIDENCE_PREFIX||'evidence/encounter-art';
try{
 await p.goto(base);await p.waitForFunction(count=>window.lab?.frame&&document.querySelectorAll('[data-encounter]').length===count,expected.length);
 const panel=p.locator('#encountersPanel');await panel.locator('summary').click();
 await p.waitForFunction(count=>document.querySelectorAll('#encountersPanel .encounter-art a').length===count,
  expected.reduce((sum,entry)=>sum+entry.items.length,0));
 for(const e of expected){
  const row=panel.locator(`[data-encounter="${e.id}"]`),links=row.locator('.encounter-art a');assert.equal(await links.count(),e.items.length);
  for(let i=0;i<e.items.length;i++){
   const {page,id}=e.items[i];
   assert.equal(await links.nth(i).getAttribute('href'),`${page}?${new URLSearchParams({id})}`);
  }
 }
 async function verifyPopup(scope,page,id){
  const href=page+'?'+new URLSearchParams({id});
  const [popup]=await Promise.all([context.waitForEvent('page'),
   scope.locator(`a[href="${href}"]`).click()]);
  await popup.waitForFunction(()=>window.charactersGallery?.ready);
  assert.equal(new URL(popup.url()).pathname,`/${page}`);
  assert.equal(await popup.locator(`#cards article[data-id="${id}"]`).isVisible(),true);
  assert.equal(await popup.evaluate(()=>window.charactersGallery.visibleCount),1);
  assert.equal(new URL(popup.url()).searchParams.get('id'),id);
  if(id==='xbalanque'){
   await popup.selectOption('#profile','h48c32');
   assert.equal(new URL(popup.url()).searchParams.get('id'),id);
   await popup.fill('#assetSearch','xbalan');
   await popup.waitForFunction(()=>window.charactersGallery?.ready&&window.charactersGallery.visibleCount===3);
   assert.equal(new URL(popup.url()).searchParams.has('id'),false);
   assert.equal(new URL(popup.url()).searchParams.get('q'),'xbalan');
  }
  await popup.close();
 }
 await panel.getByLabel('ボス名で検索').fill('アビサルヴィシャップの群れ');
 assert(await panel.getByRole('button',{name:'ゲーム内の地図で案内'}).isEnabled());
 for(const id of ['rimebiter','bolteater']){
  await verifyPopup(panel,'bosses-art.html',id);
 }
 await panel.getByLabel('ボス名で検索').fill('');
 await panel.getByLabel('ボスの分類').selectOption('stygian');
 for(const id of ['beidou','wanderer']){
  const row=panel.locator(`[data-encounter="stygian-${id}"]`);
  assert(await row.getByRole('button',{name:'ゲーム内の地図で案内'}).isEnabled());
  assert.match(await row.locator('.encounter-art').innerText(),/同行キャラの待機絵を共用/);
  await verifyPopup(row,'characters-art.html',id);
 }
 for(const [id,asset] of [['capitano','capitano-coat'],['xbalanque','xbalanque'],['rerir','rerir'],['ronova','ronova']]){
  const row=panel.locator(`[data-encounter="stygian-${id}"]`);
  assert(await row.getByRole('button',{name:'ゲーム内の地図で案内'}).isEnabled());
  await verifyPopup(row,'bosses-art.html',asset);
 }
 await panel.screenshot({path:evidence+'-desktop.png'});
 await p.setViewportSize({width:390,height:844});await panel.screenshot({path:evidence+'-mobile.png'});
 assert.equal(await panel.evaluate(el=>el.scrollWidth>el.clientWidth),false);
 for(const [key,{catalog}] of Object.entries(encounterArtGalleries)){
  const routePattern=`**/${catalog}`;
  const faultPage=await context.newPage();
  faultPage.on('pageerror',e=>errors.push(e.message));
  try{
   await faultPage.setViewportSize({width:390,height:844});
   await faultPage.route(routePattern,route=>route.fulfill({status:503,body:'unavailable'}));
   await faultPage.goto(base);
   await faultPage.waitForFunction(count=>window.lab?.frame&&document.querySelectorAll('[data-encounter]').length===count,expected.length);
   const faultPanel=faultPage.locator('#encountersPanel');
   await faultPanel.locator('summary').click();
   const remaining=expected.flatMap(e=>e.items).filter(item=>item.gallery!==key);
   await faultPage.waitForFunction(count=>document.querySelectorAll('#encountersPanel .encounter-art a').length===count,remaining.length);
   await faultPanel.getByLabel('ボス名で検索').fill('ファルカ');
   await faultPanel.getByRole('button',{name:'試作に挑戦'}).click();
   await faultPage.waitForFunction(()=>window.lab.frame.boss?.name==='ファルカ模擬戦');
  }finally{await faultPage.close()}
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(evidence+'-test.json',JSON.stringify({rows:expected.length,rowsWithArt:expected.filter(e=>e.items.length).length,artLinks:expected.reduce((n,e)=>n+e.items.length,0),bossPopupsVerified:6,characterPopupsVerified:2,mobilePanelOverflow:false,catalogFailuresPreserveOtherLinksAndLaunch:true,exactArtAndEditableSearch:true,errors},null,2));
 console.log('Encounter art links, boss and character navigation, mobile and catalog failures passed');
}finally{await browser.close()}
