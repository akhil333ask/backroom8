'use client'

import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { WaterMedium } from '@/levels/types'
import { audio } from '@/lib/backrooms/audio'
import { moveWithCollision, type BoxSource } from '@/lib/backrooms/collision'
import { CEIL_H, ELEV, FLOOR_H, PLAYER_R } from '@/lib/backrooms/constants'
import { ATTACK_TIME, BODY_TURN, CAMERA, JOYSTICK } from '@/lib/backrooms/controls-config'
import { doorCollider, doorFor, playerInCab, updateElevator } from '@/lib/backrooms/elevator-state'
import { exitHideSpot, updateHidden } from '@/lib/backrooms/hiding'
import { findTarget } from '@/lib/backrooms/interact'
import { commitPlayer, EYE_CROUCH, EYE_STAND, NOISE, player, roleCaps } from '@/lib/backrooms/player-store'
import { buildStairwell, stairGround } from '@/lib/backrooms/stairs'
import { currentRole, floorOf, game, getUi, setUi } from '@/lib/backrooms/store'
import { resetCameraFollow, updateThirdPersonCamera } from '@/lib/backrooms/third-person-camera'
import { ATTACK } from '@/lib/characters/anim-map'
import { CROUCH_FACTOR } from '@/lib/characters/roles'
import { attackTargets, emitAttack } from '@/lib/characters/seeker-store'
import { getWater, updateWater } from '@/lib/backrooms/water-state'
import { livingAfterMove } from '@/levels/living-layout'
import { P, poolGroundAt, poolMedium } from '@/levels/pool-layout'
import { garageGround, inGarage, rampGround } from '@/lib/world/garage-zone'
import { inLivingWing, inPoolRooms, LIVING_FLOOR, LIVING_ORIGIN, POOL_FLOOR, POOL_ORIGIN } from '@/lib/world/wings'
import { updateZones } from '@/lib/world/zone-manager'

/** Walkable height at (x, z) in the continuous world. */
function groundAt(x: number, z: number, feet: number, crouching: boolean) {
  const stair = stairGround(x, z, feet)
  if (stair !== null) return stair
  const ramp = rampGround(x, z)
  if (ramp !== null) return ramp
  const floor = floorOf(feet, x, z)
  if (floor === 0 && inGarage(x, z)) return garageGround(x)
  const base = floor * FLOOR_H
  if (floor === POOL_FLOOR && game.pool && inPoolRooms(x, z)) {
    const o = POOL_ORIGIN
    return base + poolGroundAt(game.pool.layout, x - o.x, z - o.z, feet - base, crouching)
  }
  return base
}

const DRY: WaterMedium = { kind: 'dry', speed: 1, surface: P.SURF }

/** Pool water under the player (dry everywhere else). Surface is floor-local. */
function mediumAt(x: number, z: number, floor: number): WaterMedium {
  if (floor !== POOL_FLOOR || !game.pool || !inPoolRooms(x, z)) return DRY
  return poolMedium(game.pool.layout, x - POOL_ORIGIN.x, z - POOL_ORIGIN.z)
}

const HEIGHT = 1.8
const GARAGE_CEIL = 2.6
const THREE_CLAMP = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Targets inside the attack cone (range 1.8m, 90deg) in front of the character's body. */
function attackHits(p: typeof game.player) {
  const fx = -Math.sin(p.bodyYaw)
  const fz = -Math.cos(p.bodyYaw)
  const halfCone = Math.cos((ATTACK.coneDeg / 2) * DEG)
  const hits: string[] = []
  for (const t of attackTargets.values()) {
    const dx = t.x - p.x
    const dz = t.z - p.z
    const d = Math.hypot(dx, dz)
    if (d > ATTACK.range || Math.abs(t.feet - p.feet) > 1.5) continue
    if (d < 0.3 || (dx * fx + dz * fz) / d >= halfCone) hits.push(t.id)
  }
  return { time: performance.now(), x: p.x, z: p.z, yaw: p.bodyYaw, hits }
}
const DEG = Math.PI / 180
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/** Ceiling world y above the player (garage 2.6m, elevator cab, office CEIL_H). */
function ceilingAt(x: number, z: number, feet: number, floor: number) {
  if (playerInCab()) return floor * FLOOR_H + ELEV.cabCeil
  if (floor === 0 && inGarage(x, z)) return garageGround(x) + GARAGE_CEIL
  if (stairGround(x, z, feet) !== null) return feet + 3.2
  return floor * FLOOR_H + CEIL_H
}

