import { useEffect, useMemo, useRef, useState } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { Environment, Lightformer, OrbitControls } from "@react-three/drei"
import { Bloom, ChromaticAberration, EffectComposer, Vignette } from "@react-three/postprocessing"
import * as THREE from "three"
import type { StageTheme } from "@/lib/stageTheme"
import { STAGE_CHAPTERS, type StageChapter } from "./stage/chapters"
import { ACTIVE_CHAPTER, ZONE_GAP, easeInOut, phaseAt, type TimeRef } from "./stage/timeline"
import { prefersReducedMotion } from "./stage/motion"
import { AmbientMotes, BokehBlobs } from "./stage/organic"
import { CinematicDust, LightShaft } from "./stage/atmosphere"
import { JourneyRail } from "./stage/journey"
import { ChapterImmune } from "./stage/ChapterImmune"
import { ChapterAnchoring } from "./stage/ChapterAnchoring"
import { ChapterMining } from "./stage/ChapterMining"
import { ChapterFactory } from "./stage/ChapterFactory"

/** 各站台的世界坐标：按章节顺序沿 -x 排开，同一条装配线上的四站 */
const ZONE_X: Record<string, number> = Object.fromEntries(
  STAGE_CHAPTERS.map((c, i) => [c.id, -i * ZONE_GAP]),
)

type Stage3DProps = {
  chapter: StageChapter
  /** 非空时锁定到该阶段：页面滚动到某一步，动画就停在那一步上 */
  focusPhase: number | null
  theme: StageTheme
  onPhaseChange: (index: number) => void
  /** 本章播完，交给下一章，整条动画就这样一直循环下去 */
  onChapterEnd: () => void
}

type StageClockProps = {
  chapter: StageChapter
  tRef: TimeRef
  focusPhase: number | null
  /** 系统开启减少动效：自动轮播停住，只在滚动锁定时才动 */
  reduced: boolean
  /** 诊断预设的「全静态」：整条时间轴冻结，一帧都不推进 */
  paused: boolean
  onPhaseChange: (index: number) => void
  onChapterEnd: () => void
}

/** 时间轴推进器：必须挂在 Canvas 内部才能每帧拿到 useFrame。 */
function StageClock({ chapter, tRef, focusPhase, reduced, paused, onPhaseChange, onChapterEnd }: StageClockProps) {
  const lastPhase = useRef(0)
  const ended = useRef(false)
  const focusRef = useRef(focusPhase)
  focusRef.current = focusPhase
  const reducedRef = useRef(reduced)
  reducedRef.current = reduced
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  useEffect(() => {
    tRef.current = 0
    lastPhase.current = 0
    ended.current = false
    onPhaseChange(0)
  }, [chapter.id, onPhaseChange, tRef])

  useFrame((_, delta) => {
    // 全静态诊断：时间轴一格都不走
    if (pausedRef.current) return
    const focus = focusRef.current

    // 锁定模式：平滑地追上目标阶段的起点，然后停住。
    // 追的过程本身就是一次「快进 / 回退」，比硬切自然；减少动效时直接落位。
    if (focus !== null) {
      const from = chapter.starts[focus] ?? 0
      const to = focus + 1 < chapter.starts.length ? chapter.starts[focus + 1] : chapter.total
      // 停在阶段中段：阶段起点往往还什么都没发生，中段才是这一步最有代表性的画面
      const target = from + (to - from) * 0.6
      if (reducedRef.current) {
        tRef.current = target
      } else {
        // 追逐速率压到 2.4：跨步擦洗变成一秒以上的顺滑滑翔，
        // 阶段画面渐次过渡而不是两百毫秒冲到位的频闪
        const gap = target - tRef.current
        tRef.current = Math.abs(gap) < 0.02 ? target : tRef.current + gap * Math.min(1, delta * 2.4)
      }
      if (lastPhase.current !== focus) {
        lastPhase.current = focus
        onPhaseChange(focus)
      }
      return
    }

    // 减少动效：章节轮播不再自动推进，停在章节起点；十步滚动锁定走上面的分支，照常工作
    if (reducedRef.current) return

    const span = Math.max(0.001, chapter.total)
    const next = tRef.current + Math.min(delta, 0.05)

    // 播完停顿一拍再进下一章，让结尾动作留得住；ended 挡住状态更新生效前的重复触发
    if (next > span + 1) {
      tRef.current = span + 1
      if (!ended.current) {
        ended.current = true
        onChapterEnd()
      }
      return
    }

    tRef.current = next
    const index = phaseAt(tRef.current, chapter.starts)
    if (index !== lastPhase.current) {
      lastPhase.current = index
      onPhaseChange(index)
    }
  })

  return null
}

