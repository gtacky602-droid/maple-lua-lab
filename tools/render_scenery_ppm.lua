-- Lua 5.3+. Render one lab download without the game, Python or an image library.
-- lua tools/render_scenery_ppm.lua scene.lua result.ppm [MapleCodec.lua]
assert(arg[1] and arg[2], "Specify a downloaded scene.lua and an output.ppm")
local here = arg[0]:match("^(.*[/\\])") or "./"
local codec = dofile(arg[3] or (here .. "../assets/MapleCodec.lua"))
local scenes = assert(loadfile(arg[1], "t", {}))()
local name, scene = next(scenes)
assert(scene and not next(scenes, name), "Expected a single selected scene")
local ctx = {}
codec(ctx)
ctx.profiles[1] = scene.base
ctx.scenerySplits.selected = scene.details
local image = ctx.refinedScenery("selected", ctx.profile(1))
assert(#image.runs == 4096 + scene.count, "Unexpected rectangle count")
local rows = {}
for y = 1, image.height do rows[y] = string.rep("\0", image.width * 3) end
for _, rect in ipairs(image.runs) do
    local x, y, width, height, color = table.unpack(rect)
    local r, g, b = color:match("^#(%x%x)(%x%x)(%x%x)$")
    local fill = string.rep(string.char(tonumber(r, 16), tonumber(g, 16), tonumber(b, 16)), width)
    for row = y + 1, y + height do
        local previous = rows[row]
        rows[row] = previous:sub(1, x * 3) .. fill .. previous:sub((x + width) * 3 + 1)
    end
end
local out = assert(io.open(arg[2], "wb"))
assert(out:write(("P6\n%d %d\n255\n"):format(image.width, image.height), table.concat(rows)))
assert(out:close())
