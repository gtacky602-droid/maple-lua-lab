import {surveyPoint,surveyPointUrl} from './survey-point.js';

const pictures=new Map();

export function teaCardPicture(card,image){
 const canvas=document.createElement('canvas');
 canvas.width=104;canvas.height=60;canvas.setAttribute('aria-hidden','true');
 function paint(source){
  const [x,y,w,h]=card.box,scale=Math.min(canvas.width/w,canvas.height/h);
  const ctx=canvas.getContext('2d');
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(source,x,y,w,h,(canvas.width-w*scale)/2,(canvas.height-h*scale)/2,w*scale,h*scale);
 }
 if(image)paint(image);
 else{
  if(!pictures.has(card.source)){
   const sheet=new Image();
   sheet.src='assets/'+card.source;
   pictures.set(card.source,sheet);
  }
  const sheet=pictures.get(card.source);
  if(sheet.complete&&sheet.naturalWidth)paint(sheet);
  else sheet.addEventListener('load',()=>paint(sheet),{once:true});
 }
 return canvas;
}

let notebookOpen=false;

export function teaNotebook(quest,state,nodeName,button){
 const details=document.createElement('details');
 details.className='tea-notebook';details.open=notebookOpen;
 details.ontoggle=()=>{if(details.isConnected)notebookOpen=details.open};
 const entries=quest.itinerary.filter(step=>step.teaClue);
 const known=quest.itinerary.slice(0,state.count).filter(step=>step.teaClue);
 const summary=document.createElement('summary');
 summary.textContent='平蔵の事件帖　絵札 '+known.length+' / '+entries.length;
 details.append(summary);
 const cards=document.createElement('ul');
 for(const step of known){
  const item=document.createElement('li'),clue=step.teaClue;
  item.dataset.clue=clue.id;
  const title=document.createElement('strong'),place=document.createElement('small'),note=document.createElement('span');
  title.textContent=clue.label;place.textContent=nodeName(step.node);note.textContent=clue.detail;
  const link=document.createElement('a');
  link.href=surveyPointUrl(surveyPoint(quest,quest.itinerary.indexOf(step),step.node));
  link.target='_blank';link.rel='noopener';link.textContent='発見場所を見る';
  link.setAttribute('aria-label',clue.label+'の発見場所を見る');
  if(clue.box&&clue.source)item.append(teaCardPicture(clue));
  item.append(title,place,note,link);
  cards.append(item);
 }
 if(known.length)details.append(cards);
 else{
  const empty=document.createElement('p');
  empty.textContent='聞き込みで手に入れた絵札をここに綴じます。';
  details.append(empty);
 }
 if(state.status==='complete'){
  const rest=button('船着き場の茶屋を地図で見る','world_map_focus:'+quest.target);
  const preview=document.createElement('a');
  preview.href=surveyPointUrl(surveyPoint(quest,quest.goal-1,quest.target));
  preview.target='_blank';preview.rel='noopener';preview.textContent='屋台のドット絵を見比べる';
  details.append(rest,preview);
 }
 return details;
}
