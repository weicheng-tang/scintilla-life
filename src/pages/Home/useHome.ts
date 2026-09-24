import { useCallback, useEffect, useMemo, useState } from "react"
import { STAGE_CHAPTERS, chapterById } from "@/components/home/stage/chapters"
import { readStageTheme, type StageTheme } from "@/lib/stageTheme"

/** 检测运行环境是否具备 WebGL，缺能力时页面降级为静态示意图。 */
function detectWebGL(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false
  try {
    const canvas = document.createElement("canvas")
    const gl =
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl")
    return Boolean(gl)
  } catch {
    return false
  }
}

/** 十步流程与「个性化抗原挖掘」章节共用同一份阶段定义，滚动到哪一步动画就走到哪一步。 */
const MINING_CHAPTER_INDEX = Math.max(
  0,
  STAGE_CHAPTERS.findIndex((item) => item.id === "mining"),
)

export function useHome() {
  const [chapterIndex, setChapterIndex] = useState(0)
  const [phaseIndex, setPhaseIndex] = useState(0)
  const [focusPhase, setFocusPhase] = useState<number | null>(null)
  const [webglAvailable, setWebglAvailable] = useState(false)
  const [stageTheme, setStageTheme] = useState<StageTheme>(() => readStageTheme())

  useEffect(() => {
    setWebglAvailable(detectWebGL())
    setStageTheme(readStageTheme())
  }, [])

  const chapters = STAGE_CHAPTERS
  const chapter = chapters[chapterIndex] ?? chapters[0]
  const pipelineSteps = useMemo(() => chapterById("mining").phases, [])

  const handlePhaseChange = useCallback((next: number) => {
    setPhaseIndex((prev) => (prev === next ? prev : next))
  }, [])

  /** 滚动到流程里的第 index 步：切回挖掘章节并锁定到那一步；离开流程区则恢复自由播放。 */
  const handleFocusStep = useCallback((next: number | null) => {
    setFocusPhase(next)
    if (next !== null) setChapterIndex(MINING_CHAPTER_INDEX)
  }, [])

  /** 一章播完自动接下一章，三个板块就这样一直轮着放，不需要任何手动控制。 */
  const handleChapterEnd = useCallback(() => {
    setChapterIndex((prev) => (prev + 1) % STAGE_CHAPTERS.length)
    setPhaseIndex(0)
  }, [])

  return {
    chapters,
    chapterIndex,
    chapter,
    phaseIndex,
    focusPhase,
    pipelineSteps,
    webglAvailable,
    stageTheme,
    handlePhaseChange,
    handleFocusStep,
    handleChapterEnd,
  }
}
