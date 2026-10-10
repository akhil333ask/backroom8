'use client'

import { useSyncExternalStore } from 'react'
import { game } from '@/lib/backrooms/store'
import type { RoleId } from './roles'
import type { SeekerState } from './anim-map'

/** Reactive bits for the UI (role switch, debug panel). The frame loop reads/writes `seekerDebug` directly. */
export interface SeekerUi {
  role: RoleId
  loadedClips: string[]
  missingClips: string[]
  state: SeekerState | 'loading'
  modelReady: boolean
  /** Bumped when attackTargets changes (debug dummy rendering). */
  targetsVersion: number
  /** Last attack summary for the debug panel. */
  lastHit: string
}

export const seekerDebug = {
  /** null = automatic state selection. */
  forced: null as SeekerState | null,
  /** Multiplies animation playback speed (debug slider). */
  speedMul: 1,
}

let ui: SeekerUi = {
  role: game.role,
  loadedClips: [],
  missingClips: [],
  state: 'loading',
  modelReady: false,
  targetsVersion: 0,
  lastHit: '-',
}
const listeners = new Set<() => void>()

export function setSeekerUi(patch: Partial<SeekerUi>) {
  let changed = false
  for (const k in patch) {
    const key = k as keyof SeekerUi
    if (ui[key] !== patch[key]) changed = true
  }
  if (!changed) return
  ui = { ...ui, ...patch }
  for (const l of listeners) l()
}

export const getSeekerUi = () => ui

export function useSeekerUi<T>(selector: (s: SeekerUi) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => selector(ui),
    () => selector(ui),
  )
}

/** Runtime role switch (debug key K). */
export function setRole(role: RoleId) {
  game.role = role
  setSeekerUi({ role })
}

/**
 * Debug key K: take control of the seeker. A hider dummy is left where you stood so the attack cone has
 * something to hit; switching back removes it.
 */
export function toggleDebugSeeker() {
  if (game.role === 'seeker') {
    attackTargets.delete(DUMMY_ID)
    setRole('hider')
  } else {
    const p = game.player
    attackTargets.set(DUMMY_ID, { id: DUMMY_ID, x: p.x, z: p.z, feet: p.feet })
    setRole('seeker')
  }
  setSeekerUi({ targetsVersion: ui.targetsVersion + 1 })
}

export const DUMMY_ID = 'hider-dummy'

export interface AttackTarget {
  id: string
  x: number
  z: number
  feet: number
}

export interface AttackEvent {
  /** Increments per attack so listeners can detect new events. */
  id: number
  time: number
  x: number
  z: number
  yaw: number
  hits: string[]
}

/**
 * Anything that can be hit registers itself here (other players, dummies). The seeker's attack emits
 * `player.attack` as game.lastAttack + attackListeners. No damage, health or scoring here.
 */
export const attackTargets = new Map<string, AttackTarget>()
export const attackListeners = new Set<(e: AttackEvent) => void>()
let attackSeq = 0

export function emitAttack(e: Omit<AttackEvent, 'id'>) {
  const event = { ...e, id: ++attackSeq }
  game.lastAttack = event
  setSeekerUi({ lastHit: `#${event.id}: ${event.hits.length ? event.hits.join(', ') : 'miss'}` })
  for (const l of attackListeners) l(event)
  return event
}
