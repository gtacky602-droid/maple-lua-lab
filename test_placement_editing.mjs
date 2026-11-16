import {chromium} from 'playwright';import fs from 'node:fs/promises';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8')),node=graph.nodes.find(n=>n.id==='liyue-field'),support=node.platforms[1];
const b=await chromium.launch({headless:true,channel:'chrome'}),p=await b.newPage({viewport:{width:1440,height:1200}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
const state=()=>p.evaluate(()=>window.mapArt),waitLoad=()=>p.waitForFunction(()=>!document.getElementById('loadLive').disabled);
try{
 await p.goto('http://127.0.0.1:8769/map-art.html');await p.waitForFunction(()=>window.mapArt?.ready);await p.selectOption('#node','liyue-field');await p.click('#loadLive');await waitLoad();
 const original=(await state()).placements[0],id=original.id;await p.locator(`#placements button[data-id="${id}"]`).click();if((await state()).selected!==id||(await state()).editMode!=='move')throw Error('selection');
 const box=await p.locator('#rect').boundingBox(),x=Math.round(support.x+support.w/2);await p.mouse.click(box.x+x/960*box.width,box.y+support.y/540*box.height);
 let s=await state(),e=s.placements.find(e=>e.id===id);if(s.count!==6||Math.abs(e.x-x)>1||e.y!==support.y)throw Error(JSON.stringify({x,support,e,count:s.count,mode:s.editMode}));
 await p.click('#flipSelected');if(!(await state()).placements.find(e=>e.id===id).flip)throw Error('flip');
 const download=p.waitForEvent('download');await p.click('#export');const text=await fs.readFile(await (await download).path(),'utf8'),saved=JSON.parse(text);if(!saved.nodes['liyue-field'][0].flip||saved.nodes['liyue-field'][0].y!==support.y)throw Error('export edit');
 await p.click('#deleteSelected');if((await state()).count!==5||(await state()).selected!==null)throw Error('delete');await p.click('#undo');if((await state()).count!==6||!(await state()).placements[0].flip)throw Error('undo delete');
 await p.click('#undo');if((await state()).placements[0].flip)throw Error('undo flip');await p.click('#undo');if(JSON.stringify((await state()).placements[0])!==JSON.stringify(original))throw Error('undo move');
 await p.locator('#import').setInputFiles({name:'edited.json',mimeType:'application/json',buffer:Buffer.from(text)});await p.waitForFunction(()=>document.getElementById('import').value==='');if((await state()).selected!==null||!(await state()).placements[0].flip)throw Error('import edit');
 await p.locator(`#placements button[data-id="${id}"]`).click();await p.locator('#camera').fill('480');await p.locator('#camera').dispatchEvent('input');const box2=await p.locator('#png').boundingBox();await p.mouse.click(box2.x+100/960*box2.width,box2.y+479/540*box2.height);e=(await state()).placements[0];if(Math.abs(e.x-580)>1||e.y!==480)throw Error('camera-space move');
 await p.screenshot({path:'evidence/placement-editing.png',fullPage:true});await p.selectOption('#node','mond-town');if((await state()).selected!==null||!(await p.locator('#deleteSelected').isDisabled()))throw Error('stale selection');const empty=(await state()).count;const hubBox=await p.locator('#png').boundingBox();await p.mouse.click(hubBox.x+200/960*hubBox.width,hubBox.y+479/540*hubBox.height);if((await state()).count!==empty)throw Error('unselected move added enemy');
 await p.selectOption('#editMode','add');
 await p.setViewportSize({width:390,height:844});if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('mobile overflow');if(errors.length)throw Error(errors.join('/'));
 await fs.writeFile('evidence/placement-editing.json',JSON.stringify({checks:['select item from accessible list','move snaps to upper platform without changing ID/count','flip','delete','undo move/flip/delete','export/import edited positions and facing','camera-space move','node switch clears selection','unselected move does not add','390px layout'],errors},null,2));console.log('Placement select/move/flip/delete/undo/roundtrip/camera and mobile passed');
}finally{await b.close()}

