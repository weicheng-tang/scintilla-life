/**
 * 系统级「减少动效」偏好。
 * 开启时，所有装饰性动画（自转、视差、微粒聚合、膜面起伏、章节轮播）静默停下；
 * 内容驱动的十步滚动锁定不受影响，仍然照常工作。
 * 结果缓存一次，避免每帧 / 每次渲染都去问一次 matchMedia。
 */
let cached: boolean | null = null

export function prefersReducedMotion(): boolean {
  if (cached !== null) return cached
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    cached = false
    return cached
  }
  cached = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  return cached
}
