import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=process.env.FIELD_EDITOR_TEST_URL;if(!url)throw Error('Run python -m tools.field_editor.run_browser_checks');
const output=process.env.FIELD_EDITOR_SCREENSHOTS||'work/field-editor-qa';await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1680,height:1100},acceptDownloads:true});
const page=await context.newPage(),errors=[],checks=[],network=[];
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/tiles/')&&r.status()!==200)network.push({url:r.url(),status:r.status()})});
async function check(name,fn){await fn();checks.push(name);console.log('PASS',name)}
async function approve({protectedValue=false}={}){await page.locator('#reviewConsent').check();if(protectedValue&&await page.locator('#overwriteApproved').count())await page.locator('#overwriteApproved').check();await page.locator('#approveProposal').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);}
const node=i=>page.locator(`[data-field-id="${i}"]`);
try{
 await page.goto(url,{waitUntil:'networkidle'});
 await check('Mondstadt shows 51 navigation points, 13 domains and zero default connections',async()=>{assert.equal(await page.locator('#pointCount').textContent(),'64');assert.equal(await page.locator('.map-node:not(.domain)').count(),51);assert.equal(await page.locator('.map-node.domain').count(),13);assert.equal(await page.locator('.map-node.statue').count(),6);assert.equal(await page.locator('#edgeCount').textContent(),'0');const a=await node('teyvat:3').boundingBox(),b=await node('teyvat:7').boundingBox();assert.ok(Math.abs(a.x-b.x)>10);assert.ok(Math.abs((b.x-a.x)/(b.y-a.y)-(756.5-373.5)/(46.5-145.5))<0.01)});
 await check('Official terrain loads successfully',async()=>{await page.waitForFunction(()=>{const t=document.querySelector('#mapLoading').textContent,m=t.match(/(\d+)\/(\d+)タイル/);return m&&Number(m[2])>0&&m[1]===m[2]&&!t.includes('失敗')},{timeout:60000});assert.equal(network.length,0)});
 await page.screenshot({path:output+'/mondstadt-overview.png',fullPage:true});
 await check('Click and save field proposal, approve, reload',async()=>{
  await node('teyvat:3').click();await page.locator('[name="name"]').fill('QA・風の狩場');await page.locator('[name="recommended_level"]').fill('8');await page.locator('[name="reason"]').fill('QA: 地点編集と再読込');await page.locator('#fieldForm button[type=submit]').click();await page.locator('#reviewConsent').waitFor();assert.match(await page.locator('#modalBody').innerText(),/QA・風の狩場/);await approve();await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('[name="name"]').inputValue(),'QA・風の狩場');assert.equal(await page.locator('[name="recommended_level"]').inputValue(),'8');
 });
 await check('Drag one map marker directly onto another to propose a connection',async()=>{
  assert.equal(await page.locator('#connectMode').isChecked(),false);
  const a=await node('teyvat:3').boundingBox(),b=await node('teyvat:7').boundingBox();
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);
  await page.mouse.down();
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:15});
  await page.locator('[data-field-id="teyvat:7"].connection-target').waitFor();
  await page.mouse.up();
  await page.locator('#edgeForm').waitFor();
  assert.equal(await page.locator('[name="from_field"]').inputValue(),'teyvat:3');
  assert.equal(await page.locator('[name="to_field"]').inputValue(),'teyvat:7');
  await page.locator('[name="direction"]').selectOption('one_way');
  await page.locator('[name="kind"]').selectOption('level');
  await page.locator('[name="min_level"]').fill('8');
  await page.locator('#edgeForm button.primary').click();
  await page.locator('#reviewConsent').waitFor();
  assert.equal(await page.locator('#edgeCount').textContent(),'0');
  await approve();
  assert.equal(await page.locator('#edgeCount').textContent(),'1');
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.locator('#edgeCount').textContent(),'1');
 });
 await check('Ctrl+Z and Ctrl+Y reverse and restore approved connection with history',async()=>{
  await page.locator('[data-view="geo"]').click();await page.keyboard.press('Control+z');await page.waitForFunction(()=>document.querySelector('#edgeCount').textContent==='0');await page.keyboard.press('Control+y');await page.waitForFunction(()=>document.querySelector('#edgeCount').textContent==='1');
 });
 await check('Right-click a connection line to open and edit its saved settings',async()=>{
  await page.locator('#zoomIn').click();
  await page.locator('#zoomIn').click();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const a=await node('teyvat:3').boundingBox(),b=await node('teyvat:7').boundingBox();
  const x=(a.x+b.x+a.width)/2,y=(a.y+b.y+a.height)/2;
  await page.mouse.click(x,y,{button:'right'});
  await page.locator('#edgeForm').waitFor();
  assert.equal(await page.locator('[name="from_field"]').inputValue(),'teyvat:3');
  assert.equal(await page.locator('[name="direction"]').inputValue(),'one_way');
  assert.equal(await page.locator('[name="min_level"]').inputValue(),'8');
  await page.locator('#modal [name="notes"]').fill('QA: right click edits the existing edge');
  await page.locator('#edgeForm button.primary').click();
  await approve({protectedValue:true});
  assert.equal(await page.locator('#edgeCount').textContent(),'1');
  await page.mouse.click(x,y);
  await page.locator('#editSelectedEdge').waitFor();
 });
 await check('Graph view and independent draggable node layout',async()=>{
  await page.locator('[data-view="graph"]').click();await page.locator('#fitMap').click();const b=await node('teyvat:3').boundingBox();await page.mouse.move(b.x+30,b.y+20);await page.mouse.down();await page.mouse.move(b.x+60,b.y+45,{steps:10});await page.mouse.up();await page.locator('#reviewConsent').waitFor();await approve();await page.reload({waitUntil:'networkidle'});assert.match(await node('teyvat:3').getAttribute('class'),/graph/);await page.screenshot({path:output+'/connection-graph.png',fullPage:true});
 });
 await check('Graph connection handle works with connection mode off',async()=>{
  assert.equal(await page.locator('#connectMode').isChecked(),false);
  const a=await node('teyvat:3').locator('.connection-handle').boundingBox(),b=await node('teyvat:7').boundingBox();
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);
  await page.mouse.down();
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:15});
  await page.mouse.up();
  await page.locator('#edgeForm').waitFor();
  assert.equal(await page.locator('[name="from_field"]').inputValue(),'teyvat:3');
  assert.equal(await page.locator('[name="to_field"]').inputValue(),'teyvat:7');
  await page.locator('#modalClose').click();
 });
 await check('Create monster family through editor',async()=>{
  await page.locator('#monsterOpen').click();await page.locator('#newFamily').click();await page.locator('#modal [name="family_id"]').fill('qa-family');await page.locator('#modal [name="name"]').fill('QAヒルチャール系統');await page.locator('#modal [name="defaults"]').fill('{"hp":100,"attack":10,"defense":5}');await page.locator('#familyForm button[type=submit]').click();await approve();
 });
 await check('Create regional variant and inherited stats',async()=>{
  await page.locator('#monsterOpen').click();await page.locator('#newVariant').click();await page.locator('#modal [name="monster_id"]').fill('qa-mond-hilichurl');await page.locator('#modal [name="name"]').fill('QAヒルチャール');await page.locator('#modal [name="family_id"]').selectOption('qa-family');await page.locator('#modal [name="region_id"]').selectOption('region-01');await page.locator('#modal [name="base_level"]').fill('5');await page.locator('#variantForm button[type=submit]').click();await approve();
 });
 await check('Add spawn from bestiary with automatic base level',async()=>{
  await node('teyvat:3').click();await page.locator('#addMonster').click();await page.locator('[data-pick-monster="qa-mond-hilichurl"]').click();assert.match(await page.locator('#modalBody').innerText(),/基準Lv 5/);assert.match(await page.locator('#modalBody').innerText(),/HP 100/);await page.locator('#modal [name="count"]').fill('10');await page.locator('#spawnForm button[type=submit]').click();await approve();assert.match(await page.locator('#spawnList').innerText(),/Lv5 × 10体/);
 });
 await check('Variant base level change previews impact then updates reference',async()=>{
  await page.locator('#monsterOpen').click();await page.locator('[data-edit-monster="qa-mond-hilichurl"]').click();await page.locator('#modal [name="base_level"]').fill('6');await page.locator('#variantForm button[type=submit]').click();await page.locator('#reviewConsent').waitFor();assert.match(await page.locator('#modalBody').innerText(),/影響 1フィールド/);await approve({protectedValue:true});assert.match(await page.locator('#spawnList').innerText(),/Lv6 × 10体/);
 });
 await check('Japanese instruction becomes protected proposal and has undo/redo preview',async()=>{
  await page.locator('[data-dock="chat"]').click();await page.locator('#chatInput').fill('teyvat:3の推奨Lvを9にする');await page.locator('#chatForm button[type=submit]').click();await page.locator('#previewOnly').click();await page.keyboard.press('Control+z');assert.match(await page.locator('#toast').textContent(),/取り消し/);await page.keyboard.press('Control+y');await page.locator('#reviewConsent').waitFor();await approve({protectedValue:true});assert.equal(await page.locator('[name="recommended_level"]').inputValue(),'9');
 });
 await check('Import ChatGPT change JSON; approved data changes only after review',async()=>{
  await page.locator('[data-dock="proposals"]').click();await page.locator('#importProposal').click();const initial=JSON.parse(await page.locator('#changeJson').inputValue());initial.reason='QA JSON取込';initial.operations=[{collection:'field_definitions',id:'teyvat:3',changes:{notes:'ChatGPT JSON import test'}}];await page.locator('#changeJson').fill(JSON.stringify(initial));await page.locator('#parseJson').click();await approve();assert.equal(await page.locator('[name="notes"]').inputValue(),'ChatGPT JSON import test');
 });
 await check('Route display, graph checks and high-level branch isolation',async()=>{
  await page.locator('[data-view="route"]').click();await page.locator('#checkGraph').click();await page.locator('.report-row').first().waitFor();await page.locator('[data-map="branch-01-map"]').click();assert.match(await page.locator('#mapGuide').textContent(),/35.*40–55.*60/);assert.equal(await page.locator('#pointCount').textContent(),'13');await page.locator('[data-map="branch-06-map"]').click();assert.match(await page.locator('#mapGuide').textContent(),/150.*155–170.*175/);await page.locator('[data-map="region-01-map"]').click();await page.locator('[data-view="geo"]').click();await page.locator('#fitMap').click();
 });
 await check('Export PNG, JSON, CSV, Markdown, edges and approved runtime',async()=>{
  await page.waitForFunction(()=>{const t=document.querySelector('#mapLoading').textContent,m=t.match(/(\d+)\/(\d+)タイル/);return m&&Number(m[2])>0&&m[1]===m[2]},{timeout:60000});await page.locator('#exportOpen').click();for(const fmt of ['json','markdown','csv','edges','runtime','world-runtime','png']){const pending=page.waitForEvent('download');await page.locator(`[data-export="${fmt}"]`).click();const dl=await pending;assert.ok(dl.suggestedFilename());if(fmt==='png')await dl.saveAs(output+'/mondstadt-overlay.png');else if(fmt==='runtime'){await dl.saveAs(output+'/runtime.json')}}await page.locator('#modalClose').click();
 });
 await check('Missing historical terrain cannot be exported as an official overlay',async()=>{
  await page.locator('[data-map="hidden-01-map"]').click();await page.locator('#exportOpen').click();await page.locator('[data-export="png"]').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('公式地形が未取得'));await page.locator('#modalClose').click();await page.locator('[data-map="region-01-map"]').click();
 });
 await node('teyvat:3').click();await page.screenshot({path:output+'/editor-with-field.png',fullPage:true});
 await check('Narrow viewport has no horizontal document overflow',async()=>{await page.setViewportSize({width:390,height:844});await page.screenshot({path:output+'/mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1))});
 assert.deepEqual(errors,[]);
 await check('Create a waypoint and multiple dragged connections in one reviewed transaction',async()=>{
  await page.setViewportSize({width:1680,height:1100});
  await page.locator('[data-map="region-01-map"]').click();
  await page.locator('[data-view="geo"]').click();
  const snapshot=()=>page.evaluate(()=>fetch('/api/bootstrap').then(r=>r.json()).then(b=>b.project));
  const before=await snapshot();
  await page.locator('#addWaypoint').click();
  await page.locator('#mapCanvas').click({position:{x:250,y:125}});
  await page.locator('#waypointForm [name="name"]').fill('QA・ワープ狩場');
  const x=Number(await page.locator('#waypointForm [name="x"]').inputValue());
  const y=Number(await page.locator('#waypointForm [name="y"]').inputValue());
  await page.locator('#waypointForm button.primary').click();
  const marker=page.locator('.map-node[data-field-id^="waypoint-"]');
  await marker.waitFor();
  const waypoint=await marker.getAttribute('data-field-id');
  assert.equal(await page.locator('.map-node.statue').count(),6);
  assert.match(await marker.getAttribute('class'),/waypoint.*preview/);
  for(const to of ['teyvat:3','teyvat:7']){
   const a=await marker.boundingBox(),b=await node(to).boundingBox();
   await page.mouse.move(a.x+a.width/2,a.y+a.height/2);
   await page.mouse.down();
   await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12});
   await page.mouse.up();
   await page.locator('#edgeForm').waitFor();
   assert.equal(await page.locator('#edgeForm [name="from_field"]').inputValue(),waypoint);
   assert.equal(await page.locator('#edgeForm [name="to_field"]').inputValue(),to);
   await page.locator('#queueEdge').click();
  }
  assert.equal((await snapshot()).revision,before.revision);
  assert.equal((await snapshot()).field_definitions[waypoint],undefined);
  await page.locator('#reviewMapDrafts').click();
  assert.equal(await page.locator('.map-drafts li').count(),3);
  await page.screenshot({path:output+'/waypoint-and-connections.png',fullPage:true});
  await page.locator('#submitMapDrafts').click();
  await page.locator('#reviewConsent').waitFor();
  assert.equal((await snapshot()).revision,before.revision);
  await approve();
  const after=await snapshot();
  assert.equal(after.revision,before.revision+1);
  assert.deepEqual(after.field_definitions[waypoint].waypoint_position,{map_id:'region-01-map',x,y});
  assert.equal(Object.values(after.field_edges).filter(e=>e.from_field===waypoint).length,2);
  await page.reload({waitUntil:'networkidle'});
  await marker.waitFor();
  assert.equal(await page.locator('#fieldForm [name="name"]').inputValue(),'QA・ワープ狩場');
  const exported=await page.evaluate(async()=>{
   const {ui_token}=await fetch('/api/bootstrap').then(r=>r.json());
   return fetch('/api/export?map_id=region-01-map',{headers:{'X-Editor-UI':ui_token}}).then(r=>r.json());
  });
  assert.equal(exported.map_nodes[waypoint].custom,true);
  assert.ok(exported.map_definition.node_ids.includes(waypoint));
  await page.locator('#undo').click();
  await marker.waitFor({state:'detached'});
  assert.equal(Object.values((await snapshot()).field_edges).filter(e=>e.from_field===waypoint).length,0);
  await page.locator('#redo').click();
  await marker.waitFor();
  assert.equal(Object.values((await snapshot()).field_edges).filter(e=>e.from_field===waypoint).length,2);
 });
 await check('All eight countries open directly; create a waypoint and connect across countries',async()=>{
  for(let i=1;i<=8;i++){
   await page.locator('[data-map="region-0'+i+'-map"]').click();
   assert.ok(Number(await page.locator('#pointCount').textContent())>0);
   await page.locator('#addWaypoint').click();
   assert.match(await page.locator('#mapHint').textContent(),/追加したい位置/);
   await page.keyboard.press('Escape');
  }
  await page.locator('[data-map="region-02-map"]').click();
  await page.locator('#addWaypoint').click();
  await page.locator('#mapCanvas').click({position:{x:240,y:115}});
  await page.locator('#waypointForm [name="name"]').fill('QA・璃月の新フィールド');
  await page.locator('#waypointForm button.primary').click();
  await page.locator('#inspectorBody').getByRole('button',{name:'接続を作成'}).click();
  const form=page.locator('#edgeForm');
  const waypoint=await form.locator('[name="from_field"]').inputValue();
  assert.match(waypoint,/^waypoint-/);
  assert.equal(await form.locator('[name="from_map"]').inputValue(),'region-02-map');
  await form.locator('[name="to_map"]').selectOption('region-08-map');
  assert.ok(await form.locator('[name="to_field"] option').count()>1);
  const destination=await form.locator('[name="to_field"] option').nth(1).getAttribute('value');
  await form.locator('[name="to_field"]').selectOption(destination);
  await form.locator('[name="entry_x"]').fill('12.75');
  await page.screenshot({path:output+'/country-connection.png',fullPage:true});
  await form.locator('button.primary').click();
  await approve();
  await page.locator('[data-view="graph"]').click();
  await node(destination).waitFor();
  const {project}=await page.evaluate(()=>fetch('/api/bootstrap').then(r=>r.json()));
  assert.equal(project.field_definitions[waypoint].waypoint_position.map_id,'region-02-map');
  assert.equal(Object.values(project.field_edges).find(e=>e.from_field===waypoint&&e.to_field===destination).entrance_position.x,12.75);
 });
 await check('Previously missing maps show confirmed official points and floor images',async()=>{
  await page.locator('[data-view="geo"]').click();
  for(const [mapId,fieldId,floorId] of [
   ['branch-02-map','teyvat:64832','150'],
   ['branch-04-map','teyvat:46523','64'],
   ['branch-07-map','teyvat:79548','202'],
   ['branch-09-map','teyvat:106184','349']
  ]){
   await page.locator('[data-map="'+mapId+'"]').click();
   assert.ok(Number(await page.locator('#pointCount').textContent())>0);
   await page.locator('#floorSelect').selectOption(floorId);
   await page.waitForFunction(()=>document.querySelector('#mapLoading').textContent.includes('公式階層画像'));
   await node(fieldId).waitFor();
  }
  await page.screenshot({path:output+'/official-floor.png',fullPage:true});
  await page.locator('#exportOpen').click();
  const [png]=await Promise.all([page.waitForEvent('download'),page.locator('[data-export="png"]').click()]);
  assert.ok(png.suggestedFilename().endsWith('.png'));
  await page.locator('#modalClose').click();
  await page.locator('#floorSelect').selectOption('');
  await node('teyvat:106220').waitFor();
  await page.locator('[data-point="teyvat:106220"]').evaluate(button=>button.click());
  await page.locator('#showFieldFloor').click();
  assert.equal(await page.locator('#floorSelect').inputValue(),'350');
  await page.waitForFunction(()=>document.querySelector('#mapLoading').textContent.includes('公式階層画像'));
 });
 await check('Official domain markers can be selected, named and approved as editable fields',async()=>{
  await page.locator('[data-map="region-02-map"]').click();
  await page.locator('#kindFilter').selectOption('domain');
  assert.equal(await page.locator('#pointCount').textContent(),'11');
  const domain=await page.locator('.map-node.domain').first().getAttribute('data-field-id');
  await page.locator('[data-point="'+domain+'"]').evaluate(button=>button.click());
  assert.match(await page.locator('#inspectorBody .field-source').textContent(),/秘境/);
  await page.locator('#fieldForm [name="name"]').fill('QA・秘境フィールド');
  await page.locator('#fieldForm [name="recommended_level"]').fill('43');
  await page.locator('#fieldForm [name="reason"]').fill('QA・秘境をフィールドとして編集');
  await page.locator('#fieldForm button.primary').click();
  await approve();
  assert.equal(await page.locator('#fieldForm [name="recommended_level"]').inputValue(),'43');
  await page.screenshot({path:output+'/domain-fields.png',fullPage:true});
 });
 await writeFile(process.env.FIELD_EDITOR_BROWSER_REPORT||'evidence/field-editor/browser.json',JSON.stringify({passed:checks.length,checks,page_errors:errors,terrain_failures:network,screenshots:output,production_data_modified:false},null,2)+'\n');
 console.log(JSON.stringify({passed:checks.length,page_errors:errors}));
}catch(e){await page.screenshot({path:output+'/failure.png',fullPage:true});await writeFile(process.env.FIELD_EDITOR_BROWSER_REPORT||'evidence/field-editor/browser.json',JSON.stringify({passed:checks.length,checks,error:e.stack,page_errors:errors,terrain_failures:network},null,2)+'\n');throw e}finally{await browser.close()}
