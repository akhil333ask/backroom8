'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ATTACK_TIME, CAMERA } from '@/lib/backrooms/controls-config'
import { EYE_STAND, player } from '@/lib/backrooms/player-store'
import { game } from '@/lib/backrooms/store'
import { ROLES } from '@/lib/characters/roles'
import { useSeekerUi } from '@/lib/characters/seeker-store'
import { SeekerCharacter } from './seeker-character'

function makeBlobTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(0,0,0,0.55)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * Placeholder body (capsule + sphere head) for characters without a model file, plus a blob shadow
 * (no real-time shadows). Fades out when the camera is pulled in close, hidden while in a hide spot.
 */
export function CharacterBody() {
  const role = ROLES[useSeekerUi((s) => s.role)]
  const [modelReady, setModelReady] = useState(false)
  const showModel = role.model !== null
  const { height, radius, color } = role.body
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const arm = useRef<THREE.Mesh>(null)
  const blob = useRef<THREE.Mesh>(null)

  const res = useMemo(() => {
    const torsoLen = Math.max(0.2, height * 0.72 - radius * 2)
    const headR = radius * 0.78
    return {
      torsoLen,
      headR,
      torso: new THREE.CapsuleGeometry(radius, torsoLen, 4, 10),
      head: new THREE.SphereGeometry(headR, 12, 10),
      visor: new THREE.BoxGeometry(headR * 1.2, headR * 0.45, 0.06),
      armGeo: new THREE.BoxGeometry(0.11, 0.11, 0.7),
      plane: new THREE.PlaneGeometry(1, 1),
      skin: new THREE.MeshLambertMaterial({ color }),
      visorMat: new THREE.MeshBasicMaterial({ color: role.id === 'seeker' ? '#c23b2a' : '#cfe3ef' }),
      blobMat: new THREE.MeshBasicMaterial({ map: makeBlobTexture(), transparent: true, depthWrite: false }),
    }
  }, [height, radius, color, role.id])

  useEffect(
    () => () => {
      res.torso.dispose()
      res.head.dispose()
      res.visor.dispose()
      res.armGeo.dispose()
      res.plane.dispose()
      res.skin.dispose()
      res.visorMat.dispose()
      res.blobMat.map?.dispose()
      res.blobMat.dispose()
    },
    [res],
  )

  useFrame(() => {
    const g = root.current
    const b = body.current
    if (!g || !b) return
    const p = game.player
    const hidden = player.isHidden || game.debugFirstPerson
    g.visible = !hidden
    if (hidden) return

    g.position.set(p.x, p.feet, p.z)
    b.rotation.y = p.bodyYaw
    const crouch = player.eye / EYE_STAND
    b.scale.y = 0.55 + 0.45 * crouch
    // Lean into movement; lunge on attack.
    const attack = p.attackT > 0 ? Math.sin((1 - p.attackT / ATTACK_TIME) * Math.PI) : 0
    b.rotation.x = -Math.min(0.18, p.speed * 0.03) - attack * 0.25
    b.position.y = Math.abs(Math.sin(p.bob)) * 0.04 * Math.min(1, p.speed / 3)
    if (arm.current) {
      arm.current.visible = role.canAttack
      arm.current.rotation.x = -0.9 + attack * 1.6
    }

    const near = CAMERA.fadeDistance
    const opacity = Math.max(0, Math.min(1, (game.camDist - near * 0.5) / (near * 0.5)))
    // Opaque unless fading, so parts never sort through each other.
    const fading = opacity < 0.99
    for (const m of [res.skin, res.visorMat]) {
      m.opacity = opacity
      if (m.transparent !== fading) {
        m.transparent = fading
        m.needsUpdate = true
      }
    }
    // The skinned model replaces the placeholder once its mesh + eager clips are loaded.
    b.visible = opacity > 0.02 && !(showModel && modelReady)
    if (blob.current) blob.current.scale.setScalar(radius * 3.2)
  })

  const torsoY = radius + res.torsoLen / 2
  const headY = radius * 2 + res.torsoLen + res.headR * 0.9
  const body3d = (
    <group ref={root}>
      <group ref={body}>
        <mesh geometry={res.torso} material={res.skin} position-y={torsoY} />
        <mesh geometry={res.head} material={res.skin} position-y={headY} />
        <mesh geometry={res.visor} material={res.visorMat} position={[0, headY + 0.02, -res.headR * 0.85]} />
        <mesh
          ref={arm}
          geometry={res.armGeo}
          material={res.skin}
          position={[radius + 0.06, torsoY + res.torsoLen * 0.35, -0.15]}
        />
      </group>
      <mesh ref={blob} geometry={res.plane} material={res.blobMat} rotation-x={-Math.PI / 2} position-y={0.02} />
    </group>
  )
  return (
    <>
      {body3d}
      {showModel && <SeekerCharacter onReady={setModelReady} />}
    </>
  )
}
