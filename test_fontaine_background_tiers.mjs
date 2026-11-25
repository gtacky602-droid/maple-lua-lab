import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser = await chromium.launch({channel:'chrome',headless:true,args:['--disable-accelerated-2d-canvas']});
const reports = {};
try {
  for (const group of ['beryl','fon-domain']) {
    const prefix = group==='beryl' ? 'fon-beryl' : group;
    const manifest = JSON.parse(await fs.readFile('assets/'+prefix+'-background-generation.json','utf8'));
    const report = JSON.parse(await fs.readFile('evidence/'+group+'-background-compression.json','utf8'));
    for (const {node,source} of manifest.scenes) {
      const page = await browser.newPage({viewport:{width:1420,height:1000}});
      const errors = [];
      page.on('pageerror',error=>errors.push(error.message));
      try {
        await page.goto((process.env.LAB_URL || 'http://127.0.0.1:9101/')+'map-art.html?node='+node);
        await page.waitForFunction(id=>window.mapArt?.node===id && window.mapArt.backgroundState==='ready' && window.mapArt?.decodedBackgroundRectangles===6144,node);
        await page.locator('#loadLive').click();
        await page.waitForFunction(()=>window.mapArt.count>0 && window.mapArt.diff?.unchanged===window.mapArt.count);
        if (await page.locator('#placements button').count()===1) {
          await page.locator('#placements button').click();
          await page.locator('#focusSelected').click();
          await page.locator('#clearSelection').click();
        }
        const before = await page.evaluate(()=>window.mapArt);
        assert.equal(before.backgroundFile,source);
        const seen = new Set();
        for (const {rectangles,rgbSha256} of report.scenes[source].tiers) {
          await page.selectOption('#backgroundTier',String(rectangles));
          await page.waitForFunction(n=>window.mapArt.decodedBackgroundRectangles===n,rectangles);
          const actual = await page.evaluate(async n=>{
            const image = new Image();
            image.src = 'assets/'+window.mapArt.decodedBackgroundFile;
            await image.decode();
            const ctx = document.createElement('canvas').getContext('2d');
            ctx.canvas.width=512;
            ctx.canvas.height=288;
            const tile = n===6144 ? 0 : (n-4096)/512;
            ctx.drawImage(image,(tile%2)*512,Math.floor(tile/2)*288,512,288,0,0,512,288);
            const rgb = ctx.getImageData(0,0,512,288).data.filter((_,i)=>i%4!==3);
            const hash = async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
            const canvasHash = id=>hash(document.getElementById(id).getContext('2d').getImageData(0,0,960,540).data);
            return {pixels:await hash(rgb),right:await canvasHash('rect'),left:await canvasHash('png')};
          },rectangles);
          assert.equal(actual.pixels,rgbSha256);
          if (seen.size===0) reports[node]={source,count:before.count,sourceCanvas:actual.left,tiers:{}};
          assert.equal(actual.left,reports[node].sourceCanvas);
          seen.add(actual.right);
          reports[node].tiers[rectangles]=actual.right;
        }
        assert.equal(seen.size,5);
        await page.locator('#decodedBackground').uncheck();
        assert.equal(await page.locator('#backgroundTier').isDisabled(),true);
        await page.locator('#decodedBackground').check();
        const after = await page.evaluate(()=>window.mapArt);
        assert.equal(after.camera,before.camera);
        assert.deepEqual(after.placements,before.placements);
        assert.deepEqual(errors,[]);
        if (group==='fon-domain') {
          await page.locator('main').screenshot({path:'evidence/'+source.replace('-background-v1.png','-comparison.png')});
        }
      } finally { await page.close(); }
    }
  }
  await fs.writeFile('evidence/fontaine-background-tiers-browser.json',JSON.stringify(reports,null,2)+'\n');
  console.log('Checked the five decoded tiers, pixel hashes and fixed placements in '+Object.keys(reports).length+' fields.');
} finally { await browser.close(); }
