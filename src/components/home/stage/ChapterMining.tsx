import { useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { MeshTransmissionMaterial } from "@react-three/drei"
import * as THREE from "three"
import type { StageTheme } from "@/lib/stageTheme"
import { chapterById } from "./chapters"
import { ACTIVE_CHAPTER, clamp01, easeInOut, lerp, makeRandom, phaseProgress, type TimeRef } from "./timeline"
import { CellOrganelles, GLASS_SAMPLES, MembraneBumps, createOrganicSphere, useMembraneWobble } from "./organic"

const CHAPTER = chapterById("mining")
const S = CHAPTER.starts
const TOTAL = CHAPTER.total

const HELIX_NODES = 30
const NODE_COUNT = HELIX_NODES * 2
const NODE_SPAN = 6.6
const HELIX_TURNS = 14.5
const SIDE_X = 2.25
const HELIX_R = 0.46

const DIFF_NODES = [5, 11, 17, 21, 25, 28]
const PEPTIDE_COUNT = 3
const CANDIDATE_COUNT = 8
const TOP_COUNT = 3
const FLOW_COUNT = 180
const EXPR_COUNT = 90
const IMMUNE_COUNT = 6

const R_CARRIER = 0.95
const R_HLA = 0.6
const R_TISSUE = 0.7

const TISSUE_NORMAL = [-3.5, 2.7, 0] as const
const TISSUE_TUMOR = [3.5, 2.7, 0] as const

/** 沿双螺旋取点：side = -1 正常组织，+1 肿瘤组织。 */
function helixCoords(side: number, u: number): [number, number, number] {
  const angle = u * HELIX_TURNS
  return [side * SIDE_X + Math.cos(angle) * HELIX_R, -NODE_SPAN / 2 + u * NODE_SPAN, Math.sin(angle) * HELIX_R]
}

/** 候选肽队列：横向一字排开，靠前的就是打分更高的。 */
const CANDIDATE_POS = Array.from({ length: CANDIDATE_COUNT }, (_, i) => {
  const x = -2.9 + (i / (CANDIDATE_COUNT - 1)) * 5.8
  return [x, -1.5, 0] as const
})

/**
 * 统一淡入淡出：第一次遍历时把材质的原始透明度记下来当基准，之后按系数缩放。
 * 这样每个阶段组可以整体淡出，而组内元素各自的透明度动画不受影响。
 */
function applyFade(group: THREE.Object3D | null, k: number) {
  if (!group) return
  group.visible = k > 0.02
  if (!group.visible) return
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh & { material?: THREE.Material | THREE.Material[] }
    if (!mesh.material) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of mats) {
      const mm = m as THREE.Material & { opacity: number }
      if (mm.userData.baseOpacity === undefined) {
        mm.userData.baseOpacity = mm.opacity
        mm.transparent = true
      }
      mm.opacity = (mm.userData.baseOpacity as number) * k
    }
  })
}

