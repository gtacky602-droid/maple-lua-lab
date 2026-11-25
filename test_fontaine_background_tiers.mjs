import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser = await chromium.launch({channel:'chrome',headless:true,args:['--disable-accelerated-2d-canvas']});
// The original default remains the Fontaine gallery. An argument checks another scenery batch.
const groups=process.argv[2]?[process.argv[2]]:['beryl','fon-domain','fon-north'];
const output=process.argv[2] || 'fontaine';
if (!/^[a-z0-9-]+$/.test(output)) throw Error('Invalid scenery batch');
const reports = {};
const {fileBytesByRectangles}=JSON.parse(await fs.readFile('evidence/scenery-download-tiers.json','utf8'));
const weekly=JSON.parse(await fs.readFile('content/weekly-boss-spawns.json','utf8')).weeklyBosses;
const fieldBosses=JSON.parse(await fs.readFile('content/field-boss-spawns.json','utf8')).fieldBosses;
const components=JSON.parse(await fs.readFile('content/weekly-opening-parts.json','utf8'));
const {nodes: spawns} = JSON.parse(await fs.readFile('content/enemy-spawns.json','utf8'));
try {
  for (const group of groups) {
    const prefix = group==='beryl' ? 'fon-beryl' : group;
    const manifest = JSON.parse(await fs.readFile('assets/'+prefix+'-background-generation.json','utf8'));
    const report = JSON.parse(await fs.readFile('evidence/'+group+'-background-compression.json','utf8'));
    for (const {node,source} of manifest.scenes) {
      const page = await browser.newPage({viewport:{width:1420,height:1000}});
      page.setDefaultTimeout(45000);
      const errors = [];
      page.on('pageerror',error=>errors.push(error.message));
      try {
        const lightweightLink = group==='weekly-arenas' || node === 'sites-hunt-12791-pocket-2' || node === 'sites-hunt-7201' || node === 'sites-hunt-7116' || node === 'sites-hunt-7215' || node === 'azhdaha-dragon-seal-arena' || node === 'nod-false-moon-rift' || node === 'sites-hunt-88121' || node === 'sites-hunt-100707' || node === 'sites-hunt-46532' || node === 'sites-hunt-28756' || ['signora-ten-shrine-arena','raiden-thunder-echo-arena','shouki-godmaking-arena','dvalin-sky-arena','andrius-wolf-ring','branch-hunt-64849','branch-hunt-66770-pocket-1','branch-hunt-66769','branch-hunt-64840','branch-hunt-64844','branch-hunt-64835-pocket-2','branch-hunt-64834','branch-hunt-64831','chizhang-legend-terrace','branch-hunt-64828','branch-hunt-68600','branch-hunt-64825','bygone-bell-archive','suanni-field-sanctum'].includes(node);
        const query = new URLSearchParams({node});
        if (lightweightLink) {
          query.set('tier','4096');
          query.set('compare','background');
        }
        await page.goto((process.env.LAB_URL || 'http://127.0.0.1:9101/')+'map-art.html?'+query);
        await page.waitForFunction(({id,tier})=>window.mapArt?.node===id && window.mapArt.backgroundState==='ready' &&
          window.mapArt.decodedBackgroundRectangles===tier,{id:node,tier:lightweightLink ? 4096 : 6144});
        if (lightweightLink) assert.equal(await page.locator('#matchSpritePng').isChecked(),true);
        if (node==='sites-hunt-50057') {
          await page.locator('#mapNodePicker summary').click();
          await page.locator('#nodeMeasuredFilter').check();
          const listed=await page.locator('#nodeSearchResults [data-node]').evaluateAll(
            buttons=>buttons.map(button=>button.dataset.node));
          const measuredNodes=await page.evaluate(async()=>Object.keys((await import('./scenery-measurements.js')).backgroundMeasurements));
          assert.deepEqual(listed.sort(),measuredNodes.sort());
          assert.ok(listed.includes('sites-hunt-68347-pocket-3'));
          await page.locator('#nodeSearch').fill('灯台');
          await page.locator('#clearNodeSearch').click();
          assert.equal(await page.locator('#nodeMeasuredFilter').isChecked(),false);
          await page.locator('#mapNodePicker summary').click();
        }
        await page.locator('#loadLive').click();
        const boss=[...weekly,...fieldBosses].find(b=>b.node===node && b.mapIdleArt);
        const inner=weekly.find(b=>b.innerNode===node && b.rift?.shadowArt);
        const expectedCount=spawns[node]?.length ?? components[node]?.parts.length ?? (boss?(boss.partner?.mapIdleArt?2:1):inner?.rift.pointsU.length??0);
        await page.waitForFunction(n=>window.mapArt.count===n && window.mapArt.diff?.unchanged===n,expectedCount);
        if (await page.locator('#placements button').count()===1) {
          await page.locator('#placements button').click();
          await page.locator('#focusSelected').click();
          await page.locator('#clearSelection').click();
        }
        const before = await page.evaluate(()=>window.mapArt);
        const decodeStats = await page.evaluate(async id=>(await import('./scenery-measurements.js')).backgroundMeasurements[id]?.decode,node);
        assert.equal(before.backgroundFile,source);
        if(inner){
          const live=JSON.parse(await fs.readFile('evidence/false-moon-weekly-lua.json','utf8')).riftShadowPlacements;
          assert.deepEqual(before.placements.map(p=>[p.id,p.x,p.y]),live);
          assert.ok(before.visuals.every(v=>v.height===inner.rift.shadowArt.height && v.opacity===inner.rift.shadowArt.opacity && v.hover===0));
        }
        if(boss){
          if (boss.home!==undefined) assert.equal(before.visuals[0].height,boss.artHeight);
          const expected=[{id:boss.id,species:boss.mapIdleArt,x:boss.home??boss.center,y:boss.floorY,flip:boss.openingPose?.flip??false}];
          if(boss.partner?.mapIdleArt)expected.push({id:'boss-'+boss.partner.entity,species:boss.partner.mapIdleArt,
            x:boss.home+boss.partner.offset,y:boss.floorY,flip:false});
          assert.deepEqual(before.placements,expected);
        }
        const seen = new Set();
        for (const {rectangles,rgbSha256,meanAbsoluteRgbErrorToReference} of report.scenes[source].tiers) {
          await page.selectOption('#backgroundTier',String(rectangles));
          await page.waitForFunction(n=>window.mapArt.decodedBackgroundRectangles===n,rectangles);
          const metrics = await page.locator('#backgroundMetrics').innerText();
          assert.ok(metrics.includes(meanAbsoluteRgbErrorToReference.toFixed(2)+' / 255'),metrics);
          if (decodeStats) {
            const sample=decodeStats[rectangles], label=await page.locator('#decodeCost').innerText();
            assert.ok(label.includes(sample.ms.toFixed(2)+' ms') && label.includes(sample.kib.toLocaleString('ja-JP')+' KiB'));
          }
          await page.locator('#sceneryDownload').waitFor({state:'visible'});
          const filename=source.replace('-background-v1.png','-'+rectangles+'.lua');
          assert.equal(await page.locator('#sceneryDownload').getAttribute('download'),filename);
          const sizes=fileBytesByRectangles[source];
          const saved=sizes[6144]-sizes[rectangles];
          const exportLabel=await page.locator('#sceneryExportStatus').innerText();
          assert.ok(exportLabel.includes(sizes[rectangles].toLocaleString('ja-JP')+' B'),exportLabel);
          const compared=rectangles===6144?'比較基準 6,144矩形':
            '6,144矩形比 '+saved.toLocaleString('ja-JP')+' B（'+(100*saved/sizes[6144]).toFixed(1)+'%）減';
          assert.ok(exportLabel.includes(compared),exportLabel);
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
          if (lightweightLink && rectangles===4096) {
            await page.locator('main').screenshot({path:'evidence/'+source.replace('-background-v1.png','-4096.png')});
          }
          if (seen.size===0) reports[node]={source,count:before.count,sourceCanvas:actual.left,tiers:{}};
          assert.equal(actual.left,reports[node].sourceCanvas);
          seen.add(actual.right);
          reports[node].tiers[rectangles]=actual.right;
        }
        assert.equal(seen.size,5);
        await page.locator('#decodedBackground').uncheck();
        assert.equal(await page.locator('#backgroundTier').isDisabled(),true);
        await page.locator('#matchSpritePng').check();
        const sameCanvases = () => page.evaluate(() => {
          const read = id => document.getElementById(id).getContext('2d').getImageData(0,0,960,540).data;
          const left = read('png'), right = read('rect');
          return left.every((value,i) => value === right[i]);
        });
        assert.equal(await sameCanvases(),true);
        await page.locator('#decodedBackground').check();
        await page.waitForFunction(() => window.mapArt.decodedBackgroundRectangles === 6144);
        assert.equal(await sameCanvases(),false);
        // Retain original combined comparison captures for existing batches.
        if (!['sum-forest','nat-domain','ina-narukami','ina-west','ina-islands','mond-ruins','mond-temples','li-north','li-highlands','li-weekly','nod-islands','nod-false-moon','sne-domains','sum-frontier','tun-domains','border-domains','chenyu-gates','bygone-hunts','branch-boss-courts','chenyu-west','chenyu-lake','chenyu-post','chenyu-ferry','chenyu-south','weekly-opening','inazuma-weekly','weekly-arenas'].includes(group)) await page.locator('#matchSpritePng').uncheck();
        const after = await page.evaluate(()=>window.mapArt);
        assert.equal(after.camera,before.camera);
        assert.deepEqual(after.placements,before.placements);
        assert.deepEqual(errors,[]);
        const picture=group==='beryl'
          ? source.replace('fon-beryl-','beryl-').replace('-background-v1.png','-scene-comparison.png')
          : source.replace('-background-v1.png','-comparison.png');
        await page.locator('main').screenshot({path:'evidence/'+picture});
        if(inner){
          const liveLink=await page.locator('#placementViewLink').getAttribute('href');
          await page.goto(new URL(liveLink,page.url()).href);
          await page.waitForFunction(()=>window.mapArt?.liveView && window.mapArt.count===3);
          assert.deepEqual(await page.evaluate(()=>window.mapArt.placements),before.placements);
          assert.ok((await page.locator('#status').innerText()).includes('異界の影の出現位置'));
          reports[node].liveShadowPlacements=before.placements;
        }
      } catch (error) {
        console.error('Scenery comparison failed for',node,source);
        throw error;
      } finally { await page.close(); }
    }
  }
  await fs.writeFile('evidence/'+output+'-background-tiers-browser.json',JSON.stringify(reports,null,2)+'\n');
  console.log('Checked the five decoded tiers, pixel hashes and fixed placements in '+Object.keys(reports).length+' fields.');
} finally { await browser.close(); }
