import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { waypointDriver } from './tools/browser_waypoint_test.mjs';

const base=new URL(process.env.LAB_URL||'http://127.0.0.1:9007/');
const baseline='c768a61';
const [mond,sumeru,drake,liyue,fontaine]=[
 'mondstadt-background.png','sumeru-background-v1.png','aeonblight-field-background-v1.png',
 'liyue-background-v1.png','fontaine-background-v1.png',
];
const sharedSprite='fon-navia-photo-terrace-background-v1.png';
const source=await fs.readFile('scenery.js','utf8');
const previous=execFileSync('git',['show',baseline+':scenery.js'],{encoding:'utf8'});
const backgroundNames=source=>new Set([...source.matchAll(/file:'([^']+)'/g)].map(match=>match[1]));
const baselineFiles=backgroundNames(previous);
const files=new Set([...baselineFiles,...backgroundNames(source)]);
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const fixture=await fs.readFile('work/coop-aeonblight-fixture.json','utf8');
const evidence='evidence/scenery-on-demand';
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const errors=[];

async function visit(path) {
 const context=await browser.newContext({viewport:{width:1220,height:940}});
 const page=await context.newPage(),requests=[];
 page.setDefaultTimeout(60000);
 await page.route('**/assets/**',route=>route.continue());
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{
  const path=new URL(r.url()).pathname;
  if(path.startsWith('/assets/')){
   const file=decodeURIComponent(path.slice('/assets/'.length));
   if(files.has(file)&&file!==sharedSprite)requests.push(file);
  }
 });
 return {context,page,requests,open:()=>page.goto(new URL(path,base).href)};
}

async function stat(requests) {
 const unique=[...new Set(requests)];
 const sizes=await Promise.all(unique.map(file=>fs.stat('assets/'+file)));
 return {unique:unique.length,encodedBytes:sizes.reduce((total,stat)=>total+stat.size,0)};
}

const backgroundPixel=(page, id)=>page.evaluate(id=>
 [...document.getElementById(id).getContext('2d').getImageData(37,137,1,1).data],id);

async function awaitAdventureBackground(page,file) {
 await page.evaluate(async()=>{window.testSceneryStatus=(await import('./scenery.js')).sceneryStatus});
 await page.waitForFunction(file=>{
  const f=window.lab?.frame;
  if(!f)return false;
  const b=window.testSceneryStatus(f);
  return b.file===file&&b.state==='ready';
 },file);
}

async function editorReady(page,node) {
 await page.waitForFunction(node=>window.mapArt?.node===node&&window.mapArt.backgroundState==='ready',node);
}

