// Match only registered gallery files; encounter metadata is not used as a URL.
export function encounterArtItems(encounter, catalog){
 const files=new Set([encounter.art_candidate,...(encounter.art_variants??[]),...(encounter.art_components??[])]
  .filter(Boolean).map(art=>art.encoding));
 return catalog.filter(item=>files.has('assets/'+item.file));
}
