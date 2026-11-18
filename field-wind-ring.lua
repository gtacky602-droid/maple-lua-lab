return function(C)
 return {
  draw=function(f,s,b,spec,_,mode,profile)
   C.drawWindRingArt(f,b.x-s.camera,b.y,spec.artHeight,mode,profile,b.facing>0)
  end
 }
end
