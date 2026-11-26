-- PNG draws only need the crop and anchor. Materialize a profile on its first rectangle draw.
return function(grid, records)
 local format = grid.wide and '<I2I2I2I2B' or '<BBBBB'
 local stride = string.packsize(format)
 local eager = type(records) == 'string'
 if eager then assert(#records % stride == 0, 'invalid packed pose length') end
 local palette = grid.palette
 grid.palette, grid.wide = nil, nil
 return setmetatable(grid, {__index = function(t, key)
  if key ~= 'runs' then return nil end
  local bytes = eager and records or records()
  if not eager then assert(#bytes % stride == 0, 'invalid packed pose length') end
  local runs = {}
  for pos = 1, #bytes, stride do
   local x,y,w,h,index = string.unpack(format, bytes, pos)
   local color = assert(palette[index+1], 'invalid packed pose color')
   runs[#runs+1] = {x,y,w,h,color}
  end
  rawset(t, 'runs', runs)
  setmetatable(t, nil)
  return runs
 end})
end
