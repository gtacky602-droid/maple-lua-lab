import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {chromium} from 'playwright';

const base = process.env.LAB_URL || 'http://127.0.0.1:19749/';
const fixturePath = 'work/daily-nat-level-fixture.json';
const hub = 'natlan-hub', quarry = 'natlan-quarry-road', field = 'natlan-field';
const evidence = {views:[]};
const browser = await chromium.launch({channel:'chrome',headless:true});
const errors = [];
const paint = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const map = page => page.evaluate(() => window.lab.frame.worldMap);
const tick = page => page.evaluate(() => window.lab.frame.t);

async function load(page) {
 page.on('pageerror',error => errors.push(error.message));
 await page.goto(base);
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await page.waitForFunction(() => Number.isInteger(window.lab?.frame.daily?.period));
 const fixture = JSON.parse(await fs.readFile(fixturePath,'utf8'));
 fixture.daily.profile = randomUUID().replaceAll('-','');
 fixture.daily.ledger.period = await page.evaluate(() => window.lab.frame.daily.period);
 await page.evaluate(raw => localStorage.setItem('maple-lua-lab.checkpoint.v1',raw), JSON.stringify(fixture));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(id => window.lab.frame.story?.node === id,hub);
 assert.equal(await page.evaluate(() => window.lab.frame.progression.level),100);
 const quest = page.locator('[data-quest="natlan-contract"]');
 await quest.getByRole('button',{name:'受注',exact:true}).click();
 await quest.getByRole('button',{name:'この依頼を追跡',exact:true}).click();
 await page.locator('#trackedQuestMap').click();
 await page.waitForFunction(id => window.lab.frame.worldMap?.selected?.id === id,field);
}

async function pixels(canvas) {
 const data = await canvas.evaluate(el => el.toDataURL());
 return createHash('sha256').update(data).digest('hex');
}

async function fit(page) {
 const zoom = page.locator('#atlasZoomReset');
 const canvas = page.locator('#atlasCanvas');
 assert.equal(await zoom.textContent(),'100%');
 assert.deepEqual((await map(page)).guide.stops.map(stop=>stop.id),[quarry,field]);
 const before = await pixels(canvas);
 await page.getByRole('button',{name:'道順を拡大',exact:true}).click();
 await paint(page);
 assert.ok(parseInt(await zoom.textContent(),10)>150);
 assert.notEqual(await pixels(canvas),before);
 return canvas;
}

async function clickQuarry(page,canvas) {
 const view = await map(page);
 const stops = view.points.filter(point => [hub,quarry,field].includes(point.id));
 const [minX,maxX] = [Math.min(...stops.map(p=>p.x)),Math.max(...stops.map(p=>p.x))];
 const [minY,maxY] = [Math.min(...stops.map(p=>p.y)),Math.max(...stops.map(p=>p.y))];
 const scale = Math.min(4,(view.width-144)/(maxX-minX),(view.height-112)/(maxY-minY));
 const left = Math.max(view.width*(1-scale),Math.min(0,(view.width-(minX+maxX)*scale)/2));
 const top = Math.max(view.height*(1-scale),Math.min(0,(view.height-(minY+maxY)*scale)/2));
 const target = stops.find(p=>p.id===quarry);
 const box = await canvas.boundingBox();
 await canvas.click({position:{x:(target.x*scale+left)*box.width/view.width,y:(target.y*scale+top)*box.height/view.height}});
 await page.waitForFunction(id => window.lab.frame.worldMap?.selected?.id===id,quarry);
 assert.equal((await map(page)).guide.stops.at(-1).id,quarry);
}