export function ChapterMining({ tRef, theme }: { tRef: TimeRef; theme: StageTheme }) {
  const tissueGroupRef = useRef<THREE.Group>(null)
  const needleRef = useRef<THREE.Mesh>(null)
  const helixGroupRef = useRef<THREE.Group>(null)
  const nodeRef = useRef<THREE.InstancedMesh>(null)
  const spotRef = useRef<THREE.InstancedMesh>(null)
  const exprRef = useRef<THREE.InstancedMesh>(null)
  const flowMatRef = useRef<THREE.PointsMaterial>(null)
  const hlaGroupRef = useRef<THREE.Group>(null)
  const hlaCoreRef = useRef<THREE.Mesh>(null)
  const peptideRef = useRef<THREE.InstancedMesh>(null)
  const tcrGroupRef = useRef<THREE.Group>(null)
  const screenGroupRef = useRef<THREE.Group>(null)
  const candidateRef = useRef<THREE.InstancedMesh>(null)
  const winnerRef = useRef<THREE.InstancedMesh>(null)
  const carrierGroupRef = useRef<THREE.Group>(null)
  const carrierRef = useRef<THREE.Mesh>(null)
  const immuneRef = useRef<THREE.InstancedMesh>(null)
  const dummyRef = useRef(new THREE.Object3D())

  // 纳米疫苗载体的膜面流体起伏（只动缩放，和外面那层 grow 动画互不打架）
  useMembraneWobble(carrierRef, { speed: 1.6, amp: 0.03 })

  // —— 有机外形：组织块、载体、免疫细胞都不是完美球体 ——
  const tissueNormalGeo = useMemo(() => createOrganicSphere(R_TISSUE, 4, 71, 0.16), [])
  const tissueTumorGeo = useMemo(() => createOrganicSphere(R_TISSUE, 5, 83, 0.24), [])
  const carrierGeo = useMemo(() => createOrganicSphere(R_CARRIER, 5, 53, 0.05), [])
  const immuneGeo = useMemo(() => createOrganicSphere(0.4, 4, 97, 0.1), [])

  const flowGeo = useMemo(() => {
    const rnd = makeRandom(97)
    const arr = new Float32Array(FLOW_COUNT * 3)
    for (let i = 0; i < FLOW_COUNT; i += 1) {
      const side = i % 2 === 0 ? -1 : 1
      const [x, y, z] = helixCoords(side, rnd())
      arr[i * 3] = x
      arr[i * 3 + 1] = y
      arr[i * 3 + 2] = z
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3))
    return geo
  }, [])

  const flowData = useMemo(() => {
    const rnd = makeRandom(131)
    return Array.from({ length: FLOW_COUNT }, (_, i) => ({
      side: i % 2 === 0 ? -1 : 1,
      offset: rnd(),
      speed: 0.16 + rnd() * 0.22,
    }))
  }, [])

  useEffect(
    () => () => {
      flowGeo.dispose()
      tissueNormalGeo.dispose()
      tissueTumorGeo.dispose()
      carrierGeo.dispose()
      immuneGeo.dispose()
    },
    [flowGeo, tissueNormalGeo, tissueTumorGeo, carrierGeo, immuneGeo],
  )

  // 双序列按实例着色：正常样本取冰蓝体色，肿瘤样本偏病理暖调——两种样本一眼可分。
  // 再叠一层亮度抖动：真实的测序呈现里每个节点的信号强度都不一样，
  // 完美均匀的灯珠列反而假。实例色乘在材质色上，材质基底改白避免双重叠色。
  useEffect(() => {
    const nodes = nodeRef.current
    if (!nodes) return
    const rnd = makeRandom(167)
    const normalCol = new THREE.Color(theme.scene.body)
    const tumorCol = new THREE.Color(theme.primary).lerp(new THREE.Color("hsl(8, 68%, 52%)"), 0.62)
    const scratch = new THREE.Color()
    for (let i = 0; i < NODE_COUNT; i += 1) {
      const jitter = 0.84 + rnd() * 0.32
      scratch.copy(i < HELIX_NODES ? normalCol : tumorCol).multiplyScalar(jitter)
      nodes.setColorAt(i, scratch)
    }
    if (nodes.instanceColor) nodes.instanceColor.needsUpdate = true
  }, [theme])

  useFrame(() => {
    // 隐藏章节直接短路：常驻挂载下不干活，主线程只算当前章
    if (ACTIVE_CHAPTER.current !== "mining") return
    const t = tRef.current
    const p = (i: number) => phaseProgress(t, S, TOTAL, i)
    const dummy = dummyRef.current

    const pBiopsy = p(0)
    const pSeq = p(1)
    const pMut = p(2)
    const pExpr = p(3)
    const pHla = p(4)
    const pBind = p(5)
    const pTcr = p(6)
    const pScreen = p(7)
    const pSynth = p(8)
    const pInfuse = p(9)

    // 各阶段组的整体显隐
    const helixFade = clamp01(pSeq * 3) * (1 - clamp01((pHla - 0.25) * 3))
    // 起点就给一点可见度：动画从头播放或锁在第 1 步时，组织块不能是空的
    const tissueFade = clamp01(0.4 + pBiopsy * 1.8) * (1 - clamp01((pSeq - 0.45) * 3))
    const hlaFade = clamp01((pHla - 0.12) * 2.6) * (1 - clamp01((pSynth - 0.35) * 3))
    const tcrFade = clamp01((pTcr - 0.12) * 2.4) * (1 - clamp01((pScreen - 0.25) * 3))
    const screenFade = clamp01((pScreen - 0.12) * 2.6) * (1 - clamp01((pSynth - 0.45) * 3))
    const carrierFade = clamp01((pSynth - 0.28) * 2.6)

    applyFade(tissueGroupRef.current, tissueFade)
    applyFade(helixGroupRef.current, helixFade)
    applyFade(hlaGroupRef.current, hlaFade)
    applyFade(tcrGroupRef.current, tcrFade)
    applyFade(screenGroupRef.current, screenFade)
    applyFade(carrierGroupRef.current, carrierFade)

    // 阶段 1：组织块在液体里轻微浮动，取样针下降取一小块肿瘤组织
    const tissues = tissueGroupRef.current
    if (tissues) {
      tissues.position.y = Math.sin(t * 0.85) * 0.07
      tissues.rotation.y = Math.sin(t * 0.31) * 0.12
    }
    const needle = needleRef.current
    if (needle) {
      const dive = easeInOut(clamp01(pBiopsy * 1.7))
      const back = easeInOut(clamp01((pBiopsy - 0.6) * 2.6))
      needle.position.y = lerp(5.4, TISSUE_TUMOR[1], dive) + back * 2.6
      needle.rotation.z = Math.sin(t * 1.4) * 0.04
    }

    // 阶段 2：两段序列并排展开
    const nodes = nodeRef.current
    if (nodes) {
      for (let i = 0; i < NODE_COUNT; i += 1) {
        const side = i < HELIX_NODES ? -1 : 1
        const local = i < HELIX_NODES ? i : i - HELIX_NODES
        const u = local / (HELIX_NODES - 1)
        const [x, y, z] = helixCoords(side, u)
        const appear = easeInOut(clamp01((pSeq - local * 0.022) / 0.5))
        dummy.position.set(x, y, z)
        dummy.quaternion.identity()
        dummy.scale.setScalar(Math.max(0.001, appear * 0.1))
        dummy.updateMatrix()
        nodes.setMatrixAt(i, dummy.matrix)
      }
      nodes.instanceMatrix.needsUpdate = true
    }

    // 阶段 2–3：测序读段沿序列流动
    const flowMat = flowMatRef.current
    if (flowMat) {
      const active = pSeq > 0 && t < S[3]
      flowMat.opacity = active ? clamp01(pSeq * 3) * (1 - clamp01((pMut - 0.7) * 2)) * 0.9 : 0
      if (active) {
        const attr = flowGeo.getAttribute("position") as THREE.BufferAttribute
        for (let i = 0; i < FLOW_COUNT; i += 1) {
          const f = flowData[i]
          const u = (t * f.speed + f.offset) % 1
          const angle = u * HELIX_TURNS
          const spread = 0.28 + (i % 5) * 0.06
          attr.setXYZ(
            i,
            f.side * SIDE_X + Math.cos(angle) * spread,
            -NODE_SPAN / 2 + u * NODE_SPAN,
            Math.sin(angle) * spread,
          )
        }
        attr.needsUpdate = true
      }
    }

    // 阶段 3：体细胞突变位点逐个被标出
    const spots = spotRef.current
    if (spots) {
      for (let i = 0; i < DIFF_NODES.length; i += 1) {
        const u = DIFF_NODES[i] / (HELIX_NODES - 1)
        const [x, y, z] = helixCoords(1, u)
        const grow = easeInOut(clamp01((pMut - i * 0.08) / 0.5))
        const pulse = 1 + 0.06 * Math.sin(t * 2.2 + i)
        dummy.position.set(x, y, z)
        dummy.rotation.set(t * 0.6, t * 0.5, 0)
        dummy.scale.setScalar(Math.max(0.001, grow * 0.2 * pulse))
        dummy.updateMatrix()
        spots.setMatrixAt(i, dummy.matrix)
      }
      spots.instanceMatrix.needsUpdate = true
    }

    // 阶段 4：RNA-seq 确认这些突变真的被表达
    const expr = exprRef.current
    if (expr) {
      for (let i = 0; i < EXPR_COUNT; i += 1) {
        const side = i % 2 === 0 ? -1 : 1
        const u = (t * 0.2 + i / EXPR_COUNT) % 1
        const [x, y, z] = helixCoords(side, u)
        const rise = easeInOut(clamp01((pExpr - 0.15) * 2.4))
        dummy.position.set(x * (1 + rise * 0.35), y, z * (1 + rise * 0.35))
        dummy.scale.setScalar(Math.max(0.001, 0.055 * (1 + rise * 0.4)))
        dummy.updateMatrix()
        expr.setMatrixAt(i, dummy.matrix)
      }
      expr.instanceMatrix.needsUpdate = true
    }

    // 阶段 5：HLA 分子出现，代表这位患者的型别
    const hla = hlaGroupRef.current
    if (hla) {
      const grow = easeInOut(clamp01((pHla - 0.12) * 2.6))
      hla.scale.setScalar(Math.max(0.001, grow))
      hla.rotation.y = t * 0.42
      const core = hlaCoreRef.current
      if (core) {
        const mat = core.material as THREE.MeshStandardMaterial
        mat.emissiveIntensity = 0.25 + 0.3 * Math.abs(Math.sin(t * 2.4))
      }
    }

    // 阶段 6：突变肽嵌进 HLA 的结合槽；阶段 9 再现并锚定到脂质体载体表面
    const peptides = peptideRef.current
    if (peptides) {
      for (let i = 0; i < PEPTIDE_COUNT; i += 1) {
        const u = DIFF_NODES[i] / (HELIX_NODES - 1)
        const [sx, sy, sz] = helixCoords(1, u)
        let x = sx
        let y = sy
        let z = sz
        if (pBind > 0) {
          const k = easeInOut(clamp01((pBind - i * 0.13) / 0.55))
          x = lerp(x, 0, k)
          y = lerp(y, R_HLA * 0.26, k)
          z = lerp(z, (i - 1) * 0.17, k)
        }
        // TCR 评估完（阶段 7 后半）抗原肽退场：否则 HLA 组淡出后它们会永远停在画面中央穿模
        const retire = 1 - easeInOut(clamp01((pTcr - 0.55) * 2.2))
        // 阶段 9：标签化长肽重新进场，飞向载体并以固定取向锚定到表面——
        // 这就是「标签技术把抗原接到载体上」的可视化收尾
        const dock = easeInOut(clamp01((pSynth - 0.2) * 2.2))
        const a = i * 2.3 + 0.6
        const dr = R_CARRIER + 0.06
        if (dock > 0) {
          x = lerp(x, Math.cos(a) * dr, dock)
          y = lerp(y, R_CARRIER * 0.62 + Math.sin(a) * dr * 0.42, dock)
          z = lerp(z, Math.sin(a * 1.7) * dr * 0.72, dock)
        }
        dummy.position.set(x, y, z)
        dummy.rotation.set(0, t * 0.5, Math.PI / 2)
        // 旧波（HLA 槽内的肽）按 retire 消失，新波（锚定到载体）按 dock 出现，两者互不相扰
        const scale = Math.max(clamp01(pMut * 2) * retire, dock * (i === 0 ? 1 : 0.85))
        dummy.scale.setScalar(Math.max(0.001, scale))
        dummy.updateMatrix()
        peptides.setMatrixAt(i, dummy.matrix)
      }
      peptides.instanceMatrix.needsUpdate = true
    }

    // 阶段 7：T 细胞受体靠近，评估能不能认出这个复合物
    const tcr = tcrGroupRef.current
    if (tcr) {
      const k = easeInOut(clamp01((pTcr - 0.12) * 2.4))
      tcr.position.set(0, lerp(3.2, R_HLA + 0.62, k), 0)
      tcr.rotation.y = Math.sin(t * 0.6) * 0.35
      tcr.scale.setScalar(Math.max(0.001, k))
    }

    // 阶段 8：候选新抗原排成一列，打分高的浮起来
    const candidates = candidateRef.current
    const winners = winnerRef.current
    if (candidates) {
      for (let i = 0; i < CANDIDATE_COUNT; i += 1) {
        const top = i < TOP_COUNT
        const base = CANDIDATE_POS[i]
        const rise = top ? easeInOut(clamp01((pScreen - 0.35) * 2)) * 0.9 : 0
        const appear = easeInOut(clamp01((pScreen - i * 0.05) / 0.4))
        dummy.position.set(base[0], base[1] + rise + Math.sin(t * 1.4 + i) * 0.03, base[2])
        dummy.rotation.set(0, t * 0.4, 0)
        dummy.scale.setScalar(Math.max(0.001, appear * (top ? 0.15 : 0.095)))
        dummy.updateMatrix()
        candidates.setMatrixAt(i, dummy.matrix)
      }
      candidates.instanceMatrix.needsUpdate = true
    }
    if (winners) {
      for (let i = 0; i < CANDIDATE_COUNT; i += 1) {
        const base = CANDIDATE_POS[i]
        const top = i < TOP_COUNT
        const rise = top ? easeInOut(clamp01((pScreen - 0.35) * 2)) * 0.9 : 0
        const show = top ? easeInOut(clamp01((pScreen - 0.45) * 2.4)) : 0
        const pulse = 1 + 0.16 * Math.sin(t * 5 + i)
        dummy.position.set(base[0], base[1] + rise, base[2])
        dummy.rotation.set(0, t * 0.6, 0)
        dummy.scale.setScalar(Math.max(0.001, show * 0.26 * pulse))
        dummy.updateMatrix()
        winners.setMatrixAt(i, dummy.matrix)
      }
      winners.instanceMatrix.needsUpdate = true
    }

    // 阶段 9：合成长肽，锚定到脂质体载体上
    const carrier = carrierGroupRef.current
    if (carrier) {
      const grow = easeInOut(clamp01((pSynth - 0.28) * 2.6))
      carrier.scale.setScalar(Math.max(0.001, grow))
      carrier.rotation.y = t * 0.28
      const core = carrierRef.current
      if (core) {
        const mat = core.material as THREE.MeshStandardMaterial
        mat.emissiveIntensity = 0.2 + 0.4 * Math.abs(Math.sin(t * 2.2)) * grow
      }
    }

    // 阶段 10：疫苗回输，免疫细胞围上来响应
    const immune = immuneRef.current
    if (immune) {
      for (let i = 0; i < IMMUNE_COUNT; i += 1) {
        const angle = (i / IMMUNE_COUNT) * Math.PI * 2 + t * 0.26
        const r = 2.25 + Math.sin(t * 0.8 + i) * 0.14
        dummy.position.set(
          Math.cos(angle) * r,
          Math.sin(angle * 1.3) * 0.95 - 0.15,
          Math.sin(angle) * r * 0.62,
        )
        dummy.rotation.set(t * 0.3 + i, t * 0.4, 0)
        dummy.scale.setScalar(Math.max(0.001, easeInOut(clamp01((pInfuse - i * 0.06) / 0.5)) * 0.42))
        dummy.updateMatrix()
        immune.setMatrixAt(i, dummy.matrix)
      }
      immune.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <group>
      {/* 阶段 1：肿瘤组织与配对的正常组织 */}
      <group ref={tissueGroupRef}>
        <mesh geometry={tissueNormalGeo} position={[TISSUE_NORMAL[0], TISSUE_NORMAL[1], TISSUE_NORMAL[2]]}>
          <meshPhysicalMaterial
            color={theme.scene.body}
            emissive={theme.scene.emissive}
            emissiveIntensity={0.2}
            transmission={0}
            ior={1.5}
            thickness={0.9}
            transparent
            opacity={0.62}
            roughness={0.38}
            clearcoat={0.7}
            clearcoatRoughness={0.4}
          />
          <MembraneBumps
            radius={R_TISSUE * 1.03}
            count={58}
            color={theme.scene.body}
            emissive={theme.scene.emissive}
            emissiveIntensity={0.4}
            size={0.036}
            seed={71}
          />
        </mesh>
        <mesh geometry={tissueTumorGeo} position={[TISSUE_TUMOR[0], TISSUE_TUMOR[1], TISSUE_TUMOR[2]]}>
          <meshPhysicalMaterial
            color={theme.scene.ink}
            emissive={theme.scene.emissive}
            emissiveIntensity={0.55}
            transmission={0}
            ior={1.5}
            thickness={0.9}
            iridescence={0.08}
            iridescenceIOR={1.3}
            transparent
            opacity={0.82}
            roughness={0.35}
            clearcoat={0.7}
            clearcoatRoughness={0.35}
          />
          <MembraneBumps
            radius={R_TISSUE * 1.03}
            count={58}
            color={theme.scene.ink}
            emissive={theme.scene.emissive}
            emissiveIntensity={0.9}
            size={0.036}
            seed={83}
          />
          <CellOrganelles
            radius={R_TISSUE * 0.6}
            count={7}
            color={theme.scene.ink}
            emissive={theme.scene.emissive}
            emissiveIntensity={0.5}
            opacity={0.42}
            seed={83}
          />
        </mesh>
        {/* 取样针 */}
        <mesh ref={needleRef} position={[TISSUE_TUMOR[0], 5.4, TISSUE_TUMOR[2]]}>
          <cylinderGeometry args={[0.035, 0.05, 2.6, 12]} />
          <meshStandardMaterial
            color={theme.scene.body}
            emissive={theme.scene.emissive}
            emissiveIntensity={0.7}
            roughness={0.25}
            metalness={0.6}
            toneMapped
          />
        </mesh>
      </group>

      {/* 阶段 2–4：双序列、突变位点、表达确认 */}
      <group ref={helixGroupRef}>
        <instancedMesh ref={nodeRef} args={[undefined, undefined, NODE_COUNT]}>
          <sphereGeometry args={[1, 14, 12]} />
          {/* 基底改白：颜色由 instanceColor 按样本给出（正常=冰蓝 / 肿瘤=病理暖调） */}
          <meshStandardMaterial color="#ffffff" emissive={theme.scene.emissive} emissiveIntensity={0.85} toneMapped />
        </instancedMesh>

        <points geometry={flowGeo}>
          <pointsMaterial
            ref={flowMatRef}
            size={0.085}
            color={theme.primary}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped
          />
        </points>

        <instancedMesh ref={spotRef} args={[undefined, undefined, DIFF_NODES.length]}>
          <octahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color={theme.primary} emissive={theme.scene.emissive} emissiveIntensity={1.8} toneMapped />
        </instancedMesh>

        <instancedMesh ref={exprRef} args={[undefined, undefined, EXPR_COUNT]}>
          <sphereGeometry args={[1, 8, 6]} />
          <meshStandardMaterial color={theme.scene.body} emissive={theme.scene.emissive} emissiveIntensity={1.4} toneMapped />
        </instancedMesh>
      </group>

      {/* 阶段 5–6：患者 HLA 分子与嵌进结合槽的突变肽 */}
      <group ref={hlaGroupRef} scale={0}>
        <mesh ref={hlaCoreRef} position={[0, 0.2, 0]}>
          <sphereGeometry args={[R_HLA, 36, 20, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
          <meshPhysicalMaterial
            color={theme.scene.body}
            emissive={theme.scene.emissive}
            emissiveIntensity={0.25}
            transmission={0}
            ior={1.5}
            thickness={1}
            transparent
            opacity={0.45}
            roughness={0.3}
            clearcoat={0.9}
            clearcoatRoughness={0.3}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        {/* 肽结合槽 */}
        <mesh position={[0, 0.22, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.34, 0.3, 0.12, 28, 1, true]} />
          <meshStandardMaterial
            color={theme.primary}
            emissive={theme.scene.emissive}
            emissiveIntensity={0.9}
            transparent
            opacity={0.34}
            side={THREE.DoubleSide}
            toneMapped
          />
        </mesh>
        <pointLight position={[0, 0.3, 0]} color={theme.primary} intensity={1.8} distance={3.5} />
      </group>

      {/* 从突变位点析出的抗原肽 */}
      <instancedMesh ref={peptideRef} args={[undefined, undefined, PEPTIDE_COUNT]}>
        <capsuleGeometry args={[0.055, 0.42, 4, 12]} />
        <meshStandardMaterial color={theme.scene.body} emissive={theme.scene.emissive} emissiveIntensity={1.3} toneMapped />
      </instancedMesh>

      {/* 阶段 7：T 细胞受体 */}
      <group ref={tcrGroupRef} scale={0}>
        {[1, -1].map((side) => (
          <group key={`tcr-${side}`} position={[side * 0.16, 0, 0]} rotation={[0, 0, side * 0.42]}>
            <mesh position={[0, 0.2, 0]}>
              <capsuleGeometry args={[0.045, 0.26, 4, 10]} />
              <meshStandardMaterial color={theme.scene.body} emissive={theme.scene.emissive} emissiveIntensity={1.1} toneMapped />
            </mesh>
            <mesh position={[side * 0.13, 0.46, 0]} rotation={[0, 0, side * 0.7]}>
              <capsuleGeometry args={[0.036, 0.2, 4, 10]} />
              <meshStandardMaterial color={theme.scene.body} emissive={theme.scene.emissive} emissiveIntensity={1.1} toneMapped />
            </mesh>
          </group>
        ))}
      </group>

      {/* 阶段 8：候选新抗原筛选 */}
      <group ref={screenGroupRef}>
        <instancedMesh ref={candidateRef} args={[undefined, undefined, CANDIDATE_COUNT]}>
          <capsuleGeometry args={[0.05, 0.2, 4, 10]} />
          <meshStandardMaterial
            color={theme.scene.ink}
            emissive={theme.scene.emissive}
            emissiveIntensity={0.5}
            transparent
            opacity={0.7}
            toneMapped
          />
        </instancedMesh>
        <instancedMesh ref={winnerRef} args={[undefined, undefined, CANDIDATE_COUNT]}>
          <torusGeometry args={[0.24, 0.018, 8, 28]} />
          <meshStandardMaterial color={theme.primary} emissive={theme.scene.emissive} emissiveIntensity={1.6} toneMapped />
        </instancedMesh>
      </group>

      {/* 阶段 9：长肽锚定到脂质体，形成纳米疫苗 */}
      <group ref={carrierGroupRef} scale={0}>
        <mesh ref={carrierRef} geometry={carrierGeo}>
          {/* 纳米疫苗载体：真实玻璃质感，折射 / 色散 / 体积厚度都给到位 */}
          <MeshTransmissionMaterial
            samples={GLASS_SAMPLES}
            resolution={384}
            color={theme.scene.body}
            thickness={1.2}
            roughness={0.22}
            ior={1.5}
            chromaticAberration={0.02}
            anisotropicBlur={0.12}
            distortion={0.2}
            distortionScale={0.3}
            temporalDistortion={0.05}
            attenuationColor={theme.scene.surface}
            attenuationDistance={2.2}
            backside={false}
          />
          <MembraneBumps
            radius={R_CARRIER * 1.015}
            count={96}
            color={theme.scene.body}
            emissive={theme.scene.emissive}
            emissiveIntensity={0.55}
            size={0.036}
            seed={37}
          />
          <CellOrganelles
            radius={R_CARRIER * 0.6}
            count={6}
            color={theme.scene.body}
            emissive={theme.scene.emissive}
            emissiveIntensity={0.3}
            opacity={0.34}
            seed={37}
          />
        </mesh>
        <mesh>
          <sphereGeometry args={[R_CARRIER * 0.98, 24, 16]} />
          <meshBasicMaterial
            color={theme.primary}
            wireframe
            transparent
            opacity={0.2}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>

      {/* 阶段 10：免疫细胞围上来响应 */}
      <instancedMesh ref={immuneRef} args={[immuneGeo, undefined, IMMUNE_COUNT]}>
        <meshPhysicalMaterial
          color={theme.scene.body}
          emissive={theme.scene.emissive}
          emissiveIntensity={0.55}
          transmission={0}
          ior={1.5}
          thickness={0.8}
          transparent
          opacity={0.72}
          roughness={0.3}
          clearcoat={0.9}
          clearcoatRoughness={0.32}
          sheen={0.6}
          sheenColor={theme.primary}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  )
}
