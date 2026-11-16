// Only gallery display preferences travel in the link; no game/save state.
export function setupGalleryUrl({search,render}){
 const profile=document.getElementById('profile'),zoom=document.getElementById('zoom'),flip=document.getElementById('flip');
 const link=document.createElement('a');link.id='comparisonLink';link.textContent='この比較条件のリンク';
 search.closest('.gallery-search').append(link);
 const allowed=(select,value,fallback)=>[...select.options].some(o=>o.value===value)?value:fallback;
 function restore(){
  const params=new URL(location.href).searchParams;
  search.value=params.get('q')??'';
  profile.value=allowed(profile,params.get('profile'),'h32c16');
  zoom.value=allowed(zoom,params.get('zoom'),'2');
  flip.checked=params.get('flip')==='1';
 }
 function update(){
  const url=new URL(location.href);
  for(const [key,value,defaultValue] of [['q',search.value,''],['profile',profile.value,'h32c16'],['zoom',zoom.value,'2'],['flip',flip.checked?'1':'0','0']]){
   if(value===defaultValue)url.searchParams.delete(key);else url.searchParams.set(key,value);
  }
  link.href=url.href;
  if(url.href!==location.href)history.replaceState(history.state,'',url.href);
 }
 restore();
 window.addEventListener('popstate',()=>{restore();render()});
 return update;
}
