/**
 * Seeker animation config: one entry per state. File names are exact (case-sensitive on Vercel).
 * Mesh + skeleton come from MESH_FILE; every other file only contributes animations[0].
 */
export type SeekerState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'stairs-up'
  | 'stairs-down'
  | 'swim'
  | 'swim-to-edge'
  | 'wade'
  | 'attack'

export interface AnimEntry {
  /** File in MODEL_DIR. Several states may share one file (wade reuses walk). */
  file: string
  loop: boolean
  /** Loaded with the mesh before the seeker appears; others load lazily afterwards. */
  eager: boolean
  /**
   * Ground speed (m/s) the clip was authored for. null = measure it from the hips root motion before it
   * is stripped. Playback speed = actual speed / refSpeed, so feet don't slide.
   */
  refSpeed: number | null
  /** Play-once clips are squeezed/stretched to this many seconds. */
  playSeconds?: number
}

export const MODEL_DIR = '/models/seeker/'
export const MESH_FILE = 'walk.fbx'
export const SEEKER_HEIGHT = 2.6
export const CROSSFADE = 0.2
export const BODY_COLOR = '#B8A838'
export const BODY_ROUGHNESS = 0.6
export const CREDITS = 'Smiler (Backrooms) by lucaarcadu, CC BY'

export const ANIM_MAP: Record<SeekerState, AnimEntry> = {
  idle: { file: 'Idle.fbx', loop: true, eager: true, refSpeed: 0 },
  walk: { file: 'walk.fbx', loop: true, eager: true, refSpeed: null },
  run: { file: 'run.fbx', loop: true, eager: true, refSpeed: null },
  'stairs-up': { file: 'run-upstairs.fbx', loop: true, eager: false, refSpeed: null },
  'stairs-down': { file: 'down-stairs.fbx', loop: true, eager: false, refSpeed: null },
  swim: { file: 'swim.fbx', loop: true, eager: false, refSpeed: null },
  'swim-to-edge': { file: 'swim-to-edge.fbx', loop: false, eager: false, refSpeed: 0, playSeconds: 1.6 },
  wade: { file: 'walk.fbx', loop: true, eager: true, refSpeed: null },
  attack: { file: 'attack.fbx', loop: false, eager: false, refSpeed: 0, playSeconds: 1.0 },
}

export const STATES = Object.keys(ANIM_MAP) as SeekerState[]

/** Ground slope (rise / run) that switches walk/run to the stairs clips. Stairs are ~0.6, ramps ~0.15. */
export const SLOPE_THRESHOLD = 0.12
/** Below this horizontal speed (m/s) the seeker idles. */
export const MOVE_THRESHOLD = 0.25
/** Wading lowers the model this much (m). */
export const WADE_SINK = 0.1
/**
 * Deep water floats the feet 1.45m under the surface, but the swim clip lies flat near foot height:
 * lift the model so the back sits just under the surface.
 */
export const SWIM_LIFT = 1.15
/** Fallbacks when a clip/refSpeed can't be measured (m/s). */
export const FALLBACK_REF_SPEED: Partial<Record<SeekerState, number>> = {
  walk: 1.6,
  wade: 1.6,
  run: 4.2,
  'stairs-up': 3.5,
  'stairs-down': 2.0,
  swim: 1.0,
}
/** Playback speed clamp so very slow/fast movement doesn't freeze or blur the clip. */
export const TIME_SCALE_RANGE: [number, number] = [0.45, 2.2]

/** Attack: 1s cooldown, hit cone in front of the character. No damage/health here. */
export const ATTACK = {
  cooldown: 1.0,
  /** Fraction of the attack when the hit is checked. */
  impactAt: 0.4,
  range: 1.8,
  coneDeg: 90,
}