/* ------------------------------------------------------------------ *
 * 取景：手机屏幕又窄又长，横平竖直地「把整幅画面装下」会让主体小到看不清。
 * 这里按屏幕宽高比反推机位距离——竖屏宁可裁掉两侧，也要让主体占满宽度。
 * ------------------------------------------------------------------ */

const CAMERA_FOV = 42
/** 相机的基准方向，只调远近不调角度，保证各端看到的是同一个视角 */
const CAMERA_DIR = new THREE.Vector3(1.1, 1.5, 10.2)
/** 场景主体的大致包围盒（横屏按整幅算，竖屏按中间那条算） */
const HALF_WIDTH = 4.6
const HALF_WIDTH_PORTRAIT = 3.3
const HALF_HEIGHT = 3.9

function fitDistance(aspect: number): number {
  const tan = Math.tan((CAMERA_FOV * Math.PI) / 360)
  const byHeight = HALF_HEIGHT / tan
  const byWidth = (aspect < 1 ? HALF_WIDTH_PORTRAIT : HALF_WIDTH) / (tan * Math.max(aspect, 0.34))
  // 横竖都要装得下，取更远的那个；上限兜住极端窄屏，别把相机甩到天边
  return Math.min(24, Math.max(byHeight, byWidth) * 1.04)
}

function readAspect(): number {
  if (typeof window === "undefined") return 1.6
  return window.innerWidth / Math.max(1, window.innerHeight)
}

/** 只认宽度变化：手机地址栏收起只改高度，那时重算会让画面莫名其妙缩放一下。 */
function useViewportAspect(): number {
  const [aspect, setAspect] = useState(readAspect)

  useEffect(() => {
    let lastWidth = window.innerWidth
    const sync = () => {
      if (window.innerWidth === lastWidth) return
      lastWidth = window.innerWidth
      setAspect(readAspect())
    }
    const force = () => {
      lastWidth = -1
      sync()
    }
    window.addEventListener("resize", sync)
    window.addEventListener("orientationchange", force)
    return () => {
      window.removeEventListener("resize", sync)
      window.removeEventListener("orientationchange", force)
    }
  }, [])

  return aspect
}

function useMediaQuery(query: string): boolean {
  return useMemo(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
    return window.matchMedia(query).matches
  }, [query])
}

/** 系统「减少动效」偏好：开启时装饰性动画静默停下，内容驱动的滚动锁定不受影响。 */
function useReducedMotion(): boolean {
  return useMemo(() => prefersReducedMotion(), [])
}

/** 机位由屏幕宽高比决定，尺寸一变就把相机放到算好的距离上。 */
function CameraFit({ distance }: { distance: number }) {
  const camera = useThree((state) => state.camera)

  useEffect(() => {
    camera.position.copy(CAMERA_DIR).normalize().multiplyScalar(distance)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera, distance])

  return null
}

/* ------------------------------------------------------------------ *
 * 触摸端的视角控制：单指留给页面滚动，双指才转视角。
 * 不挂 OrbitControls 是因为它连单指拖动也一并接管（并在 touchstart 里
 * preventDefault），页面就滚不动了；这里只认双指，其余手势一概不碰。
 * ------------------------------------------------------------------ */