export function Player() {
  const camera = useThree((s) => s.camera)
  const stairColliders = useMemo(() => buildStairwell().colliders, [])
  const step = useRef(0)
  const vel = useRef({ x: 0, z: 0 })

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    updateElevator(dt)

    const p = game.player
    const inp = game.input
    const ui = getUi()
    const floor = floorOf(p.feet)
    const data = game.floors[floor]
    if (!data) return

    const role = currentRole()
    roleCaps.canCrouch = role.canCrouch
    const firstPerson = game.debugFirstPerson
    p.yaw -= inp.lookDX
    // Third person: camera pitch -25..+50 deg (p.pitch is look-up positive, so the range is mirrored).
    const pitchLo = player.isHidden || firstPerson ? -1.45 : -CAMERA.pitchMax
    const pitchHi = player.isHidden || firstPerson ? 1.45 : -CAMERA.pitchMin
    p.pitch = Math.max(pitchLo, Math.min(pitchHi, p.pitch - inp.lookDY))
    inp.lookDX = 0
    inp.lookDY = 0
    const prevAttackT = p.attackT
    p.attackT = Math.max(0, p.attackT - dt)
    p.attackCooldown = Math.max(0, p.attackCooldown - dt)
    const impactT = ATTACK_TIME * (1 - ATTACK.impactAt)
    if (prevAttackT > impactT && p.attackT <= impactT) emitAttack(attackHits(p))

    if (player.isHidden) {
      updateHidden(camera, dt)
      vel.current.x = 0
      vel.current.z = 0
      p.speed = 0
      p.running = false
      inp.attackQueued = false
      game.highlight = null
      if (inp.interactQueued) {
        inp.interactQueued = false
        exitHideSpot()
        p.bodyYaw = p.yaw
        p.pitch = -CAMERA.defaultPitch
        resetCameraFollow()
      }
      commitPlayer()
      updateZones()
      setUi({ floor, target: player.isHidden ? 'Leave hiding spot' : null })
      return
    }

    if (!role.canCrouch) player.crouchToggled = false
    const crouching =
      role.canCrouch && (player.crouchToggled || inp.keys.has('ControlLeft') || inp.keys.has('ControlRight'))
    player.crouching = crouching
    player.eye += ((crouching ? EYE_CROUCH : EYE_STAND) - player.eye) * Math.min(1, dt * 10)

    let mx = 0
    let mz = 0
    if (ui.started) {
      const k = inp.keys
      if (k.has('KeyW') || k.has('ArrowUp')) mz += 1
      if (k.has('KeyS') || k.has('ArrowDown')) mz -= 1
      if (k.has('KeyD') || k.has('ArrowRight')) mx += 1
      if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1
      mx += inp.joyX
      mz += inp.joyY
    }
    const mag = Math.hypot(mx, mz)
    if (mag > 1) {
      mx /= mag
      mz /= mag
    }
    const medium = mediumAt(p.x, p.z, floor)
    const wet = medium.kind !== 'dry'
    const runInput =
      inp.runHeld ||
      inp.keys.has('ShiftLeft') ||
      inp.keys.has('ShiftRight') ||
      Math.hypot(inp.joyX, inp.joyY) > JOYSTICK.runThreshold
    const running = !crouching && mag > 0.05 && runInput
    p.running = running
    p.water = medium.kind
    const mediumSpeed = medium.kind === 'shallow' ? 0.6 : medium.speed
    const speed =
      (crouching ? role.walkSpeed * CROUCH_FACTOR : running ? role.runSpeed : role.walkSpeed) * mediumSpeed
    const fx = -Math.sin(p.yaw)
    const fz = -Math.cos(p.yaw)
    const rx = Math.cos(p.yaw)
    const rz = -Math.sin(p.yaw)
    const tvx = (fx * mz + rx * mx) * speed
    const tvz = (fz * mz + rz * mx) * speed
    const accel = Math.min(1, dt * 10)
    vel.current.x += (tvx - vel.current.x) * accel
    vel.current.z += (tvz - vel.current.z) * accel

    const base = floor * FLOOR_H
    // Current floor + the floors directly above/below (ramp and stair landings straddle two).
    const sources: BoxSource[] = [{ boxes: stairColliders, yOffset: 0 }]
    for (let k = Math.max(0, floor - 1); k <= Math.min(game.floors.length - 1, floor + 1); k++) {
      sources.push({ boxes: game.floors[k].colliders, yOffset: k * FLOOR_H })
    }
    if (doorFor(floor) < 0.85) sources.push({ boxes: [doorCollider], yOffset: base })
    const before = { x: p.x, z: p.z, feet: p.feet }
    moveWithCollision(p, p.feet, HEIGHT, PLAYER_R, vel.current.x * dt, vel.current.z * dt, sources)
    if (floor === LIVING_FLOOR && game.living && inLivingWing(p.x, p.z)) {
      // The loop room's wrong doors work in wing-local coordinates.
      const o = LIVING_ORIGIN
      const local = { x: p.x - o.x, z: p.z - o.z }
      livingAfterMove(game.living.layout, local)
      p.x = local.x + o.x
      p.z = local.z + o.z
    }

    const ground = groundAt(p.x, p.z, p.feet, crouching)
    if (ground > p.feet) p.feet += (ground - p.feet) * Math.min(1, dt * (wet ? 4 : 18)) + 0.0005
    else p.feet = Math.max(ground, p.feet - (wet ? 1.8 : 7) * dt)
    if (Math.abs(ground - p.feet) < 0.002) p.feet = ground
    // Ground slope while moving (stairs/ramps) drives the seeker's stairs clips.
    const run = Math.hypot(p.x - before.x, p.z - before.z)
    const slopeNow = run > 0.002 ? THREE_CLAMP((p.feet - before.feet) / run, -1.5, 1.5) : 0
    p.slope += (slopeNow - p.slope) * Math.min(1, dt * 6)
    updateWater(medium.kind, p.feet + player.eye, base + medium.surface)

    const moving = Math.hypot(vel.current.x, vel.current.z)
    p.speed = moving
    if (inp.attackQueued) {
      inp.attackQueued = false
      if (role.canAttack && p.attackCooldown <= 0 && p.attackT <= 0 && ui.started) {
        p.attackT = ATTACK_TIME
        p.attackCooldown = ATTACK.cooldown
        // Attacks face where the camera looks.
        p.bodyYaw = p.yaw
      }
    }
    if (moving > 0.3 && p.attackT <= 0) {
      const want = Math.atan2(-vel.current.x, -vel.current.z)
      p.bodyYaw = wrap(p.bodyYaw + wrap(want - p.bodyYaw) * Math.min(1, dt * BODY_TURN))
    }
    player.noise = moving > 0.2 ? (crouching ? NOISE.crouch : running ? NOISE.run : NOISE.walk) : NOISE.idle
    if (getWater().submerged) player.noise = NOISE.hidden
    if (moving > 0.2) {
      p.bob += dt * moving * 2.6
      const s = Math.floor(p.bob / Math.PI)
      if (s !== step.current) {
        step.current = s
        if (wet) audio.splash(medium.kind === 'deep' ? 0.45 : crouching ? 0.4 : 0.9)
        else audio.footstep(running, crouching ? 0.3 : 1)
      }
    } else {
      p.bob += (Math.round(p.bob / Math.PI) * Math.PI - p.bob) * Math.min(1, dt * 6)
    }
    const sh = game.shake
    if (firstPerson) {
      // Debug-only (?debug=1, key P): old eye camera, kept for level testing.
      camera.position.set(p.x + (Math.random() - 0.5) * sh, p.feet + player.eye, p.z)
      camera.rotation.order = 'YXZ'
      camera.rotation.set(p.pitch, p.yaw, 0)
      game.camDist = 0
      resetCameraFollow()
    } else {
      const swimBob = medium.kind === 'deep' ? Math.sin(performance.now() / 650) * 0.05 : 0
      game.camDist = updateThirdPersonCamera(
        camera,
        {
          x: p.x,
          z: p.z,
          pivotY: p.feet + CAMERA.height + (role.cameraLift ?? 0) - (EYE_STAND - player.eye) * 0.6 + swimBob,
          yaw: p.yaw,
          pitch: p.pitch,
          ceilingY: ceilingAt(p.x, p.z, p.feet, floorOf(p.feet)) - CAMERA.wallMargin,
          shake: sh,
        },
        sources,
        dt,
      )
    }

    const currentFloor = floorOf(p.feet)
    const target = ui.started ? findTarget(currentFloor, ui.isTouch) : null
    game.highlight = target?.spot ?? null
    if (inp.interactQueued) {
      inp.interactQueued = false
      target?.run()
    }
    commitPlayer()
    updateZones()
    setUi({ floor: currentFloor, target: player.isHidden ? 'Leave hiding spot' : (target?.label ?? null) })
  })

  return null
}
