"""
Headless Blender script: converts a single Mixamo FBX file to GLB.

Usage:
  blender --background --factory-startup --python fbx_to_glb.py -- <input.fbx> <output.glb>

- Textures are NOT embedded (materials set to NONE) because the Three.js
  code loads and applies PBR textures separately via applyPBRMaterial().
- Skeletal animations and skinning weights are fully preserved.
- NO transform_apply: bone rest poses and animation keyframes must remain
  in the same local coordinate system or animations will be corrupted.
  The Armature node carries scale (0.01) and rotation from the FBX import;
  Three.js handles both via the skinning pipeline without needing manual fixes.
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

# Diagnostic: show Armature object transform so we know what ends up in the GLB
for obj in bpy.data.objects:
    if obj.type == "ARMATURE":
        print(f"[fbx_to_glb] Armature rotation_euler: {list(obj.rotation_euler)}")
        print(f"[fbx_to_glb] Armature scale: {list(obj.scale)}")

# --- Export GLB ---------------------------------------------------------
# export_apply=True applies mesh-object transforms to vertex data at export
# time without touching Blender scene data.  The Armature node (scale 0.01,
# rotation from FBX import) is preserved as-is in the GLB — Three.js uses
# it correctly through the skinning inverse-bind-matrix pipeline.
bpy.ops.export_scene.gltf(
    filepath=glb_path,
    export_format="GLB",
    export_image_format="NONE",
    export_materials="NONE",
    export_animations=True,
    export_skins=True,
    export_apply=False,   # MUST be False for skinned characters — True causes
                          # Blender to export without the mesh→skin binding, and
                          # gltf-transform prune then deletes the orphaned Skin,
                          # leaving an unanimated static mesh.
    export_cameras=False,
    export_lights=False,
)

size_mb = os.path.getsize(glb_path) / (1024 * 1024) if os.path.exists(glb_path) else -1
print(f"[fbx_to_glb] done — {size_mb:.2f} MB written to {glb_path}")
