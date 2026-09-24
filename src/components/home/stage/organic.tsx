import { useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { prefersReducedMotion } from "./motion"

/**
 * 有机外形工具：让细胞不再是完美球体。
 * 全部程序化生成，不依赖任何外部模型 / 贴图素材。
 */

/**
 * 真实玻璃的折射采样数：桌面 6（肉眼无差别，成本直降四成），触摸端 4。
 * 只算一次，整个场景共用，避免每个材质各判一次媒体查询。
 *
 * 注：MeshTransmissionMaterial 每帧要把整个场景渲进 FBO 再按 samples 折射采样，
 * samples 与分辨率平方都会线性放大开销——这是卡顿的头号来源，动它要克制但坚决。
 */
export const GLASS_SAMPLES =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches
    ? 4
    : 6

/**
 * 膜面的流体起伏：三个不同相位 / 频率的正弦叠在缩放上，
 * 膜看起来像被液体轻轻推着呼吸，而不是一颗静止的玻璃球。
 * 只做缩放微扰（不改顶点缓冲），成本几乎为零，移动端也稳。
 */
export function useMembraneWobble(
  ref: { current: THREE.Object3D | null },
  { speed = 1.1, amp = 0.018 }: { speed?: number; amp?: number } = {},
) {
  const tRef = useRef(0)
  useFrame((_, delta) => {
    const obj = ref.current
    if (!obj) return
    // 系统开启减少动效：膜面停在静止形状，不再呼吸起伏
    if (prefersReducedMotion()) {
      if (obj.scale.x !== 1 || obj.scale.y !== 1 || obj.scale.z !== 1) obj.scale.set(1, 1, 1)
      return
    }
    tRef.current += Math.min(delta, 0.05)
    const t = tRef.current
    obj.scale.set(
      1 + amp * Math.sin(t * speed),
      1 + amp * Math.sin(t * speed * 1.27 + 1.7),
      1 + amp * Math.sin(t * speed * 0.83 + 3.1),
    )
  })
}

/** 低频伪噪声：几个正弦叠加，连续、可重复、无需额外依赖。 */
function organicNoise(x: number, y: number, z: number, seed: number): number {
  return (
    Math.sin(x * 2.7 + seed * 1.7) * 0.5 +
    Math.sin(y * 3.3 - seed * 0.9) * 0.32 +
    Math.sin(z * 2.1 + seed * 2.3) * 0.28 +
    Math.sin((x + y) * 4.4 + seed) * 0.14 +
    Math.sin((y - z) * 5.1 - seed * 1.4) * 0.1
  )
}

/** 在正二十面体上按方向做噪声位移，得到不规则但连续的细胞外形。 */
export function createOrganicSphere(
  radius: number,
  detail: number,
  seed: number,
  amount = 0.075,
): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, detail)
  const pos = geo.getAttribute("position") as THREE.BufferAttribute
  const v = new THREE.Vector3()
  const dir = new THREE.Vector3()
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i)
    dir.copy(v).normalize()
    const n = organicNoise(dir.x, dir.y, dir.z, seed)
    v.copy(dir).multiplyScalar(radius * (1 + n * amount))
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

/** 斐波那契球面点：膜表面受体 / 锚定位点的均匀分布。 */
export function fibonacciSphere(count: number, radius: number): THREE.Vector3[] {
  if (count <= 0) return []
  const out: THREE.Vector3[] = []
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < count; i += 1) {
    const y = count === 1 ? 0 : 1 - (i / (count - 1)) * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = golden * i
    out.push(new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r).multiplyScalar(radius))
  }
  return out
}

type MembraneBumpsProps = {
  radius: number
  count: number
  color: string
  emissive: string
  emissiveIntensity?: number
  size?: number
  seed?: number
}

