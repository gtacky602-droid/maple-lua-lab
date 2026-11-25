import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';
import {worksitePoint,worksitePoints,surveyPointUrl} from './survey-point.js';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const {worksites:art,haul}=JSON.parse(await fs.readFile('content/worksite-props.json','utf8'));
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
const base=process.env.LAB_URL||'http://127.0.0.1:9117/';
const game=await browser.newPage({viewport:{width:1240,height:920}});
const drive=waypointDriver(game,Object.fromEntries(graph.nodes.map(n=>[n.id,n])));
const id='liyue-hauling-shortcut',hub='liyue-harbor',post='liyue-quarry-post';
const select=game.locator('#trackedWorksite'), hint=game.locator('#trackedHuntHint');
const errors=[],results=[],pictures=[];
game.on('pageerror',e=>errors.push(e.message));

async function atlas(node){
 await game.locator('#trackedQuestMap').click();
 await game.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,node);
 await game.keyboard.press('Escape');
 await game.locator('#worldAtlas').waitFor({state:'hidden'});
}

try{
 await game.goto(base);
 await game.waitForFunction(()=>window.lab?.frame);
 await game.locator('#importSave').setInputFiles('work/liyue-fresh-route/earned-worksites-start.json');
 await drive.waitNode(hub);
 await drive.accept(id);
 await game.locator('[data-quest="'+id+'"]').getByRole('button',{name:'この依頼を追跡'}).click();
 await select.selectOption('old-lift');
 await game.keyboard.press('KeyM');
 await game.locator('#atlasQuestFocus').click();
 await game.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,post);
 await game.locator('#atlasQuestPoint').waitFor({state:'visible'});
 assert.ok((await game.locator('#atlasQuestPoint').getAttribute('href')).includes('worksite=old-lift'));
 await game.keyboard.press('Escape');
 await game.locator('#worldAtlas').waitFor({state:'hidden'});
 assert.equal(await hint.isVisible(),false);
 await game.locator('#saveProgress').click();
 await game.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await game.reload();
 await game.waitForFunction(()=>window.lab?.frame);
 await game.locator('#loadProgress').click();
 await drive.waitNode(hub);
 await game.waitForFunction(()=>document.querySelector('#trackedWorksite').value==='old-lift');
 await select.selectOption('roof');
 assert.ok((await hint.textContent()).includes('屋根伝い'));
 await select.selectOption('detour');
 assert.ok((await hint.textContent()).includes('平らな遠回り'));
 await atlas(hub);
 const [preview]=await Promise.all([game.waitForEvent('popup'),game.locator('#trackedSurveyPoint').click()]);
 preview.on('pageerror',e=>errors.push(e.message));
 await preview.waitForFunction(()=>window.mapArt?.decodedBackgroundRectangles===4096);
 assert.equal(await preview.locator('#surveyPointNote').getAttribute('data-worksite'),'detour');
 await game.bringToFront();
 await drive.walk(1300);
 await game.keyboard.press('KeyG');
 await drive.count(id,1);
 await game.waitForFunction(()=>!document.querySelector('#trackedWorksite option[value="detour"]'));
 await select.selectOption('old-lift');
 await drive.cross(post);
 await drive.walk(1535);
 await game.waitForFunction(()=>document.querySelector('#trackedHuntHint').textContent.includes('古い荷揚げ'));
 await game.keyboard.press('KeyG');
 await drive.count(id,2);
 await game.waitForFunction(()=>document.querySelector('#trackedWorksiteLabel').hidden);
 await atlas(hub);

 for(const [file,route] of [['inazuma-save','liyue-cart-road'],['earned-shortcut-lift','liyue-cart-lift']]){
  await game.locator('#importSave').setInputFiles('work/liyue-fresh-route/'+file+'.json');
  await game.waitForFunction(route=>document.querySelector('#trackedQuestMap').dataset.node===route,route);
  assert.ok((await game.locator('#trackedSurveyPoint').getAttribute('href')).includes('node='+route));
  await atlas(route);
 }

 await preview.bringToFront();
 for(const quest of graph.quests){
  for(const site of worksitePoints(quest)){
   const p=worksitePoint(quest,site.id,site.node);
   await preview.selectOption('#node',site.node);
   await preview.waitForFunction(n=>window.mapArt?.node===n&&window.mapArt.decodedBackgroundRectangles===4096,site.node);
   const panel=preview.locator('#localQuestSteps');
   if(!await panel.evaluate(el=>el.open))await panel.locator('summary').click();
   await panel.locator('a[href="'+surveyPointUrl(p)+'"]').click();
   const check=await preview.evaluate(({site,runs})=>{
    const camera=Number(document.querySelector('#camera').value),x=site.x-camera,y=site.y;
    const pixels=new Map();
    for(const [dx,dy,w,h,color] of runs){
     for(let j=dy;j<dy+h;j++)for(let i=dx;i<dx+w;i++){
      if(Math.abs(i)>12||Math.abs(j)>12)pixels.set(i+','+j,color);
     }
    }
    const crops=[];
    for(const layer of ['png','rect']){
     const canvas=document.getElementById(layer),ctx=canvas.getContext('2d');
     if(Array.from(ctx.getImageData(x,y,1,1).data).join(',')!=='133,255,223,255')throw Error('Cross: '+site.id);
     const region=ctx.getImageData(0,0,canvas.width,canvas.height);
     for(const [key,color] of pixels){
      const [i,j]=key.split(',').map(Number),offset=4*((y+j)*region.width+x+i);
      const rgb=Array.from(region.data.slice(offset,offset+3)).map(n=>n.toString(16).padStart(2,'0')).join('');
      if('#'+rgb!==color)throw Error(site.id+' '+layer+' pixel '+key+' '+rgb+' expected '+color);
     }
     const crop=document.createElement('canvas');crop.width=150;crop.height=85;
     const top=site.id==='old-lift'?y-77:y-62;
     crop.getContext('2d').drawImage(canvas,x-75,top,150,85,0,0,150,85);
     crops.push(crop.toDataURL());
    }
    return {pixels:pixels.size,crops};
   },{site,runs:art[quest.id][site.id]});
   assert.ok(check.pixels>0);
   results.push({quest:quest.id,id:site.id,node:site.node,x:site.x,y:site.y,pixelsPerLayer:check.pixels});
   pictures.push({name:site.name,crops:check.crops});
  }
 }
 const haulChecks=[];
 for(const [node,route] of Object.entries(haul.routes)){
  await preview.selectOption('#node',node);
  await preview.waitForFunction(n=>window.mapArt?.node===n&&window.mapArt.decodedBackgroundRectangles===4096,node);
  for(const [i,stop] of route.stops.entries()){
   await preview.selectOption('#questPropStage',String(i));
   const values=await preview.evaluate(({x,y})=>['png','rect'].map(id=>{
    const ctx=document.getElementById(id).getContext('2d');
    const rgb=(dx,dy)=>Array.from(ctx.getImageData(x+dx,y+dy,1,1).data).slice(0,3);
    return [rgb(-16,-7),rgb(20,-7),rgb(8,-41)];
   }),stop);
   const colors=[[191,158,107],[191,158,107],[113,162,160]];
   assert.deepEqual(values,[colors,colors],node+' '+stop.label);
   haulChecks.push({node,...stop});
  }
 }
 const picture=await preview.evaluate(async rows=>{
  const sheet=document.createElement('canvas');sheet.width=978;sheet.height=448;
  const ctx=sheet.getContext('2d');ctx.fillStyle='#153133';ctx.fillRect(0,0,sheet.width,sheet.height);
  ctx.fillStyle='#f5eed9';ctx.font='bold 18px sans-serif';
  ctx.fillText('璃月の採集・調査地点',14,27);ctx.font='14px sans-serif';
  ctx.fillText('各組の左が元の背景、右が4,096矩形。水色の十字が調べる位置。',14,50);
  for(const [i,row] of rows.entries()){
   const x=12+(i%3)*324,y=80+Math.floor(i/3)*123;
   ctx.fillStyle='#f5eed9';ctx.fillText(row.name,x,y);
   for(const [j,src] of row.crops.entries()){
    const img=new Image();img.src=src;await img.decode();ctx.drawImage(img,x+j*153,y+8);
   }
  }
  return sheet.toDataURL();
 },pictures);
 assert.equal(results.length,9);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/liyue-worksites-comparison.png',Buffer.from(picture.split(',')[1],'base64'));
 await fs.writeFile('evidence/earned-worksites-browser.json',JSON.stringify({results,haulChecks,selectedSiteRestored:true,
  sameRoomAlternatives:true,mapFocus:true,finishedOptionsRemoved:true,
  completedShortcutLinks:['liyue-cart-road','liyue-cart-lift'],errors},null,2)+'\n');
 console.log('9 worksites: field, map, both preview layers and saved preference passed.');
}finally{await browser.close()}
