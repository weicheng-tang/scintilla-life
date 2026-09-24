import { useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { CellOrganelles, MembraneBumps, createOrganicSphere, fibonacciSphere, useMembraneWobble } from "./organic"
import * as THREE from "three"
import type { StageTheme } from "@/lib/stageTheme"
import { chapterById } from "./chapters"
import { ACTIVE_CHAPTER, clamp01, easeInOut, lerp, makeRandom, phaseProgress, type TimeRef } from "./timeline"

const CHAPTER = chapterById("immune")
const S = CHAPTER.starts
const TOTAL = CHAPTER.total

/* ———— 空间布局：左 = 免疫器官区（APC/B/T），右 = 战场区（病原体/肿瘤）。
   一条从左到右的因果轴：疫苗进入 APC → 提呈 → 活化扩增 → 效应细胞向右迁移 → 杀伤 ———— */
const R_APC = 1.7
const R_CELL = 0.95
const APC_POS = new THREE.Vector3(-3.4, 0.2, 0)
const B_POS = new THREE.Vector3(-1.7, -1.25, 0.3)
const T_POS = new THREE.Vector3(-0.7, 1.15, -0.2)
const PLASMA_POS = new THREE.Vector3(-0.6, -2.0, 0.4)
const TUMOR_POS = new THREE.Vector3(4.3, -1.0, 0.4)
const PATHOGEN_POS = new THREE.Vector3(4.7, 1.35, -0.2)

/* 纳米疫苗主角的入场路径：从左缘外沿弧线漂向 APC 表面 */
const VACCINE_START = new THREE.Vector3(-6.6, 1.5, 0.7)
const VACCINE_CTRL = new THREE.Vector3(-5.2, 2.5, 0.2)
const VACCINE_SURF_DIR = new THREE.Vector3(0.85, 0.45, 0.1).normalize()

const MARKER_COUNT = 6
const ANTIBODY_COUNT = 5
const CTL_COUNT = 2
const CLONE_COUNT = 2
const SPIKE_COUNT = 8
const FLOW_COUNT = 60
const FRAGMENT_COUNT = 90
const DEBRIS_COUNT = 60
const LYMPH_COUNT = 60

const UP = new THREE.Vector3(0, 1, 0)
const tmpA = new THREE.Vector3()
const tmpB = new THREE.Vector3()
const tmpC = new THREE.Vector3()
const tmpD = new THREE.Vector3()

/* CTL 出发时的散布偏移（相对 T 细胞） */
const CTL_STARTS: [number, number, number][] = [
  [0.55, 0.7, 0.2],
  [-0.5, 0.95, -0.25],
]

/** 二次贝塞尔取点（作用在 out 上，避免每帧分配） */
function bezier(out: THREE.Vector3, a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, u: number) {
  const mu = 1 - u
  out.set(
    mu * mu * a.x + 2 * mu * u * c.x + u * u * b.x,
    mu * mu * a.y + 2 * mu * u * c.y + u * u * b.y,
    mu * mu * a.z + 2 * mu * u * c.z + u * u * b.z,
  )
  return out
}

function normalize(x: number, y: number, z: number) {
  const len = Math.hypot(x, y, z) || 1
  return new THREE.Vector3(x / len, y / len, z / len)
}

/* 提呈标记在 APC 表面的分布方向 */
const MARKER_DIRS = [
  normalize(0.2, 0.9, 0.35),
  normalize(0.85, 0.35, -0.4),
  normalize(-0.55, 0.7, 0.45),
  normalize(-0.9, -0.1, 0.4),
  normalize(0.35, -0.85, 0.35),
  normalize(-0.2, -0.5, -0.85),
]

/* 接触桥端点：桥从 APC 表面伸向 T 细胞、从 T 表面伸向 B 细胞 */
const BRIDGE_A_A = APC_POS.clone().addScaledVector(normalize(0.55, -0.55, 0), R_APC - 0.06)
const BRIDGE_A_B = T_POS.clone().addScaledVector(normalize(-0.8, -0.5, 0), R_CELL - 0.05)
const BRIDGE_B_A = T_POS.clone().addScaledVector(normalize(-0.35, -0.8, 0), R_CELL - 0.05)
const BRIDGE_B_B = B_POS.clone().addScaledVector(normalize(0.4, 0.85, 0), R_CELL - 0.05)

/* 抗体命中点：病原体表面的均匀分布 */
const ANTIBODY_SURF = [
  normalize(0.4, 0.8, 0.25),
  normalize(-0.7, 0.5, -0.3),
  normalize(0.75, -0.3, 0.4),
  normalize(-0.3, -0.75, 0.5),
  normalize(0.1, 0.35, -0.9),
].map((d) => d.clone().multiplyScalar(0.6))

/* CTL 抵达点：肿瘤表面朝向 T 细胞的一侧 */
const CTL_LAND = [
  normalize(-0.85, 0.35, 0.15).multiplyScalar(0.78),
  normalize(-0.7, -0.5, 0.3).multiplyScalar(0.78),
]

function AntibodyShape({ body, glow }: { body: string; glow: string }) {
  const armMat = (
    <meshStandardMaterial color={body} emissive={glow} emissiveIntensity={0.95} toneMapped />
  )
  return (
    <group>
      {/* 主干（铰链区）：飞向病灶时这条尾巴在后 */}
      <mesh position={[0, -0.04, 0]}>
        <capsuleGeometry args={[0.032, 0.16, 4, 8]} />
        <meshStandardMaterial color={body} emissive={glow} emissiveIntensity={0.7} toneMapped />
      </mesh>
      {/* 两条 Fab 臂：张开的经典 Y 形 */}
      {[
        [-0.075, 0.245, 0.55],
        [0.075, 0.245, -0.55],
      ].map(([x, y, rz]) => (
        <mesh key={rz} position={[x, y, 0]} rotation={[0, 0, rz]}>
          <capsuleGeometry args={[0.026, 0.12, 4, 8]} />
          {armMat}
        </mesh>
      ))}
      {/* Fab 端的结合域小球 */}
      {[
        [-0.135, 0.335],
        [0.135, 0.335],
      ].map(([x, y]) => (
        <mesh key={`${x}-${y}`} position={[x, y, 0]}>
          <sphereGeometry args={[0.042, 10, 10]} />
          {armMat}
        </mesh>
      ))}
    </group>
  )
}

export function ChapterImmune({ tRef, theme }: { tRef: TimeRef; theme: StageTheme }) {
  const vaccineRef = useRef<THREE.Group>(null)
  const vaccineSpikeRef = useRef<THREE.InstancedMesh>(null)
  const endosomeRef = useRef<THREE.Mesh>(null)
  const apcRef = useRef<THREE.Mesh>(null)
  const markerRef = useRef<THREE.InstancedMesh>(null)
  const bridgeARef = useRef<THREE.Mesh>(null)
  const bridgeBRef = useRef<THREE.Mesh>(null)
  const flowRef = useRef<THREE.Points>(null)
  const flowMatRef = useRef<THREE.PointsMaterial>(null)
  const bCellRef = useRef<THREE.Mesh>(null)
  const tCellRef = useRef<THREE.Mesh>(null)
  const cloneRef = useRef<THREE.InstancedMesh>(null)
  const plasmaRef = useRef<THREE.Mesh>(null)
  const antibodyRefs = useRef<(THREE.Group | null)[]>([])
  const ctlRef = useRef<THREE.InstancedMesh>(null)
  const pathogenRef = useRef<THREE.Mesh>(null)
  const tumorRef = useRef<THREE.Mesh>(null)
  const fragGroupRef = useRef<THREE.Points>(null)
  const fragMatRef = useRef<THREE.PointsMaterial>(null)
  const debrisGroupRef = useRef<THREE.Points>(null)
  const debrisMatRef = useRef<THREE.PointsMaterial>(null)
  const lymphRef = useRef<THREE.Points>(null)
  const killLightRef = useRef<THREE.PointLight>(null)

  const dummyRef = useRef(new THREE.Object3D())

  // 提呈细胞膜面的流体起伏：被组织液轻轻推着呼吸（只动缩放，与位置动画互不干扰）
  useMembraneWobble(apcRef, { speed: 1.2, amp: 0.018 })

  const apcInnerGeo = useMemo(() => createOrganicSphere(R_APC * 0.93, 4, 3, 0.05), [])
  const apcGeo = useMemo(() => createOrganicSphere(R_APC, 5, 3, 0.05), [])
  const bCellGeo = useMemo(() => createOrganicSphere(R_CELL, 4, 7, 0.085), [])
  const tCellGeo = useMemo(() => createOrganicSphere(R_CELL, 4, 11, 0.085), [])
  const cloneGeo = useMemo(() => createOrganicSphere(0.42, 3, 71, 0.1), [])
  const plasmaGeo = useMemo(() => createOrganicSphere(0.78, 4, 61, 0.09), [])
  const ctlGeo = useMemo(() => createOrganicSphere(0.44, 4, 31, 0.09), [])
  const pathogenGeo = useMemo(() => createOrganicSphere(0.62, 4, 17, 0.17), [])
  const tumorGeo = useMemo(() => createOrganicSphere(0.82, 5, 23, 0.2), [])
  const endosomeGeo = useMemo(() => createOrganicSphere(0.3, 3, 67, 0.12), [])

  /* 疫苗主角的表面抗原刺突方向 */
  const spikeDirs = useMemo(() => fibonacciSphere(SPIKE_COUNT, 1), [])

  /* 加工碎片：APC 体内的小范围点云 */
  const fragmentGeo = useMemo(() => {
    const rnd = makeRandom(11)
    const arr = new Float32Array(FRAGMENT_COUNT * 3)
    for (let i = 0; i < FRAGMENT_COUNT; i += 1) {
      const r = Math.cbrt(rnd()) * 0.72
      const theta = rnd() * Math.PI * 2
      const phi = Math.acos(2 * rnd() - 1)
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      arr[i * 3 + 2] = r * Math.cos(phi)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3))
    return geo
  }, [])

  /* 信号流粒子：前半沿桥 A（APC→T），后半沿桥 B（T→B） */
  const flowData = useMemo(() => {
    const rnd = makeRandom(29)
    return Array.from({ length: FLOW_COUNT }, (_, i) => ({
      bridge: i < FLOW_COUNT / 2 ? 0 : 1,
      offset: rnd(),
      speed: 0.3 + rnd() * 0.35,
      side: (rnd() - 0.5) * 0.22,
    }))
  }, [])

  const flowGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(FLOW_COUNT * 3), 3))
    return geo
  }, [])

  /* 肿瘤碎裂碎片：以肿瘤为中心的爆发点云 */
  const debrisGeo = useMemo(() => {
    const rnd = makeRandom(53)
    const arr = new Float32Array(DEBRIS_COUNT * 3)
    for (let i = 0; i < DEBRIS_COUNT; i += 1) {
      const dir = normalize(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1)
      const r = 0.35 + rnd() * 1.3
      arr[i * 3] = dir.x * r
      arr[i * 3 + 1] = dir.y * r
      arr[i * 3 + 2] = dir.z * r
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3))
    return geo
  }, [])

  /* 组织液流场：粒子从左向右漂，暗示淋巴流动方向 */
  const lymphData = useMemo(() => {
    const rnd = makeRandom(401)
    return Array.from({ length: LYMPH_COUNT }, () => ({
      x: -6.2 + rnd() * 11.6,
      y: -2.4 + rnd() * 4.6,
      z: -1.4 + rnd() * 1.9,
      speed: 0.22 + rnd() * 0.26,
    }))
  }, [])

  const lymphGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(LYMPH_COUNT * 3), 3))
    return geo
  }, [])

  useEffect(
    () => () => {
      fragmentGeo.dispose()
      flowGeo.dispose()
      debrisGeo.dispose()
      lymphGeo.dispose()
      apcGeo.dispose()
      apcInnerGeo.dispose()
      bCellGeo.dispose()
      tCellGeo.dispose()
      cloneGeo.dispose()
      plasmaGeo.dispose()
      ctlGeo.dispose()
      pathogenGeo.dispose()
      tumorGeo.dispose()
      endosomeGeo.dispose()
    },
    [fragmentGeo, flowGeo, debrisGeo, lymphGeo, apcGeo, apcInnerGeo, bCellGeo, tCellGeo, cloneGeo, plasmaGeo, ctlGeo, pathogenGeo, tumorGeo, endosomeGeo],
  )

  useFrame(() => {
    // 隐藏章节直接短路：常驻挂载下不干活，主线程只算当前章
    if (ACTIVE_CHAPTER.current !== "immune") return
    const t = tRef.current
    const p = (i: number) => phaseProgress(t, S, TOTAL, i)
    const p0 = p(0)
    const p1 = p(1)
    const p2 = p(2)
    const p3 = p(3)
    const p4 = p(4)
    const p5 = p(5)
    const dummy = dummyRef.current

    /* ———— 主角：纳米疫苗漂入 → 贴膜 → 胞吞消失 ———— */
    const vaccine = vaccineRef.current
    if (vaccine) {
      const arrive = easeInOut(clamp01(p0 * 1.3))
      bezier(tmpA, VACCINE_START, VACCINE_CTRL, tmpB.copy(APC_POS).addScaledVector(VACCINE_SURF_DIR, R_APC + 0.12), arrive)
      const bob = Math.sin(t * 1.9) * 0.05 * (1 - arrive)
      vaccine.position.set(tmpA.x, tmpA.y + bob, tmpA.z)
      vaccine.rotation.set(t * 0.35, t * 0.5, 0)
      // 末段被膜包裹吞入：阶段 1 前半整个主角收进 APC
      const swallowed = easeInOut(clamp01((p0 - 0.72) * 6)) * 0.5 + easeInOut(clamp01(p1 * 2.2)) * 0.5
      vaccine.scale.setScalar(Math.max(0.001, 1 - clamp01(swallowed)))
      const spikes = vaccineSpikeRef.current
      if (spikes) {
        for (let i = 0; i < SPIKE_COUNT; i += 1) {
          const dir = spikeDirs[i]
          dummy.position.copy(dir).multiplyScalar(0.3)
          dummy.quaternion.setFromUnitVectors(UP, dir)
          dummy.scale.setScalar(1)
          dummy.updateMatrix()
          spikes.setMatrixAt(i, dummy.matrix)
        }
        spikes.instanceMatrix.needsUpdate = true
      }
    }

    /* ———— 吞噬泡：阶段 2 在 APC 体内长大、碎裂 ———— */
    const endosome = endosomeRef.current
    if (endosome) {
      const grow = easeInOut(clamp01(p1 * 1.6)) * (1 - clamp01((p1 - 0.72) * 3.4))
      endosome.scale.setScalar(Math.max(0.001, grow))
      endosome.rotation.set(t * 0.9, t * 0.7, 0)
    }

    /* ———— 提呈细胞：加工期内部活跃，提呈期表面增亮，缓慢漂移 ———— */
    const apc = apcRef.current
    if (apc) {
      const mat = apc.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = 0.18 + 0.45 * p2 + 0.05 * Math.sin(t * 1.6) * clamp01(p1)
      apc.position.set(
        APC_POS.x + Math.sin(t * 0.47) * 0.06,
        APC_POS.y + Math.cos(t * 0.39) * 0.05,
        APC_POS.z + Math.sin(t * 0.53) * 0.06,
      )
    }

    /* ———— pMHC 提呈标记：阶段 3 起在 APC 表面长出 ———— */
    const markers = markerRef.current
    if (markers) {
      for (let i = 0; i < MARKER_COUNT; i += 1) {
        const dir = MARKER_DIRS[i]
        const grow = easeInOut(clamp01((p2 - i * 0.07) / 0.6))
        dummy.position.set(
          APC_POS.x + dir.x * (R_APC + 0.07),
          APC_POS.y + dir.y * (R_APC + 0.07),
          APC_POS.z + dir.z * (R_APC + 0.07),
        )
        dummy.scale.setScalar(Math.max(0.001, grow))
        dummy.rotation.set(t * 0.4 + i, 0, t * 0.3)
        dummy.updateMatrix()
        markers.setMatrixAt(i, dummy.matrix)
      }
      markers.instanceMatrix.needsUpdate = true
    }

    /* ———— 细胞内加工碎片：阶段 2 活跃、阶段 3 淡出 ———— */
    const fragMat = fragMatRef.current
    const fragPoints = fragGroupRef.current
    if (fragMat && fragPoints) {
      fragMat.opacity = p1 > 0 ? (1 - clamp01(p2 * 1.25)) * 0.9 : 0
      fragPoints.position.set(APC_POS.x, APC_POS.y, APC_POS.z)
      fragPoints.rotation.set(t * 0.32, t * 0.78, 0)
      fragPoints.scale.setScalar(lerp(0.4, 1, easeInOut(clamp01(p1 * 1.6))))
    }

    /* ———— 接触桥 + 信号流：APC→T（阶段 4 起）、T→B（阶段 5 起） ———— */
    const placeBridge = (mesh: THREE.Mesh | null, a: THREE.Vector3, b: THREE.Vector3, k: number) => {
      if (!mesh) return
      mesh.visible = k > 0.01
      if (!mesh.visible) return
      mesh.position.copy(tmpA.addVectors(a, b).multiplyScalar(0.5))
      tmpB.subVectors(b, a)
      const len = tmpB.length()
      mesh.scale.set(1, len, 1)
      mesh.quaternion.setFromUnitVectors(UP, tmpB.normalize())
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = (0.1 + 0.08 * Math.abs(Math.sin(t * 2.4))) * k
    }
    // 桥与信号流的窗口（绝对时间门）：桥 A = 提呈/活化期（S3→S5+），桥 B = 辅助期（S4→S6+）
    const gateA = clamp01((t - S[3]) * 2.2) * (1 - clamp01((t - S[5] - 0.5) * 1.6))
    const gateB = clamp01((t - S[4]) * 2.2) * (1 - clamp01((t - S[6] + 0.2) * 1.8))
    placeBridge(bridgeARef.current, BRIDGE_A_A, BRIDGE_A_B, gateA)
    placeBridge(bridgeBRef.current, BRIDGE_B_A, BRIDGE_B_B, gateB)

    const flowMat = flowMatRef.current
    const flowPoints = flowRef.current
    if (flowMat && flowPoints) {
      flowMat.opacity = Math.max(gateA, gateB) * 0.85
      flowPoints.visible = flowMat.opacity > 0.01
      if (flowPoints.visible) {
        const attr = flowGeo.getAttribute("position") as THREE.BufferAttribute
        for (let i = 0; i < FLOW_COUNT; i += 1) {
          const f = flowData[i]
          const a = f.bridge === 0 ? BRIDGE_A_A : BRIDGE_B_A
          const b = f.bridge === 0 ? BRIDGE_B_A : BRIDGE_B_B
          const u = (t * f.speed + f.offset) % 1
          bezier(tmpC, a, tmpA.addVectors(a, b).multiplyScalar(0.5).add(tmpB.set(f.side, 0.18 * Math.sin(t * 2 + i), f.side * 0.6)), b, u)
          attr.setXYZ(i, tmpC.x, tmpC.y, tmpC.z)
        }
        attr.needsUpdate = true
      }
    }

    /* ———— B 细胞：阶段 4 识别微亮 ———— */
    const bCell = bCellRef.current
    if (bCell) {
      bCell.position.set(
        B_POS.x + Math.sin(t * 0.61) * 0.05,
        B_POS.y + Math.cos(t * 0.44) * 0.05,
        B_POS.z + Math.sin(t * 0.55) * 0.05,
      )
      const recognized = easeInOut(clamp01((p3 - 0.3) * 2))
      const mat = bCell.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = 0.2 + recognized * 0.45
    }

    /* ———— T 细胞：阶段 5 活化脉冲 ———— */
    const activated = easeInOut(p4)
    const tCell = tCellRef.current
    if (tCell) {
      tCell.position.set(
        T_POS.x + Math.cos(t * 0.57) * 0.05,
        T_POS.y + Math.sin(t * 0.41) * 0.05,
        T_POS.z + Math.cos(t * 0.63) * 0.05,
      )
      tCell.scale.setScalar(1 + 0.025 * Math.sin(t * 2.4) * clamp01(p4))
      const mat = tCell.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = 0.2 + activated * 1.2
    }

    /* ———— 克隆扩增：T 旁长出两个克隆小 T，缓慢绕转 ———— */
    const clones = cloneRef.current
    if (clones) {
      const grow = easeInOut(clamp01((p5 - 0.2) * 2.2))
      for (let i = 0; i < CLONE_COUNT; i += 1) {
        const angle = (i / CLONE_COUNT) * Math.PI * 2 + t * 0.3
        dummy.position.set(
          T_POS.x + Math.cos(angle) * 1.15,
          T_POS.y + Math.sin(angle) * 0.7 - 0.1,
          T_POS.z + Math.sin(angle) * 0.5,
        )
        dummy.scale.setScalar(Math.max(0.001, grow * (i === 0 ? 1 : 0.85)))
        dummy.rotation.set(t * 0.2 + i, t * 0.3, 0)
        dummy.updateMatrix()
        clones.setMatrixAt(i, dummy.matrix)
      }
      clones.instanceMatrix.needsUpdate = true
    }

    /* ———— 浆细胞：阶段 5 后半从 B 旁分化、滑到抗体工厂位 ———— */
    const plasma = plasmaRef.current
    if (plasma) {
      const born = easeInOut(clamp01((p5 - 0.35) * 2.2))
      plasma.scale.setScalar(Math.max(0.001, born))
      plasma.position.set(
        lerp(B_POS.x, PLASMA_POS.x, born) + Math.sin(t * 0.5) * 0.04,
        lerp(B_POS.y, PLASMA_POS.y, born) + Math.cos(t * 0.42) * 0.04,
        lerp(B_POS.z, PLASMA_POS.z, born),
      )
      const mat = plasma.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = 0.3 + born * 0.5 + 0.15 * Math.sin(t * 3.4) * born
    }

    /* ———— 抗体：阶段 7 从浆细胞成串射出，弧线飞向病原体并吸附包被 ————
        时序按绝对时间：起飞 S6 + i*0.4s，飞行 3.6s，最后一枚在阶段 9 前落位 ———— */
    const T6 = S[6]
    let landedSum = 0
    for (let i = 0; i < ANTIBODY_COUNT; i += 1) {
      const group = antibodyRefs.current[i]
      if (!group) continue
      const g = clamp01((t - T6 - i * 0.4) / 3.6) // 飞行进度
      if (g >= 1) landedSum += 1
      const surface = tmpB.copy(PATHOGEN_POS).add(ANTIBODY_SURF[i])
      const start = tmpC.copy(PLASMA_POS)
      start.y += 0.35
      const ctrl = tmpA.copy(start).lerp(surface, 0.45)
      ctrl.y += 1.15
      ctrl.x += 0.4
      const fl = easeInOut(g)
      // 输出走 tmpD：out 不能和控制点（tmpA）共用，否则读写同一向量会互相污染
      bezier(tmpD, start, ctrl, surface, fl)
      group.position.copy(tmpD)
      // 飞行途中翻滚，命中后贴附微呼吸
      if (g < 1) group.rotation.set(t * 0.6 + i, t * 0.45, Math.sin(t + i) * 0.4)
      else group.rotation.set(0.35 + Math.sin(t * 2 + i) * 0.08, i * 1.3, 0)
      const pop = easeInOut(clamp01((g - 0.02) * 12))
      group.scale.setScalar(Math.max(0.001, 0.9 * pop))
    }

    /* ———— CTL：阶段 8 从 T 出发飞抵肿瘤；抵达瞬间 = 光爆与碎裂的时序锚 ———— */
    const T7 = S[7]
    const ctls = ctlRef.current
    // 第一枚 CTL 的抵达进度（决定杀伤事件的触发时机）
    const hitArrive = easeInOut(clamp01((t - T7 - 0.4) / 2.9))
    if (ctls) {
      const spawn = easeInOut(clamp01((p5 - 0.5) * 2))
      for (let i = 0; i < CTL_COUNT; i += 1) {
        const g = easeInOut(clamp01((t - T7 - 0.4 - i * 0.5) / 2.9))
        const off = CTL_STARTS[i]
        const land = tmpB.copy(TUMOR_POS).add(CTL_LAND[i])
        const start = tmpC.copy(T_POS).add(tmpD.set(off[0] * 0.8, off[1] * 0.8, off[2]))
        const ctrl = tmpA.copy(start).lerp(land, 0.5)
        ctrl.y += 0.9
        // 输出走 tmpD 之外的路径：先落 tmpA 再拷贝（ctrl 用的也是 tmpA，必须避免别名）
        bezier(tmpD, start, ctrl, land, g)
        dummy.position.copy(tmpD)
        const scale = spawn * (i === 0 ? 1 : 0.9)
        dummy.scale.setScalar(Math.max(0.001, scale))
        dummy.rotation.set(t * 0.25 + i, t * 0.32, 0)
        dummy.updateMatrix()
        ctls.setMatrixAt(i, dummy.matrix)
      }
      ctls.instanceMatrix.needsUpdate = true
    }

    /* ———— 病原体：抗体包被后发光衰减 = 被中和 ———— */
    const pathogen = pathogenRef.current
    if (pathogen) {
      const neutralized = landedSum / ANTIBODY_COUNT
      const mat = pathogen.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = 0.45 * (1 - neutralized) + 0.08
      pathogen.scale.setScalar(1 + 0.03 * Math.sin(t * 4) * (1 - neutralized))
    }

    /* ———— 肿瘤：CTL 抵达瞬间触发光爆与碎裂（hitArrive 是时序锚，事件不早于命中） ———— */
    const touched = clamp01((hitArrive - 0.985) * 45) // 贴到肿瘤面才算命中（0→1 快速越过）
    const decay = 1 - clamp01((t - T7 - 0.4 - 2.9 - 1.1) * 1.1) // 命中 1.1s 后开始退场
    const tumor = tumorRef.current
    if (tumor) {
      const shrink = easeInOut(touched) * (1 - easeInOut(clamp01((t - T7 - 0.4 - 2.9 - 2.6) * 0.9)))
      const scaleOut = 1 - easeInOut(clamp01((t - T7 - 0.4 - 2.9 - 2.4) * 1.2))
      tumor.scale.setScalar(lerp(1, lerp(0.16, 0.02, scaleOut), shrink))
      const mat = tumor.material as THREE.MeshStandardMaterial
      mat.opacity = lerp(0.9, 0.08, shrink)
      mat.emissiveIntensity = 0.2 + 1.4 * touched * decay + 0.3 * Math.abs(Math.sin(t * 9)) * touched
    }
    const killLight = killLightRef.current
    if (killLight) {
      killLight.intensity = touched * decay * 5.5 * (0.7 + 0.3 * Math.sin(t * 18))
    }
    const debrisMat = debrisMatRef.current
    const debrisPoints = debrisGroupRef.current
    if (debrisMat && debrisPoints) {
      debrisMat.opacity = touched * decay * 0.9
      debrisPoints.visible = touched > 0.01
      debrisPoints.position.set(TUMOR_POS.x, TUMOR_POS.y, TUMOR_POS.z)
      debrisPoints.scale.setScalar(lerp(0.25, 1.5, easeInOut(clamp01((t - T7 - 0.4 - 2.9) * 0.8))))
      debrisPoints.rotation.y = t * 0.5
    }

    /* ———— 组织液流场：粒子向右漂移（淋巴流向 = 因果方向） ———— */
    const lymph = lymphRef.current
    if (lymph) {
      const attr = lymphGeo.getAttribute("position") as THREE.BufferAttribute
      for (let i = 0; i < LYMPH_COUNT; i += 1) {
        const d = lymphData[i]
        let x = d.x + t * d.speed
        const span = 11.6
        x = ((x + 6.2) % span) - 6.2
        attr.setXYZ(i, x, d.y + Math.sin(t * 0.4 + d.z * 3) * 0.06, d.z)
      }
      attr.needsUpdate = true
    }
  })

  return (
    <group>
      {/* ———— 主角：纳米疫苗（脂质体核心 + 表面抗原刺突，与第②章载体同款视觉语言） ———— */}
      <group ref={vaccineRef}>
        <mesh>
          <sphereGeometry args={[0.3, 24, 18]} />
          <meshPhysicalMaterial
            color={theme.scene.body}
            emissive={theme.scene.emissive}
            emissiveIntensity={0.55}
            transmission={0}
            ior={1.45}
            thickness={0.4}
            transparent
            opacity={0.75}
            roughness={0.3}
            clearcoat={0.8}
            clearcoatRoughness={0.3}
            depthWrite={false}
          />
        </mesh>
        <pointLight color={theme.primary} intensity={1.1} distance={3.2} />
        <instancedMesh ref={vaccineSpikeRef} args={[undefined, undefined, SPIKE_COUNT]}>
          <capsuleGeometry args={[0.04, 0.13, 4, 8]} />
          <meshStandardMaterial color={theme.scene.body} emissive={theme.scene.emissive} emissiveIntensity={1.3} toneMapped />
        </instancedMesh>
      </group>

      {/* ———— 提呈细胞：分层玻璃质感外壳 + 内层膜 + 细胞器 ———— */}
      <mesh ref={apcRef} geometry={apcGeo}>
        <meshPhysicalMaterial
          color={theme.scene.body}
          emissive={theme.scene.emissive}
          emissiveIntensity={0.22}
          transmission={0}
          ior={1.5}
          thickness={1.7}
          transparent
          opacity={0.5}
          roughness={0.28}
          clearcoat={0.85}
          clearcoatRoughness={0.3}
          sheen={0.55}
          sheenColor={theme.scene.surface}
          depthWrite={false}
        />
        <MembraneBumps
          radius={R_APC * 1.015}
          count={110}
          color={theme.scene.body}
          emissive={theme.scene.emissive}
          emissiveIntensity={0.55}
          size={0.05}
          seed={2}
        />
        <mesh geometry={apcInnerGeo}>
          <meshPhysicalMaterial
            color={theme.primary}
            emissive={theme.scene.emissive}
            emissiveIntensity={0.28}
            transmission={0}
            ior={1.4}
            thickness={0.5}
            transparent
            opacity={0.14}
            roughness={0.34}
            clearcoat={0.6}
            clearcoatRoughness={0.3}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
        <CellOrganelles
          radius={R_APC * 0.76}
          count={10}
          color={theme.scene.body}
          emissive={theme.scene.emissive}
          emissiveIntensity={0.34}
          opacity={0.42}
          seed={3}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[R_APC * 1.004, 26, 18]} />
        <meshBasicMaterial
          color={theme.primary}
          wireframe
          transparent
          opacity={0.2}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <pointLight position={[APC_POS.x, APC_POS.y, APC_POS.z]} color={theme.primary} intensity={2.6} distance={8} />

      {/* ———— 吞噬泡（加工可视化） ———— */}
      <mesh ref={endosomeRef} geometry={endosomeGeo} position={[APC_POS.x, APC_POS.y + 0.15, APC_POS.z]} scale={0.001}>
        <meshStandardMaterial
          color={theme.scene.body}
          emissive={theme.scene.emissive}
          emissiveIntensity={0.9}
          transparent
          opacity={0.6}
          roughness={0.4}
          depthWrite={false}
        />
      </mesh>

      {/* 细胞内加工碎片 */}
      <points ref={fragGroupRef} geometry={fragmentGeo}>
        <pointsMaterial
          ref={fragMatRef}
          size={0.085}
          color={theme.primary}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped
        />
      </points>

      {/* ———— pMHC 提呈标记 ———— */}
      <instancedMesh ref={markerRef} args={[undefined, undefined, MARKER_COUNT]}>
        <capsuleGeometry args={[0.07, 0.16, 4, 12]} />
        <meshStandardMaterial color={theme.scene.body} emissive={theme.scene.emissive} emissiveIntensity={1.6} toneMapped />
      </instancedMesh>

      {/* ———— 接触桥：APC↔T、T↔B 的信号接触 ———— */}
      <mesh ref={bridgeARef}>
        <cylinderGeometry args={[0.016, 0.016, 1, 8]} />
        <meshBasicMaterial
          color={theme.primary}
          transparent
          opacity={0.12}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={bridgeBRef}>
        <cylinderGeometry args={[0.016, 0.016, 1, 8]} />
        <meshBasicMaterial
          color={theme.primary}
          transparent
          opacity={0.12}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* 桥上的信号流粒子 */}
      <points ref={flowRef} geometry={flowGeo} visible={false}>
        <pointsMaterial
          ref={flowMatRef}
          size={0.09}
          color={theme.scene.surface}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped
        />
      </points>

      {/* ———— B 细胞（识别） ———— */}
      <mesh ref={bCellRef} geometry={bCellGeo} position={[B_POS.x, B_POS.y, B_POS.z]}>
        <meshPhysicalMaterial
          color={theme.scene.body}
          emissive={theme.scene.emissive}
          emissiveIntensity={0.2}
          transmission={0}
          ior={1.5}
          thickness={1}
          transparent
          opacity={0.56}
          roughness={0.3}
          clearcoat={0.9}
          clearcoatRoughness={0.35}
          sheen={0.6}
          sheenColor={theme.scene.surface}
          depthWrite={false}
        />
        <MembraneBumps
          radius={R_CELL * 1.02}
          count={78}
          color={theme.scene.body}
          emissive={theme.scene.emissive}
          emissiveIntensity={0.6}
          size={0.036}
          seed={5}
        />
        <CellOrganelles
          radius={R_CELL * 0.64}
          count={6}
          color={theme.scene.body}
          emissive={theme.scene.emissive}
          emissiveIntensity={0.3}
          opacity={0.38}
          seed={5}
        />
      </mesh>

      {/* ———— T 细胞（活化） ———— */}
      <mesh ref={tCellRef} geometry={tCellGeo} position={[T_POS.x, T_POS.y, T_POS.z]}>
        <meshPhysicalMaterial
          color={theme.scene.body}
          emissive={theme.scene.emissive}
          emissiveIntensity={0.2}
          transmission={0}
          ior={1.5}
          thickness={1}
          transparent
          opacity={0.56}
          roughness={0.3}
          clearcoat={0.9}
          clearcoatRoughness={0.35}
          sheen={0.6}
          sheenColor={theme.scene.surface}
          depthWrite={false}
        />
        <MembraneBumps
          radius={R_CELL * 1.02}
          count={78}
          color={theme.scene.body}
          emissive={theme.scene.emissive}
          emissiveIntensity={0.6}
          size={0.036}
          seed={9}
        />
        <CellOrganelles
          radius={R_CELL * 0.64}
          count={6}
          color={theme.scene.body}
          emissive={theme.scene.emissive}
          emissiveIntensity={0.3}
          opacity={0.38}
          seed={9}
        />
      </mesh>

      {/* ———— 克隆扩增的小 T ———— */}
      <instancedMesh ref={cloneRef} args={[cloneGeo, undefined, CLONE_COUNT]}>
        <meshPhysicalMaterial
          color={theme.scene.body}
          emissive={theme.scene.emissive}
          emissiveIntensity={0.4}
          transmission={0}
          ior={1.5}
          thickness={0.8}
          transparent
          opacity={0.62}
          roughness={0.3}
          clearcoat={0.9}
          clearcoatRoughness={0.32}
          sheen={0.6}
          sheenColor={theme.primary}
          depthWrite={false}
        />
      </instancedMesh>

      {/* ———— 浆细胞：抗体工厂 ———— */}
      <mesh ref={plasmaRef} geometry={plasmaGeo} scale={0.001}>
        <meshPhysicalMaterial
          color={theme.scene.body}
          emissive={theme.scene.emissive}
          emissiveIntensity={0.5}
          transmission={0}
          ior={1.5}
          thickness={0.9}
          transparent
          opacity={0.66}
          roughness={0.28}
          clearcoat={0.85}
          clearcoatRoughness={0.3}
          sheen={0.7}
          sheenColor={theme.primary}
          depthWrite={false}
        />
        <CellOrganelles
          radius={0.78 * 0.7}
          count={9}
          color={theme.scene.body}
          emissive={theme.scene.emissive}
          emissiveIntensity={0.5}
          opacity={0.5}
          seed={61}
        />
      </mesh>

      {/* ———— 抗体（从浆细胞发射） ———— */}
      {Array.from({ length: ANTIBODY_COUNT }, (_, i) => (
        <group
          key={`ab-${i}`}
          ref={(el) => {
            antibodyRefs.current[i] = el
          }}
          scale={0}
        >
          <AntibodyShape body={theme.scene.body} glow={theme.scene.emissive} />
        </group>
      ))}

      {/* ———— 细胞毒性 T 细胞（迁移+杀伤） ———— */}
      <instancedMesh ref={ctlRef} args={[ctlGeo, undefined, CTL_COUNT]}>
        <meshPhysicalMaterial
          color={theme.scene.body}
          emissive={theme.scene.emissive}
          emissiveIntensity={0.5}
          transmission={0}
          ior={1.5}
          thickness={0.7}
          transparent
          opacity={0.72}
          roughness={0.3}
          clearcoat={0.9}
          clearcoatRoughness={0.3}
          sheen={0.6}
          sheenColor={theme.scene.surface}
        />
        <MembraneBumps
          radius={0.44 * 1.03}
          count={54}
          color={theme.scene.body}
          emissive={theme.scene.emissive}
          emissiveIntensity={0.7}
          size={0.03}
          seed={13}
        />
      </instancedMesh>

      {/* ———— 病原体（右上：抗体中和的目标） ———— */}
      <mesh ref={pathogenRef} geometry={pathogenGeo} position={[PATHOGEN_POS.x, PATHOGEN_POS.y, PATHOGEN_POS.z]}>
        <meshPhysicalMaterial
          color={theme.scene.ink}
          emissive={theme.scene.emissive}
          emissiveIntensity={0.45}
          transmission={0}
          ior={1.5}
          thickness={0.8}
          roughness={0.36}
          metalness={0.15}
          clearcoat={0.8}
          clearcoatRoughness={0.35}
        />
        <MembraneBumps
          radius={0.62 * 1.03}
          count={52}
          color={theme.scene.ink}
          emissive={theme.scene.emissive}
          emissiveIntensity={0.8}
          size={0.032}
          seed={17}
        />
      </mesh>

      {/* ———— 肿瘤（右下：CTL 杀伤的目标） ———— */}
      <mesh ref={tumorRef} geometry={tumorGeo} position={[TUMOR_POS.x, TUMOR_POS.y, TUMOR_POS.z]}>
        <meshPhysicalMaterial
          color={theme.scene.body}
          emissive={theme.scene.emissive}
          emissiveIntensity={0.2}
          transmission={0}
          ior={1.5}
          thickness={0.9}
          transparent
          opacity={0.9}
          roughness={0.32}
          clearcoat={0.8}
          clearcoatRoughness={0.3}
          sheen={0.5}
          sheenColor={theme.scene.surface}
        />
        <MembraneBumps
          radius={0.82 * 1.02}
          count={70}
          color={theme.scene.body}
          emissive={theme.scene.emissive}
          emissiveIntensity={0.5}
          size={0.038}
          seed={21}
        />
      </mesh>
      {/* 杀伤瞬间的生物光爆 */}
      <pointLight
        ref={killLightRef}
        position={[TUMOR_POS.x, TUMOR_POS.y, TUMOR_POS.z]}
        color={theme.primary}
        intensity={0}
        distance={4.5}
      />
      <points ref={debrisGroupRef} geometry={debrisGeo}>
        <pointsMaterial
          ref={debrisMatRef}
          size={0.1}
          color={theme.scene.surface}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped
        />
      </points>

      {/* ———— 组织液流场：淋巴流动方向 = 因果方向 ———— */}
      <points ref={lymphRef} geometry={lymphGeo}>
        <pointsMaterial
          size={0.05}
          color={theme.scene.surface}
          transparent
          opacity={0.16}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped
        />
      </points>
    </group>
  )
}
