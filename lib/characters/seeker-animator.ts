import * as THREE from 'three'
import {
  ANIM_MAP,
  CROSSFADE,
  FALLBACK_REF_SPEED,
  MOVE_THRESHOLD,
  SLOPE_THRESHOLD,
  STATES,
  TIME_SCALE_RANGE,
  type SeekerState,
} from './anim-map'
import { loadSeekerClip, type PreparedClip } from './seeker-model'

export interface MotionInput {
  speed: number
  running: boolean
  slope: number
  water: 'dry' | 'shallow' | 'deep'
  /** Seconds since the attack started; null when not attacking. */
  attackElapsed: number | null
}

/**
 * Drives one seeker's AnimationMixer: picks a state from the motion input, crossfades 0.2s between
 * states, scales playback by real ground speed, and applies fallbacks for missing clips.
 */
export class SeekerAnimator {
  readonly mixer: THREE.AnimationMixer
  private actions = new Map<SeekerState, { action: THREE.AnimationAction; prepared: PreparedClip }>()
  private missing = new Set<SeekerState>()
  private current: SeekerState | null = null
  private currentAction: THREE.AnimationAction | null = null
  private currentKey: string | null = null
  private lastWater: MotionInput['water'] = 'dry'
  private edgeT = 0
  private rightArm: THREE.Bone | null = null
  private leftArm: THREE.Bone | null = null
  private disposed = false

  constructor(private root: THREE.Object3D) {
    this.mixer = new THREE.AnimationMixer(root)
    root.traverse((o) => {
      if (!(o as THREE.Bone).isBone) return
      if (/RightArm$/.test(o.name)) this.rightArm = o as THREE.Bone
      if (/LeftArm$/.test(o.name)) this.leftArm = o as THREE.Bone
    })
  }

  /** Starts loading clips; resolves when the given states are ready (or known missing). */
  load(states: SeekerState[], onChange: () => void) {
    return Promise.all(
      states.map(async (s) => {
        const prepared = await loadSeekerClip(s)
        if (this.disposed) return
        if (!prepared) {
          this.missing.add(s)
        } else if (!this.actions.has(s)) {
          const action = this.mixer.clipAction(prepared.clip)
          const entry = ANIM_MAP[s]
          if (!entry.loop) {
            action.setLoop(THREE.LoopOnce, 1)
            action.clampWhenFinished = true
          }
          this.actions.set(s, { action, prepared })
        }
        onChange()
      }),
    )
  }

  get loaded() {
    return STATES.filter((s) => this.actions.has(s))
  }
  get missingStates() {
    return [...this.missing]
  }
  get state() {
    return this.current
  }

  private choose(m: MotionInput): SeekerState {
    if (m.attackElapsed !== null) return 'attack'
    if (this.edgeT > 0) return 'swim-to-edge'
    if (m.water === 'deep') return 'swim'
    if (m.speed < MOVE_THRESHOLD) return 'idle'
    if (m.water === 'shallow') return 'wade'
    if (m.slope > SLOPE_THRESHOLD) return 'stairs-up'
    if (m.slope < -SLOPE_THRESHOLD) return 'stairs-down'
    return m.running ? 'run' : 'walk'
  }

  /** Walk/run stand in for stairs clips that haven't loaded yet; idle falls back to frozen walk. */
  private resolve(state: SeekerState): { state: SeekerState; frozen: boolean } | null {
    if (this.actions.has(state)) return { state, frozen: false }
    if (state === 'idle' && this.actions.has('walk')) return { state: 'walk', frozen: true }
    if ((state === 'stairs-up' || state === 'stairs-down' || state === 'wade') && this.actions.has('walk'))
      return { state: 'walk', frozen: false }
    if (state === 'swim' || state === 'swim-to-edge') return this.resolve('idle')
    // Attack without a clip: keep the locomotion pose and lunge procedurally in postUpdate.
    return null
  }

  private refSpeed(state: SeekerState, prepared: PreparedClip) {
    const cfg = ANIM_MAP[state].refSpeed
    if (cfg !== null) return cfg
    return prepared.nativeSpeed > 0.2 ? prepared.nativeSpeed : (FALLBACK_REF_SPEED[state] ?? 1.5)
  }

  update(dt: number, m: MotionInput, forced: SeekerState | null, speedMul: number) {
    if (this.lastWater === 'deep' && m.water !== 'deep') {
      this.edgeT = ANIM_MAP['swim-to-edge'].playSeconds ?? 1.5
    }
    this.lastWater = m.water
    this.edgeT = Math.max(0, this.edgeT - dt)

    const wanted = forced ?? this.choose(m)
    const resolved = this.resolve(wanted)
    const key = resolved ? `${wanted}>${resolved.state}:${resolved.frozen}` : null

    if (resolved && key !== this.currentKey) {
      this.currentKey = key
      const { action, prepared } = this.actions.get(resolved.state)!
      const entry = ANIM_MAP[wanted]
      action.reset()
      action.enabled = true
      action.setEffectiveWeight(1)
      if (!entry.loop && entry.playSeconds) action.timeScale = prepared.clip.duration / entry.playSeconds
      if (resolved.frozen) action.timeScale = 0
      action.play()
      if (this.currentAction && this.currentAction !== action) this.currentAction.crossFadeTo(action, CROSSFADE, false)
      else action.fadeIn(CROSSFADE)
      this.currentAction = action
    }
    this.current = wanted

    const active = this.currentAction
    if (active && resolved && !resolved.frozen) {
      const entry = ANIM_MAP[wanted]
      const prepared = this.actions.get(resolved.state)!.prepared
      if (entry.loop) {
        const ref = this.refSpeed(wanted, prepared)
        const raw = ref > 0 ? Math.max(m.speed, MOVE_THRESHOLD) / ref : 1
        // Forced states have no meaningful ground speed; play them at authored speed.
        active.timeScale = (forced ? 1 : THREE.MathUtils.clamp(raw, ...TIME_SCALE_RANGE)) * speedMul
      } else if (entry.playSeconds) {
        active.timeScale = (prepared.clip.duration / entry.playSeconds) * speedMul
      }
    }

    this.mixer.update(dt)

    // Procedural arm lunge when the attack clip is missing (or not loaded yet).
    if (wanted === 'attack' && !this.actions.has('attack')) {
      const t = m.attackElapsed ?? (performance.now() / 1000) % 1
      const lunge = Math.sin(Math.min(1, t / (ANIM_MAP.attack.playSeconds ?? 1)) * Math.PI)
      if (this.rightArm) this.rightArm.rotateX(-lunge * 1.4)
      if (this.leftArm) this.leftArm.rotateX(-lunge * 1.1)
    }
  }

  dispose() {
    this.disposed = true
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.root)
  }
}
