const STEPS = [
  {
    no: "01",
    title: "无人配料与脂质组装",
    desc: "脂质配料、混合与纳米粒组装全部在密闭管路内自动完成，配方参数随患者批次自动下发，全程无开门操作。",
  },
  {
    no: "02",
    title: "机器人灌装与封装",
    desc: "隔离器内机械臂完成灌装、加塞与轧盖。没有人工干预，就没有人为差错与微生物引入——每一支都是只属于一位患者的独立批次。",
  },
  {
    no: "03",
    title: "在线质检与放行",
    desc: "过程分析技术（PAT）在线检测粒径、锚定率与无菌指标，数据实时入库比对，合格即放行——把质检从终点搬进过程，把放行从「天」压缩到「分钟」。",
  },
]

/**
 * 黑灯工厂。
 * 版式上先给一段「为什么」：个性化疫苗的行业共识瓶颈是制备周期与成本；
 * 再用三段编号块讲产线怎么回答它。背景动画的第四章，就是这条产线的实时演示。
 */
export function FactorySection() {
  return (
    <section id="factory" className="relative scroll-mt-20 border-t border-border md:scroll-mt-24">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 md:py-24">
        <span className="text-xs text-muted-foreground">智能制造</span>
        <h2 className="mt-6 max-w-3xl font-display text-xl font-semibold text-foreground md:text-2xl">
          黑灯工厂：为 N=1 而生的产线
        </h2>
        <p className="mt-6 max-w-2xl text-base leading-loose text-muted-foreground">
          个性化新抗原疫苗的科学有效性已被反复验证，真正卡住它的是制造——每一份疫苗都是独立批次，
          传统路径靠人工在多环节之间串行传递，周期以周计、成本居高不下，这已是领域综述的共识。
          我们的回答不是更多人手，而是一座不留人位置的工厂：灯可以关掉，产线照常运转。
        </p>

        <ol className="mt-10 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:mt-14 md:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.no} className="glass-panel pointer-events-auto bg-card/85 p-6 md:bg-card/70 md:p-8 md:backdrop-blur-md">
              <span className="font-mono text-xs text-primary">{step.no}</span>
              <h3 className="mt-4 font-display text-lg font-semibold text-foreground">{step.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
            </li>
          ))}
        </ol>

        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
          本页背景的第四章三维动画，即为这条产线的工艺演示：西林瓶依次经过灌装、轧盖与在线质检，
          状态灯塔实时指示产线状态。
        </p>
      </div>
    </section>
  )
}
