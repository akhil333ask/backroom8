import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import {
  ANIM_MAP,
  BODY_COLOR,
  BODY_ROUGHNESS,
  MESH_FILE,
  MODEL_DIR,
  SEEKER_HEIGHT,
  STATES,
  type SeekerState,
} from './anim-map'

export interface PreparedClip {
  clip: THREE.AnimationClip
  /** Ground speed measured from the hips root motion before stripping (m/s, already scaled). */
  nativeSpeed: number
}

export interface SeekerAsset {
  /** Template; clone with SkeletonUtils for each seeker instance. */
  template: THREE.Group
  /** Applied to the template root so the model stands SEEKER_HEIGHT tall. */
  scale: number
  bodyMaterial: THREE.MeshStandardMaterial
  featureMaterial: THREE.MeshStandardMaterial
  boneNames: Set<string>
}

const loader = new FBXLoader()
const fileCache = new Map<string, Promise<THREE.Group | null>>()

function loadFile(file: string) {
  let p = fileCache.get(file)
  if (!p) {
    p = loader.loadAsync(MODEL_DIR + file).catch((err) => {
      console.warn(`[seeker] failed to load ${file}:`, err)
      return null
    })
    fileCache.set(file, p)
  }
  return p
}

/** Draw groups that share a material are merged so the skinned mesh costs one draw call per material. */
function mergeGroupsByMaterial(geo: THREE.BufferGeometry) {
  if (geo.groups.length <= 1) return
  const order = [...geo.groups].sort((a, b) => a.materialIndex! - b.materialIndex!)
  const ranges: number[] = []
  const groups: { start: number; count: number; materialIndex: number }[] = []
  let cursor = 0
  for (const g of order) {
    const last = groups[groups.length - 1]
    if (last && last.materialIndex === g.materialIndex) last.count += g.count
    else groups.push({ start: cursor, count: g.count, materialIndex: g.materialIndex! })
    for (let i = 0; i < g.count; i++) ranges.push(g.start + i)
    cursor += g.count
  }
  if (geo.index) {
    const src = geo.index.array
    const out = new (src.constructor as Uint32ArrayConstructor)(ranges.length)
    for (let i = 0; i < ranges.length; i++) out[i] = src[ranges[i]]
    geo.setIndex(new THREE.BufferAttribute(out, 1))
  } else {
    for (const name of Object.keys(geo.attributes)) {
      const attr = geo.attributes[name] as THREE.BufferAttribute
      const size = attr.itemSize
      const out = new (attr.array.constructor as Float32ArrayConstructor)(ranges.length * size)
      for (let i = 0; i < ranges.length; i++) {
        for (let c = 0; c < size; c++) out[i * size + c] = attr.array[ranges[i] * size + c]
      }
      geo.setAttribute(name, new THREE.BufferAttribute(out, size, attr.normalized))
    }
  }
  geo.clearGroups()
  for (const g of groups) geo.addGroup(g.start, g.count, g.materialIndex)
}

/** Posed height of the skinned mesh (walk frame 0), in model units, plus the lowest point. */
function measurePosed(root: THREE.Group, mesh: THREE.SkinnedMesh, clip: THREE.AnimationClip | undefined) {
  if (clip) {
    const mixer = new THREE.AnimationMixer(root)
    mixer.clipAction(clip).play()
    mixer.setTime(0)
  }
  root.updateMatrixWorld(true)
  const box = new THREE.Box3()
  const v = new THREE.Vector3()
  const pos = mesh.geometry.attributes.position
  for (let i = 0; i < pos.count; i += 5) {
    v.fromBufferAttribute(pos, i)
    mesh.applyBoneTransform(i, v)
    v.applyMatrix4(mesh.matrixWorld)
    box.expandByPoint(v)
  }
  return box
}

/** "mixamorig:Hips" / "Armature|mixamorigHips" -> a bone name that exists in the skeleton. */
function resolveBone(name: string, bones: Set<string>) {
  if (bones.has(name)) return name
  const candidates = [name.replace(/:/g, ''), name.split('|').pop()!, name.split('|').pop()!.replace(/:/g, '')]
  return candidates.find((c) => bones.has(c)) ?? null
}

/**
 * Sanitizes track names, measures root motion speed, then zeroes the hips X/Z so movement only comes from
 * game code. Position tracks are scaled from cm via the root scale, so they stay in model units here.
 */
