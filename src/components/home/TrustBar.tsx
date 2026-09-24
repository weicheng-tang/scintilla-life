const FACTS = [
  {
    label: "98% 无效表位被滤除",
    desc: "免疫原性多参数模型：结合力 × 表达丰度 × pMHC 稳定性联合过滤，精度 >0.70",
  },
  {
    label: "50% 患者诱导高强度应答",
    desc: "个体化 mRNA 新抗原疫苗 I 期临床：应答者无复发生存期显著延长",
  },
  {
    label: "血清中锚定依然稳定",
    desc: "金属螯合配位锚定：约 1 M 咪唑冲击下仍保持 >75% 结合",
  },
]

/**
 * 首屏之下的事实信息带。
 * 三条事实全部取自同行评议文献的公开数据，作为平台路线的技术依据；
 * 操作说明收在带的右下角：只讲怎么转视角、怎么缩放，不写任何滚动引导。
 */
export function TrustBar() {
  return (
    <section aria-label="核心事实" className="relative">
      <div className="mx-auto w-full max-w-6xl px-6 pb-4 md:pb-6">
        <div className="glass-panel overflow-hidden rounded-lg border border-border bg-card/75 md:backdrop-blur-md">
          <dl className="grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {FACTS.map((item) => (
              <div key={item.label} className="px-5 py-4 md:px-6 md:py-5">
                <dt className="text-sm font-medium text-foreground">{item.label}</dt>
                <dd className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{item.desc}</dd>
              </div>
            ))}
          </dl>
          <p className="flex justify-end border-t border-border px-5 py-2.5 text-xs leading-relaxed text-muted-foreground md:px-6">
            <span className="hidden md:inline">按住左键拖动可旋转视角</span>
            <span className="md:hidden">双指拖动旋转、捏合缩放，双击复位</span>
          </p>
        </div>
      </div>
    </section>
  )
}
