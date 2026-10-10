import type * as THREE from 'three'
import type { BoxSource } from './collision'
import { CAMERA } from './controls-config'

const state = { px: 0, py: 0, pz: 0, dist: CAMERA.distance as number, init: false }

/** Snap instead of easing on the next frame (teleports, leaving a hide spot). */
export function resetCameraFollow() {
  state.init = false
}

/**
 * Ray (origin o, direction d, length 1) vs AABB slab test. Returns entry t in [0, 1] or 1 if no hit.
 * Rays that start inside a box are ignored so a character grazing a wall doesn't collapse the camera.
 */
function rayBox(
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number,
) {
  if (ox > minX && ox < maxX && oy > minY && oy < maxY && oz > minZ && oz < maxZ) return 1
  let t0 = 0
  let t1 = 1
  const axes: [number, number, number, number][] = [
    [ox, dx, minX, maxX],
    [oy, dy, minY, maxY],
    [oz, dz, minZ, maxZ],
  ]
  for (const [o, d, mn, mx] of axes) {
    if (Math.abs(d) < 1e-8) {
      if (o < mn || o > mx) return 1
      continue
    }
    let a = (mn - o) / d
    let b = (mx - o) / d
    if (a > b) [a, b] = [b, a]
    if (a > t0) t0 = a
    if (b < t1) t1 = b
    if (t0 > t1) return 1
  }
  return t0
}

export interface FollowTarget {
  x: number
  z: number
  /** Pivot height in world y (feet + CAMERA.height, already lowered for crouch). */
  pivotY: number
  yaw: number
  /** Look-up positive (camera convention: negative = camera above the character). */
  pitch: number
  /** World y the camera may not go above (ceiling minus margin). */
  ceilingY: number
  shake: number
}

/** Over-the-shoulder orbit with wall/furniture collision. Returns the final camera distance. */
export function updateThirdPersonCamera(camera: THREE.Camera, t: FollowTarget, sources: BoxSource[], dt: number) {
  const k = state.init ? 1 - Math.exp(-dt * CAMERA.damping) : 1
  state.px += (t.x - state.px) * k
  state.py += (t.pivotY - state.py) * k
  state.pz += (t.z - state.pz) * k
  const pivotY = Math.min(state.py, t.ceilingY)

  const cp = Math.cos(t.pitch)
  const fx = -Math.sin(t.yaw) * cp
  const fy = Math.sin(t.pitch)
  const fz = -Math.cos(t.yaw) * cp
  const rx = Math.cos(t.yaw)
  const rz = -Math.sin(t.yaw)

  // Desired offset from pivot: back along the view, then out to the right shoulder.
  const ox = -fx * CAMERA.distance + rx * CAMERA.shoulder
  const oy = -fy * CAMERA.distance
  const oz = -fz * CAMERA.distance + rz * CAMERA.shoulder
  const len = Math.hypot(ox, oy, oz)

  let hit = 1
  for (const src of sources) {
    for (const b of src.boxes) {
      const th = rayBox(
        state.px, pivotY, state.pz, ox, oy, oz,
        b.minX, b.maxX, b.minY + src.yOffset, b.maxY + src.yOffset, b.minZ, b.maxZ,
      )
      if (th < hit) hit = th
    }
  }
  // Ceiling (garage is 2.6m): treat it as a horizontal plane.
  if (oy > 0 && pivotY + oy > t.ceilingY) hit = Math.min(hit, Math.max(0, (t.ceilingY - pivotY) / oy))

  const allowed = Math.max(0, hit * len - (hit < 1 ? CAMERA.wallMargin : 0))
  if (!state.init || allowed < state.dist) state.dist = allowed
  else state.dist = Math.min(allowed, state.dist + CAMERA.returnSpeed * dt)
  state.init = true

  const s = len > 0 ? state.dist / len : 0
  const sh = t.shake
  camera.position.set(
    state.px + ox * s + (Math.random() - 0.5) * sh,
    Math.min(pivotY + oy * s, t.ceilingY) + (Math.random() - 0.5) * sh,
    state.pz + oz * s,
  )
  camera.rotation.order = 'YXZ'
  camera.rotation.set(t.pitch, t.yaw, 0)
  return state.dist
}
