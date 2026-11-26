-- PNG draws only need the crop and anchor. Materialize a profile on its first rectangle draw.
return function(grid, records)
 local format = grid.wide and '<I2I2I2I2B' or '<BBBBB'
 local stride = string.packsize(format)
 assert(#records % stride == 0, 'invalid packed pose length')
 local palette = grid.palette
 grid.palette, grid.wide = nil, nil
 return setmetatable(grid, {__index = function(t, key)
  if key ~= 'runs' then return nil end
  local runs = {}
  for pos = 1, #records, stride do
   local x,y,w,h,index = string.unpack(format, records, pos)
   local color = assert(palette[index+1], 'invalid packed pose color')
   runs[#runs+1] = {x,y,w,h,color}
  end
  rawset(t, 'runs', runs)
  setmetatable(t, nil)
  return runs
 end})
end
