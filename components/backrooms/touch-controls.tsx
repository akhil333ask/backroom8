'use client'

import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { audio } from '@/lib/backrooms/audio'
import { CAMERA, JOYSTICK, SENSITIVITY } from '@/lib/backrooms/controls-config'
import { toggleCrouch, toggleFlashlight, usePlayer } from '@/lib/backrooms/player-store'
import { currentRole, game } from '@/lib/backrooms/store'

const R = JOYSTICK.base / 2

/**
 * Free Fire style multi-touch: left half = floating joystick, right half = drag to look,
 * buttons on the right edge. Every touch is tracked by pointerId so all can be used at once.
 */
export function TouchControls() {
  const zoneRef = useRef<HTMLDivElement>(null)
  const baseRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const runTagRef = useRef<HTMLDivElement>(null)
  const crouching = usePlayer((s) => s.crouching)
  const flashlightOn = usePlayer((s) => s.flashlightOn)
  const role = currentRole()

  useEffect(() => {
    const zone = zoneRef.current
    const base = baseRef.current
    const knob = knobRef.current
    if (!zone || !base || !knob) return
    let joyId: number | null = null
    let lookId: number | null = null
    let ox = 0
    let oy = 0
    let lx = 0
    let ly = 0

    const hideJoy = () => {
      base.style.opacity = '0'
      game.input.joyX = 0
      game.input.joyY = 0
    }
    const down = (e: PointerEvent) => {
      audio.init()
      if (e.clientX < window.innerWidth / 2) {
        if (joyId !== null) return
        joyId = e.pointerId
        ox = e.clientX
        oy = e.clientY
        base.style.opacity = '1'
        base.style.transform = `translate(${ox - R}px, ${oy - R}px)`
        knob.style.transform = 'translate(0px, 0px)'
      } else {
        if (lookId !== null) return
        lookId = e.pointerId
        lx = e.clientX
        ly = e.clientY
      }
      zone.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (e.pointerId === joyId) {
        let dx = e.clientX - ox
        let dy = e.clientY - oy
        const len = Math.hypot(dx, dy)
        if (len > R) {
          dx = (dx / len) * R
          dy = (dy / len) * R
        }
        knob.style.transform = `translate(${dx}px, ${dy}px)`
        const mag = Math.min(1, len / R)
        if (mag < JOYSTICK.deadZone) {
          game.input.joyX = 0
          game.input.joyY = 0
          return
        }
        const scaled = (mag - JOYSTICK.deadZone) / (1 - JOYSTICK.deadZone)
        game.input.joyX = (dx / (mag * R)) * scaled
        game.input.joyY = (-dy / (mag * R)) * scaled
      } else if (e.pointerId === lookId) {
        game.input.lookDX += (e.clientX - lx) * SENSITIVITY.touch
        game.input.lookDY += (e.clientY - ly) * SENSITIVITY.touch
        lx = e.clientX
        ly = e.clientY
      }
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId === joyId) {
        joyId = null
        hideJoy()
      } else if (e.pointerId === lookId) lookId = null
    }
    const block = (e: Event) => e.preventDefault()

    zone.addEventListener('pointerdown', down)
    zone.addEventListener('pointermove', move)
    zone.addEventListener('pointerup', up)
    zone.addEventListener('pointercancel', up)
    document.addEventListener('touchmove', block, { passive: false })
    document.addEventListener('gesturestart', block)
    document.addEventListener('contextmenu', block)

    let raf = 0
    const tick = () => {
      if (runTagRef.current) runTagRef.current.style.opacity = game.player.running ? '1' : '0'
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      zone.removeEventListener('pointerdown', down)
      zone.removeEventListener('pointermove', move)
      zone.removeEventListener('pointerup', up)
      zone.removeEventListener('pointercancel', up)
      document.removeEventListener('touchmove', block)
      document.removeEventListener('gesturestart', block)
      document.removeEventListener('contextmenu', block)
      cancelAnimationFrame(raf)
      hideJoy()
      game.input.runHeld = false
    }
  }, [])

  const setRun = (held: boolean) => {
    game.input.runHeld = held
  }
  const resetCamera = () => {
    game.player.yaw = game.player.bodyYaw
    game.player.pitch = -CAMERA.defaultPitch
  }

  return (
    <div className="absolute inset-0 touch-none select-none" style={{ WebkitUserSelect: 'none' }}>
      <div ref={zoneRef} className="absolute inset-0 touch-none" aria-hidden="true">
        <div
          ref={baseRef}
          className="pointer-events-none absolute left-0 top-0 rounded-full border-2 border-white/30 bg-white/5 opacity-0 transition-opacity duration-100"
          style={{ width: JOYSTICK.base, height: JOYSTICK.base }}
        >
          <div className="absolute inset-0 m-auto" style={{ width: JOYSTICK.knob, height: JOYSTICK.knob }}>
            <div
              ref={knobRef}
              className="rounded-full bg-white/45"
              style={{ width: JOYSTICK.knob, height: JOYSTICK.knob }}
            />
          </div>
        </div>
      </div>

      <div
        ref={runTagRef}
        className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 font-mono text-[10px] font-bold tracking-widest text-[#f3ecc4] opacity-0 transition-opacity"
        role="status"
      >
        RUNNING
      </div>

      {role.canAttack && (
        <PadButton label="ATTACK" size={72} className="bottom-6 right-6" onDown={() => (game.input.attackQueued = true)} strong />
      )}
      <PadButton
        label="RUN"
        size={60}
        className={role.canAttack ? 'bottom-[6.5rem] right-8' : 'bottom-6 right-6'}
        onDown={() => setRun(true)}
        onUp={() => setRun(false)}
      />
      <PadButton
        label="USE"
        size={60}
        className={role.canAttack ? 'bottom-6 right-[6.5rem]' : 'bottom-6 right-[6rem]'}
        onDown={() => (game.input.interactQueued = true)}
      />
      {role.canCrouch && (
        <PadButton label="CROUCH" size={56} className="bottom-[6rem] right-[6.75rem]" active={crouching} onDown={toggleCrouch} />
      )}
      <PadButton label="LIGHT" size={56} className="bottom-[10.5rem] right-6" active={flashlightOn} onDown={toggleFlashlight} />
      <PadButton label="CAM" size={40} className="right-4 top-24" onDown={resetCamera} ariaLabel="Reset camera" />
    </div>
  )
}

function PadButton({
  label,
  size,
  className,
  onDown,
  onUp,
  active,
  strong,
  ariaLabel,
}: {
  label: string
  size: number
  className: string
  onDown: () => void
  onUp?: () => void
  active?: boolean
  strong?: boolean
  ariaLabel?: string
}) {
  const release = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    onUp?.()
  }
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? label}
      aria-pressed={active}
      onPointerDown={(e) => {
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        audio.init()
        onDown()
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={() => onUp?.()}
      style={{ width: size, height: size }}
      className={`absolute flex touch-none items-center justify-center rounded-full border font-mono font-bold tracking-wider backdrop-blur-[1px] active:scale-95 ${
        strong ? 'text-xs' : 'text-[10px]'
      } ${
        active
          ? 'border-[#f3ecc4] bg-[#f3ecc4]/30 text-white'
          : strong
            ? 'border-[#e0a090]/70 bg-[#7a2a20]/45 text-white'
            : 'border-white/40 bg-black/35 text-white/85'
      } ${className}`}
    >
      {label}
    </button>
  )
}