/** 基准方向换算成球坐标，用户转出来的偏移量加在它上面 */
const BASE_SPHERICAL = new THREE.Spherical().setFromVector3(CAMERA_DIR)
/** 复用的临时球坐标，免得每帧新建对象给 GC 添活 */
const SPHERICAL = new THREE.Spherical()

/** 上下能转到哪：别让用户把镜头翻到脚底下 */
const PHI_LIMIT = 0.62
/** 手指划过一像素转多少弧度，越小越「重」 */
const TOUCH_SPIN = 0.0055
/** 双指捏合能把画面推到多近 / 拉多远（相对自适应算出的基准距离） */
const ZOOM_MIN = 0.5
const ZOOM_MAX = 2.4
/** 松手后再让自转等一会儿，免得刚摆好的角度立刻被转走 */
const SPIN_RESUME_MS = 3200
/** 双击复位的判定：两下间隔 / 每下按住多久 / 两下之间允许偏多少像素 */
const DOUBLE_TAP_MS = 320
const TAP_MS = 260
const TAP_SLOP = 40

type OrbitState = {
  /** 相对基准方向的水平偏移 */
  theta: number
  /** 相对基准方向的俯仰偏移 */
  phi: number
  /** 相对基准距离的缩放：捏合拉近时小于 1，推开时大于 1 */
  zoom: number
  /** 这个时刻之前都算用户正在操作，自转先让位 */
  busyUntil: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 触摸设备的相机：位置 = 基准方向 + 双指转出来的偏移，距离仍由屏幕宽高比定。 */
function TouchOrbit({ distance, orbit }: { distance: number; orbit: { current: OrbitState } }) {
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)

  useFrame(() => {
    const o = orbit.current
    SPHERICAL.set(distance * o.zoom, BASE_SPHERICAL.phi + o.phi, BASE_SPHERICAL.theta + o.theta)
    camera.position.setFromSpherical(SPHERICAL)
    camera.lookAt(0, 0, 0)
  })

  useEffect(() => {
    const el = gl.domElement
    let tracking = false
    let lastX = 0
    let lastY = 0
    let lastSpread = 0
    /* 认「双击复位」用的材料：这一下按在哪、什么时候按的、有没有划动 */
    let tapAt = 0
    let dragged = false
    let lastTapAt = 0
    let lastTapX = 0
    let lastTapY = 0

    const midpoint = (touches: TouchList) => ({
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    })
    /** 两指间距，捏合缩放看的就是它 */
    const spreadOf = (touches: TouchList) =>
      Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY,
      )

    const onStart = (event: TouchEvent) => {
      if (event.touches.length === 1) {
        // 单指只做记录，用来认出「双击复位」，绝不拦截——滚动永远优先
        tapAt = performance.now()
        dragged = false
        return
      }
      // 单指以外的手势才接管
      if (event.touches.length !== 2) return
      const mid = midpoint(event.touches)
      tracking = true
      dragged = true
      lastX = mid.x
      lastY = mid.y
      lastSpread = spreadOf(event.touches)
      orbit.current.busyUntil = performance.now() + SPIN_RESUME_MS
    }

    const onMove = (event: TouchEvent) => {
      if (event.touches.length === 1) {
        // 手指划出去了就不是轻点，是在滚页面
        dragged = true
        return
      }
      if (!tracking || event.touches.length !== 2) return
      // 双指纵向滑动默认会被浏览器当成滚页，这里必须拦下来（监听器要 non-passive）
      event.preventDefault()
      dragged = true
      const mid = midpoint(event.touches)
      const spread = spreadOf(event.touches)
      const o = orbit.current
      // 两指中点拖着走 = 转视角；两指间距拉开收拢 = 推近拉远
      o.theta -= (mid.x - lastX) * TOUCH_SPIN
      o.phi = clamp(o.phi - (mid.y - lastY) * TOUCH_SPIN, -PHI_LIMIT, PHI_LIMIT)
      if (lastSpread > 0) {
        // 用增量比值而不是绝对距离：中途撞到上下限，反向捏回来能立刻响应
        o.zoom = clamp(o.zoom * (lastSpread / Math.max(1, spread)), ZOOM_MIN, ZOOM_MAX)
      }
      lastX = mid.x
      lastY = mid.y
      lastSpread = spread
      o.busyUntil = performance.now() + SPIN_RESUME_MS
    }

    const onEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) tracking = false
      // 还有手指留在屏幕上、或者这一下划过 / 用过双指，都不算轻点
      if (event.touches.length > 0 || dragged) return

      const touch = event.changedTouches[0]
      const now = performance.now()
      if (!touch || now - tapAt > TAP_MS) return

      const near =
        Math.abs(touch.clientX - lastTapX) < TAP_SLOP && Math.abs(touch.clientY - lastTapY) < TAP_SLOP
      if (now - lastTapAt < DOUBLE_TAP_MS && near) {
        // 双击：视角和缩放一起放回默认，捏远了、转歪了都能一下回来
        const o = orbit.current
        o.theta = 0
        o.phi = 0
        o.zoom = 1
        o.busyUntil = now + SPIN_RESUME_MS
        lastTapAt = 0
        return
      }

      lastTapAt = now
      lastTapX = touch.clientX
      lastTapY = touch.clientY
    }

    el.addEventListener("touchstart", onStart, { passive: true })
    el.addEventListener("touchmove", onMove, { passive: false })
    el.addEventListener("touchend", onEnd)
    el.addEventListener("touchcancel", onEnd)
    return () => {
      el.removeEventListener("touchstart", onStart)
      el.removeEventListener("touchmove", onMove)
      el.removeEventListener("touchend", onEnd)
      el.removeEventListener("touchcancel", onEnd)
    }
  }, [gl, orbit])

  return null
}