function prepareClip(raw: THREE.AnimationClip, state: SeekerState, asset: SeekerAsset): PreparedClip {
  const tracks: THREE.KeyframeTrack[] = []
  const unmatched: string[] = []
  let nativeSpeed = 0
  for (const src of raw.tracks) {
    const dot = src.name.lastIndexOf('.')
    const bone = resolveBone(src.name.slice(0, dot), asset.boneNames)
    if (!bone) {
      unmatched.push(src.name)
      continue
    }
    const track = src.clone()
    track.name = `${bone}${src.name.slice(dot)}`
    if (/Hips$/.test(bone) && track.name.endsWith('.position')) {
      // clone() can share the typed array with the cached file (walk + wade both use walk.fbx).
      track.values = track.values.slice()
      const v = track.values
      const n = v.length / 3
      if (n > 1 && raw.duration > 0) {
        const dx = v[(n - 1) * 3] - v[0]
        const dz = v[(n - 1) * 3 + 2] - v[2]
        nativeSpeed = (Math.hypot(dx, dz) * asset.scale) / raw.duration
      }
      for (let i = 0; i < n; i++) {
        v[i * 3] = 0
        v[i * 3 + 2] = 0
      }
    }
    tracks.push(track)
  }
  if (unmatched.length) console.warn(`[seeker] ${state}: ${unmatched.length} unmatched tracks`, unmatched)
  const clip = new THREE.AnimationClip(state, raw.duration, tracks)
  return { clip, nativeSpeed }
}

let assetPromise: Promise<SeekerAsset | null> | null = null
const clipPromises = new Map<SeekerState, Promise<PreparedClip | null>>()

/** Mesh + skeleton from walk.fbx, yellow standard materials, merged draw groups, scaled to 2.6m. */
export function loadSeekerAsset() {
  if (!assetPromise) {
    assetPromise = loadFile(MESH_FILE).then((root) => {
      if (!root) return null
      let mesh: THREE.SkinnedMesh | null = null
      const boneNames = new Set<string>()
      root.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh && !mesh) mesh = o as THREE.SkinnedMesh
        if ((o as THREE.Bone).isBone) boneNames.add(o.name)
      })
      if (!mesh) {
        console.warn('[seeker] walk.fbx has no skinned mesh')
        return null
      }
      const skinned = mesh as THREE.SkinnedMesh
      const bodyMaterial = new THREE.MeshStandardMaterial({ color: BODY_COLOR, roughness: BODY_ROUGHNESS })
      const featureMaterial = new THREE.MeshStandardMaterial({ color: '#000000', roughness: 0.9 })
      const oldMats = Array.isArray(skinned.material) ? skinned.material : [skinned.material]
      // The material owning the biggest draw group is the body; the small head-only parts are eyes/mouth.
      const groups = skinned.geometry.groups
      const bodyIndex = groups.length
        ? groups.reduce((best, g) => (g.count > best.count ? g : best)).materialIndex!
        : 0
      skinned.material = oldMats.map((_, i) => (i === bodyIndex ? bodyMaterial : featureMaterial))
      for (const m of oldMats) m.dispose()
      mergeGroupsByMaterial(skinned.geometry)
      skinned.frustumCulled = false
      skinned.castShadow = false
      skinned.receiveShadow = false

      const box = measurePosed(root, skinned, root.animations[0])
      const height = Math.max(1, box.max.y - box.min.y)
      const scale = SEEKER_HEIGHT / height
      root.scale.setScalar(scale)
      root.position.y = -box.min.y * scale
      // Reset to bind pose; measuring left the skeleton posed.
      skinned.skeleton.pose()

      const template = new THREE.Group()
      template.add(root)
      // Mixamo faces +Z; the game's forward at yaw 0 is -Z.
      root.rotation.y = Math.PI
      return { template, scale, bodyMaterial, featureMaterial, boneNames }
    })
  }
  return assetPromise
}

export function loadSeekerClip(state: SeekerState) {
  let p = clipPromises.get(state)
  if (!p) {
    p = Promise.all([loadSeekerAsset(), loadFile(ANIM_MAP[state].file)]).then(([asset, root]) => {
      const raw = root?.animations[0]
      if (!asset || !raw) {
        console.warn(`[seeker] clip missing for state "${state}" (${ANIM_MAP[state].file})`)
        return null
      }
      return prepareClip(raw, state, asset)
    })
    clipPromises.set(state, p)
  }
  return p
}

export const eagerStates = () => STATES.filter((s) => ANIM_MAP[s].eager)
export const lazyStates = () => STATES.filter((s) => !ANIM_MAP[s].eager)
