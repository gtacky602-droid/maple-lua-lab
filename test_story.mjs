import {chromium} from 'playwright';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
async function openPlacementComparison(node){
 const link=page.getByRole('link',{name:'この地点の配置比較を開く',exact:true})
  .and(page.locator(`a[href="map-art.html?node=${node}"]`));
 const pending=page.waitForEvent('popup');await link.click();const popup=await pending;
 popup.on('pageerror',e=>errors.push(e.message));
 await popup.waitForFunction(()=>window.mapArt?.ready);
 assert.equal(await popup.locator('#node').inputValue(),node);
 assert.deepEqual(await popup.evaluate(()=>[window.mapArt.node,window.mapArt.dirty,window.mapArt.backgroundState]),[node,false,'ready']);
 assert.equal(await page.evaluate(()=>window.lab.frame.story.node),node);
 return popup;
}
try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.story.active);
 const town=await openPlacementComparison('mond-town');await town.close();
 await page.locator('#storyPanel p').filter({hasText:'街道の安全確認'}).getByRole('button',{name:'受注'}).click();await page.waitForFunction(()=>window.lab.frame.story.quests['mond-patrol']);
 await page.getByRole('button',{name:'門：モンド・南の街道 Lv1',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.storyNotice?.includes('歩いて'));
 await page.locator('canvas').first().scrollIntoViewIfNeeded();await page.locator('canvas').first().click();await page.keyboard.down('KeyD');await page.waitForFunction(()=>window.lab.frame.actors[0].x>1305);await page.keyboard.up('KeyD');
 await page.getByRole('button',{name:'門：モンド・南の街道 Lv1',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.story.node==='mond-road');
 const road=await openPlacementComparison('mond-road');
 await road.locator('main').screenshot({path:'evidence/story-map-placement.png'});
 const invalid=new URL(road.url());invalid.searchParams.set('node','unknown');await road.goto(invalid.href);
 await road.waitForFunction(()=>window.mapArt?.ready);
 assert.equal(await road.locator('#node').inputValue(),'mond-road');
 assert.equal(await road.evaluate(()=>localStorage.getItem('maple-lua-lab.map-draft.v1')),null);
 await road.close();
 await page.locator('#saveProgress').click();await page.waitForFunction(()=>document.getElementById('saveStatus').textContent.includes('保存しました'));
 await page.reload();await page.waitForFunction(()=>window.lab?.frame);await page.locator('#loadProgress').click();await page.waitForFunction(()=>window.lab.frame.story.node==='mond-town'&&window.lab.frame.story.visited['mond-road']);
 await page.waitForFunction(()=>document.getElementById('storyPanel').textContent.includes('街道の巡回依頼'));
 await page.locator('#storyPanel').screenshot({path:'evidence/story-browser.png'});
 if(errors.length)throw Error(errors.join(' / '));await fs.writeFile('evidence/story-browser.json',JSON.stringify({errors,questAccepted:true,remotePortalRejected:true,walkedToPortal:true,visitedStage:true,savedResumedAtHub:true,placementLinksVerified:['mond-town','mond-road'],invalidPlacementLinkFallsBack:true,openingPlacementLeavesDraftClean:true},null,2));console.log('Story portal traversal, placement comparison, quest acceptance and save verified');
}catch(e){console.log(await page.evaluate(()=>({status:document.getElementById('status').textContent,actor:window.lab?.frame.actors[0],zone:window.lab?.frame.campaign?.zone})));throw e}finally{await browser.close()}