/* ------------------------------------------------------------------ *
 * 滚动视差：window 滚动进度 -> 阻尼平滑 -> 相机轻微推近 + 内容轻微俯仰，
 * 环境微粒同时向场景中心缓缓聚合（见 AmbientMotes）。
 * 平滑值写进 ref 传给消费方，避免每帧 setState；
 * 相机只动 fov，不碰 OrbitControls / TouchOrbit 管的位姿，两套逻辑互不打架。
 * ------------------------------------------------------------------ */

function ScrollParallax({
  scrollRef,
  rigRef,
}: {
  scrollRef: { current: number }
  rigRef: { current: THREE.Group | null }
}) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera
  const targetRef = useRef(0)

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement
      const max = doc.scrollHeight - window.innerHeight
      targetRef.current = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
  }, [])

  useFrame((state, delta) => {
    scrollRef.current += (targetRef.current - scrollRef.current) * Math.min(1, delta * 3)
    const progress = scrollRef.current
    // 滚得越深推得越近：只微调 fov，幅度小到不破坏 fitDistance 取景
    const nextFov = CAMERA_FOV - progress * 2.2
    if (Math.abs(camera.fov - nextFov) > 0.01) {
      camera.fov = nextFov
      camera.updateProjectionMatrix()
    }
    // 内容轻微俯仰视差 + 电影级「手持感」：极低频的呼吸摇摆，
    // 幅度小到不会被察觉为「在动」，但完全没有它画面就是死的
    if (rigRef.current) {
      const t = state.clock.elapsedTime
      rigRef.current.rotation.x = progress * 0.06 + Math.sin(t * 0.12) * 0.011
      rigRef.current.rotation.z = Math.sin(t * 0.089 + 1.3) * 0.013
      rigRef.current.position.y = Math.sin(t * 0.14 + 0.6) * 0.07
    }
  })

  return null
}

/**
 * 场景层。暗色电影调性下，真实感来自五件事：
 * 1) 三点式电影布光：微弱环境光压住底噪，暖白 key light 塑形，
 *    主色轮廓光从背后把主体从暗场里「雕」出来，底部一点青色补光；
 * 2) 程序化 IBL：四枚柔光箱提供玻璃的反射 / 折射高光，暗场上反射对比更强；
 * 3) 空气感：线性雾 + 顶部体积光束（LightShaft）+ 两层发光尘埃（CinematicDust），
 *    光在空气里，暗场才有体积；
 * 4) 有机形变的细胞外形 + 膜表面受体颗粒 + 内部结构分层（见各章节场景）；
 * 5) 后期管线：Bloom 辉光 + 胶片颗粒 + 色差 + 晕影，配色全部由 stageTheme 从 token 派生。
 */
