'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { ATTACK_TIME, CAMERA } from '@/lib/backrooms/controls-config'
import { player } from '@/lib/backrooms/player-store'
import { game } from '@/lib/backrooms/store'
import { SWIM_LIFT, WADE_SINK } from '@/lib/characters/anim-map'
import { SeekerAnimator } from '@/lib/characters/seeker-animator'
import { eagerStates, lazyStates, loadSeekerAsset, type SeekerAsset } from '@/lib/characters/seeker-model'
import { seekerDebug, setSeekerUi } from '@/lib/characters/seeker-store'

const RIPPLES = 8

/**
 * The Smiler seeker: skinned FBX model driven by SeekerAnimator. Renders nothing until the mesh and the
 * eager clips (idle/walk/run) are in; `onReady(false)` keeps the placeholder visible meanwhile.
 */
export function SeekerCharacter({ onReady }: { onReady: (ready: boolean) => void }) {
  const [asset, setAsset] = useState<SeekerAsset | null>(null)
  const root = useRef<THREE.Group>(null)
  const ripples = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    let alive = true
    loadSeekerAsset().then((a) => {
      if (!alive) return
      if (!a) {
        console.warn('[seeker] model unavailable, keeping the placeholder body')
        setSeekerUi({ state: 'loading', modelReady: false })
        return
      }
      setAsset(a)
    })
    return () => {
      alive = false
    }
  }, [])

  const instance = useMemo(() => {
    if (!asset) return null
    const model = cloneSkinned(asset.template) as THREE.Group
    const animator = new SeekerAnimator(model)
    return { model, animator }
  }, [asset])

  useEffect(() => {
    if (!instance) return
    const { animator } = instance
    let alive = true
    const report = () => {
      if (!alive) return
      setSeekerUi({ loadedClips: animator.loaded, missingClips: animator.missingStates })
    }
    animator.load(eagerStates(), report).then(() => {
      if (!alive) return
      setSeekerUi({ modelReady: true })
      onReady(true)
      animator.load(lazyStates(), report)
    })
    return () => {
      alive = false
      onReady(false)
      animator.dispose()
    }
  }, [instance, onReady])

  const fx = useMemo(() => {
    const ring = new THREE.RingGeometry(0.32, 0.4, 24)
    ring.rotateX(-Math.PI / 2)
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    return {
      ring,
      ringMat,
      ages: new Float32Array(RIPPLES).fill(1),
      next: 0,
      spawnT: 0,
      lift: 0,
      mtx: new THREE.Matrix4(),
      color: new THREE.Color(),
      pos: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      scl: new THREE.Vector3(),
    }
  }, [])

  useEffect(
    () => () => {
      fx.ring.dispose()
      fx.ringMat.dispose()
    },
    [fx],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const g = root.current
    if (!g || !instance || !asset) return
    const p = game.player
    const hidden = player.isHidden || game.debugFirstPerson
    g.visible = !hidden
    if (hidden) return

    const wading = p.water === 'shallow'
    const targetLift = p.water === 'deep' ? SWIM_LIFT : wading ? -WADE_SINK : 0
    fx.lift += (targetLift - fx.lift) * Math.min(1, dt * 5)
    g.position.set(p.x, p.feet + fx.lift, p.z)
    g.rotation.y = p.bodyYaw

    const attackElapsed = p.attackT > 0 ? ATTACK_TIME - p.attackT : null
    instance.animator.update(
      dt,
      { speed: p.speed, running: p.running, slope: p.slope, water: p.water, attackElapsed },
      seekerDebug.forced,
      seekerDebug.speedMul,
    )
    const state = instance.animator.state
    if (state) setSeekerUi({ state })

    const near = CAMERA.fadeDistance
    const opacity = Math.max(0, Math.min(1, (game.camDist - near * 0.5) / (near * 0.5)))
    const fading = opacity < 0.99
    for (const m of [asset.bodyMaterial, asset.featureMaterial]) {
      m.opacity = opacity
      if (m.transparent !== fading) {
        m.transparent = fading
        m.needsUpdate = true
      }
    }
    instance.model.visible = opacity > 0.02

    // Ripple rings at the feet while wading (one instanced draw call; additive, so fading = darkening).
    const r = ripples.current
    if (r) {
      fx.spawnT -= dt
      if (wading && fx.spawnT <= 0) {
        fx.spawnT = p.speed > 0.3 ? 0.22 : 0.7
        fx.ages[fx.next] = 0
        r.userData[`o${fx.next}`] = [p.x, p.z]
        fx.next = (fx.next + 1) % RIPPLES
      }
      for (let i = 0; i < RIPPLES; i++) {
        fx.ages[i] = Math.min(1, fx.ages[i] + dt / 1.1)
        const age = fx.ages[i]
        const at = (r.userData[`o${i}`] as [number, number] | undefined) ?? [p.x, p.z]
        fx.pos.set(at[0], p.feet + 0.02, at[1])
        fx.scl.setScalar(age >= 1 ? 0 : 0.6 + age * 1.6)
        fx.mtx.compose(fx.pos, fx.quat, fx.scl)
        r.setMatrixAt(i, fx.mtx)
        fx.color.setScalar((1 - age) * 0.35)
        r.setColorAt(i, fx.color)
      }
      r.instanceMatrix.needsUpdate = true
      if (r.instanceColor) r.instanceColor.needsUpdate = true
    }
  })

  if (!instance) return null
  return (
    <>
      <group ref={root}>
        <primitive object={instance.model} />
      </group>
      <instancedMesh ref={ripples} args={[fx.ring, fx.ringMat, RIPPLES]} frustumCulled={false} />
    </>
  )
}
