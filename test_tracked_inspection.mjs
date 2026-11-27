import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await readFile('content/story-graph.json','utf8'));
const browser=await chromium.launch({channel:'chrome'});
const page=await browser.newPage();
page.setDefaultTimeout(12000);
const captures=process.env.LAB_INSPECTION_CAPTURES??'evidence';
try{
 const drive=waypointDriver(page,Object.fromEntries(graph.nodes.map(n=>[n.id,n])));
 const id='chenyu-tea-delivery';
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9125/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/chenyu-tea-fixture.json');
 await drive.waitNode('chenyu-camp');
 const row=page.locator('[data-quest="'+id+'"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await row.getByRole('button',{name:'この依頼を追跡',exact:true}).click();
 await drive.cross('chenyu-tea-terraces');
 const hint=page.locator('#trackedHuntHint');
 await hint.filter({hasText:/茶畑の荷札.*右手/}).waitFor();
 await drive.walk(318);
 await hint.filter({hasText:/茶畑の荷札.*すぐ近く/}).waitFor();
 await page.keyboard.press('KeyG');
 await hint.filter({hasText:/畝を見下ろす道標.*右手・上段/}).waitFor();
 await drive.walk(929);
 await hint.filter({hasText:/道標.*今いる足場の上/}).waitFor();
 await page.locator('#trackedQuest').screenshot({path:captures+'/tracked-tea-sign-above.png'});
 await drive.changeHeight(390);
 await hint.filter({hasText:/道標.*すぐ近く/}).waitFor();
 await page.keyboard.press('KeyG');
 await hint.filter({hasText:/二手に分かれる案内.*右手・下段/}).waitFor();
 await drive.walk(1430);
 await drive.changeHeight(480);
 await page.keyboard.press('KeyG');
 await drive.count(id,3);
 await page.keyboard.press('KeyM');
 await page.waitForFunction(()=>window.lab.frame.worldMap?.selected?.id==='chenyu-tea-terraces');
 assert.equal(await page.evaluate(()=>window.lab.frame.worldMap.selected.questField),true);
 const upper='chenyu-tea-pavilion',lower='chenyu-cart-road';
 for(const [target,y] of [[upper,'384'],[lower,'480']]){
  const link=page.locator(`#atlasRoutes a[href*="to=${target}"]`);
  const params=new URL(await link.getAttribute('href'),page.url()).searchParams;
  assert.equal(params.get('gateY'),y);
 }
 await page.locator('#atlasRoutes').screenshot({path:captures+'/chenyu-tea-route-choices.png'});
 await page.locator('#atlasClose').click();
 await page.waitForFunction(()=>!window.lab.frame.worldMap);
 const landings=[];
 for(const [target,x] of [[lower,305],['chenyu-tea-terraces',1735],[lower,305],[upper,109]]){
  await drive.cross(target);
  assert.deepEqual([(await drive.actor()).x,(await drive.actor()).y],[x,480]);
  landings.push({target,x,y:480});
 }
 await drive.walk(660);
 await page.keyboard.press('KeyG');
 await drive.count(id,4);
 await drive.cross(lower);
 assert.deepEqual([(await drive.actor()).x,(await drive.actor()).y],[1540,480]);
 landings.push({target:lower,x:1540,y:480});
 await drive.walk(1234);
 await page.keyboard.press('KeyG');
 await drive.count(id,5);
 await drive.cross('chenyu-camp');
 await drive.report(id);
 const result={twoAtlasGates:true,landings,journeys:drive.journeys,reported:id};
 if(process.env.LAB_INSPECTION_CAPTURES){
  await writeFile(captures+'/tracked-tea-route.json',JSON.stringify(result,null,2)+'\n');
 }
 console.log('Tracked tea signs, both M-map gates, ground-route delivery and return passed.');
}catch(error){
 console.error(await page.evaluate(()=>{
  const f=window.lab?.frame,a=f?.actors.find(actor=>actor.id===f.active);
  return {node:f?.story?.node,actor:a&&[a.x,a.y,a.hp],atlasOpen:!!f?.worldMap,
   hint:document.querySelector('#trackedHuntHint')?.textContent,save:document.querySelector('#saveStatus')?.textContent};
 }));
 throw error;
}finally{await browser.close()}
