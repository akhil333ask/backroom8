const DEG = Math.PI / 180

/** Over-the-shoulder camera. */
export const CAMERA = {
  distance: 3.2,
  /** Pivot height above the feet. */
  height: 1.7,
  /** To the right of the character. */
  shoulder: 0.5,
  fov: 65,
  /** Higher = snappier follow. */
  damping: 14,
  /** Distance regained per second after a collision pull-in. */
  returnSpeed: 6,
  /** Gap kept between the camera and walls / ceilings. */
  wallMargin: 0.2,
  /** Character fades out when the camera is closer than this. */
  fadeDistance: 0.8,
  /** Camera pitch: positive = camera above, looking down at the character. */
  pitchMin: -25 * DEG,
  pitchMax: 50 * DEG,
  defaultPitch: 10 * DEG,
} as const

export const SENSITIVITY = {
  /** Radians per pixel. */
  mouse: 0.0022,
  touch: 0.005,
} as const

export const JOYSTICK = {
  base: 120,
  knob: 50,
  deadZone: 0.1,
  /** Pushing past this fraction runs. */
  runThreshold: 0.85,
} as const

/** How fast the body turns toward the movement direction (1/s). */
export const BODY_TURN = 12
/** Attack animation length (s); matches ANIM_MAP.attack.playSeconds. Cooldown is ATTACK.cooldown in anim-map. */
export const ATTACK_TIME = 1.0