function StageScene({
  chapter,
  tRef,
  theme,
  touchOrbit,
  scrollRef,
  reduced,
  showAtmos,
  coarse,
}: {
  chapter: StageChapter
  tRef: TimeRef
  theme: StageTheme
  /** 触摸端传用户视角状态（自转要给它让位）；桌面端为 null，自转交给 OrbitControls */
  touchOrbit: { current: OrbitState } | null
  /** 滚动进度（阻尼平滑后），驱动视差与微粒聚合 */
  scrollRef: { current: number }
  /** 系统开启减少动效：不挂视差、微粒不聚合、触摸端也不自转 */
  reduced: boolean
  /** 诊断预设：false 时卸载全部氛围元素（光束/尘埃/微粒/轨道） */
  showAtmos: boolean
  /** 手机 / 平板：触屏设备，微粒配额减半保帧率 */
  coarse: boolean
}) {
  const rigRef = useRef<THREE.Group>(null)
  /** 整条世界（四站 + 轨道）沿 -x 滑动，把当前章节带回相机取景中心 */
  const journeyRef = useRef<THREE.Group>(null)
  /** 每站的根组引用：切换章时各自原地缓转，避免邻站在世界滑移时甩大弧 */
  const zoneRefs = useRef<(THREE.Group | null)[]>([])
  const spinAngleRef = useRef(0)
  /** 章节滑移补间：easeInOut 匀起步匀收尾——指数追逐起步最猛，观感是抽鞭式的猛晃 */
  const slideRef = useRef<{ from: number; to: number; at: number; active: boolean }>({ from: 0, to: 0, at: 0, active: false })
  const chapterIdRef = useRef(chapter.id)
  /** 滑移时长与可见窗口（滑动期间只画新旧两站，远站在雾外不必渲染） */
  const SLIDE_SECONDS = 2.4
  const SLIDE_VISIBLE_WINDOW = ZONE_GAP * 0.72

  // 每帧同步激活章节：各章节的 useFrame 闸门按它短路隐藏章节的重计算
  useFrame((state, delta) => {
    ACTIVE_CHAPTER.current = chapter.id
    // 世界滑移（easeInOut 补间）：起步匀加速、收尾匀减速，整个世界像被推着走而不是被甩出去。
    // 滑动期间只保留新旧两站可见——远站本就在雾外不可见，不让 GPU 白画它们；落定后只画当前章。
    if (journeyRef.current) {
      if (chapterIdRef.current !== chapter.id) {
        chapterIdRef.current = chapter.id
        slideRef.current = {
          from: journeyRef.current.position.x,
          to: -(ZONE_X[chapter.id] ?? 0),
          at: state.clock.elapsedTime,
          active: true,
        }
      }
      const slide = slideRef.current
      let anySliding = false
      if (slide.active) {
        const u = Math.min(1, (state.clock.elapsedTime - slide.at) / SLIDE_SECONDS)
        const e = easeInOut(u)
        journeyRef.current.position.x = slide.from + (slide.to - slide.from) * e
        if (u >= 1) {
          slide.active = false
        } else {
          anySliding = true
        }
      }
      const jx = journeyRef.current.position.x
      for (let i = 0; i < zoneRefs.current.length; i++) {
        const z = zoneRefs.current[i]
        if (!z) continue
        const meta = STAGE_CHAPTERS[i]
        if (anySliding) {
          // 窗内渐显：站台在窗口边缘按距离平滑缩放浮现，配合雾出场——
          // 二值可见性翻转会让又大又亮的站台凭空出现/消失，正是「一闪一闪」的知觉来源
          const worldX = (ZONE_X[meta.id] ?? 0) + jx
          const dist = Math.abs(worldX)
          if (dist >= SLIDE_VISIBLE_WINDOW) {
            z.visible = false
            z.scale.setScalar(1)
          } else {
            const emerge = easeInOut(Math.min(1, (SLIDE_VISIBLE_WINDOW - dist) / 7))
            z.visible = emerge > 0.002
            z.scale.setScalar(Math.max(0.002, emerge))
          }
        } else {
          z.visible = meta.id === chapter.id
          z.scale.setScalar(1)
        }
      }
    }
    // 站台原地缓转：触屏端在用户拖拽期间静默，桌面 AutoRotate 接管镜头
    if (!reduced) {
      const busy = touchOrbit ? performance.now() < touchOrbit.current.busyUntil : false
      if (!busy) spinAngleRef.current += Math.min(delta, 0.05) * 0.06
      for (let i = 0; i < zoneRefs.current.length; i++) {
        const z = zoneRefs.current[i]
        if (z) z.rotation.y = spinAngleRef.current
      }
    }
  })

  // 四章常驻、切换只翻可见性：几何与着色器在整个生命周期只创建/编译一次，
  // 切章瞬间不再有整组重挂载带来的几何重建与编译卡顿（观察到的「一顿」就在这）。
  // 隐藏的章节点不被 React 渲染进绘图队列（WebGL 直接跳过），GPU 开销只花在当前章；
  // 各章动画都从全局 tRef 读相位，轮播回卷后状态自然复位，帧级行为与旧版一致。
  const content = (
    <>
      <group ref={(el) => { zoneRefs.current[0] = el }} position={[ZONE_X.mining, 0, 0]} visible={chapter.id === "mining"}>
        <ChapterMining tRef={tRef} theme={theme} />
      </group>
      <group ref={(el) => { zoneRefs.current[1] = el }} position={[ZONE_X.anchoring, 0, 0]} visible={chapter.id === "anchoring"}>
        <ChapterAnchoring tRef={tRef} theme={theme} />
      </group>
      <group ref={(el) => { zoneRefs.current[2] = el }} position={[ZONE_X.factory, 0, 0]} visible={chapter.id === "factory"}>
        <ChapterFactory tRef={tRef} theme={theme} />
      </group>
      <group ref={(el) => { zoneRefs.current[3] = el }} position={[ZONE_X.immune, 0, 0]} visible={chapter.id === "immune"}>
        <ChapterImmune tRef={tRef} theme={theme} />
      </group>
      {/* 贯穿四站的物流线：发光轨道 + 流动粒子 + 穿梭舱 + 站间门环（诊断无氛围时静止） */}
      <JourneyRail theme={theme} reduced={reduced || !showAtmos} gap={ZONE_GAP} coarse={coarse} />
    </>
  )

  return (
    <>
      <color attach="background" args={[theme.scene.backdrop]} />

      {/* 三点式电影布光：环境光只留一点底噪，明暗全靠 key / 轮廓 / 补光三束光雕出来 */}
      <ambientLight intensity={0.16} />
      {/* key light：微暖的主光，从右上前方打下，塑形 */}
      <directionalLight position={[6, 9, 7]} intensity={2.6} color={theme.scene.light} />
      {/* 轮廓光：主色冷光从背后勾边，主体从暗场里立起来 */}
      <directionalLight position={[-6, 4, -8]} intensity={2.1} color={theme.primary} />
      {/* 底部青色补光：暗部不死黑，留一点冷调细节 */}
      <directionalLight position={[0, -8, 4]} intensity={0.55} color={theme.scene.surface} />

      {/* 程序化 IBL：四枚柔光箱提供玻璃的反射 / 折射高光，暗场上反射对比更强 */}
      <Environment resolution={256} frames={1} key={theme.primary}>
        <Lightformer
          form="rect"
          intensity={3.2}
          position={[0, 7, 1]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[16, 16, 1]}
          color={theme.scene.light}
        />
        <Lightformer
          form="rect"
          intensity={1.4}
          position={[-8, 2, 4]}
          rotation={[0, Math.PI / 2, 0]}
          scale={[10, 8, 1]}
          color={theme.primary}
        />
        <Lightformer
          form="rect"
          intensity={2}
          position={[8, 3, 2]}
          rotation={[0, -Math.PI / 2, 0]}
          scale={[10, 10, 1]}
          color={theme.scene.surface}
        />
        <Lightformer
          form="rect"
          intensity={0.9}
          position={[0, -6, 3]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[12, 10, 1]}
          color={theme.scene.light}
        />
      </Environment>

      {/* 顶部体积光束：两道光柱从天窗垂下，缓慢摇摆；尘埃在光里浮沉（诊断无氛围时卸载） */}
      {showAtmos ? (
        <>
          <LightShaft
            color={theme.scene.light}
            position={[-1.6, 3.2, -2.4]}
            tilt={[0.14, 0.2]}
            intensity={0.3}
            swaySeed={0}
            reduced={reduced}
          />
          <LightShaft
            color={theme.primary}
            position={[2.4, 3.4, -1.2]}
            tilt={[0.1, -0.26]}
            height={12}
            radius={2.2}
            intensity={0.16}
            swaySeed={2.4}
            reduced={reduced}
          />
        </>
      ) : null}

      {reduced ? null : <ScrollParallax scrollRef={scrollRef} rigRef={rigRef} />}

      <group ref={rigRef}>
        {showAtmos ? (
          <>
            <AmbientMotes color={theme.scene.surface} scrollRef={scrollRef} count={coarse ? 130 : 260} reduced={reduced} />
            <CinematicDust color={theme.scene.surface} reduced={reduced} />
          </>
        ) : null}

        {/* 微距景深：镜头前一层大而淡的暖白光斑、主体之后一层小而密的冰蓝光斑，
            近处失焦、主体清晰，与后期 Bloom 叠出电影级焦外 */}
        <BokehBlobs
          color={theme.scene.light}
          count={7}
          spread={7.4}
          zRange={[1.8, 3.8]}
          sizeRange={[1.7, 3.6]}
          opacity={0.22}
          seed={11}
        />
        <BokehBlobs
          color={theme.scene.surface}
          count={12}
          spread={8}
          zRange={[-4.4, -1.4]}
          sizeRange={[0.5, 1.5]}
          opacity={0.3}
          seed={23}
        />

        {/* 自转以站台为单位进行（各自原地转），这里直接挂内容 */}
        {content}
      </group>
    </>
  )
}

