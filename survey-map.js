export function initSurveyMap(){
 const panel=document.getElementById('surveyMap');
 const caption=document.getElementById('surveyMapCaption');
 const canvas=document.getElementById('surveyMapCanvas'),ctx=canvas.getContext('2d');
 const selector=document.getElementById('surveySheet'),sheets=document.getElementById('surveySheets');
 const fieldNotes=document.getElementById('surveyFieldNotes');
 let displayed,choices=new Map();
 selector.onchange=()=>draw(choices.get(selector.value));
 function draw(map){
  caption.textContent=map.caption;
  ctx.fillStyle='#203d3a';ctx.fillRect(0,0,420,132);
  ctx.strokeStyle='#55746e';ctx.lineWidth=1;
  for(const y of [32,62,93,117]){
   ctx.beginPath();ctx.moveTo(18,y);ctx.lineTo(401,y);ctx.stroke();
  }
  for(const block of map.blocks??[]){
   ctx.fillStyle='#795c70';ctx.fillRect(block.x,block.y,block.w,block.h);
   ctx.fillStyle='#f4d9bd';ctx.font="12px 'Yu Gothic UI', sans-serif";ctx.textAlign='center';
   ctx.fillText(block.label,block.x+block.w/2,block.y+block.h-7);
  }
  for(const route of map.routes){
   ctx.strokeStyle=route.color;ctx.lineWidth=3;
   ctx.setLineDash(route.dashed?[5,6]:[]);
   ctx.beginPath();
   route.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
   ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.textAlign='center';ctx.font="14px 'Yu Gothic UI', sans-serif";
  for(const mark of map.marks){
   ctx.fillStyle='#f6e8b9';ctx.fillRect(mark.x-3,mark.y-3,6,6);
   ctx.fillStyle='#fff8d6';ctx.fillText(mark.name,mark.x,mark.y+(mark.below?18:-8));
  }
 }
 return function update(map,frame){
  panel.hidden=!map;
  if(map?.id===displayed)return;
  displayed=map?.id;
  fieldNotes.hidden=sheets.hidden=true;
  if(!map)return;
  draw(map);
  if(map.id!=='sumeru-height-map')return;
  const completed=frame.storyGraph.quests.filter(q=>frame.story.quests[q.id]?.status==='complete');
  choices=new Map([[map.id,map]]);
  const labels=new Map([['sumeru-height-map','川から観測所へ'],['river-canopy','川を渡る葉の橋'],
   ['root-up','幹の中段へ登る根道'],['merged-canopy','枝道と根道の合流点'],['wanderer-observation-record','放浪者の観測標識']]);
  for(const q of completed){
   for(const step of q.itinerary??[]){
    const sheet=step.surveyMap;
    if(sheet&&labels.has(sheet.id))choices.set(sheet.id,sheet);
   }
  }
  selector.replaceChildren(...Array.from(choices.keys(),id=>new Option(labels.get(id),id)));
  sheets.hidden=choices.size<2;
  const list=fieldNotes.querySelector('ul');
  list.replaceChildren();
  function note(name,text,node){
   const li=document.createElement('li'),link=document.createElement('button');
   link.textContent=name+'を地図で見る';link.type='button';
   link.onclick=()=>window.lab.action('world_map_focus:'+node);
   li.append(document.createTextNode(text+' '),link);list.append(li);
  }
  for(const q of completed){
   const state=frame.story.quests[q.id];
   if(q.id==='sum-wanderer-observation'){
    const sign=q.itinerary.at(-1);
    note(sign.name,sign.readback,sign.node);
   }else if(q.id==='sum-fungus-visitors'){
    note('標本の保管所','ティナリの観測記録　'+q.observation.pattern+'。星葉草を棚に戻したあとも、観測器の音は同じだった。',q.target);
   }else if(q.id==='sum-collei-guide'){
    const stop=q.itinerary.find(step=>step.choices?.some(c=>c.restStop));
    note('屋根付きの休憩所','コレイの道案内　雨宿りするなら、川を見下ろす腰掛けから下へ。屋根の下で休める。',stop.node);
   }else if(q.id==='sum-kaveh-model'&&state.roomLayout){
    const room=frame.storyGraph.nodes.find(n=>n.kavehQuest===q.id&&n.readingRoom);
    const windowStyle=q.readingModel.options.window.find(w=>w.id===state.roomLayout.window);
    if(room&&windowStyle)note('閲覧室','カーヴェの模型に合わせた「'+windowStyle.label+'」が、観測所の閲覧室に取り付けられた。',room.id);
   }else if(q.id==='sum-nahida-map'&&state.discoveryDraft){
    const chosen=q.discoveryMap.cards.filter(c=>c.id in state.discoveryDraft).map(c=>c.label);
    note('広場の絵地図','ナヒーダと広場に掲示した発見　'+chosen.join('、')+'。',q.target);
   }
  }
  fieldNotes.hidden=!list.childElementCount;
 }
}
