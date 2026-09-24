import type { StageTheme } from "@/lib/stageTheme"
import { Stage3D } from "./Stage3D"
import type { StageChapter } from "./stage/chapters"

type StageBackdropProps = {
  chapter: StageChapter
  focusPhase: number | null
  theme: StageTheme
  webglAvailable: boolean
  onPhaseChange: (index: number) => void
  onChapterEnd: () => void
}

/** 没有 WebGL 时的静态降级：一张分子示意图 + 一句提示，绝不白屏（配色同样走 token）。 */
function BackdropFallback() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
      <svg viewBox="0 0 240 160" className="h-40 w-60 opacity-90" role="img" aria-label="纳米疫苗示意图">
        <circle cx="120" cy="80" r="46" fill="none" stroke="hsl(var(--primary))" strokeOpacity="0.55" />
        <circle cx="120" cy="80" r="30" fill="hsl(var(--primary))" fillOpacity="0.1" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
          const rad = (deg * Math.PI) / 180
          return (
            <circle
              key={deg}
              cx={120 + Math.cos(rad) * 46}
              cy={80 + Math.sin(rad) * 46}
              r="6"
              fill="hsl(var(--primary))"
              fillOpacity="0.8"
            />
          )
        })}
        <line x1="24" y1="80" x2="66" y2="80" stroke="hsl(var(--primary))" strokeOpacity="0.4" strokeDasharray="4 4" />
        <line x1="174" y1="80" x2="216" y2="80" stroke="hsl(var(--primary))" strokeOpacity="0.4" strokeDasharray="4 4" />
      </svg>
      <p className="max-w-sm px-6 text-center text-sm leading-relaxed text-muted-foreground">
        当前浏览器没有开启三维显示能力，这里展示的是静态示意图。换一个现代浏览器就能看到可拖动旋转的完整动画。
      </p>
    </div>
  )
}

/**
 * 背景动画层：固定在视口，整页内容在它上面滚动。
 * 内容层整体不吃指针事件，所以除了卡片和按钮，页面上任何地方都能按住左键拖动来旋转视角。
 *
 * 浅色稳重调性：三维画面之上叠三层极低对比的纸感工艺 ——
 * 细网格、细颗粒肌理、两处大半径径向渐变，再用页面底色做的柔纱把首尾收住，
 * 中间留出动画本体。全程没有任何发光 / 荧光 / 光晕。
 */
export function StageBackdrop({
  chapter,
  focusPhase,
  theme,
  webglAvailable,
  onPhaseChange,
  onChapterEnd,
}: StageBackdropProps) {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-background">
      {webglAvailable ? (
        <Stage3D
          chapter={chapter}
          focusPhase={focusPhase}
          theme={theme}
          onPhaseChange={onPhaseChange}
          onChapterEnd={onChapterEnd}
        />
      ) : (
        <BackdropFallback />
      )}

      {/* 极细网格纹理：从浅底里隐约透出来的坐标纸质感 */}
      <div aria-hidden className="bg-grid-faint pointer-events-none absolute inset-0 opacity-50" />
      {/* 细颗粒肌理：低对比细点阵，避免浅色大平面死板 */}
      <div aria-hidden className="bg-paper-grain pointer-events-none absolute inset-0 opacity-40" />
      {/* 极细微的径向渐变：两处冷调光斑，只做氛围暗示 */}
      <div aria-hidden className="bg-halo-soft pointer-events-none absolute inset-0" />

      {/* 柔纱：越靠近首尾越实，中间留出动画本体；浅底上用的是页面底色而不是压暗 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/92 via-background/20 to-background/92"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-background to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-background to-transparent"
      />
    </div>
  )
}
