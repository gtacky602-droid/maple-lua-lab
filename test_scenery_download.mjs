import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const out='work/scenery-download-check';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage();
  const base=process.env.LAB_URL || 'http://127.0.0.1:9101/';
  await page.goto(base+'map-art.html?node=sites-hunt-36703-pocket-1');
  await page.locator('#sceneryDownload').waitFor();
  await page.selectOption('#backgroundTier','4608');
  const link=page.locator('#sceneryDownload[download$="-4608.lua"]');
  await link.waitFor();
  const [download]=await Promise.all([page.waitForEvent('download'),link.click()]);
  const downloaded=out+'/'+download.suggestedFilename();
  await download.saveAs(downloaded);
  const saved=await fs.readFile(downloaded,'utf8');
  const [codecFile]=await Promise.all([page.waitForEvent('download'),page.locator('#sceneryCodec').click()]);
  assert.equal(codecFile.suggestedFilename(),'MapleCodec.lua');
  await codecFile.saveAs(out+'/MapleCodec.lua');
  assert.deepEqual(await fs.readFile(out+'/MapleCodec.lua'),await fs.readFile('assets/MapleCodec.lua'));
  const rows=[];
  for (const name of (await fs.readdir('evidence')).filter(n=>n.endsWith('-background-compression.json'))) {
    const report=JSON.parse(await fs.readFile('evidence/'+name,'utf8'));
    const group=name.replace('-background-compression.json','');
    const prefix=group==='beryl'?'fon-beryl':group;
    for (const [source,scene] of Object.entries(report.scenes)) {
      for (const {rectangles,rgbSha256} of scene.tiers) {
        const result=await page.evaluate(async({prefix,source,rectangles})=>{
          const {buildSceneryExport}=await import('./scenery-export.js');
          const {blob,name}=await buildSceneryExport(prefix+'-native-backgrounds.lua',source,rectangles);
          return {text:await blob.text(),file:name,size:blob.size};
        },{prefix,source,rectangles});
        if (result.file===download.suggestedFilename()) assert.equal(saved,result.text);
        assert.equal(result.size,Buffer.byteLength(result.text));
        await fs.writeFile(out+'/'+result.file,result.text);
        rows.push({source,file:result.file,rectangles,bytes:result.size,rgbSha256});
      }
    }
  }
  await fs.writeFile(out+'/files.json',JSON.stringify(rows,null,2)+'\n');
  console.log('Downloaded a selected tier through the page and exported '+rows.length+' individual Lua modules.');
} finally { await browser.close(); }
