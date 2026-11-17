export const encounterArtGalleries={
 bosses:{catalog:'content/boss-art-gallery.json',page:'bosses-art.html',label:'ボス'},
 characters:{catalog:'content/character-art-gallery.json',page:'characters-art.html',label:'キャラクター'},
};

export function encounterArtReferences(encounter){
 return [encounter.art_candidate,...(encounter.art_variants??[]),...(encounter.art_components??[])].filter(Boolean);
}

// Match registered files within a known gallery. Metadata only supplies lookup keys.
export function encounterArtItems(encounter, catalogs){
 const references=encounterArtReferences(encounter);
 return Object.entries(encounterArtGalleries).flatMap(([gallery,{page}])=>{
  const files=new Set(references.filter(art=>(art.gallery??'bosses')===gallery).map(art=>art.encoding));
  return (catalogs[gallery]??[]).filter(item=>files.has('assets/'+item.file)).map(item=>({...item,gallery,page}));
 });
}
