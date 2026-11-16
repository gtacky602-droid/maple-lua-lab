"""Blender background script for local, unposed PMX costume inspection.

Requires MMD Tools checkout under work/tools/blender_mmd_tools.
Model files stay under ignored work/references; no model redistribution.
Run Blender --background --factory-startup --python this_file -- character_id.
Flat texture renders are reference views, not game-engine shading validation.
"""
from pathlib import Path
import sys, math, json
import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'work/tools/python'))
sys.path.insert(0, str(ROOT / 'work/tools/blender_mmd_tools'))
import mmd_tools
mmd_tools.register()
name = sys.argv[sys.argv.index('--') + 1]
model = next((ROOT / 'work/references' / (name + '-model')).glob('*.pmx'))
out = ROOT / 'work/references' / (name + '-views')
out.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.mmd_tools.import_model(filepath=str(model), types={'MESH', 'ARMATURE'}, scale=0.08)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for obj in meshes:
    overlay_slots = set()
    for i, mat in enumerate(obj.data.materials):
        tex = mat.node_tree.nodes.get('mmd_base_tex') if mat and mat.node_tree else None
        if tex and tex.image and tex.image.name in {'sph.png', 'spa_h.png', 'sp.png'}:
            overlay_slots.add(i)
    # Coplanar additive shine faces obscure the underlying hair in Cycles.
    # Omit them only in this transient inspection scene; source PMX is untouched.
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in overlay_slots], context='FACES')
    bm.to_mesh(obj.data)
    bm.free()
textures = []
for mat in bpy.data.materials:
    if not mat.use_nodes:
        continue
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    tex = nodes.get('mmd_base_tex')
    if tex is None or tex.image is None:
        continue
    tex.image.alpha_mode = 'CHANNEL_PACKED'
    textures.append({'material': mat.name, 'image': tex.image.name, 'size': list(tex.image.size)})
    output = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL')
    if tex.image.name in {'sph.png', 'spa_h.png', 'sp.png'}:
        # Separate additive shine overlay must not become an opaque black shell.
        transparent = nodes.new('ShaderNodeBsdfTransparent')
        links.new(transparent.outputs[0], output.inputs['Surface'])
        continue
    emission = nodes.new('ShaderNodeEmission')
    links.new(tex.outputs['Color'], emission.inputs['Color'])
    # These provided textures pack non-opacity information in alpha (notably
    # the hair). Keep the model surface opaque for this costume-only view.
    links.new(emission.outputs[0], output.inputs['Surface'])
points = [o.matrix_world @ Vector(p) for o in meshes for p in o.bound_box]
lo = Vector(tuple(min(p[i] for p in points) for i in range(3)))
hi = Vector(tuple(max(p[i] for p in points) for i in range(3)))
center = (lo + hi) / 2
height = hi.z - lo.z
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 8
scene.render.resolution_x = 640
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
scene.world.color = (0.12, 0.12, 0.12)
scene.view_settings.view_transform = 'Standard'
bpy.ops.object.camera_add()
camera = bpy.context.object
camera.data.type = 'ORTHO'
camera.data.ortho_scale = max(height * 1.12, (hi.x-lo.x) * 1.25 * 1.12)
scene.camera = camera
views = [('front', (0,-1,0)), ('right', (1,0,0)), ('back', (0,1,0)), ('left', (-1,0,0))]
for label, direction in views:
    camera.location = center + Vector(direction) * height * 3
    camera.rotation_euler = (center-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath = str(out / (label + '.png'))
    bpy.ops.render.render(write_still=True)
(out/'render.json').write_text(json.dumps({'model': str(model), 'views': [v[0] for v in views], 'textures': textures, 'bounds': [list(lo),list(hi)], 'render': 'flat base textures; no physics or pose; not in-game shader'}, ensure_ascii=False, indent=2), encoding='utf8')
