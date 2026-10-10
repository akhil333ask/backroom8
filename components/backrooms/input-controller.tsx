'use client'

import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { audio } from '@/lib/backrooms/audio'
import { SENSITIVITY } from '@/lib/backrooms/controls-config'
import { toggleCrouch, toggleFlashlight } from '@/lib/backrooms/player-store'
import { game, getUi, setUi } from '@/lib/backrooms/store'
import { toggleDebugSeeker } from '@/lib/characters/seeker-store'

const MOUSE_SENS = SENSITIVITY.mouse

export const dom = { canvas: null as HTMLCanvasElement | null }

export function requestLock() {
  const c = dom.canvas
  if (!c || getUi().isTouch) return
  try {
    const r = c.requestPointerLock() as unknown as Promise<void> | undefined
    if (r && typeof r.catch === 'function') r.catch(() => {})
  } catch {
    // Pointer lock can be blocked inside iframes; drag-to-look still works.
  }
}

/** Desktop keyboard + mouse handling. Writes into game.input; never re-renders. */
export function InputController() {
  const gl = useThree((s) => s.gl)

  useEffect(() => {
    const canvas = gl.domElement
    dom.canvas = canvas
    const keys = game.input.keys
    const debug = new URLSearchParams(window.location.search).get('debug') === '1'
    let dragging = false

    const onKeyDown = (e: KeyboardEvent) => {
      if (!getUi().started) return
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code))
        e.preventDefault()
      keys.add(e.code)
      if (e.repeat) return
      if (e.code === 'KeyE') game.input.interactQueued = true
      else if (e.code === 'KeyC') toggleCrouch()
      else if (e.code === 'KeyP' && debug) game.debugFirstPerson = !game.debugFirstPerson
      else if (e.code === 'KeyK' && debug) toggleDebugSeeker()
      else if (e.code === 'KeyF') toggleFlashlight()
      else if (e.code === 'KeyV') setUi({ footage: !getUi().footage })
    }
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code)
    const onBlur = () => keys.clear()

    const onMouseMove = (e: MouseEvent) => {
      const locked = document.pointerLockElement === canvas
      if (!locked && !dragging) return
      game.input.lookDX += e.movementX * MOUSE_SENS
      game.input.lookDY += e.movementY * MOUSE_SENS
    }
    const onMouseDown = (e: MouseEvent) => {
      if (getUi().isTouch || !getUi().started) return
      if (e.button === 0) {
        game.input.attackQueued = true
        dragging = true
        if (document.pointerLockElement !== canvas) {
          audio.init()
          requestLock()
        }
      }
    }
    const onMouseUp = () => {
      dragging = false
    }
    const onLockChange = () => setUi({ locked: document.pointerLockElement === canvas })

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('mousedown', onMouseDown)
    document.addEventListener('pointerlockchange', onLockChange)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('pointerlockchange', onLockChange)
      if (dom.canvas === canvas) dom.canvas = null
    }
  }, [gl])

  return null
}
