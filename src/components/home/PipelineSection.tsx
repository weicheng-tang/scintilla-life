import { useEffect, useRef } from "react"
import type { StagePhase } from "./stage/chapters"

type PipelineSectionProps = {
  steps: StagePhase[]
  activeStep: number
  onFocusStep: (index: number | null) => void
}

/**
 * 十步流程。滚动到哪一步，背景里的三维动画就走到哪一步——
 * 观察窗口收成视口中间的一条窄带，卡片进出这条带子就切换焦点。
 * 卡片本身不吃指针事件，这样整页都能按住左键拖动旋转背景。
 */
export function PipelineSection({ steps, activeStep, onFocusStep }: PipelineSectionProps) {
  const itemRefs = useRef<Array<HTMLLIElement | null>>([])

  useEffect(() => {
    const nodes = itemRefs.current.filter((node): node is HTMLLIElement => Boolean(node))
    if (nodes.length === 0 || typeof IntersectionObserver === "undefined") return

    // 记录每张卡片中心相对视口的距离，取离中线最近的那张
    const centers = new Map<number, number>()

    // 观察带只有视口中部一条窄带，快速滚动时带宽会短暂空窗——
    // 此时若立刻把时间轴交还给自动轮播，几百毫秒后又吸回下一步，
    // 「自动播放 ↔ 滚动锁定」反复翻转就是滚动时的频闪。
    // 所以空窗后先持住当前焦点一小会儿，连续滚过去也不松手。
    const RELEASE_GRACE_MS = 850
    let releaseTimer: number | null = null
    const cancelRelease = () => {
      if (releaseTimer !== null) {
        window.clearTimeout(releaseTimer)
        releaseTimer = null
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = Number((entry.target as HTMLElement).dataset.step)
          if (!Number.isFinite(index)) return
          if (entry.isIntersecting) {
            centers.set(index, entry.boundingClientRect.top + entry.boundingClientRect.height / 2)
          } else {
            centers.delete(index)
          }
        })

        if (centers.size === 0) {
          if (releaseTimer === null) {
            releaseTimer = window.setTimeout(() => {
              releaseTimer = null
              onFocusStep(null)
            }, RELEASE_GRACE_MS)
          }
          return
        }
        cancelRelease()

        const middle = window.innerHeight / 2
        let best = -1
        let bestGap = Number.POSITIVE_INFINITY
        centers.forEach((center, index) => {
          const gap = Math.abs(center - middle)
          if (gap < bestGap) {
            bestGap = gap
            best = index
          }
        })
        if (best >= 0) onFocusStep(best)
      },
      // 窄带比卡片之间的间距宽得多，所以滚动过程中始终有且只有一张卡片落在带子里
      { rootMargin: "-40% 0px -40% 0px", threshold: 0 },
    )

    nodes.forEach((node) => observer.observe(node))
    return () => {
      cancelRelease()
      observer.disconnect()
    }
  }, [onFocusStep, steps.length])

  return (
    <section id="pipeline" className="relative scroll-mt-20 border-t border-border md:scroll-mt-24">
      <div className="mx-auto w-full max-w-6xl px-6 pt-20 pb-8 md:pt-24 md:pb-10">
        <span className="text-xs text-muted-foreground">个性化肿瘤疫苗流程</span>
        <h2 className="mt-6 max-w-3xl font-display text-xl font-semibold text-foreground md:text-2xl">
          从一块肿瘤组织，到一支只属于你的疫苗
        </h2>
        <p className="mt-6 max-w-2xl text-base leading-loose text-muted-foreground">
          向下滚动，背景里的三维动画会跟着走到对应的那一步。十条步骤，就是一支个性化疫苗的完整诞生过程。
        </p>
      </div>

      <div className="mx-auto w-full max-w-6xl px-6 pb-20 md:pb-32">
        <ol className="flex flex-col gap-4 md:gap-5">
          {steps.map((step, index) => {
            const active = index === activeStep
            return (
              <li
                key={step.title}
                data-step={index}
                ref={(node) => {
                  itemRefs.current[index] = node
                }}
                className={["w-full md:w-[54%]", index % 2 === 1 ? "md:self-end" : "md:self-start"].join(" ")}
              >
                <div
                  className={[
                    /* 手机上一整列卡片都压在动画上，逐个做毛玻璃会把帧率吃干净：
                       窄屏改用更实的浅底，宽屏再上模糊 */
                    "rounded-lg border p-5 transition-all duration-500 md:p-6 md:backdrop-blur-md",
                    active
                      ? "ring-active-soft border-primary/45 bg-card/95 md:bg-card/75"
                      : "glass-panel border-border bg-card/85 md:bg-card/65",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={[
                        "font-mono text-xs transition-colors duration-500",
                        active ? "text-primary" : "text-muted-foreground",
                      ].join(" ")}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={[
                        "h-px flex-1 transition-colors duration-500",
                        active ? "bg-primary/45" : "bg-border",
                      ].join(" ")}
                    />
                  </div>
                  <h3
                    className={[
                      "mt-4 font-display text-lg font-semibold transition-colors duration-500 md:text-xl",
                      active ? "text-foreground" : "text-foreground/75",
                    ].join(" ")}
                  >
                    {step.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
