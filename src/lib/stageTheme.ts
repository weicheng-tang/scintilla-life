// 3D 舞台配色：直接读取 :root 上已烧好的设计 token，保证三维场景与整站视觉完全一致。
// 只做「CSS 变量 -> three 可解析的 hsl 字符串」的转换 + 同色相明度派生，
// 不引入任何与设计系统无关的颜色。
//
// 暗色电影场景（本次重设计）：底色是深青蓝黑，与页面同族；
// 主体是发光的玻璃 / 凝胶质感，自发光这一档被**提亮**成为 Bloom 后期的驱动源，
// 主光用暖白做电影级 key light，轮廓光取主色，让主体从暗场里被光「雕」出来。

export type StageTheme = {
  /** 主色，用于高亮「当前正在发生的动作」 */
  primary: string
  /** 正文色（暗色主题下是浅灰白） */
  foreground: string
  background: string
  card: string
  muted: string
  /**
   * 三维场景专用配色：暗色电影调性。
   */
  scene: {
    /** 场景底色：深青蓝黑，与页面背景同族 */
    backdrop: string
    /** 细胞 / 载体主体：发亮的冰蓝玻璃色，暗场上才立得住 */
    body: string
    /** 膜表面颗粒与细胞内含物：高亮的冰蓝 / 青白 */
    surface: string
    /** 结构骨架：取样针这类部件的冷金属灰 */
    ink: string
    /** 电影主光色：微暖的白，做 key light 与顶部体积光 */
    light: string
    /**
     * 自发光色：暗色场景里被**提亮**为明亮的青蓝。
     * 它是 Bloom 后期的主要驱动源——突变位点、信号流、活化脉冲的辉光全靠它。
     */
    emissive: string
  }
}

const FALLBACK_BASE = {
  primary: "hsl(213, 94%, 62%)",
  foreground: "hsl(214, 32%, 91%)",
  background: "hsl(224, 52%, 4%)",
  card: "hsl(223, 44%, 7%)",
  muted: "hsl(217, 16%, 58%)",
}

/**
 * 把 `221 83% 53%` 这类 CSS 变量值归一化成 three 的 Color 与 canvas 渐变都能解析的
 * `hsl(221, 83%, 53%)`。
 *
 * 注意：token 的分量里**自带百分号**（`83%`），拼装前必须先剥掉再补回，
 * 否则会拼出 `hsl(221, 83%%, 53%%)` 这种非法颜色 —— three 会静默回退成白色、
 * canvas 的 addColorStop 则直接抛错（WebKit 下即 "The string did not match the expected pattern"）。
 */
function toHslString(raw: string, fallback: string): string {
  const parts = raw.replace(/%/g, " ").split(/[\s,/]+/).filter(Boolean)
  if (parts.length < 3) return fallback
  const [h, s, l] = parts
  if (![h, s, l].every((part) => Number.isFinite(Number(part)))) return fallback
  return `hsl(${h}, ${s}%, ${l}%)`
}

function parseHsl(value: string): [number, number, number] | null {
  const matched = value.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/)
  if (!matched) return null
  return [Number(matched[1]), Number(matched[2]), Number(matched[3])]
}

/**
 * 两色之间按 HSL 分量线性插值。
 * 场景配色全部靠它从一个色相族里派生出「深 / 中 / 浅」三档，
 * 绝不引入 token 之外的色相；任一输入非法时原样返回，绝不产出非法字符串。
 */
function mix(a: string, b: string, t: number): string {
  const ha = parseHsl(a)
  const hb = parseHsl(b)
  if (!ha || !hb) return a
  const [h1, s1, l1] = ha
  const [h2, s2, l2] = hb
  // 色相按最短弧插值：token 都在 220 一带，这里只是防止极端取值时绕远路
  let delta = h2 - h1
  if (delta > 180) delta -= 360
  if (delta < -180) delta += 360
  const h = (h1 + delta * t + 360) % 360
  const s = s1 + (s2 - s1) * t
  const l = l1 + (l2 - l1) * t
  return `hsl(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%)`
}

/**
 * 由主色、正文色、底色与青灰色派生整套暗色场景配色，不额外引入任何色相。
 * 四档层次：深黑底（最暗）→ 冷金属骨架 → 冰蓝主体 → 青白高光与自发光（最亮）。
 */
function buildScene(
  primary: string,
  foreground: string,
  background: string,
  muted: string,
): StageTheme["scene"] {
  return {
    // 场景底色：深青蓝黑，和页面背景同族，雾的尽头融进这里
    backdrop: background,
    // 主体：暗场上必须提亮，玻璃折射 / 透射里的凝胶感从这一档取
    body: mix(primary, foreground, 0.52),
    // 膜表面颗粒 / 内含物 / 尘埃：近乎青白，暗场里的高光层
    surface: mix(primary, foreground, 0.78),
    // 结构骨架：冷金属灰，比底色亮但不抢发光主体
    ink: mix(foreground, muted, 0.42),
    // 电影主光色：微暖的白，key light 与体积光都用它，冷暖对比衬出主体
    light: "hsl(38, 32%, 92%)",
    // 自发光：提亮的饱和青蓝，是 Bloom 的驱动源
    emissive: mix(primary, foreground, 0.3),
  }
}

const FALLBACK: StageTheme = {
  ...FALLBACK_BASE,
  scene: buildScene(
    FALLBACK_BASE.primary,
    FALLBACK_BASE.foreground,
    FALLBACK_BASE.background,
    FALLBACK_BASE.muted,
  ),
}

/** 读取当前主题 token。非浏览器环境返回兜底值，绝不抛错。 */
export function readStageTheme(): StageTheme {
  if (typeof window === "undefined" || typeof document === "undefined") return FALLBACK
  const styles = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: string) => {
    const raw = styles.getPropertyValue(name).trim()
    return raw ? toHslString(raw, fallback) : fallback
  }
  const base = {
    primary: read("--primary", FALLBACK_BASE.primary),
    foreground: read("--foreground", FALLBACK_BASE.foreground),
    background: read("--background", FALLBACK_BASE.background),
    card: read("--card", FALLBACK_BASE.card),
    muted: read("--muted-foreground", FALLBACK_BASE.muted),
  }
  return {
    ...base,
    scene: buildScene(base.primary, base.foreground, base.background, base.muted),
  }
}
