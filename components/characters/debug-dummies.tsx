'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { attackListeners, attackTargets, useSeekerUi } from '@/lib/characters/seeker-store'

/** ?debug=1 only: draws registered attack targets (the K dummy); flashes red when hit. */
export function DebugDummies() {
  const version = useSeekerUi((s) => s.targetsVersion)
  const targets = useMemo(() => [...attackTargets.values()], [version])
  const flash = useRef(new Map<string, number>())
  const meshes = useRef(new Map<string, THREE.Mesh>())
  const geo = useMemo(() => new THREE.CapsuleGeometry(0.28, 1.15, 4, 10).translate(0, 0.86, 0), [])

  useEffect(() => {
    const onAttack = (e: { hits: string[] }) => {
      for (const id of e.hits) flash.current.set(id, 0.5)
    }
    attackListeners.add(onAttack)
    return () => {
      attackListeners.delete(onAttack)
      geo.dispose()
    }
  }, [geo])

  useFrame((_, dt) => {
    for (const [id, mesh] of meshes.current) {
      const t = Math.max(0, (flash.current.get(id) ?? 0) - dt)
      flash.current.set(id, t)
      ;(mesh.material as THREE.MeshLambertMaterial).color.set(t > 0 ? '#e0402a' : '#6f7d8c')
    }
  })

  return (
    <>
      {targets.map((t) => (
        <mesh
          key={t.id}
          geometry={geo}
          position={[t.x, t.feet, t.z]}
          ref={(m) => {
            if (m) meshes.current.set(t.id, m)
            else meshes.current.delete(t.id)
          }}
        >
          <meshLambertMaterial color="#6f7d8c" />
        </mesh>
      ))}
    </>
  )
}
