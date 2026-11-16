import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {encounterArtItems} from './encounter-art.js';
const data=JSON.parse(await fs.readFile('content/encounters.json','utf8'));
const catalog=JSON.parse(await fs.readFile('content/boss-art-gallery.json','utf8')).items;
const expected=data.encounters.map(e=>({id:e.id,items:encounterArtItems(e,catalog)}));
for(const encounter of data.encounters){
 const declared=[encounter.art_candidate,...encounter.art_variants??[],...encounter.art_components??[]].filter(Boolean);
 for(const art of declared)assert(catalog.some(item=>'assets/'+item.file===art.encoding),'Missing registered art '+art.encoding);
}
assert.equal(expected.find(e=>e.id==='bathysmal-herd').items.length,2);
assert.deepEqual(encounterArtItems({art_candidate:{encoding:'javascript:alert(1)'}},catalog),[]);
const browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext({viewport:{width:1440,height:1080}}),p=await context.newPage(),errors=[];
p.on('pageerror',e=>errors.push(e.message));
const base=process.env.LAB_URL||'http://127.0.0.1:8771';
try{
 await p.goto(base);await p.waitForFunction(()=>window.lab?.frame&&document.querySelectorAll('[data-encounter]').length===66);
 const panel=p.locator('#encountersPanel');await panel.locator('summary').click();
 for(const e of expected){
  const row=panel.locator(`[data-encounter="${e.id}"]`),links=row.locator('.encounter-art a');assert.equal(await links.count(),e.items.length);
  for(let i=0;i<e.items.length;i++)assert.equal(new URL(await links.nth(i).getAttribute('href'),base).searchParams.get('q'),e.items[i].id);
 }
 await panel.getByLabel('ボス名で検索').fill('アビサルヴィシャップの群れ');
 assert(await panel.getByRole('button',{name:'制作中',exact:true}).isDisabled());
 await panel.screenshot({path:'evidence/encounter-art-desktop.png'});
 for(const id of ['rimebiter','bolteater']){
  const popupPromise=context.waitForEvent('page');await panel.locator(`a[href$="q=${id}"]`).click();const popup=await popupPromise;
  await popup.waitForFunction(()=>window.charactersGallery?.ready);assert.equal(await popup.locator(`#cards article[data-id="${id}"]`).isVisible(),true);assert.equal(await popup.evaluate(()=>window.charactersGallery.visibleCount),1);await popup.close();
 }
 await p.setViewportSize({width:390,height:844});await panel.screenshot({path:'evidence/encounter-art-mobile.png'});
 assert.equal(await panel.evaluate(el=>el.scrollWidth>el.clientWidth),false);
 // A missing art catalog must not remove combat rows or disable existing actions.
 await p.route('**/content/boss-art-gallery.json',route=>route.fulfill({status:503,body:'unavailable'}));await p.reload();
 await p.waitForFunction(()=>window.lab?.frame&&document.querySelectorAll('[data-encounter]').length===66);
 if(!await panel.evaluate(el=>el.open))await panel.locator('summary').click();
 assert.equal(await panel.locator('.encounter-art a').count(),0);
 await panel.getByLabel('ボス名で検索').fill('ファルカ');await panel.getByRole('button',{name:'試作に挑戦'}).click();await p.waitForFunction(()=>window.lab.frame.boss?.name==='ファルカ模擬戦');
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/encounter-art-test.json',JSON.stringify({rows:expected.length,rowsWithArt:expected.filter(e=>e.items.length).length,artLinks:expected.reduce((n,e)=>n+e.items.length,0),pairPopupsVerified:2,mobilePanelOverflow:false,catalogFailurePreservesLaunch:true,errors},null,2));
 console.log('Encounter art links, pair navigation, mobile and catalog failure passed');
}finally{await browser.close()}
