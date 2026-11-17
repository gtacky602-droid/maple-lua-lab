import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

// Hand-marked crown and chin rows in the source PNG, excluding hair ornaments.
const subjects=[
 {id:'traveler',name:'旅人',before:{crown:116,chin:450},after:{crown:132,chin:529}},
 {id:'amber',name:'アンバー',before:{crown:245,chin:540},after:{crown:214,chin:550}},
];
for(const subject of subjects){
 for(const [version,suffix] of [['before',''],['after','-v3']]){
  const art=JSON.parse(await fs.readFile(`assets/${subject.id}-idle-sprites${suffix}.json`,'utf8'));
  const m=subject[version];m.source=art.source;m.box=art.box;m.anchor=art.anchorX;
  const standingHeight=art.box[1]+art.box[3]-m.crown;
  m.headHeight=m.chin-m.crown;
  m.heads=standingHeight/m.headHeight;
  m.runs=Object.fromEntries(Object.entries(art.profiles).map(([key,profile])=>[key,profile.runs.length]));
 }
 subject.headIncreasePercent=(subject.before.heads/subject.after.heads-1)*100;
 assert(subject.after.heads>=2.8&&subject.after.heads<=3.2,subject.id+' head-to-body ratio');
 assert(subject.headIncreasePercent>=10&&subject.headIncreasePercent<=20,subject.id+' head size at equal anatomical height');
}
const atlas=JSON.parse(await fs.readFile('assets/sprites.json','utf8'));
const bowArt=JSON.parse(await fs.readFile('assets/amber-bow-sprites-v3.json','utf8'));
const bow={name:'アンバーの弓の構え',before:{source:'atlas-transparent.png',box:atlas.sprites[3].box,anchor:.5,bowSpan:[81,346]},
 after:{source:bowArt.source,box:bowArt.box,anchor:bowArt.anchorX,bowSpan:[176,901]}};
const bowShare=data=>(data.bowSpan[1]-data.bowSpan[0])/data.box[3];
bow.increasePercent=(bowShare(bow.after)/bowShare(bow.before)-1)*100;
assert(bow.increasePercent>=10&&bow.increasePercent<=20);

const base=process.env.LAB_URL||'http://127.0.0.1:8769';
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:940,height:620}});
 await page.setContent(`<html lang="ja"><meta charset="utf-8"><style>
 body{margin:0;background:#102d30;color:#ecf1dc;font:15px 'Yu Gothic UI',sans-serif}
 main{padding:26px 30px}h1{font-size:24px;margin:0 0 10px}p{margin:0 0 20px;color:#bcdbd0}
 #pairs{display:grid;grid-template-columns:1fr 1fr;gap:16px}
 #weapon{margin-top:18px;max-width:430px}
 section{background:#163a3c;border:1px solid #627e76;border-radius:10px;padding:14px}
 h2{margin:0 0 10px;font-size:18px;color:#f0d997}
 .row{display:flex;gap:12px}figure{margin:0;flex:1;min-width:0}
 figcaption{margin-bottom:6px}canvas{display:block;width:100%;background:#244748;border-radius:5px}
 </style><main><h1>旅人とアンバーの頭身比較</h1><p>同じ表示高で拡大。線は頭頂とあごの目安です。</p><div id="pairs"></div></main><div id="weapon"></div></html>`);
 await page.evaluate(async({base,subjects,bow})=>{
  for(const subject of [...subjects,bow]){
   const section=document.createElement('section'),heading=document.createElement('h2');
   heading.textContent=subject.name;
   const row=document.createElement('div');row.className='row';section.append(heading,row);
   for(const [version,label] of [['before','旧版'],['after','新版']]){
    const data=subject[version],image=new Image();image.src=`${base}/assets/${data.source}`;await image.decode();
    const figure=document.createElement('figure'),caption=document.createElement('figcaption'),canvas=document.createElement('canvas');
    caption.textContent=data.heads?`${label} 約${data.heads.toFixed(1)}頭身`:label;
    canvas.width=190;canvas.height=245;
    const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
    const foot=221,height=176,scale=height/data.box[3],width=data.box[2]*scale;
    ctx.fillStyle='#81a099';ctx.fillRect(8,foot,174,1);
    ctx.drawImage(image,...data.box,95-width*data.anchor,foot-height,width,height);
    ctx.strokeStyle='#e6c97d';
    for(const y of data.heads?[data.crown,data.chin]:[]){
     const line=foot-height+(y-data.box[1])*scale;
     ctx.beginPath();ctx.moveTo(146,line);ctx.lineTo(176,line);ctx.stroke();
    }
    figure.append(caption,canvas);row.append(figure);
   }
   document.getElementById(subject===bow?'weapon':'pairs').append(section);
  }
 },{base,subjects,bow});
 await page.locator('main').screenshot({path:'evidence/humanoid-proportions.png'});
 await page.locator('#weapon').screenshot({path:'evidence/amber-bow-proportions.png'});
 await fs.writeFile('evidence/humanoid-proportions.json',JSON.stringify({method:'Approximate visual landmarks. Crown excludes Aether’s hair tuft and Amber’s ribbon. Head-size change compares head share at equal standing anatomy height; picture uses equal in-game bounding-box height. Bow span excludes the red tassel.',subjects,bow},null,2));
 console.log('Two humanoid idle and Amber bow comparisons generated');
}finally{await browser.close()}