/** 诊断预设名：按 F 循环，帮助把残余的闪烁归因到具体子系统 */
const DIAG_PRESETS = ["标准", "无辉光", "无氛围", "全静态"]

export function Stage3D({ chapter, focusPhase, theme, onPhaseChange, onChapterEnd }: Stage3DProps) {
  const tRef = useRef(0)
  /** 只有真正接了鼠标的设备才挂 OrbitControls，否则触摸端的页面滚动会被它吃掉 */
  const hasPointer = useMediaQuery("(hover: hover) and (pointer: fine)")
  /** 手机 / 平板：像素比降一档，省下的是实打实的帧率 */
  const coarse = useMediaQuery("(pointer: coarse)")
  /** 系统开了「减少动效」：自转、视差、微粒聚合、章节轮播全部静默停下 */
  const reduced = useReducedMotion()
  /** 诊断预设：0 标准 · 1 无辉光（Bloom） · 2 无氛围（光束/尘埃/微粒/轨道） · 3 全静态（时间轴冻结） */
  const [diagPreset, setDiagPreset] = useState(0)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "f") return
      setDiagPreset((p) => (p + 1) % DIAG_PRESETS.length)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  const diagBloomOff = diagPreset === 1
  const diagAtmosOff = diagPreset === 2 || diagPreset === 3
  const diagFrozen = diagPreset === 3
  const aspect = useViewportAspect()
  const distance = useMemo(() => fitDistance(aspect), [aspect])
  const dpr = useMemo<[number, number]>(() => [1, coarse ? 1.5 : 1.75], [coarse])
  /** 触摸端用户双指转出来的视角偏移；桌面端不用，OrbitControls 自己管 */
  const orbit = useRef<OrbitState>({ theta: 0, phi: 0, zoom: 1, busyUntil: 0 })
  /** 滚动进度（阻尼平滑后）：驱动相机 fov 视差、内容俯仰与微粒聚合，全程走 ref 不 setState */
  const scrollRef = useRef(0)
  /** 镜头色差的偏移量：极轻微，只在画面边缘拉开一点色边 */
  const caOffset = useMemo(() => new THREE.Vector2(0.00042, 0.0008), [])

  return (
    <>
      <Canvas
        dpr={dpr}
        camera={{
          position: [1.1, 1.5, 10.2],
          fov: CAMERA_FOV,
          // 近平面抬高：尘埃/发光点贴近镜头时不再爆成一团亮斑（大面积闪烁的一个源头）
          near: 0.35,
          far: 60,
        }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance", toneMappingExposure: 1.12 }}
        className="h-full w-full"
        onCreated={({ gl }) => {
          // 画布固定铺满视口又压在内容层下面，触摸端必须把纵向手势还给页面滚动
          gl.domElement.style.touchAction = "pan-y"
        }}
      >
        <StageClock
          chapter={chapter}
          tRef={tRef}
          focusPhase={focusPhase}
          reduced={reduced}
          paused={diagFrozen}
          onPhaseChange={onPhaseChange}
          onChapterEnd={onChapterEnd}
        />

        {hasPointer ? <CameraFit distance={distance} /> : <TouchOrbit distance={distance} orbit={orbit} />}

        {/* 线性雾：远处元素融进深青蓝黑底，暗场的空气感与纵深全靠它 */}
        <fog attach="fog" args={[theme.scene.backdrop, distance * 0.8, distance * 2.0]} />

        <StageScene
          chapter={chapter}
          tRef={tRef}
          theme={theme}
          touchOrbit={hasPointer ? null : orbit}
          scrollRef={scrollRef}
          reduced={reduced}
          showAtmos={!diagAtmosOff}
          coarse={coarse}
        />

        {hasPointer ? (
          <OrbitControls
            /* autoRotate 关闭：镜头每帧都在转会让透明排序/反射高光持续翻动，
               观感上就是轻微的闪烁底噪；视角仍可通过左键拖动调整 */
            enableDamping
            dampingFactor={0.08}
            enablePan={false}
            /* 关键：关掉滚轮缩放，滚轮归还给页面滚动；只保留左键拖动旋转 */
            enableZoom={false}
            rotateSpeed={0.72}
            /* 上下限跟着机位走，否则窄屏算出的远机位会被控件拽回来 */
            minDistance={distance * 0.6}
            maxDistance={distance * 1.45}
          />
        ) : null}

        {/* 电影后期：Bloom 让发光体晕开、边缘一点色差、晕影收住视线。
            阈值抬到 0.7：呼吸脉动的发光体不再反复跨越阈值造成整屏明暗泵动（闪烁底噪）。
            注意不要挂动态胶片颗粒（Noise）——它的噪声每帧重新生成，整幅画面会明暗抖动；
            静态纸感纹理由 DOM 层的 bg-paper-grain 承担。移动端关掉多重采样，保帧率 */}
        <EffectComposer multisampling={coarse ? 0 : 2}>
          {diagBloomOff ? null : (
            <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.7} luminanceSmoothing={0.3} />
          )}
          <ChromaticAberration offset={caOffset} />
          <Vignette offset={0.24} darkness={0.74} />
        </EffectComposer>
      </Canvas>

      {/* 诊断徽标：告知当前预设与切换方式，不挡任何交互 */}
      <div className="pointer-events-none absolute bottom-20 right-5 z-40 rounded-full border border-border bg-card/70 px-3 py-1.5 text-[11px] text-muted-foreground backdrop-blur-sm">
        动画诊断：{DIAG_PRESETS[diagPreset]}（按 F 切换）
      </div>
    </>
  )
}
