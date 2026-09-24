import { useEffect, useState } from "react"
import { BRAND } from "@/lib/brand"

const NAV_ITEMS = [
  { label: "疫苗流程", id: "pipeline" },
  { label: "技术平台", id: "advantages" },
  { label: "黑灯工厂", id: "factory" },
  { label: "成本优势", id: "cost" },
]

/**
 * 滚到哪个区块就把对应的导航项点亮 —— 页面很长，没有这个指示会不知道自己在哪。
 * 判定用视口中间一条窄带（和十步流程高亮同一套办法）：窄带里是谁，当前就是谁。
 * 页脚不再是一个导航项，它只作为「预约咨询」的落点，不参与高亮。
 */
function useActiveSection(): string | null {
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const targets = [...NAV_ITEMS.map((item) => item.id), "top"]
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null)
    if (targets.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((entry) => entry.isIntersecting)
        // 回到首屏就把高亮收掉，别让第一项一直亮着
        if (hit) setActive(hit.target.id === "top" ? null : hit.target.id)
      },
      { rootMargin: "-45% 0px -45% 0px" },
    )
    targets.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return active
}

function NavLink({
  label,
  id,
  active,
  className,
}: {
  label: string
  id: string
  active: boolean
  className: string
}) {
  return (
    <a
      href={`#${id}`}
      className={[
        // 触控适配：py-3 把点击区扩到约 44px 高（Apple HIG / Material 最低触控标准），
        // -my-3 吃掉多出来的行高，外部布局节奏不变；下划线挂在内层文字盒上，
        // 位置与纯文本时代完全一致
        "relative py-3 -my-3 transition-colors duration-300",
        className,
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      <span className="relative whitespace-nowrap pb-1.5">
        {label}
        <span
          className={[
            "absolute bottom-0 left-0 h-px w-full bg-primary transition-opacity duration-300",
            active ? "opacity-100" : "opacity-0",
          ].join(" ")}
        />
      </span>
    </a>
  )
}

/**
 * 顶部导航：窄屏收成一条 56px 的紧凑细条直接贴住屏幕最上方 ——
 * 品牌缩小在左，导航项横向可滑动，「预约咨询」收纳进同一行，
 * 不再出现「品牌一行 + 菜单悬在下面」的两行错位。
 * 桌面端保持一行：品牌 | 导航（滚动高亮）| CTA。
 * 浅色毛玻璃：半透明白底 + 极细描边 + 柔和浅投影，没有发光边框。
 */
export function SiteNav() {
  const active = useActiveSection()

  return (
    <header className="pointer-events-auto glass-panel sticky top-0 z-30 w-full border-b border-border bg-background/90 md:bg-card/70 md:backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 md:h-16 md:gap-8 md:px-6">
        <a href="#top" className="flex shrink-0 items-center gap-2.5 md:gap-3">
          <span className="relative flex h-6 w-6 items-center justify-center md:h-7 md:w-7">
            <span className="absolute h-6 w-6 rounded-full bg-primary/10 md:h-7 md:w-7" />
            <span className="absolute h-3.5 w-3.5 rounded-full border border-primary/40 md:h-4 md:w-4" />
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-base font-semibold text-foreground md:text-lg">
              {BRAND.nameZh}
            </span>
            <span className="mt-1 hidden text-xs tracking-wider text-muted-foreground sm:block">
              {BRAND.nameEn.toUpperCase()}
            </span>
          </span>
        </a>

        <nav className="no-scrollbar flex min-w-0 flex-1 items-center gap-5 overflow-x-auto md:justify-center md:gap-8 md:overflow-visible">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.id}
              label={item.label}
              id={item.id}
              active={active === item.id}
              className="text-xs md:text-sm"
            />
          ))}
        </nav>

        <a
          href="#footer"
          className="btn-soft shrink-0 rounded-full bg-primary px-3.5 py-2.5 text-xs font-medium text-primary-foreground transition-all duration-200 hover:-translate-y-px hover:brightness-105 active:scale-[0.97] focus-visible:shadow-focus md:px-5 md:py-2 md:text-sm"
        >
          预约咨询
        </a>
      </div>
    </header>
  )
}
