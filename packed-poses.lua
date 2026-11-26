-- PNG draws only need the crop and anchor. Materialize a profile on its first rectangle draw.
return function(grid, records)
 local format = grid.wide and '<I2I2I2I2B' or '<BBBBB'
 local planar = grid.planarXY16
 local stride = planar and 7 or string.packsize(format)
 local eager = type(records) == 'string'
 if eager then assert(#records % stride == 0, 'invalid packed pose length') end
 local palette = grid.palette
 grid.palette, grid.wide, grid.planarXY16 = nil, nil, nil
 return setmetatable(grid, {__index = function(t, key)
  if key ~= 'runs' then return nil end
  local bytes = eager and records or records()
  if not eager then assert(#bytes % stride == 0, 'invalid packed pose length') end
  local runs = {}
  local count = #bytes // stride
  for i = 1, count do
   local x,y,w,h,index
   if planar then
    x = bytes:byte(i) + 256 * bytes:byte(count+i)
    y = bytes:byte(2*count+i) + 256 * bytes:byte(3*count+i)
    w,h,index = bytes:byte(4*count+i),bytes:byte(5*count+i),bytes:byte(6*count+i)
   else
    x,y,w,h,index = string.unpack(format, bytes, 1+(i-1)*stride)
   end
   local color = assert(palette[index+1], 'invalid packed pose color')
   runs[#runs+1] = {x,y,w,h,color}
  end
  rawset(t, 'runs', runs)
  setmetatable(t, nil)
  return runs
 end})
end
