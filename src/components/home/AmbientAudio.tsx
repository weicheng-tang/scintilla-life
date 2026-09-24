import { useCallback, useEffect, useRef, useState } from "react"

const STORAGE_KEY = "scintilla-music"

/**
 * 和弦进行（Hz）：Fmaj7 → Am9 → Dm9 → B♭maj7。
 * 慢速循环的暖垫音，三角波双振荡器轻微失谐 + 低通滤波，音量极低——
 * 科研站点调性下的背景声：存在、可关、绝不抢戏。
 * 全程序化生成（Web Audio API），零音频素材、零版权负担、零加载体积。
 */
const CHORDS: number[][] = [
  [174.61, 220.0, 261.63, 329.63], // Fmaj7
  [220.0, 261.63, 329.63, 392.0], // Am7
  [146.83, 220.0, 293.66, 349.23], // Dm9 骨架
  [116.54, 174.61, 233.08, 293.66], // B♭maj7
]
const CHORD_SECONDS = 9
const CROSSFADE = 3.5
/** 每个声部的峰值增益；× 总线 0.55 之后整体大约 2% 音量，垫音级别 */
const VOICE_GAIN = 0.05

type Engine = {
  ctx: AudioContext
  master: GainNode
  filter: BiquadFilterNode
  timer: number
}

/**
 * 背景音乐开关（右下角悬浮，44px 触控标准）。
 * 浏览器自动播放限制：声音只能在用户手势后启动——
 * 首次进站若上次开着音乐，任意一次点击/按键后自动响起。
 */
export function AmbientAudio() {
  const [enabled, setEnabled] = useState(false)
  const engineRef = useRef<Engine | null>(null)
  const chordRef = useRef(0)
  const nextAtRef = useRef(0)

  /** 排一个和弦：双振荡器失谐叠加，慢起慢落的包络避免任何咔哒声 */
  const playChord = useCallback((at: number) => {
    const eng = engineRef.current
    if (!eng) return
    const freqs = CHORDS[chordRef.current % CHORDS.length]
    chordRef.current += 1
    for (const f of freqs) {
      for (const detune of [-2.5, 2.5]) {
        const osc = eng.ctx.createOscillator()
        osc.type = "triangle"
        osc.frequency.value = f
        osc.detune.value = detune
        const g = eng.ctx.createGain()
        g.gain.setValueAtTime(0, at)
        g.gain.linearRampToValueAtTime(VOICE_GAIN, at + CROSSFADE)
        g.gain.setValueAtTime(VOICE_GAIN, at + CHORD_SECONDS - CROSSFADE)
        g.gain.linearRampToValueAtTime(0, at + CHORD_SECONDS + 1.2)
        osc.connect(g).connect(eng.filter)
        osc.start(at)
        osc.stop(at + CHORD_SECONDS + 1.4)
      }
    }
  }, [])

  /** 前瞻调度器：每 600ms 醒一次，把未来 1.5s 内该排的和弦排上 */
  const scheduleAhead = useCallback(() => {
    const eng = engineRef.current
    if (!eng) return
    while (nextAtRef.current < eng.ctx.currentTime + 1.5) {
      playChord(nextAtRef.current)
      nextAtRef.current += CHORD_SECONDS
    }
  }, [playChord])

  const enable = useCallback(() => {
    if (!engineRef.current) {
      const AC =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return
      const ctx = new AC()
      const filter = ctx.createBiquadFilter()
      filter.type = "lowpass"
      filter.frequency.value = 720
      filter.Q.value = 0.4
      const master = ctx.createGain()
      master.gain.value = 0
      filter.connect(master).connect(ctx.destination)
      engineRef.current = { ctx, master, filter, timer: 0 }
      chordRef.current = 0
      nextAtRef.current = ctx.currentTime + 0.15
      scheduleAhead()
      engineRef.current.timer = window.setInterval(scheduleAhead, 600)
    }
    const eng = engineRef.current
    if (!eng) return
    void eng.ctx.resume().catch(() => undefined)
    eng.master.gain.cancelScheduledValues(eng.ctx.currentTime)
    eng.master.gain.setTargetAtTime(0.55, eng.ctx.currentTime, 1.2)
    setEnabled(true)
    try {
      localStorage.setItem(STORAGE_KEY, "on")
    } catch {
      /* 隐私模式等场景下存不了就算了 */
    }
  }, [scheduleAhead])

  const disable = useCallback(() => {
    const eng = engineRef.current
    if (!eng) {
      setEnabled(false)
      return
    }
    eng.master.gain.cancelScheduledValues(eng.ctx.currentTime)
    eng.master.gain.setTargetAtTime(0, eng.ctx.currentTime, 0.7)
    window.setTimeout(() => {
      const cur = engineRef.current
      if (cur && cur.master.gain.value < 0.01) void cur.ctx.suspend().catch(() => undefined)
    }, 2000)
    setEnabled(false)
    try {
      localStorage.setItem(STORAGE_KEY, "off")
    } catch {
      /* 同上 */
    }
  }, [])

  // 首次进站：读偏好。上次开着 → UI 先亮起来，声音等第一次手势（浏览器限制）
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "on") setEnabled(true)
    } catch {
      /* ignore */
    }
    const gesture = () => {
      try {
        if (localStorage.getItem(STORAGE_KEY) === "on" && engineRef.current?.ctx.state !== "running") enable()
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("pointerdown", gesture)
    window.addEventListener("keydown", gesture)
    return () => {
      window.removeEventListener("pointerdown", gesture)
      window.removeEventListener("keydown", gesture)
      const eng = engineRef.current
      if (eng) {
        window.clearInterval(eng.timer)
        void eng.ctx.close().catch(() => undefined)
        engineRef.current = null
      }
    }
  }, [enable])

  return (
    <button
      type="button"
      aria-label={enabled ? "关闭背景音乐" : "开启背景音乐"}
      title={enabled ? "关闭背景音乐" : "开启背景音乐"}
      data-audio-state={enabled ? "on" : "off"}
      onClick={enabled ? disable : enable}
      className="pointer-events-auto fixed bottom-5 right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card/80 text-base text-muted-foreground shadow-sm backdrop-blur-md transition-colors duration-300 hover:border-primary/40 hover:text-foreground focus-visible:shadow-focus"
    >
      <span aria-hidden className={enabled ? "" : "opacity-40 line-through decoration-1"}>
        ♪
      </span>
    </button>
  )
}
