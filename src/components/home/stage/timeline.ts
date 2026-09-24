// 阶段动画时间轴的纯函数工具。所有章节共用，保证「阶段时间点」只有一份定义。

/** 时间轴共享引用：章节场景每帧读取，阶段变化时回报给页面层。 */
export type TimeRef = { current: number }

/**
 * 激活章节闸门：章节是常驻的（切换只翻可见性），但 R3F 的 useFrame 订阅
 * 在隐藏时照常执行——四个章节的计算同时在跑会把主线程压垮，间歇性引发
 * 丢帧爆发（观察到「还在闪」的根源）。隐藏章节的重量级动画从这里短路。
 * 场景层每帧写当前章节 id；各章节的 useFrame 开头对不上就 return。
 */
export const ACTIVE_CHAPTER = { current: "mining" }

/**
 * 世界轴距：四章沿着同一条装配线排开，相邻站台相隔这么远。
 * 挖掘(0) → 锚定(-1格) → 工厂(-2格) → 免疫(-3格)，切章时整个世界在站台间滑移。
 * 距离大到站台之间互不穿帮，又落在雾的显影范围内——下一站是从雾里浮现出来的。
 */
export const ZONE_GAP = 42

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function easeInOut(x: number): number {
  const t = clamp01(x)
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

/** 第 index 个阶段内部的推进度：0 = 刚进入该阶段，1 = 该阶段结束。 */
export function phaseProgress(t: number, starts: number[], total: number, index: number): number {
  const from = starts[index] ?? 0
  const to = index + 1 < starts.length ? starts[index + 1] : total
  return clamp01((t - from) / Math.max(0.001, to - from))
}

/** 当前时间落在第几个阶段。 */
export function phaseAt(t: number, starts: number[]): number {
  let index = 0
  for (let i = 0; i < starts.length; i += 1) {
    if (t >= starts[i]) index = i
  }
  return index
}

/** 确定性随机，保证每次重播的粒子分布完全一致。 */
export function makeRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let x = Math.imul(state ^ (state >>> 15), 1 | state)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}
