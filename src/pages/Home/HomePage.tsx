import { AdvantageSection } from "@/components/home/AdvantageSection"
import { AmbientAudio } from "@/components/home/AmbientAudio"
import { CostSection } from "@/components/home/CostSection"
import { FactorySection } from "@/components/home/FactorySection"
import { HeroSection } from "@/components/home/HeroSection"
import { PipelineSection } from "@/components/home/PipelineSection"
import { SiteFooter } from "@/components/home/SiteFooter"
import { SiteNav } from "@/components/home/SiteNav"
import { StageBackdrop } from "@/components/home/StageBackdrop"
import { TrustBar } from "@/components/home/TrustBar"
import type { useHome } from "./useHome"

type HomePageProps = ReturnType<typeof useHome>

export function HomePage({
  chapters,
  chapterIndex,
  phaseIndex,
  focusPhase,
  pipelineSteps,
  webglAvailable,
  stageTheme,
  handlePhaseChange,
  handleFocusStep,
  handleChapterEnd,
}: HomePageProps) {
  // 只有被滚动锁定的那一步才高亮；自由播放时高亮不跟着乱跳
  const activeStep = focusPhase !== null ? phaseIndex : -1

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <StageBackdrop
        chapter={chapters[chapterIndex] ?? chapters[0]}
        focusPhase={focusPhase}
        theme={stageTheme}
        webglAvailable={webglAvailable}
        onPhaseChange={handlePhaseChange}
        onChapterEnd={handleChapterEnd}
      />

      {/* 内容层整体不吃指针事件，于是页面上几乎任何地方都能按住左键拖动背景里的模型 */}
      <div className="relative z-10 pointer-events-none">
        <SiteNav />
        <main>
          <HeroSection />
          <TrustBar />
          <PipelineSection steps={pipelineSteps} activeStep={activeStep} onFocusStep={handleFocusStep} />
          <AdvantageSection />
          <FactorySection />
          <CostSection />
        </main>
        <SiteFooter />
        {/* 背景音乐：右下角悬浮开关，全程序化生成的氛围垫音，偏好持久化 */}
        <AmbientAudio />
      </div>
    </div>
  )
}
