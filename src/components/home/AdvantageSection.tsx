const ADVANTAGES = [
  {
    title: "AI 驱动的新抗原挖掘",
    desc: "肿瘤与正常组织双样本全外显子组比对，筛出患者独有的体细胞突变；再以整合结合亲和力、表达丰度、pMHC 稳定性与疏水性的免疫原性模型逐条打分。经全球多中心验证的参数体系可滤除 98% 的非免疫原肽，把预测从「穷举猜测」变成「定量筛选」。",
    points: ["WES + RNA-seq 双组学交叉验证", "结合 <34 nM、稳定性 >1.4 h、丰度 >33 TPM 三重阈值", "CD8⁺ 与 CD4⁺ 表位联合预测"],
  },
  {
    title: "金属螯合锚定载体",
    desc: "抗原肽带 His 标签，与脂质体膜上的钴/镍螯合脂质发生配位结合，以固定取向锚定在颗粒表面。展示取向与表位密度直接决定 B 细胞受体的识别效率；配位键在血清环境与高浓度咪唑冲击下依然稳定，且全程常温混合即成苗，无需多轮偶联与纯化。",
    points: ["His 标签 × 金属螯合脂质配位锚定", "取向可控的定向多表位展示", "血清条件下结合稳定、即配即用"],
  },
  {
    title: "黑灯工厂无人化智造",
    desc: "个性化疫苗最大的成本不在原料，而在「每一份都是独立批次」。我们把配料、组装、灌装、封装、质检全部搬进全封闭自动化产线：无开门操作、机器人灌装轧盖、过程分析技术在线放行，让 N=1 批次第一次具备了工业级的批次一致性与可审计性。",
    points: ["全封闭隔离器内无人操作", "机器人灌装、加塞、轧盖", "PAT 在线质检，合格即放行"],
  },
]

/**
 * 技术平台。
 * 不排三张等宽卡：第一项占满整行做主体，后两项并排为次，
 * 版式上有主次，读起来才知道哪一段是链路的地基。
 */
export function AdvantageSection() {
  const [lead, ...rest] = ADVANTAGES

  return (
    <section id="advantages" className="relative scroll-mt-20 border-t border-border md:scroll-mt-24">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 md:py-24">
        <h2 className="max-w-3xl font-display text-xl font-semibold text-foreground md:text-2xl">
          三段能力，串成一条完整的个性化疫苗链路
        </h2>
        <p className="mt-5 max-w-2xl text-base leading-loose text-muted-foreground">
          算得准、锚得稳、造得快——缺任何一段，个性化疫苗都停在实验室里。
        </p>

        <div className="mt-10 grid gap-5 md:mt-14 md:gap-6">
          <div className="glass-panel pointer-events-auto rounded-lg border border-border bg-card/85 p-6 transition-colors duration-300 md:grid md:grid-cols-[1.15fr_1fr] md:items-start md:gap-10 md:bg-card/70 md:p-9 md:backdrop-blur-md">
            <div>
              <h3 className="font-display text-xl font-semibold text-foreground md:text-2xl">{lead.title}</h3>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
                {lead.desc}
              </p>
            </div>
            <ul className="mt-6 space-y-3 md:mt-0 md:border-l md:border-border md:pl-10">
              {lead.points.map((point) => (
                <li key={point} className="flex items-center gap-3 text-sm text-foreground">
                  <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-5 md:grid-cols-2 md:gap-6">
            {rest.map((item) => (
              <div
                key={item.title}
                className="glass-panel pointer-events-auto flex h-full flex-col rounded-lg border border-border bg-card/85 p-6 transition-colors duration-300 md:bg-card/70 md:p-8 md:backdrop-blur-md"
              >
                <h3 className="font-display text-lg font-semibold text-foreground">{item.title}</h3>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
                <ul className="mt-6 space-y-2.5 border-t border-border pt-6 md:mt-auto">
                  {item.points.map((point) => (
                    <li key={point} className="flex items-center gap-3 text-sm text-foreground">
                      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
