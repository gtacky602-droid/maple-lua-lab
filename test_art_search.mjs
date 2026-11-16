import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const b=await chromium.launch({headless:true,channel:'chrome'});
const p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];
p.on('pageerror',e=>errors.push(e.message));
const state=()=>p.evaluate(()=>window.charactersGallery);
const visible=()=>p.locator('#cards article:visible').count();
try{
 for(const [file,query,count] of [['bosses-art.html','千年真珠',2],['characters-art.html','旅人',1],['enemies-art.html','水スライム',2]]){
  await p.goto((process.env.LAB_URL||'http://127.0.0.1:8771')+'/'+file);
  await p.waitForFunction(()=>window.charactersGallery?.ready,null,{timeout:60000});
  const total=(await state()).count;assert.equal(await visible(),total);
  await p.fill('#assetSearch',query);assert.equal(await visible(),count);assert.equal((await state()).visibleCount,count);
  await p.selectOption('#profile','h48c32');await p.selectOption('#zoom','3');await p.check('#flip');
  assert.equal(await visible(),count);assert.equal((await state()).query,query);
  assert.ok((await p.locator('#cards article:visible .stats').first().textContent()).includes('矩形'));
  await p.fill('#assetSearch','存在しない素材xyz');assert.equal(await visible(),0);assert.match(await p.locator('#searchResults').textContent(),/該当する素材がありません/);
  await p.click('#clearAssetSearch');assert.equal(await visible(),total);assert.equal((await state()).profile,'h48c32');assert.equal((await state()).flip,true);
  assert.equal(await p.evaluate(()=>document.activeElement.id),'assetSearch');
  await p.fill('#assetSearch',query);await p.setViewportSize({width:390,height:844});
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await p.screenshot({path:`evidence/${file.replace('.html','')}-search.png`,fullPage:true});
  await p.setViewportSize({width:1440,height:1000});checks.push({file,total,query,matches:count});
 }
 await p.goto((process.env.LAB_URL||'http://127.0.0.1:8771')+'/bosses-art.html');await p.waitForFunction(()=>window.charactersGallery?.ready);
 await p.fill('#assetSearch','ＳＥＡＨＯＲＳＥ　ｖ１');assert.equal(await visible(),1);assert.equal(await p.locator('#cards article:visible').getAttribute('data-id'),'seahorse-v1');
 await p.fill('#assetSearch','<img src=x onerror=alert(1)>');assert.equal(await visible(),0);assert.equal(await p.locator('#searchResults img').count(),0);
 assert.deepEqual(errors,[]);await fs.writeFile('evidence/art-search-test.json',JSON.stringify({checks,multipleTerms:true,unicodeNormalization:true,noMatch:true,clearRetainsSettings:true,mobileOverflow:false,errors},null,2));
 console.log('Art search passed for bosses, characters and enemies');
}finally{await b.close()}
