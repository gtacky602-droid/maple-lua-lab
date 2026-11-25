import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1220,height:900}});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  const draw=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(image,...coords){
   const result=draw.call(this,image,...coords);
   if(this.canvas.id==='game' && image.src && coords.at(-2)===1160 && coords.at(-1)===540){
    window.lastSceneryDraw={file:new URL(image.src).pathname.split('/').pop(),coords};
   }
   return result;
  };
 });
 await page.goto(process.env.LAB_URL || 'http://127.0.0.1:9101/');
 await page.waitForFunction(()=>window.lab?.frame);
 const drive=waypointDriver(page,nodes,{walkTimeout:20000});
 await page.locator('#importSave').setInputFiles('work/inazuma-domain-terrain-fixture.json');
 await drive.waitNode('inazuma-town');
 const tier=page.locator('#playBackgroundTier');
 const originalCharacterMode=await page.locator('#renderMode').inputValue();
 assert.equal(await tier.inputValue(),'0');
 await tier.selectOption('4096');
 await page.waitForFunction(()=>document.querySelector('#playBackgroundStatus').textContent.includes('この地点は元PNG'));
 await drive.warp('ina-wp-47990');
 await drive.cross('sites-hunt-12778');
 async function expectDraw(file,source){
  await page.waitForFunction(({file,source})=>{
   const draw=window.lastSceneryDraw;
   if(draw?.file!==file)return false;
   return source ? draw.coords.length===8 && source.every((n,i)=>draw.coords[i]===n) : draw.coords.length===4;
  },{file,source});
  return page.evaluate(()=>window.lastSceneryDraw);
 }
 const prefix='ina-araumi-cistern';
 const results={};
 for(const [index,n] of [4096,4608,5120,5632,6144].entries()){
  await tier.selectOption(String(n));
  const file=prefix+(n===6144?'-native-preview-v1.png':'-native-tiers-v1.webp');
  results[n]=await expectDraw(file,n===6144?null:[(index%2)*512,Math.floor(index/2)*288,512,288]);
 }
 await tier.selectOption('4096');
 await drive.walk(1120);
 const moved=await expectDraw(prefix+'-native-tiers-v1.webp',[0,0,512,288]);
 assert.ok(moved.coords[4]<results[4096].coords[4]);
 await page.locator('#game').screenshot({path:'evidence/inazuma-araumi-live-4096.png'});
 await page.route('**/ina-thunder-vault-native-tiers-v1.webp',route=>route.abort());
 await drive.cross('sites-hunt-12778-pocket-1');
 await page.waitForFunction(()=>document.querySelector('#playBackgroundStatus').textContent.includes('読み込めず'));
 const fallback=await expectDraw('ina-thunder-vault-background-v1.png');
 await tier.selectOption('6144');
 await expectDraw('ina-thunder-vault-native-preview-v1.png');
 await drive.cross('sites-hunt-12778');
 await expectDraw(prefix+'-native-preview-v1.png');
 await tier.selectOption('0');
 await expectDraw(prefix+'-background-v1.png');
 assert.equal(await page.locator('#renderMode').inputValue(),originalCharacterMode);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/play-scenery-tiers.json',JSON.stringify({stage:'sites-hunt-12778',results,moved,fallback,returnStage:await drive.node(),characterMode:originalCharacterMode},null,2)+'\n');
 console.log('Five actual adventure canvas draws, scrolling, fallback, return and original art passed.');
} finally {await browser.close();}
