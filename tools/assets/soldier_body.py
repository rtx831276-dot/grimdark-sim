"""Blender blockout generator. Run in a NEW Blender process, not your scene.

blender --background --python soldier_body.py -- --output /path/to/output
Creates a rigid-segment rigged blockout, not a finished skinned character.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    return mat


def box(name, location, scale, mat, bone):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    group = obj.vertex_groups.new(name=bone)
    group.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
    modifier = obj.modifiers.new('rig', 'ARMATURE')
    modifier.object = rig
    return obj


parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
out = Path(args.output).resolve()
out.mkdir(parents=True, exist_ok=True)
if (out / 'soldier-blockout.blend').exists():
    raise RuntimeError('Refusing to overwrite an existing asset')

# Use a fresh process: the startup scene is removed intentionally.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
cloth = material('uniform_green', (0.20, 0.29, 0.18))
armor = material('vest_grey', (0.18, 0.21, 0.20))
skin = material('skin', (0.56, 0.37, 0.28))
dark = material('boots_and_weapon', (0.055, 0.065, 0.060))

data = bpy.data.armatures.new('soldier_skeleton')
rig = bpy.data.objects.new('soldier_rig', data)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bones = [
    ('root', (0, 0, 0), (0, 0, .18), None),
    ('pelvis', (0, 0, .85), (0, 0, 1), 'root'),
    ('spine', (0, 0, 1), (0, 0, 1.42), 'pelvis'),
    ('head', (0, 0, 1.42), (0, 0, 1.72), 'spine'),
]
for side, x in [('L', .14), ('R', -.14)]:
    bones.extend([
        ('thigh.' + side, (x, 0, .91), (x, 0, .49), 'pelvis'),
        ('shin.' + side, (x, 0, .49), (x, 0, .10), 'thigh.' + side),
        ('foot.' + side, (x, 0, .10), (x, -.18, .10), 'shin.' + side),
        ('upper_arm.' + side, (x * 1.8, 0, 1.39), (x * 2, 0, 1.12), 'spine'),
        ('forearm.' + side, (x * 2, 0, 1.12), (x * 2, -.22, 1.02), 'upper_arm.' + side),
    ])
for name, head, tail, parent in bones:
    bone = data.edit_bones.new(name)
    bone.head, bone.tail = head, tail
    if parent:
        bone.parent = data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
box('pelvis', (0, 0, .92), (.36, .23, .20), cloth, 'pelvis')
box('torso', (0, 0, 1.23), (.43, .24, .43), cloth, 'spine')
box('vest', (0, -.025, 1.24), (.45, .30, .33), armor, 'spine')
box('backpack', (0, .21, 1.24), (.29, .16, .34), armor, 'spine')
box('head', (0, -.015, 1.58), (.20, .21, .25), skin, 'head')
box('helmet', (0, 0, 1.71), (.27, .28, .12), cloth, 'head')
for side, x in [('L', .14), ('R', -.14)]:
    box('thigh.' + side, (x, 0, .70), (.16, .19, .38), cloth, 'thigh.' + side)
    box('shin.' + side, (x, 0, .30), (.14, .17, .35), cloth, 'shin.' + side)
    box('boot.' + side, (x, -.055, .07), (.16, .29, .14), dark, 'foot.' + side)
    box('upper_arm.' + side, (x * 1.9, 0, 1.25), (.13, .16, .27), cloth, 'upper_arm.' + side)
    arm = box('forearm.' + side, (x * 2, -.11, 1.07), (.11, .25, .12), cloth, 'forearm.' + side)
    box('hand.' + side, (x * 2, -.23, 1.02), (.10, .10, .10), skin, 'forearm.' + side)
box('rifle_blockout', (-.28, -.46, 1.03), (.065, .55, .10), dark, 'forearm.R')

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x = 256
scene.render.resolution_y = 256
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
bpy.ops.object.camera_add(location=(3, -3, 3))
camera = bpy.context.object
camera.rotation_euler = (Vector((0, 0, .86)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 2.5
scene.camera = camera
bpy.ops.object.light_add(type='AREA', location=(2, -3, 5))
bpy.context.object.data.energy = 450
bpy.context.object.data.shape = 'DISK'
bpy.context.object.data.size = 5
manifest = {'version': 1, 'asset': 'soldier-blockout', 'status': 'blockout',
            'animations': [], 'rig': 'rigid segments', 'forward': '-Y',
            'unit': 'meter', 'views': []}
for direction in range(8):
    angle = math.radians(direction * 45)
    camera.location = (4 * math.sin(angle), -4 * math.cos(angle), 3.2)
    camera.rotation_euler = (Vector((0, 0, .86)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    filename = 'idle-%d.png' % direction
    scene.render.filepath = str(out / filename)
    bpy.ops.render.render(write_still=True)
    point = __import__('bpy_extras.object_utils', fromlist=['world_to_camera_view']).world_to_camera_view(scene, camera, Vector((0, 0, 0)))
    manifest['views'].append({'image': filename, 'yawDegrees': direction * 45,
                              'width': 256, 'height': 256,
                              'pivot': [point.x * 256, (1 - point.y) * 256]})
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(out / 'soldier-blockout.blend'))
