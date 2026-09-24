import { BRAND } from "@/lib/brand"

/**
 * 首屏只留四个元素：徽标、主标题、副标题、两个按钮。
 * 副标题一句话讲清整条技术链路：双组学测序 → AI 免疫原性建模 →
 * 金属螯合锚定成苗 → 黑灯工厂 N=1 智造。
 */
export function HeroSection() {
  return (
    <section id="top" className="relative">
      <div className="relative mx-auto flex w-full max-w-6xl flex-col items-start px-6 pb-14 pt-12 md:pb-16 md:pt-24">
        <span className="glass-panel inline-flex items-center rounded-full border border-border bg-card/75 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
          <span aria-hidden className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" />
          {BRAND.nameEn} · {BRAND.tagline}
        </span>

        <h1 className="mt-7 max-w-3xl font-display text-2xl font-semibold leading-tight text-foreground sm:text-3xl md:mt-8 md:text-4xl">
          一人一苗：
          <br />
          把<span className="text-primary">个性化新抗原疫苗</span>做成常规治疗
        </h1>

        <p className="mt-6 max-w-xl text-base leading-loose text-muted-foreground md:mt-7 md:text-lg">
          以全外显子组与转录组双测序锁定患者独有的肿瘤突变，AI 免疫原性模型筛出真正能激活
          T 细胞的新抗原；抗原肽经金属螯合配位定向锚定于脂质体表面，常温混合即成苗；
          再由全封闭黑灯工厂完成 N=1 批次的无人化智造——把个性化疫苗的周期与成本，压到常规治疗的量级。
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3 md:mt-12 md:gap-4">
          <a
            href="#pipeline"
            className="btn-soft pointer-events-auto rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:brightness-105 active:scale-[0.97] focus-visible:shadow-focus md:px-7"
          >
            看完整流程
          </a>
          <a
            href="#footer"
            className="group pointer-events-auto relative overflow-hidden rounded-full border border-border bg-card/75 px-6 py-3 text-sm text-foreground backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/45 hover:text-primary focus-visible:shadow-focus md:px-7"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 -translate-x-full -skew-x-12 bg-gradient-to-r from-transparent via-foreground/5 to-transparent transition-transform duration-700 group-hover:translate-x-full"
            />
            <span className="relative">预约咨询</span>
          </a>
        </div>
      </div>
    </section>
  )
}