try {
 const old=await visit('/');
 // The historical renderer only has the original PNG mode. Adapt its entry point to today's game host.
 const historicalModule=previous+"\nexport function drawPlayScenery(ctx,frame){scenery(ctx,frame);return ''}\n";
 await old.page.route('**/scenery.js',r=>r.fulfill({contentType:'text/javascript',body:historicalModule}));
 await old.open();
 await old.page.waitForFunction(()=>window.lab?.frame);
 await old.page.evaluate(async()=>{const {backgroundReady}=await import('./scenery.js');await backgroundReady});
 await awaitAdventureBackground(old.page,mond);
 const before=await stat(old.requests),beforePixel=await backgroundPixel(old.page,'game');
 assert.equal(before.unique,baselineFiles.size-Number(baselineFiles.has(sharedSprite)));
 assert.notDeepEqual(beforePixel,[197,222,204,255]);
 await old.context.close();

 const game=await visit('/');
 await game.open();
 await game.page.waitForFunction(()=>window.lab?.frame);
 await awaitAdventureBackground(game.page,mond);
 const after=await stat(game.requests);
 assert.deepEqual(game.requests,[mond]);
 await game.page.waitForFunction(expected=>{
  const pixel=document.getElementById('game').getContext('2d').getImageData(37,137,1,1).data;
  return expected.every((value,i)=>value===pixel[i]);
 },beforePixel);
 await game.page.locator('#game').screenshot({path:evidence+'-startup.png'});
 const route=waypointDriver(game.page,nodes,{walkTimeout:22000});
 await game.page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),fixture);
 await game.page.locator('#loadProgress').click();
 await route.waitNode('sumeru-hub');
 await awaitAdventureBackground(game.page,sumeru);
 await route.cross('sumeru-field');
 await route.cross('aeonblight-field-chamber');
 await awaitAdventureBackground(game.page,drake);
 await game.page.locator('#game').screenshot({path:evidence+'-chamber.png'});
 await route.cross('sumeru-field');
 await awaitAdventureBackground(game.page,sumeru);
 assert.deepEqual(game.requests,[mond,sumeru,drake]);
 await game.context.close();

 const compare=await visit('/compare.html');
 await compare.open();
 await compare.page.waitForFunction(()=>window.compareLab?.frame);
 await compare.page.evaluate(async()=>{window.testSceneryStatus=(await import('./scenery.js')).sceneryStatus});
 await compare.page.waitForFunction(file=>{
  const b=window.testSceneryStatus(window.compareLab.frame);
  return b.file===file&&b.state==='ready';
 },mond);
 await compare.page.waitForFunction(()=>{
  const pixels=['sceneA','sceneB'].map(id=>[...document.getElementById(id)
   .getContext('2d').getImageData(37,137,1,1).data]);
  return pixels[0].join()===pixels[1].join()&&pixels[0].join()!=='197,222,204,255';
 });
 assert.deepEqual(compare.requests,[mond]);
 await compare.context.close();

 const editor=await visit('/map-art.html?node=mond-road');
 let release;
 const delayed=new Promise(resolve=>{release=resolve});
 await editor.page.route('**/assets/'+liyue,async route=>{
  await delayed;
  await route.continue();
 });
 await editor.page.route('**/assets/'+drake,route=>route.fulfill({status:404,body:'missing fixture'}));
 await editor.open();
 await editorReady(editor.page,'mond-road');
 assert.deepEqual(editor.requests,[mond]);
 await editor.page.selectOption('#node','liyue-entry');
 assert.equal(await editor.page.evaluate(()=>window.mapArt.backgroundState),'loading');
 assert.match(await editor.page.locator('#context').textContent(),/背景画像を読み込み中/);
 assert.deepEqual(await backgroundPixel(editor.page,'png'),[197,222,204,255]);
 await editor.page.selectOption('#node','fontaine-field');
 await editorReady(editor.page,'fontaine-field');
 const image=await backgroundPixel(editor.page,'png');
 const loaded=editor.page.waitForResponse(r=>r.url().endsWith('/'+liyue));
 release();
 await loaded;
 await editor.page.evaluate(async()=>{
  const {loadScenery}=await import('./scenery.js');
  await loadScenery({campaign:{zone:'geo'}});
 });
 assert.equal(await editor.page.evaluate(()=>window.mapArt.node),'fontaine-field');
 assert.deepEqual(await backgroundPixel(editor.page,'png'),image);
 await editor.page.selectOption('#node','aeonblight-field-chamber');
 await editor.page.waitForFunction(()=>window.mapArt?.backgroundState==='error');
 assert.match(await editor.page.locator('#context').textContent(),/単色で表示/);
 assert.deepEqual(await backgroundPixel(editor.page,'png'),[197,222,204,255]);
 await editor.page.locator('main').screenshot({path:evidence+'-missing.png'});
 await editor.page.selectOption('#node','fontaine-field');
 await editorReady(editor.page,'fontaine-field');
 assert.deepEqual(editor.requests,[mond,liyue,fontaine,drake]);
 await editor.context.close();
 assert.deepEqual(errors,[]);
 await fs.writeFile(evidence+'.json',JSON.stringify({
  baseline,before,after,adventureTravel:route.journeys,adventureRequests:game.requests,
  comparisonRequests:compare.requests,editorRequests:editor.requests,
  startupPixelMatches:true,lateBackgroundDoesNotOverwriteSelection:true,missingBackgroundFallsBack:true,
  sharedSpriteExcluded:sharedSprite,errors,
 },null,2)+'\n');
 console.log(JSON.stringify({before,after,adventureRequests:game.requests}));
} finally {
 await browser.close();
}
