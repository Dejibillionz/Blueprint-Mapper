"""
Headless Blender script: converts a single Mixamo FBX file to GLB.

Usage:
  blender --background --factory-startup --python fbx_to_glb.py -- <input.fbx> <output.glb>

- Textures are NOT embedded (materials set to NONE) because the Three.js
  code loads and applies PBR textures separately via applyPBRMaterial().
- Skeletal animations and skinning weights are fully preserved.
- Blender handles the centimetre→metre unit conversion during FBX import,
  so the output GLB is already in metres (no scale.setScalar(0.01) needed).
"""

import bpy
import sys
import os

argv = sys.argv
script_args = argv[argv.index("--") + 1:] if "--" in argv else []

if len(script_args) < 2:
    print("ERROR: provide <input.fbx> <output.glb> after --")
    sys.exit(1)

fbx_path = os.path.abspath(script_args[0])
glb_path = os.path.abspath(script_args[1])

print(f"[fbx_to_glb] input : {fbx_path}")
print(f"[fbx_to_glb] output: {glb_path}")

# --- Clear default scene ------------------------------------------------
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

# --- Import FBX ---------------------------------------------------------
bpy.ops.import_scene.fbx(
    filepath=fbx_path,
    use_anim=True,
    anim_offset=1.0,
    ignore_leaf_bones=False,
    force_connect_children=False,
    automatic_bone_orientation=False,
    primary_bone_axis="Y",
    secondary_bone_axis="X",
    use_prepost_rot=True,
)

print(f"[fbx_to_glb] objects after import: {[o.name for o in bpy.data.objects]}")

# --- Apply scale so glTF node has scale (1,1,1) in metres ---------------
# Mixamo FBX imports with the Armature at scale (0.01, 0.01, 0.01).
# Applying the scale bakes it into bone rest positions and mesh vertices,
# so the exported glTF nodes have identity scale → Three.js sees the
# character at the correct ~1.7 m height with no extra scaling needed.
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
print(f"[fbx_to_glb] scale applied")

# --- Export GLB ---------------------------------------------------------
bpy.ops.export_scene.gltf(
    filepath=glb_path,
    export_format="GLB",
    export_image_format="NONE",
    export_materials="NONE",
    export_animations=True,
    export_skins=True,
    export_apply=False,   # transforms already applied above
    export_cameras=False,
    export_lights=False,
)

size_mb = os.path.getsize(glb_path) / (1024 * 1024) if os.path.exists(glb_path) else -1
print(f"[fbx_to_glb] done — {size_mb:.2f} MB written to {glb_path}")
