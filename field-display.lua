return function(C,art)
 return {
  draw=function(f,s,b,spec,_,mode,profile)
   C.drawFieldDisplayArt(f,art.idle or art,b.x-s.camera,b.y,spec.artHeight,mode,profile,b.facing>0)
  end
 }
end
