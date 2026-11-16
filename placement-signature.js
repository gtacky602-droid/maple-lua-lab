// Empty nodes and object-key order do not change the rendered placement.
// Array order is retained because overlapping sprites render in that order.
export function placementSignature(draft){
 return JSON.stringify(Object.entries(draft.nodes).filter(([,items])=>items.length).sort(([a],[b])=>a.localeCompare(b)).map(([id,items])=>[id,items.map(e=>[e.id,e.species,e.x,e.y,e.flip])]));
}
