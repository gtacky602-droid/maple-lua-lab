import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser = await chromium.launch({channel:'chrome'});
const base = process.env.LAB_URL || 'http://127.0.0.1:9101/';
const id = 'branch-hunt-64835-pocket-2';
const report = {};
try {
  for (const mobile of [false,true]) {
    const page = await browser.newPage({viewport:mobile ? {width:390,height:844} : {width:1280,height:920},hasTouch:mobile});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const live = mobile ? '' : '&placements=live';
    await page.goto(base+'map-art.html?node='+id+'&compare=background&tier=4096'+live+'#sceneryDetail');
    await page.waitForFunction(id=>window.mapArt?.node===id && window.mapArt.decodedBackgroundRectangles===4096,id);
    const initial = await page.evaluate(()=>window.mapArt.placements);
    // Under the magnifier each of the 80x45 source pixels must fill its own 4x4 square.
    async function check() {
      return page.evaluate(()=>{
        const x=+document.getElementById('detailX').value,y=+document.getElementById('detailY').value;
        let unequalSamples=0;
        const samples=[];
        for(const key of ['png','rect']){
          const a=document.getElementById(key).getContext('2d').getImageData(x,y,80,45).data;
          const b=document.getElementById(key+'Detail').getContext('2d').getImageData(0,0,320,180).data;
          for (let j=0;j<180;j++)for(let i=0;i<320;i++){
            const src=4*(Math.floor(j/4)*80+Math.floor(i/4)),dest=4*(j*320+i);
            for(let c=0;c<4;c++)if(a[src+c]!==b[dest+c])throw Error(key+' crop differs');
          }
          samples.push(a);
        }
        for(let i=0;i<samples[0].length;i+=4){
          if([0,1,2].some(c=>samples[0][i+c]!==samples[1][i+c]))unequalSamples++;
        }
        return {x,y,unequalSamples};
      });
    }
    const canvas=page.locator('#png');
    await canvas.scrollIntoViewIfNeeded();
    const bounds=await canvas.boundingBox();
    const point={x:Math.floor(bounds.width*.38),y:Math.floor(bounds.height*.39)};
    if(mobile) await canvas.tap({position:point});
    else await canvas.click({position:point});
    const selected=await check();
    assert.ok(Math.abs(selected.x-(960*.38-40))<5 && Math.abs(selected.y-(540*.39-22.5))<5);
    assert.ok(selected.unequalSamples>0);
    assert.deepEqual(await page.evaluate(()=>window.mapArt.placements),initial);
    await page.selectOption('#backgroundTier','6144');
    await page.waitForFunction(()=>window.mapArt?.decodedBackgroundRectangles===6144);
    const high=await check();
    assert.deepEqual([high.x,high.y],[selected.x,selected.y]);
    await page.locator('#detailX').focus();
    await page.keyboard.press('End');
    await page.locator('#detailY').focus();
    await page.keyboard.press('Home');
    const corner=await check();
    assert.deepEqual([corner.x,corner.y],[880,0]);
    await page.locator('#detailX').press('ArrowLeft');
    assert.equal((await check()).x,879);
    if(!mobile){
      await page.locator('#camera').focus();
      await page.keyboard.press('End');
      const camera=await page.evaluate(()=>window.mapArt.camera);
      const expected=await check();
      const url=await page.locator('#detailLink').getAttribute('href');
      const other=await browser.newPage();
      await other.goto(new URL(url,page.url()).href);
      await other.waitForFunction(()=>window.mapArt?.decodedBackgroundRectangles===6144);
      const restored=await other.evaluate(()=>[window.mapArt.camera,+detailX.value,+detailY.value,sceneryDetail.open]);
      assert.deepEqual(restored,[camera,expected.x,expected.y,true]);
      await other.close();
      await page.locator('#camera').press('Home');
    }else assert.equal(await page.locator('#detailLink').isVisible(),false);
    await page.selectOption('#backgroundTier','4096');
    await page.waitForFunction(()=>window.mapArt.decodedBackgroundRectangles===4096);
    await canvas.click({position:point});
    if(!mobile)await page.locator('#sceneryDetail').screenshot({path:'evidence/chenyu-post-magnifier.png'});
    await page.locator('#sceneryDetail summary').click();
    await page.locator('main .detail-marker').first().waitFor({state:'hidden'});
    if(mobile){
      await canvas.tap({position:{x:Math.round(bounds.width*.24),y:Math.round(bounds.height*.89)}});
      await page.waitForFunction(n=>window.mapArt.count===n+1,initial.length);
    }
    assert.deepEqual(errors,[]);
    report[mobile?'mobileEditor':'desktopLive']={selected,high,corner,editingResumed:mobile};
    await page.close();
  }
  await fs.writeFile('evidence/scenery-detail.json',JSON.stringify(report,null,2)+'\n');
  console.log('Desktop and touch zoom samples match every pixel at both tiers.');
} finally {await browser.close();}
