import { useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"

/**
 * 暗色电影场景的氛围层：体积光束 + 发光尘埃。
 * 全部程序化生成，不依赖任何外部贴图 / 模型素材。
 *
 * 电影感的核心不是模型多精细，而是「光在空气里」——
 * 顶部天窗垂下几道缓慢摇摆的光柱，尘埃在光柱里浮沉，
 * 暗场因此有了体积与纵深。
 */

/* ------------------------------------------------------------------ *
 * 体积光束：锥形几何 + 自定义 shader。
 * 亮度 = 轴向衰减（顶部亮、向下渐隐）× 菲涅尔边缘软化（侧边看进去才亮），
 * 加色混合、不写深度、不做深度测试遮挡——它只是「空气被照亮」的错觉。
 * ------------------------------------------------------------------ */

const SHAFT_VERT = /* glsl */ `
  varying float vY;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  void main() {
    vY = position.y;
    vNormalV = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`

const SHAFT_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uHeight;
  varying float vY;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  void main() {
    // 轴向：靠近光源（锥顶）最亮，向下按幂次衰减
    float axial = pow(clamp(vY / uHeight + 0.5, 0.0, 1.0), 1.7);
    // 菲涅尔：视线擦过锥面边缘时最亮，正对锥心反而淡——体积光的关键
    float rim = pow(1.0 - abs(dot(normalize(vNormalV), normalize(vViewV))), 1.35);
    float a = axial * rim * uIntensity;
    gl_FragColor = vec4(uColor * a, a);
  }
`

type LightShaftProps = {
  /** 光柱颜色（取自主光色或主色） */
  color: string
  position: [number, number, number]
  /** 光柱倾角（弧度），让光斜着进来才有方向感 */
  tilt?: [number, number]
  /** 锥高与底面半径 */
  height?: number
  radius?: number
  intensity?: number
  /** 摇摆相位，几道光柱错开节奏 */
  swaySeed?: number
  /** 减少动效：光柱静止 */
  reduced?: boolean
}

export function LightShaft({
  color,
  position,
  tilt = [0.16, -0.1],
  height = 11,
  radius = 2.6,
  intensity = 0.32,
  swaySeed = 0,
  reduced = false,
}: LightShaftProps) {
  const ref = useRef<THREE.Mesh>(null)

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SHAFT_VERT,
        fragmentShader: SHAFT_FRAG,
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uIntensity: { value: intensity },
          uHeight: { value: height },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    [color, intensity, height],
  )

  const geometry = useMemo(
    // 顶部收窄、底部放开：天窗光垂下来的形状；开口锥不做底面，免得出现硬边圆盘
    () => new THREE.CylinderGeometry(radius * 0.16, radius, height, 28, 1, true),
    [radius, height],
  )

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  useFrame((state) => {
    const mesh = ref.current
    if (!mesh) return
    if (reduced) {
      mesh.rotation.set(tilt[0], 0, tilt[1])
      return
    }
    // 极缓慢的摇摆：光柱像跟着空气流动，静止的光柱一眼假
    const t = state.clock.elapsedTime
    mesh.rotation.x = tilt[0] + Math.sin(t * 0.11 + swaySeed) * 0.035
    mesh.rotation.z = tilt[1] + Math.cos(t * 0.087 + swaySeed * 1.7) * 0.035
  })

  return <mesh ref={ref} geometry={geometry} material={material} position={position} />
}

/* ------------------------------------------------------------------ *
 * 发光尘埃：暗场里的微尘被光照亮。加色混合 + 软圆盘贴图，
 * 两层反向慢转 + 呼吸式明暗，比单层静止粒子多一倍生气。
 * ------------------------------------------------------------------ */

/** 软圆点贴图：中心亮、边缘渐隐，尘埃与光斑共用。 */
function createGlowDot(): THREE.Texture {
  if (typeof document === "undefined") return new THREE.Texture()
  const canvas = document.createElement("canvas")
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext("2d")
  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, "rgba(255, 255, 255, 1)")
    grad.addColorStop(0.35, "rgba(255, 255, 255, 0.55)")
    grad.addColorStop(1, "rgba(255, 255, 255, 0)")
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 64, 64)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

type DustLayerProps = {
  count: number
  radius: number
  size: number
  color: string
  opacity: number
  seed: number
  /** 自转方向与速度 */
  spin: number
  texture: THREE.Texture
}

function DustLayer({ count, radius, size, color, opacity, seed, spin, texture }: DustLayerProps) {
  const ref = useRef<THREE.Points>(null)
  const matRef = useRef<THREE.PointsMaterial>(null)

  const geometry = useMemo(() => {
    let state = seed >>> 0
    const rnd = () => {
      state = (state * 1664525 + 1013904223) % 4294967296
      return state / 4294967296
    }
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i += 1) {
      const u = rnd() * Math.PI * 2
      const v = Math.acos(2 * rnd() - 1)
      const r = radius * (0.25 + rnd() * 0.75)
      arr[i * 3] = r * Math.sin(v) * Math.cos(u)
      arr[i * 3 + 1] = r * Math.sin(v) * Math.sin(u) * 0.7
      arr[i * 3 + 2] = r * Math.cos(v)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3))
    return geo
  }, [count, radius, seed])

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame((state, delta) => {
    const points = ref.current
    if (!points) return
    points.rotation.y += Math.min(delta, 0.05) * spin
    points.rotation.x = Math.sin(state.clock.elapsedTime * 0.05 * Math.sign(spin) + seed) * 0.08
    // 呼吸式明暗：尘埃群的亮度慢慢起伏，像远处有光在变化
    const mat = matRef.current
    if (mat) mat.opacity = opacity * (0.72 + 0.28 * Math.sin(state.clock.elapsedTime * 0.4 + seed))
  })

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        ref={matRef}
        map={texture}
        color={color}
        size={size}
        sizeAttenuation
        transparent
        opacity={opacity}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

/** 两层反向慢转的发光尘埃：近层大而稀、远层小而密，叠出空气纵深。 */
export function CinematicDust({ color, reduced = false }: { color: string; reduced?: boolean }) {
  // 移动端配额减半：尘埃是纯装饰，填充率一半照样有空气感，手机帧率优先
  const coarse =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  const texture = useMemo(() => createGlowDot(), [])
  useEffect(() => () => texture.dispose(), [texture])

  if (reduced) return null

  return (
    <group>
      <DustLayer
        count={coarse ? 70 : 140}
        radius={7.5}
        size={0.09}
        color={color}
        opacity={0.55}
        seed={41}
        spin={0.016}
        texture={texture}
      />
      <DustLayer
        count={coarse ? 160 : 320}
        radius={12}
        size={0.055}
        color={color}
        opacity={0.35}
        seed={97}
        spin={-0.011}
        texture={texture}
      />
    </group>
  )
}
