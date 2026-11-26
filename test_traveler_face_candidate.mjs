import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const page=await browser.newPage();
 await mkdir('work/pose-exports',{recursive:true});
 const metrics=[];
 for(const [side,frame,scale] of [['left',3,''],['right',3,''],['left',3,'native'],['left',4,'native']]){
  const params=new URLSearchParams({frame,side,region:'face',pixels:'1',scale});
  await page.goto(new URL('traveler-run-compare.html?'+params,process.env.LAB_URL||'http://127.0.0.1:19745/').href);
  await page.waitForFunction(()=>document.querySelector('#phase').dataset.file);
  const read=()=>page.evaluate(()=>({
   score:[...document.querySelectorAll('#quality tbody tr:last-child td')].slice(1).map(td=>parseFloat(td.textContent)),
   runs:Number(document.querySelector('#h32c16').closest('figure').querySelector('small').textContent.match(/(\d+)矩形/)[1]),
   images:[...document.querySelectorAll('.art canvas')].map(c=>c.toDataURL())
  }));
  const before=await read();
  await page.check('#faceCandidate');const after=await read();
  assert.deepEqual(after.images.slice(0,2),before.images.slice(0,2));
  assert(after.score[1]<before.score[1]);
  assert(after.runs<1343);
  assert.equal(new URL(await page.locator('#frameLink').getAttribute('href')).searchParams.get('face'),'1');
  const download=page.waitForEvent('download');await page.locator('#runSheet').click();
  const file=await download;await file.saveAs('work/pose-exports/'+file.suggestedFilename());
  await page.uncheck('#faceCandidate');assert.deepEqual(await read(),before);
  await page.uncheck('#palettePixels');const cached=await read();
  await page.check('#faceCandidate');const refined=await read();
  assert.notEqual(refined.images[2],cached.images[2]);
  await page.uncheck('#faceCandidate');assert.deepEqual(await read(),cached);
  if(scale==='native'){
   assert(refined.score[1]<cached.score[1]);
   metrics.push({side,frame,originalRectangles:cached.runs,refinedRectangles:refined.runs,
    originalFaceError:cached.score[1],refinedFaceError:refined.score[1],
    originalFaceOverlap:cached.score[0],refinedFaceOverlap:refined.score[0]});
   if(frame===4){
    await page.check('#faceCandidate');
    const dl=page.waitForEvent('download');await page.click('#runSheet');
    await(await dl).saveAs('evidence/traveler-native-left-face-refined.png');
   }
  }
  console.log(side,'runs',before.runs,after.runs,'overlap/color',before.score,after.score);
 }
 await writeFile('evidence/traveler-native-face-refinement.json',JSON.stringify(metrics,null,2)+'\n');
}finally{await browser.close()}
