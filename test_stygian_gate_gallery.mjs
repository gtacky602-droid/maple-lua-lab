import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.LAB_URL??'http://127.0.0.1:19743/';
const {matches}=JSON.parse(await readFile('content/stygian-matches.json','utf8'));
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 for(const [id,match] of Object.entries(matches)){
  await page.goto(base+'map-art.html?'+new URLSearchParams({node:match.node,placements:'live',profile:'h32c16'}));
  const panel=page.locator('#stygianRules');
  await panel.locator('summary').click();
  const spec=match.modes.map(mode=>mode.name+mode.level+mode.hp.toLocaleString('ja-JP'));
  assert.deepEqual(await panel.locator('tbody tr').allTextContents(),spec);
  const entrance=panel.getByRole('link',{name:/入口を見る/});
  await entrance.click();
  await page.waitForFunction(hub=>window.mapArt?.ready&&window.mapArt.node===hub,match.hub);
  await panel.locator('summary').click();
  assert.deepEqual(await panel.locator('tbody tr').allTextContents(),spec);
  const gallery=panel.locator('nav a').last();
  await page.selectOption('#profile','h48c32');
  assert.equal(new URL(await gallery.getAttribute('href'),base).searchParams.get('profile'),'h48c32');
  const galleryUrl=await gallery.evaluate(link=>link.href);
  await panel.getByRole('link',{name:'会場の開幕配置'}).click();
  await page.waitForFunction(node=>window.mapArt?.ready&&window.mapArt.node===node,match.node);
  await page.goto(galleryUrl);
  if(id==='farka'){
   await page.waitForFunction(()=>window.farkaIdle);
   assert.equal(await page.inputValue('#facing'),'left');
  }else{
   await page.waitForFunction(()=>window.charactersGallery?.ready&&window.charactersGallery.visibleCount>0);
   assert.equal(await page.inputValue('#assetSearch'),id);
  }
  assert.equal(await page.inputValue('#profile'),'h48c32');
  console.log(id,'arena, physical hub gate, difficulty rows and art verified');
 }
}finally{await browser.close()}
