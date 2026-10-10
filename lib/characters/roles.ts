export type RoleId = 'seeker' | 'hider'

export interface RoleConfig {
  id: RoleId
  label: string
  canCrouch: boolean
  canHide: boolean
  canAttack: boolean
  /** m/s */
  walkSpeed: number
  /** m/s */
  runSpeed: number
  /** Model file under /public. null = placeholder body (capsule + sphere). */
  model: string | null
  /** Placeholder body look. */
  body: { color: string; height: number; radius: number }
  /** Extra camera pivot height (m) for tall characters. */
  cameraLift?: number
}

export const ROLES: Record<RoleId, RoleConfig> = {
  seeker: {
    id: 'seeker',
    label: 'Seeker',
    canCrouch: false,
    canHide: false,
    canAttack: true,
    walkSpeed: 2.0,
    runSpeed: 5.0,
    // Smiler FBX (see lib/characters/anim-map.ts). The placeholder shows until the mesh + idle/walk/run load.
    model: '/models/seeker/walk.fbx',
    body: { color: '#6a302a', height: 2.6, radius: 0.32 },
    cameraLift: 0.45,
  },
  hider: {
    id: 'hider',
    label: 'Hider',
    canCrouch: true,
    canHide: true,
    canAttack: false,
    walkSpeed: 2.2,
    runSpeed: 4.0,
    model: null,
    body: { color: '#6f7d8c', height: 1.75, radius: 0.28 },
  },
}

/** Crouch speed as a fraction of walk speed (only for roles that can crouch). */
export const CROUCH_FACTOR = 0.55

/** `?role=seeker` picks the seeker; default is hider. */
export function initialRole(): RoleId {
  if (typeof window === 'undefined') return 'hider'
  return new URLSearchParams(window.location.search).get('role') === 'seeker' ? 'seeker' : 'hider'
}
