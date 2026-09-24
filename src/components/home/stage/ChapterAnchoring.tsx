import { useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { MeshTransmissionMaterial } from "@react-three/drei"
import * as THREE from "three"
import type { StageTheme } from "@/lib/stageTheme"
import { chapterById } from "./chapters"
import { ACTIVE_CHAPTER, clamp01, easeInOut, lerp, phaseProgress, type TimeRef } from "./timeline"
import { CellOrganelles, GLASS_SAMPLES, MembraneBumps, createOrganicSphere, useMembraneWobble } from "./organic"


const CHAPTER = chapterById("anchoring")
const S = CHAPTER.starts
const TOTAL = CHAPTER.total

const R_SHELL = 1.5
const R_DOCK = 1.62
const R_APPROACH = 4.6
const ANTIGEN_COUNT = 8

const UP = new THREE.Vector3(0, 1, 0)

/** 表面均匀分布的锚定位点（斐波那契球）。 */
const DOCK_DIRS = Array.from({ length: ANTIGEN_COUNT }, (_, i) => {
  const y = 1 - (i / (ANTIGEN_COUNT - 1)) * 2
  const r = Math.sqrt(Math.max(0, 1 - y * y))
  const theta = i * 2.399963
  return new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r).normalize()
})

/** 复用的旋转四元数，免得每帧新建对象 */
const Q_SCRATCH = new THREE.Quaternion()