try {
 const desktop = await browser.newPage({viewport:{width:1280,height:930}});
 await load(desktop);
 const startTick = await tick(desktop);
 await desktop.locator('#worldAtlas').screenshot({path:'work/atlas-local-desktop-overview.png'});
 const canvas = await fit(desktop);
 await desktop.locator('#worldAtlas').screenshot({path:'work/atlas-local-desktop-route.png'});
 await clickQuarry(desktop,canvas);
 const selected = (await map(desktop)).selected;
 const box = await canvas.boundingBox();
 const before = await pixels(canvas);
 await desktop.mouse.move(box.x+box.width/2,box.y+box.height/2);
 await desktop.mouse.down();
 await desktop.mouse.move(box.x+box.width/2-75,box.y+box.height/2-35,{steps:8});
 await desktop.mouse.up();
 await paint(desktop);
 assert.notEqual(await pixels(canvas),before);
 assert.equal((await map(desktop)).selected.id,selected.id);
 const after = await pixels(canvas);
 await canvas.focus();
 await desktop.keyboard.press('ArrowDown');
 await paint(desktop);
 assert.notEqual(await pixels(canvas),after);
 await desktop.mouse.wheel(0,120);
 await paint(desktop);
 const zoom = await desktop.locator('#atlasZoomReset').textContent();
 assert.ok(parseInt(zoom,10) < 400);
 await desktop.locator('#atlasCurrent').click();
 await desktop.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,hub);
 assert.equal(await desktop.locator('#atlasZoomReset').textContent(),zoom);
 const currentPinCentered = () => desktop.waitForFunction(() => {
  const surface = document.getElementById('atlasCanvas');
  const {data} = surface.getContext('2d').getImageData(surface.width/2-8,surface.height/2-8,16,16);
  for (let idx=0; idx<data.length; idx+=4) {
   if (data[idx]===220 && data[idx+1]===115 && data[idx+2]===91) return true;
  }
  return false;
 });
 await currentPinCentered();
 const centered = await pixels(canvas);
 await canvas.focus();
 await desktop.keyboard.press('ArrowUp');
 await paint(desktop);
 assert.notEqual(await pixels(canvas),centered);
 await desktop.locator('#atlasCurrent').click();
 await paint(desktop);
 await currentPinCentered();
 const preResize = await pixels(canvas);
 await desktop.setViewportSize({width:390,height:844});
 await paint(desktop);
 assert.notEqual(await pixels(canvas),preResize,'狭い表示幅に応じて文字を再描画');
 await desktop.setViewportSize({width:1280,height:930});
 await paint(desktop);
 await currentPinCentered();
 await desktop.locator('#atlasZoomReset').click();
 assert.equal(await desktop.locator('#atlasZoomReset').textContent(),'100%');
 assert.equal(await tick(desktop),startTick);
 await desktop.keyboard.press('Escape');
 await desktop.locator('#worldAtlas').waitFor({state:'hidden'});
 await desktop.waitForFunction(t=>window.lab.frame.t>t,startTick);
 await desktop.keyboard.press('KeyM');
 await desktop.locator('#worldAtlas').waitFor();
 assert.equal(await desktop.locator('#atlasZoomReset').textContent(),'100%');
 await desktop.locator('#atlasWorld').click();
 await desktop.waitForFunction(()=>window.lab.frame.worldMap?.region==='world');
 assert.equal(await desktop.locator('#atlasViewTools').isVisible(),false);
 evidence.views.push({viewport:[1280,930],routeFit:true,pinHit:true,mousePan:true,keyboardPan:true,wheel:true,currentRecenters:true,resize:true,reset:true,clockPaused:true});

 const phone = await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1});
 await load(phone);
 const dialog = phone.locator('#worldAtlas');
 const mobile = await fit(phone);
 assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth),false);
 await dialog.screenshot({path:'work/atlas-local-phone-route.png'});
 const original = await pixels(mobile);
 const bounds = await mobile.boundingBox();
 const cdp = await phone.context().newCDPSession(phone);
 const x = Math.round(bounds.x+bounds.width/2), y = Math.round(bounds.y+bounds.height/2);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-64,y:y-22}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await paint(phone);
 assert.notEqual(await pixels(mobile),original);
 assert.equal((await map(phone)).selected.id,field);
 await phone.getByRole('button',{name:'縮小',exact:true}).tap();
 await phone.locator('#atlasZoomReset').tap();
 await phone.locator('#atlasFitRoute').tap();
 assert.ok(parseInt(await phone.locator('#atlasZoomReset').textContent(),10)>150);
 const gate = phone.locator('#atlasItineraryStops li').first().getByRole('link',{name:/入口を見る/});
 const target = new URL(await gate.getAttribute('href'),base);
 assert.equal(target.searchParams.get('node'),hub);
 assert.equal(target.searchParams.get('to'),quarry);
 assert.equal(target.searchParams.get('gateX'),'1380');
 const popup = phone.waitForEvent('popup');
 await gate.tap();
 const preview = await popup;
 await preview.waitForFunction(()=>window.mapArt?.ready);
 assert.equal(await preview.locator('#gatePreview select option:checked').getAttribute('data-gate-x'),'1380');
 assert.equal(await preview.locator('#gatePreview select option:checked').getAttribute('data-to'),quarry);
 await preview.close();
 evidence.views.push({viewport:[390,844],routeFit:true,touchPan:true,touchZoomButtons:true,noOverflow:true,gatePreview:{from:hub,to:quarry,x:1380,opened:true}});
 assert.deepEqual(errors,[]);
 await fs.writeFile('work/atlas-local-view-browser.json',JSON.stringify(evidence,null,2)+'\n');
 console.log(evidence);
} finally {await browser.close();}
