'use client'

import { useState } from 'react'
import { ANIM_MAP, CREDITS, STATES, type SeekerState } from '@/lib/characters/anim-map'
import { seekerDebug, useSeekerUi } from '@/lib/characters/seeker-store'

/** Credits whenever the Smiler model is in use; the animation panel only with ?debug=1. */
export function SeekerOverlay() {
  const role = useSeekerUi((s) => s.role)
  const [debug] = useState(() => new URLSearchParams(window.location.search).get('debug') === '1')
  if (role !== 'seeker') {
    return debug ? (
      <p className="pointer-events-none fixed right-3 top-16 z-30 rounded bg-black/60 px-2 py-1 font-mono text-[11px] text-neutral-300">
        K: control the seeker
      </p>
    ) : null
  }
  return (
    <>
      <p className="pointer-events-none fixed bottom-1 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded bg-black/50 px-1.5 text-[10px] text-neutral-300">
        {CREDITS}
      </p>
      {debug && <SeekerDebugPanel />}
    </>
  )
}

function SeekerDebugPanel() {
  const state = useSeekerUi((s) => s.state)
  const loaded = useSeekerUi((s) => s.loadedClips)
  const missing = useSeekerUi((s) => s.missingClips)
  const ready = useSeekerUi((s) => s.modelReady)
  const lastHit = useSeekerUi((s) => s.lastHit)
  const [forced, setForced] = useState<SeekerState | null>(seekerDebug.forced)
  const [speed, setSpeed] = useState(seekerDebug.speedMul)

  const force = (s: SeekerState | null) => {
    seekerDebug.forced = s
    setForced(s)
  }

  return (
    <section
      aria-label="Seeker animation debug"
      className="fixed right-3 top-16 z-30 max-h-[calc(100dvh-5rem)] w-56 overflow-y-auto rounded-md border border-neutral-700 bg-black/80 p-3 font-mono text-[11px] text-neutral-200"
    >
      <header className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold text-[#d8c84a]">Seeker anim</h2>
        <span className="text-neutral-400">K: back to hider</span>
      </header>
      <dl className="mb-2 flex flex-col gap-0.5">
        <div className="flex justify-between gap-2">
          <dt className="text-neutral-400">model</dt>
          <dd>{ready ? 'ready' : 'loading…'}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-neutral-400">state</dt>
          <dd className="text-[#d8c84a]">
            {state}
            {forced ? ' (forced)' : ''}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-neutral-400">last attack</dt>
          <dd className="truncate">{lastHit}</dd>
        </div>
      </dl>
      <p className="mb-1 text-neutral-400">clips ({loaded.length})</p>
      <ul className="mb-2 flex flex-col gap-0.5">
        {STATES.map((s) => (
          <li key={s} className="flex justify-between gap-2">
            <span className={missing.includes(s) ? 'text-red-400' : loaded.includes(s) ? '' : 'text-neutral-500'}>
              {s}
            </span>
            <span className="truncate text-neutral-500">{ANIM_MAP[s].file}</span>
          </li>
        ))}
      </ul>
      <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="Force animation state">
        <button
          type="button"
          onClick={() => force(null)}
          className={`rounded px-1.5 py-0.5 ${forced === null ? 'bg-[#d8c84a] text-black' : 'bg-neutral-800 hover:bg-neutral-700'}`}
        >
          auto
        </button>
        {STATES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => force(s)}
            className={`rounded px-1.5 py-0.5 ${forced === s ? 'bg-[#d8c84a] text-black' : 'bg-neutral-800 hover:bg-neutral-700'}`}
          >
            {s}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1">
        <span className="flex justify-between text-neutral-400">
          anim speed <span className="text-neutral-200">{speed.toFixed(2)}x</span>
        </span>
        <input
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={speed}
          onChange={(e) => {
            const v = Number(e.target.value)
            seekerDebug.speedMul = v
            setSpeed(v)
          }}
          className="accent-[#d8c84a]"
        />
      </label>
      <p className="mt-2 text-neutral-500">Esc releases the mouse to use these controls.</p>
    </section>
  )
}