export function ChapterAnchoring({ tRef, theme }: { tRef: TimeRef; theme: StageTheme }) {
  const bodyRef = useRef<THREE.InstancedMesh>(null)
  const tagRef = useRef<THREE.InstancedMesh>(null)
  const ringRef = useRef<THREE.InstancedMesh>(null)
  const shellRef = useRef<THREE.Mesh>(null)
  const haloRef = useRef<THREE.Group>(null)
  const scratchRef = useRef(new THREE.Vector3())
  const dummyRef = useRef(new THREE.Object3D())

  // 脂质体膜面的流体起伏：三个相位 / 频率不同的正弦叠在缩放上，像被液体轻轻推着
  useMembraneWobble(shellRef, { speed: 2.2, amp: 0.024 })

  const shellGeo = useMemo(() => createOrganicSphere(R_SHELL, 5, 41, 0.045), [])
  const ringGeo = useMemo(() => new THREE.TorusGeometry(0.22, 0.022, 8, 32), [])
  const ringMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(theme.primary),
        // 自发光压暗：浅底上高亮位点靠饱和的 primary 本体色，而不是自发光
        emissive: new THREE.Color(theme.scene.emissive),
        emissiveIntensity: 2.2,
        transparent: true,
        opacity: 0.75,
      }),
    [theme.primary, theme.scene.emissive],
  )

  useEffect(
    () => () => {
      ringGeo.dispose()
      ringMat.dispose()
      shellGeo.dispose()
    },
    [ringGeo, ringMat, shellGeo],
  )

  useFrame(() => {
    // 隐藏章节直接短路：常驻挂载下不干活，主线程只算当前章
    if (ACTIVE_CHAPTER.current !== "anchoring") return
    const t = tRef.current
    const p0 = phaseProgress(t, S, TOTAL, 0)
    const p1 = phaseProgress(t, S, TOTAL, 1)
    const p2 = phaseProgress(t, S, TOTAL, 2)
    const dummy = dummyRef.current

    // 外层装饰壳缓慢翻转：成型的疫苗在溶液里做着布朗式的慢转，画面不死板
    if (haloRef.current) {
      haloRef.current.rotation.y = t * 0.08
      haloRef.current.rotation.x = Math.sin(t * 0.13) * 0.05
    }

    const bodies = bodyRef.current
    const tags = tagRef.current
    const rings = ringRef.current
    if (!bodies || !tags || !rings) return

    for (let i = 0; i < ANTIGEN_COUNT; i += 1) {
      const dir = DOCK_DIRS[i]
      const early = i < 2
      let radius = lerp(R_APPROACH, R_SHELL + 0.5, easeInOut(clamp01(p0)))
      if (early) {
        const k = easeInOut(clamp01((p1 - i * 0.14) / 0.6))
        radius = lerp(radius, R_DOCK, k)
      } else {
        radius = lerp(radius, R_DOCK, easeInOut(clamp01((p2 - (i - 2) * 0.1) / 0.6)))
      }
      const bob = Math.sin(t * 1.6 + i * 1.1) * 0.06 * (1 - clamp01(p2))
      const rr = radius + bob

      // 溶液中混合：靠近段带着角向漂移旋入，落位时回归对接方向——
      // 不是直线冲刺，而是先在溶液里打转再被锚定位点抓住；
      // 接近时抗原还绕自身轴向翻滚，被抓住后定住——刚性平移是没有生命的
      const arrive = easeInOut(clamp01(p0))
      const swirl = (1 - arrive) * (t * 0.5 + i * 1.9)
      const scratch = scratchRef.current.copy(dir).applyAxisAngle(UP, swirl).normalize()

      dummy.position.set(scratch.x * rr, scratch.y * rr, scratch.z * rr)
      dummy.quaternion.setFromUnitVectors(UP, scratch)
      const tumble = (1 - easeInOut(clamp01(p0) * 0.9)) * (t * 1.15 + i * 2.3)
      if (tumble > 0.001) {
        dummy.quaternion.multiply(Q_SCRATCH.setFromAxisAngle(UP, tumble))
      }
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      bodies.setMatrixAt(i, dummy.matrix)

      // 标签朝向载体中心（His 标签 / 点击化学位点）
      dummy.position.set(dir.x * (rr - 0.26), dir.y * (rr - 0.26), dir.z * (rr - 0.26))
      dummy.quaternion.setFromUnitVectors(UP, dir)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      tags.setMatrixAt(i, dummy.matrix)

      // 识别位点高亮环：锚定完成的一瞬「咔哒」一声爆一下光（三角脉冲，做完就退）
      const bindK = early
        ? easeInOut(clamp01((p1 - i * 0.14) / 0.6))
        : easeInOut(clamp01((p2 - (i - 2) * 0.1) / 0.6))
      const snap = Math.max(0, 1 - Math.abs(bindK - 0.92) * 13)
      const flash = 0.85 + 0.06 * Math.sin(t * 2.4 + i * 0.9) + snap * 0.6
      dummy.position.set(dir.x * R_DOCK, dir.y * R_DOCK, dir.z * R_DOCK)
      dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)
      dummy.scale.setScalar(Math.max(0.001, bindK * flash * (1 + snap * 0.4)))
      dummy.updateMatrix()
      rings.setMatrixAt(i, dummy.matrix)
    }

    bodies.instanceMatrix.needsUpdate = true
    tags.instanceMatrix.needsUpdate = true
    rings.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      {/* 脂质体纳米载体：真实玻璃质感 —— 折射采样 + 体积厚度 + 极低色散，
          膜面还有一层噪声形变的有机外形和缓慢的流体起伏，不是一颗几何球 */}
      <mesh ref={shellRef} geometry={shellGeo}>
        <MeshTransmissionMaterial
          samples={GLASS_SAMPLES}
          resolution={384}
          color={theme.scene.body}
          thickness={1.6}
          roughness={0.24}
          ior={1.5}
          chromaticAberration={0.02}
          anisotropicBlur={0.12}
          distortion={0.2}
          distortionScale={0.3}
          temporalDistortion={0.05}
          attenuationColor={theme.scene.surface}
          attenuationDistance={2.6}
          backside={false}
        />
        <MembraneBumps
          radius={R_SHELL * 1.012}
          count={132}
          color={theme.scene.body}
          emissive={theme.scene.emissive}
          emissiveIntensity={0.5}
          size={0.04}
          seed={29}
        />
        {/* 脂质体内部的水相内容物 */}
        <CellOrganelles
          radius={R_SHELL * 0.62}
          count={7}
          color={theme.scene.body}
          emissive={theme.scene.emissive}
          emissiveIntensity={0.3}
          opacity={0.34}
          seed={29}
        />
      </mesh>
      {/* 装饰壳缓慢翻转 */}
      <group ref={haloRef}>
        <mesh>
          <sphereGeometry args={[R_SHELL * 0.97, 28, 18]} />
          <meshBasicMaterial
            color={theme.primary}
            wireframe
            transparent
            opacity={0.22}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        <mesh>
          <sphereGeometry args={[R_SHELL * 0.6, 24, 18]} />
          <meshStandardMaterial
            color={theme.primary}
            emissive={theme.scene.emissive}
            emissiveIntensity={0.5}
            transparent
            opacity={0.12}
            depthWrite={false}
          />
        </mesh>
      </group>
      <pointLight position={[0, 0, 0]} color={theme.primary} intensity={2.4} distance={7} />

      {/* 抗原分子本体 */}
      <instancedMesh ref={bodyRef} args={[undefined, undefined, ANTIGEN_COUNT]}>
        <sphereGeometry args={[0.17, 20, 16]} />
        <meshStandardMaterial color={theme.scene.body} emissive={theme.scene.emissive} emissiveIntensity={1.1} toneMapped />
      </instancedMesh>

      {/* His 标签 / 点击化学手柄 */}
      <instancedMesh ref={tagRef} args={[undefined, undefined, ANTIGEN_COUNT]}>
        <capsuleGeometry args={[0.045, 0.12, 4, 10]} />
        <meshStandardMaterial color={theme.scene.body} emissive={theme.scene.emissive} emissiveIntensity={1.5} toneMapped />
      </instancedMesh>

      {/* 结合位点高亮 */}
      <instancedMesh ref={ringRef} args={[ringGeo, ringMat, ANTIGEN_COUNT]} />
    </group>
  )
}