/** 膜表面受体颗粒：细胞表面一层细密凸起，是「真实细胞感」最省成本的一招。 */
export function MembraneBumps({
  radius,
  count,
  color,
  emissive,
  emissiveIntensity = 0.55,
  size = 0.042,
  seed = 0,
}: MembraneBumpsProps) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => new THREE.SphereGeometry(size, 8, 6), [size])
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        emissive: new THREE.Color(emissive),
        emissiveIntensity,
        roughness: 0.62,
        metalness: 0.05,
      }),
    [color, emissive, emissiveIntensity],
  )

  const points = useMemo(() => fibonacciSphere(count, radius), [count, radius])

  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    const jitter = (i: number) => Math.sin(i * 12.9898 + seed) * 0.5 + Math.sin(i * 4.1414 + seed * 2) * 0.5
    points.forEach((point, i) => {
      dummy.position.copy(point).multiplyScalar(1 + jitter(i) * 0.02)
      dummy.scale.setScalar(0.7 + Math.abs(jitter(i + 7)) * 0.6)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [points, seed])

  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
    },
    [geo, mat],
  )

  return <instancedMesh ref={ref} args={[geo, mat, Math.max(1, count)]} />
}

/**
 * 场景里的悬浮微粒：液体里缓缓浮动的微尘。
 * 暗场上用加色混合让微粒被光「点亮」，靠景深与大小衰减做层次。
 * 接收滚动进度（已阻尼平滑，0~1）：
 * 滚动越深，微粒向场景中心缓缓聚合，幅度比上一版更克制。
 */
