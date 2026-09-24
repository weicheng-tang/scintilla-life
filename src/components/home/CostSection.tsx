const PROMISES = [
  {
    label: "成本",
    title: "把「专属」从奢侈品做成工业品",
    desc: "个性化疫苗贵，贵在每一份都是 N=1 批次：人工操作、多环节外包、串行等待。无人化产线把可变成本压到接近常规制剂的量级。",
  },
  {
    label: "周期",
    title: "从「以周计」到「以天计」",
    desc: "测序、预测、合成、灌装、质检在同一条封闭链路里并行推进；质检前置进过程，放行不再排队等报告。对术后辅助治疗窗口期的患者，每一天都算数。",
  },
  {
    label: "可及",
    title: "让精准免疫不再挑人",
    desc: "当周期与成本同时下探，个性化疫苗才有机会从临床试验走进常规治疗路径，成为医保与更多患者可讨论的选项，而不是少数人的特权。",
  },
]

/**
 * 成本与周期。
 * 成本对比只画两段实色条，长度按相对比例，不给背景槽也不给具体数字；
 * 三条承诺不装盒子，用发丝分隔排成一条信息带，靠留白与分隔线立住。
 */
export function CostSection() {
  return (
    <section id="cost" className="relative scroll-mt-20 border-t border-border md:scroll-mt-24">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 md:py-24">
        <h2 className="max-w-3xl font-display text-xl font-semibold text-foreground md:text-2xl">
          把个性化疫苗的成本与周期，一起压下来
        </h2>
        <p className="mt-5 max-w-2xl text-base leading-loose text-muted-foreground md:mt-6 md:text-lg">
          新抗原的发现与验证早已不是瓶颈，瓶颈在制造。我们从载体工艺与产线形态两头下手：
          锚定成苗省掉偶联纯化，黑灯工厂省掉人工与等待。
        </p>

        <div className="glass-panel mt-10 rounded-lg border border-border bg-card/85 p-6 md:mt-14 md:bg-card/70 md:p-8 md:backdrop-blur-md">
          <div className="space-y-8">
            <div>
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="text-muted-foreground">传统个性化疫苗路径</span>
                <span className="text-muted-foreground">人工操作 · 环节外包 · 串行等待</span>
              </div>
              <div className="mt-3 h-1.5 w-full rounded-full bg-muted-foreground/30" />
            </div>
            <div>
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="font-medium text-foreground">背光生命路径</span>
                <span className="font-medium text-primary">封闭链路 · 无人产线 · 并行压缩</span>
              </div>
              <div className="mt-3 h-1.5 w-1/3 rounded-full bg-primary" />
            </div>
          </div>
          <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
            示意图，用两条路径的相对长度说明环节数量与成本结构的差异。
          </p>
        </div>

        <div className="mt-10 grid divide-y divide-border border-t border-border md:mt-14 md:grid-cols-3 md:divide-x md:divide-y-0">
          {PROMISES.map((item) => (
            <div
              key={item.label}
              className="py-6 first:pt-0 last:pb-0 md:px-8 md:py-0 md:first:pl-0 md:last:pr-0"
            >
              <span className="text-xs text-muted-foreground">{item.label}</span>
              <h3 className="mt-3 font-display text-lg font-semibold text-foreground">{item.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
