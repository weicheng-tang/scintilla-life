import { BRAND } from "@/lib/brand"

export function SiteFooter() {
  return (
    <footer
      id="footer"
      className="pointer-events-auto relative scroll-mt-20 border-t border-border bg-background/92 md:scroll-mt-24 md:bg-card/60 md:backdrop-blur-md"
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-14 md:py-20">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr] md:gap-12">
          <div>
            <div className="flex items-center gap-3">
              <span className="relative flex h-7 w-7 items-center justify-center">
                <span className="absolute h-7 w-7 rounded-full bg-primary/10" />
                <span className="absolute h-4 w-4 rounded-full border border-primary/40" />
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              <span className="flex flex-col leading-none">
                <span className="font-display text-lg font-semibold text-foreground">{BRAND.nameZh}</span>
                <span className="mt-1 text-xs tracking-wider text-muted-foreground">
                  {BRAND.nameEn.toUpperCase()}
                </span>
              </span>
            </div>
            <p className="mt-6 max-w-sm text-sm leading-loose text-muted-foreground">
              个性化纳米疫苗研发。用脂质体载体承载属于每个人的抗原肽，把成本降到普通人可负担的区间。
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-foreground">技术</h3>
            <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
              <li>个性化抗原挖掘</li>
              <li>脂质体纳米载体</li>
              <li>低成本制备工艺</li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-medium text-foreground">联系</h3>
            <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
              <li>合作与咨询：contact@beiguang.life</li>
              <li>媒体与招聘：hr@beiguang.life</li>
              <li>
                <a
                  href="#top"
                  className="group relative mt-2 inline-flex items-center gap-2 overflow-hidden rounded-full border border-border bg-card/75 px-5 py-2.5 text-foreground backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/45 hover:text-primary focus-visible:shadow-focus"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 -translate-x-full -skew-x-12 bg-gradient-to-r from-transparent via-foreground/5 to-transparent transition-transform duration-700 group-hover:translate-x-full"
                  />
                  <span className="relative">预约咨询</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-8 text-xs leading-relaxed text-muted-foreground">
          <span>© 2026 {BRAND.nameZh} {BRAND.nameEn}（示例站点，内容仅用于产品演示）</span>
          <span>本页内容不构成医疗建议</span>
        </div>
      </div>
    </footer>
  )
}