export function AmbientMotes({
  count = 260,
  radius = 11,
  color,
  scrollRef,
  reduced = false,
}: {
  count?: number
  radius?: number
  color: string
  scrollRef?: { current: number }
  /** 系统开启减少动效：微粒静止，既不自转也不随滚动向心聚合 */
  reduced?: boolean
}) {
  const ref = useRef<THREE.Points>(null)

  const geo = useMemo(() => {
    const arr = new Float32Array(count * 3)
    let state = 1337
    const rnd = () => {
      state = (state * 1664525 + 1013904223) % 4294967296
      return state / 4294967296
    }
    for (let i = 0; i < count; i += 1) {
      const u = rnd() * Math.PI * 2
      const v = Math.acos(2 * rnd() - 1)
      const r = radius * (0.45 + rnd() * 0.55)
      arr[i * 3] = r * Math.sin(v) * Math.cos(u)
      arr[i * 3 + 1] = r * Math.sin(v) * Math.sin(u) * 0.6
      arr[i * 3 + 2] = r * Math.cos(v)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3))
    return g
  }, [count, radius])

  const mat = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: new THREE.Color(color),
        size: 0.06,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [color],
  )

  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
    },
    [geo, mat],
  )

  useEffect(() => {
    if (reduced) {
      ref.current?.scale.setScalar(1)
      return
    }
    let raf = 0
    const tick = () => {
      const points = ref.current
      if (points) {
        points.rotation.y += 0.00035
        points.rotation.x = Math.sin(performance.now() * 0.00004) * 0.06
        // 滚动视差聚合：微粒整体缩向场景中心，越滚越拢；阻尼插值避免突变（幅度克制）
        const target = 1 - 0.24 * (scrollRef?.current ?? 0)
        const next = points.scale.x + (target - points.scale.x) * 0.05
        points.scale.setScalar(next)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [scrollRef, reduced])

  return <points ref={ref} geometry={geo} material={mat} />
}

/**
 * 把 hsl 字符串加上透明度，供 canvas 渐变用（不引入任何新色相）。
 * 用正则取分量重建而不是字符串拼接：一旦上游给的颜色不合规，这里直接退回中性色，
 * 绝不让 addColorStop 拿到非法字符串把整个场景炸掉。
 */
function withAlpha(hsl: string, alpha: number): string {
  const matched = hsl.match(/hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/)
  if (!matched) return `hsla(0, 0%, 100%, ${alpha})`
  return `hsla(${matched[1]}, ${matched[2]}%, ${matched[3]}%, ${alpha})`
}

/**
 * 虚焦圆盘的遮罩贴图：中心到边缘柔和渐隐，没有硬边。
 * 只画灰度 + alpha，具体颜色由 sprite 的 color 决定（取自 stageTheme），
 * 所以这张贴图本身不引入任何色相。
 */
function createSoftDisc(): THREE.Texture {
  if (typeof document === "undefined") return new THREE.Texture()
  const canvas = document.createElement("canvas")
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext("2d")
  if (ctx) {
    const white = "hsl(0, 0%, 100%)"
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    grad.addColorStop(0, withAlpha(white, 0.85))
    grad.addColorStop(0.6, withAlpha(white, 0.46))
    grad.addColorStop(0.86, withAlpha(white, 0.13))
    grad.addColorStop(1, withAlpha(white, 0))
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 128, 128)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

type BokehBlobsProps = {
  /** 光斑颜色：取自 stageTheme（浅色场景里是柔光箱的暖白或冰蓝），浅底上提亮而不发亮 */
  color: string
  count?: number
  /** 光斑散布半径 */
  spread?: number
  /** 前后景的 z 区间：负值在主体之后，正值挡在镜头之前 */
  zRange?: [number, number]
  sizeRange?: [number, number]
  opacity?: number
  seed?: number
}

/**
 * 微距景深的轻量近似：主体前后各撒一层虚焦光斑。
 * 挡在镜头前的一层大而淡、落在主体之后的一层小而密，
 * 画面因此有「近处失焦、主体清晰」的层次。
 * 暗场上光斑用加色混合微微发光，与 Bloom 后期叠加出电影级焦外。
 */
export function BokehBlobs({
  color,
  count = 10,
  spread = 6.4,
  zRange = [-3.4, 3.2],
  sizeRange = [0.9, 2.8],
  opacity = 0.24,
  seed = 5,
}: BokehBlobsProps) {
  const texture = useMemo(() => createSoftDisc(), [])

  const blobs = useMemo(() => {
    let state = (seed * 2654435761) >>> 0
    const rnd = () => {
      state = (state * 1664525 + 1013904223) % 4294967296
      return state / 4294967296
    }
    return Array.from({ length: count }, () => ({
      position: [
        (rnd() * 2 - 1) * spread,
        (rnd() * 2 - 1) * spread * 0.6,
        zRange[0] + rnd() * (zRange[1] - zRange[0]),
      ] as [number, number, number],
      size: sizeRange[0] + rnd() * (sizeRange[1] - sizeRange[0]),
      alpha: opacity * (0.45 + rnd() * 0.85),
    }))
  }, [count, spread, zRange, sizeRange, opacity, seed])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <group>
      {blobs.map((blob, index) => (
        <sprite key={`bokeh-${index}`} position={blob.position} scale={[blob.size, blob.size, 1]}>
          <spriteMaterial
            map={texture}
            color={color}
            transparent
            opacity={blob.alpha}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </sprite>
      ))}
    </group>
  )
}

type CellOrganellesProps = {
  radius: number
  count?: number
  color: string
  emissive: string
  emissiveIntensity?: number
  opacity?: number
  seed?: number
}

/**
 * 细胞内部结构：在膜内随机散布一组半透明的椭球状细胞器。
 * 半透明的细胞壳里如果什么都没有，看起来就是玻璃球；有内容物才像活的细胞。
 */
export function CellOrganelles({
  radius,
  count = 8,
  color,
  emissive,
  emissiveIntensity = 0.32,
  opacity = 0.4,
  seed = 0,
}: CellOrganellesProps) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => new THREE.CapsuleGeometry(0.055, 0.11, 4, 10), [])
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        emissive: new THREE.Color(emissive),
        emissiveIntensity,
        transparent: true,
        opacity,
        roughness: 0.52,
        metalness: 0.04,
        depthWrite: false,
      }),
    [color, emissive, emissiveIntensity, opacity],
  )

  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    let state = (seed * 7919 + 131) >>> 0
    const rnd = () => {
      state = (state * 1664525 + 1013904223) % 4294967296
      return state / 4294967296
    }
    const dummy = new THREE.Object3D()
    for (let i = 0; i < count; i += 1) {
      const u = rnd() * Math.PI * 2
      const v = Math.acos(2 * rnd() - 1)
      const r = radius * (0.3 + rnd() * 0.6)
      dummy.position.set(
        r * Math.sin(v) * Math.cos(u),
        r * Math.sin(v) * Math.sin(u),
        r * Math.cos(v),
      )
      dummy.rotation.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI)
      dummy.scale.set(0.75 + rnd() * 0.9, 0.8 + rnd() * 1.5, 0.75 + rnd() * 0.9)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [count, radius, seed])

  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
    },
    [geo, mat],
  )

  return <instancedMesh ref={ref} args={[geo, mat, Math.max(1, count)]} />
}
