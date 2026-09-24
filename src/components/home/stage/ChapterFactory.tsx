import { createRef, useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { useFrame } from "@react-three/fiber"
import { MeshReflectorMaterial } from "@react-three/drei"
import * as THREE from "three"
import type { StageTheme } from "@/lib/stageTheme"
import { chapterById } from "./chapters"
import { ACTIVE_CHAPTER, clamp01, easeInOut, makeRandom, phaseProgress, type TimeRef } from "./timeline"

/**
 * 第四章：黑灯工厂。
 * 全程序化的无人产线：反射地坪、传送带、西林瓶、两台关节机械臂、
 * 玻璃隔离器、在线质检扫描门与三色状态灯塔。
 *
 * 「黑灯」的视觉语言 = 厂房本身是暗的，只有机器状态灯、灌装中的抗原液体
 * 与质检扫描光在发光——恰好与整站暗色电影调性同源。
 * 所有运动都由章节时间轴 tRef 驱动：系统开启减少动效时时间轴冻结，产线随之静止。
 */

const CHAPTER = chapterById("factory")
const S = CHAPTER.starts
const TOTAL = CHAPTER.total

/* 产线布局（x 轴为流向，左进右出） */
const BELT_Y = -1.15
const BELT_HALF = 4.6
const FILL_X = -2.2 // 灌装工位（机械臂 A）
const CAP_X = 0.8 // 轧盖工位（机械臂 B）
const SCAN_X = 3.2 // 质检扫描门

const VIAL_COUNT = 10
const VIAL_SPACING = 1.04
const VIAL_SPEED = 0.62
const VIAL_H = 0.5
const VIAL_Y = BELT_Y + 0.06 + VIAL_H / 2

/* 状态灯语义色：工厂信号语义，不参与品牌配色体系 */
const COL_PASS = new THREE.Color("hsl(152, 68%, 55%)")
const COL_AMBER = new THREE.Color("hsl(38, 92%, 58%)")

/* 背景管路布局（与 JSX 里的管材网格一一对应） */
const V_PIPE_X = [-3.4, -0.6, 2.6] // 竖管：配料自上而下流入
const PIPE_Z = -2.6
const PIPE_Y_RANGE = [3.1, -2.3] as const // 竖管 y 范围（顶→底）
const H_PIPE_Y = 2.9 // 横管：物料沿走廊流向产线
const H_PIPE_X_RANGE = [-4.2, 4.2] as const
const PIPE_DOT_COUNT = 84

/** 密闭管路内的物料流动光点：黑灯工厂里「物流在管子里自己走」的可视化。 */function PipeFlow({ tRef, theme }: { tRef: TimeRef; theme: StageTheme }) {
  const groupRef = useRef<THREE.Points>(null)
  const matRef = useRef<THREE.PointsMaterial>(null)

  const dotData = useMemo(() => {
    const rnd = makeRandom(211)
    return Array.from({ length: PIPE_DOT_COUNT }, (_, i) => ({
      pipe: i % (V_PIPE_X.length + 1), // 前 3 路竖管 + 1 路横管
      offset: rnd(),
      speed: 0.1 + rnd() * 0.12,
      rx: (rnd() - 0.5) * 0.075,
      rz: (rnd() - 0.5) * 0.075,
    }))
  }, [])

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PIPE_DOT_COUNT * 3), 3))
    return geo
  }, [])

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame(() => {
    const points = groupRef.current
    const mat = matRef.current
    if (!points || !mat) return
    const t = tRef.current
    const attr = geometry.getAttribute("position") as THREE.BufferAttribute
    for (let i = 0; i < PIPE_DOT_COUNT; i += 1) {
      const dot = dotData[i]
      const frac = (t * dot.speed + dot.offset) % 1
      if (dot.pipe < V_PIPE_X.length) {
        // 竖管：配料自上而下流入产线
        const x = V_PIPE_X[dot.pipe]
        attr.setXYZ(
          i,
          x + dot.rx,
          PIPE_Y_RANGE[0] + (PIPE_Y_RANGE[1] - PIPE_Y_RANGE[0]) * frac,
          PIPE_Z + dot.rz,
        )
      } else {
        // 横管：物料沿走廊流向灌装段
        attr.setXYZ(
          i,
          H_PIPE_X_RANGE[0] + (H_PIPE_X_RANGE[1] - H_PIPE_X_RANGE[0]) * frac,
          H_PIPE_Y + dot.rx,
          PIPE_Z + dot.rz,
        )
      }
    }
    attr.needsUpdate = true
    // 配料阶段（阶段 1 的前半）流动更醒目，其余时段维持低调底噪
    const p0 = phaseProgress(t, S, TOTAL, 0)
    mat.opacity = 0.18 + easeInOut(clamp01((1 - p0 * 2.2) * 2)) * 0.5
  })

  return (
    <points ref={groupRef} geometry={geometry}>
      <pointsMaterial
        ref={matRef}
        size={0.07}
        color={theme.scene.surface}
        transparent
        opacity={0.25}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped
      />
    </points>
  )
}

const VAPOR_COUNT = 22

/** 灌装工位的蒸汽泡：药液灌装时挥发的雾气缓缓上升、飘散——
 * 产线「活着」的气味感。确定性正弦驱动，不引入逐帧随机的频闪。 */
function VaporWisp({ tRef, theme }: { tRef: TimeRef; theme: StageTheme }) {
  const groupRef = useRef<THREE.Points>(null)
  const matRef = useRef<THREE.PointsMaterial>(null)

  const drops = useMemo(() => {
    const rnd = makeRandom(307)
    return Array.from({ length: VAPOR_COUNT }, () => ({
      ox: (rnd() - 0.5) * 1.15,
      oy: rnd(),
      oz: (rnd() - 0.5) * 0.34,
      rise: 0.08 + rnd() * 0.11,
      sway: 0.35 + rnd() * 0.5,
    }))
  }, [])

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(VAPOR_COUNT * 3), 3))
    return geo
  }, [])

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame(() => {
    const points = groupRef.current
    const mat = matRef.current
    if (!points || !mat) return
    const t = tRef.current
    const attr = geometry.getAttribute("position") as THREE.BufferAttribute
    for (let i = 0; i < VAPOR_COUNT; i += 1) {
      const d = drops[i]
      const cyc = (t * d.rise + d.oy) % 1
      attr.setXYZ(
        i,
        FILL_X + d.ox + Math.sin(t * d.sway + d.oy * 6.2) * 0.24 * cyc,
        BELT_Y + 0.42 + cyc * 1.4,
        d.oz * (1 - cyc),
      )
    }
    attr.needsUpdate = true
    mat.opacity = 0.055 + 0.05 * (0.5 + 0.5 * Math.sin(t * 0.7 + 2.1))
  })

  return (
    <points ref={groupRef} geometry={geometry}>
      <pointsMaterial
        ref={matRef}
        size={0.13}
        color={theme.scene.surface}
        transparent
        opacity={0.08}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped
      />
    </points>
  )
}

type ArmRig = {
  root: RefObject<THREE.Group | null>
  shoulder: RefObject<THREE.Group | null>
  elbow: RefObject<THREE.Group | null>
  wrist: RefObject<THREE.Group | null>
  clawL: RefObject<THREE.Mesh | null>
  clawR: RefObject<THREE.Mesh | null>
}

function createArmRig(): ArmRig {
  return {
    root: createRef(),
    shoulder: createRef(),
    elbow: createRef(),
    wrist: createRef(),
    clawL: createRef(),
    clawR: createRef(),
  }
}

/** 关节机械臂：基座 → 肩（偏航+俯仰）→ 肘 → 腕 → 双指夹爪，全部程序化拼装。 */
function RobotArm({ x, z, theme, rig }: { x: number; z: number; theme: StageTheme; rig: ArmRig }) {
  const metal = {
    color: theme.scene.ink,
    roughness: 0.34,
    metalness: 0.85,
  }
  const joint = {
    color: theme.scene.ink,
    emissive: theme.scene.emissive,
    emissiveIntensity: 0.25,
    roughness: 0.3,
    metalness: 0.7,
  }
  return (
    <group ref={rig.root} position={[x, BELT_Y + 0.06, z]}>
      {/* 基座与立柱 */}
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.2, 0.24, 0.12, 20]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      <mesh position={[0, 0.38, 0]}>
        <cylinderGeometry args={[0.09, 0.12, 0.56, 14]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      {/* 肩关节：偏航 + 俯仰 */}
      <group ref={rig.shoulder} position={[0, 0.68, 0]}>
        <mesh>
          <sphereGeometry args={[0.13, 16, 12]} />
          <meshStandardMaterial {...joint} />
        </mesh>
        {/* 大臂，沿局部 +y */}
        <mesh position={[0, 0.4, 0]}>
          <capsuleGeometry args={[0.07, 0.66, 4, 12]} />
          <meshStandardMaterial {...metal} />
        </mesh>
        {/* 肘关节 */}
        <group ref={rig.elbow} position={[0, 0.8, 0]}>
          <mesh>
            <sphereGeometry args={[0.1, 16, 12]} />
            <meshStandardMaterial {...joint} />
          </mesh>
          <mesh position={[0, 0.36, 0]}>
            <capsuleGeometry args={[0.055, 0.6, 4, 12]} />
            <meshStandardMaterial {...metal} />
          </mesh>
          {/* 腕 + 夹爪 */}
          <group ref={rig.wrist} position={[0, 0.72, 0]}>
            <mesh>
              <sphereGeometry args={[0.07, 14, 10]} />
              <meshStandardMaterial {...joint} />
            </mesh>
            {[-1, 1].map((side) => (
              <mesh
                key={side}
                ref={side < 0 ? rig.clawL : rig.clawR}
                position={[side * 0.055, 0.14, 0]}
              >
                <boxGeometry args={[0.035, 0.16, 0.05]} />
                <meshStandardMaterial {...metal} />
              </mesh>
            ))}
          </group>
        </group>
      </group>
    </group>
  )
}

export function ChapterFactory({ tRef, theme }: { tRef: TimeRef; theme: StageTheme }) {
  const vialRef = useRef<THREE.InstancedMesh>(null)
  const liquidRef = useRef<THREE.InstancedMesh>(null)
  const capRef = useRef<THREE.InstancedMesh>(null)
  const rollerRef = useRef<THREE.InstancedMesh>(null)
  const scanRef = useRef<THREE.Mesh>(null)
  const scanMatRef = useRef<THREE.MeshBasicMaterial>(null)
  const lampAmberRef = useRef<THREE.Mesh>(null)
  const lampGreenRef = useRef<THREE.Mesh>(null)
  const lampRedRef = useRef<THREE.Mesh>(null)
  const dummyRef = useRef(new THREE.Object3D())
  const colorRef = useRef(new THREE.Color())
  // 用 state 初始化器保证两台机械臂的 ref 组稳定且只在首帧创建一次
  const [armA] = useState(createArmRig)
  const [armB] = useState(createArmRig)

  /* 液体颜色基准：未灌装 = 暗，灌装中 = 主色发光，质检通过 = 亮青偏绿 */
  const colEmpty = useMemo(() => new THREE.Color(theme.scene.emissive).multiplyScalar(0.25), [theme])
  const colFilled = useMemo(() => new THREE.Color(theme.scene.emissive), [theme])
  const colPass = useMemo(
    () => new THREE.Color(theme.scene.emissive).lerp(COL_PASS, 0.45),
    [theme],
  )

  /* 滚筒间距：铺满加宽后的台面 */
  const rollers = useMemo(() => {
    const xs: number[] = []
    for (let x = -BELT_HALF - 0.55; x <= BELT_HALF + 0.55 + 0.001; x += 0.46) xs.push(x)
    return xs
  }, [])

  /* 隔离器玻璃罩与发光棱边 */
  const isoGeo = useMemo(() => new THREE.BoxGeometry(5.6, 1.9, 1.7), [])
  const isoEdges = useMemo(() => new THREE.EdgesGeometry(isoGeo), [isoGeo])

  useEffect(
    () => () => {
      isoGeo.dispose()
      isoEdges.dispose()
    },
    [isoGeo, isoEdges],
  )

  useFrame(() => {
    // 隐藏章节直接短路：常驻挂载下不干活，主线程只算当前章
    if (ACTIVE_CHAPTER.current !== "factory") return
    const t = tRef.current
    const p0 = phaseProgress(t, S, TOTAL, 0)
    const p1 = phaseProgress(t, S, TOTAL, 1)
    const p2 = phaseProgress(t, S, TOTAL, 2)
    const dummy = dummyRef.current

    /* ———— 西林瓶：左进右出，循环流动；灌装 → 轧盖 → 质检变色 ———— */
    const vials = vialRef.current
    const liquids = liquidRef.current
    const caps = capRef.current
    if (vials && liquids && caps) {
      for (let i = 0; i < VIAL_COUNT; i += 1) {
        // 每瓶错峰进场，出右界后回左界重新来
        const x = ((i * VIAL_SPACING + t * VIAL_SPEED) % (BELT_HALF * 2 + 1)) - BELT_HALF - 0.5
        const y = VIAL_Y
        dummy.position.set(x, y, 0)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.setScalar(1)
        dummy.updateMatrix()
        vials.setMatrixAt(i, dummy.matrix)

        // 质检放行的判定提前算好：液面颤动要在过门后收敛，颜色变换也要用它
        const passed = clamp01((x - SCAN_X) / 0.5)

        // 灌装：经过灌装工位后液面升起，底部对齐瓶底；
        // 液面带着细微的颤动（灌装中的液体不是静止的平面）
        const fill = easeInOut(clamp01((x - (FILL_X - 0.7)) / 1.3))
        const slosh = Math.sin(t * 3.4 + i * 1.1) * 0.013 * fill * (1 - passed)
        dummy.position.set(x, BELT_Y + 0.09 + 0.22 * fill + slosh, 0)
        dummy.scale.set(1, Math.max(0.02, fill), 1)
        dummy.updateMatrix()
        liquids.setMatrixAt(i, dummy.matrix)

        // 质检放行：过了扫描门，液体颜色提亮偏绿
        colorRef.current.copy(colEmpty).lerp(colFilled, fill).lerp(colPass, passed * fill)
        liquids.setColorAt(i, colorRef.current)

        // 轧盖：经过轧盖工位后长出瓶盖
        const capped = easeInOut(clamp01((x - (CAP_X - 0.35)) / 0.7))
        dummy.position.set(x, VIAL_Y + VIAL_H / 2 + 0.045, 0)
        dummy.scale.setScalar(Math.max(0.001, capped))
        dummy.updateMatrix()
        caps.setMatrixAt(i, dummy.matrix)
      }
      vials.instanceMatrix.needsUpdate = true
      liquids.instanceMatrix.needsUpdate = true
      if (liquids.instanceColor) liquids.instanceColor.needsUpdate = true
      caps.instanceMatrix.needsUpdate = true
    }

    /* ———— 滚筒：随流速转动 ———— */
    const rollerMesh = rollerRef.current
    if (rollerMesh) {
      for (let i = 0; i < rollers.length; i += 1) {
        dummy.position.set(rollers[i], BELT_Y, 0)
        dummy.rotation.set(t * 2.2, Math.PI / 2, 0)
        dummy.scale.setScalar(1)
        dummy.updateMatrix()
        rollerMesh.setMatrixAt(i, dummy.matrix)
      }
      rollerMesh.instanceMatrix.needsUpdate = true
    }

    /* ———— 机械臂：灌装臂在阶段 1 后半活跃，轧盖臂在阶段 2 活跃 ———— */
    const animateArm = (
      rig: ArmRig,
      activity: number,
      phase: number,
      reach: number,
    ) => {
      const w = 0.35 + 0.65 * activity
      const shoulder = rig.shoulder.current
      if (shoulder) {
        shoulder.rotation.y = Math.sin(t * 0.5 + phase) * 0.4 * w
        shoulder.rotation.x = -0.32 - reach * 0.3 + Math.sin(t * 1.1 + phase) * 0.16 * w
      }
      const elbow = rig.elbow.current
      if (elbow) elbow.rotation.x = 0.85 + reach * 0.35 + Math.sin(t * 1.1 + phase + 0.9) * 0.22 * w
      const wrist = rig.wrist.current
      if (wrist) wrist.rotation.x = -0.6 - Math.sin(t * 1.1 + phase + 0.4) * 0.14 * w
      // 夹爪开合：下伸到底时收紧
      const grab = 0.5 + 0.5 * Math.sin(t * 1.1 + phase + 0.2)
      if (rig.clawL.current) rig.clawL.current.rotation.z = 0.16 + grab * 0.2 * w
      if (rig.clawR.current) rig.clawR.current.rotation.z = -0.16 - grab * 0.2 * w
    }
    animateArm(armA, clamp01(p0 * 1.4) * (1 - clamp01((p2 - 0.3) * 2)), 0, clamp01(p1))
    animateArm(armB, clamp01(p1 * 1.6), 2.1, clamp01(p1))

    /* ———— 质检扫描门：阶段 3 扫描光面来回扫，命中提亮 ———— */
    const scan = scanRef.current
    const scanMat = scanMatRef.current
    if (scan && scanMat) {
      const active = clamp01((p2 - 0.1) * 3)
      scan.position.z = Math.sin(t * 2.6) * 0.55
      scanMat.opacity = active * (0.32 + 0.12 * Math.abs(Math.sin(t * 2.6)))
    }

    /* ———— 三色灯塔：配料/灌装亮琥珀，质检放行亮绿，红只在瞬态闪 ———— */
    const amber = lampAmberRef.current
    const green = lampGreenRef.current
    const red = lampRedRef.current
    if (amber && green && red) {
      const runPhase = clamp01(p0 * 3) * (1 - clamp01((p2 - 0.2) * 2.4))
      ;(amber.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.15 + runPhase * (1.6 + 0.5 * Math.sin(t * 4))
      ;(green.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.15 + clamp01((p2 - 0.2) * 2.4) * (2 + 0.5 * Math.sin(t * 3))
      // 红灯恒定微亮：异常指示灯不该每次章节循环都闪一下——那也是「一闪一闪」的一部分
      ;(red.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.1
    }
  })

  return (
    <group>
      {/* 反射地坪：黑灯工厂的「湿地面」反射，是工业电影感最便宜也最有效的一层 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.42, 0]}>
        <circleGeometry args={[11, 48]} />
        <MeshReflectorMaterial
          blur={[200, 80]}
          resolution={512}
          mixBlur={0.9}
          mixStrength={2.2}
          mirror={0.32}
          depthScale={0.4}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.2}
          color={theme.scene.backdrop}
          metalness={0.6}
          roughness={0.75}
        />
      </mesh>
      {/* 地坪坐标网格：极淡，抬离地坪面 0.035 防 z-fighting 闪烁 */}
      <gridHelper
        args={[20, 40, theme.scene.ink, theme.scene.ink]}
        position={[0, -2.385, 0]}
        material-transparent
        material-opacity={0.1}
      />

      {/* 传送带：台面 + 两侧导轨 + 滚筒；两端都盖住西林瓶的进出区，瓶子不能悬空 */}
      <mesh position={[0, BELT_Y - 0.06, 0]}>
        <boxGeometry args={[BELT_HALF * 2 + 1.2, 0.1, 0.66]} />
        <meshStandardMaterial color={theme.scene.ink} roughness={0.5} metalness={0.8} />
      </mesh>
      {[-0.36, 0.36].map((z) => (
        <mesh key={z} position={[0, BELT_Y + 0.05, z]}>
          <boxGeometry args={[BELT_HALF * 2 + 1.2, 0.05, 0.04]} />
          <meshStandardMaterial color={theme.scene.ink} roughness={0.4} metalness={0.85} />
        </mesh>
      ))}
      <instancedMesh ref={rollerRef} args={[undefined, undefined, rollers.length]}>
        <cylinderGeometry args={[0.045, 0.045, 0.6, 10]} />
        <meshStandardMaterial color={theme.scene.ink} roughness={0.35} metalness={0.9} />
      </instancedMesh>
      {/* 支腿 */}
      {[-4.2, -1.4, 1.4, 4.2].map((x) => (
        <mesh key={x} position={[x, (BELT_Y - 2.4) / 2 - 0.05, 0]}>
          <boxGeometry args={[0.08, 2.4 - BELT_Y, 0.08]} />
          <meshStandardMaterial color={theme.scene.ink} roughness={0.55} metalness={0.7} />
        </mesh>
      ))}

      {/* 西林瓶：玻璃外壳 + 发光液体 + 铝盖 */}
      <instancedMesh ref={vialRef} args={[undefined, undefined, VIAL_COUNT]}>
        <cylinderGeometry args={[0.09, 0.09, VIAL_H, 14]} />
        <meshPhysicalMaterial
          color={theme.scene.body}
          transmission={0}
          ior={1.5}
          thickness={0.25}
          transparent
          opacity={0.5}
          roughness={0.12}
          clearcoat={0.8}
          clearcoatRoughness={0.25}
        />
      </instancedMesh>
      <instancedMesh ref={liquidRef} args={[undefined, undefined, VIAL_COUNT]}>
        <cylinderGeometry args={[0.07, 0.07, 0.44, 12]} />
        <meshStandardMaterial
          color={theme.scene.emissive}
          emissive={theme.scene.emissive}
          emissiveIntensity={1.6}
          roughness={0.35}
          toneMapped
        />
      </instancedMesh>
      <instancedMesh ref={capRef} args={[undefined, undefined, VIAL_COUNT]}>
        <cylinderGeometry args={[0.095, 0.095, 0.09, 14]} />
        <meshStandardMaterial color={theme.scene.ink} roughness={0.28} metalness={0.95} />
      </instancedMesh>

      {/* 两台机械臂：A 负责灌装对位，B 负责轧盖 */}
      <RobotArm x={FILL_X} z={0.85} theme={theme} rig={armA} />
      <RobotArm x={CAP_X} z={0.85} theme={theme} rig={armB} />

      {/* 玻璃隔离器：灌装到轧盖段全程密闭，人的手不进来 */}
      <mesh geometry={isoGeo} position={[-0.5, BELT_Y + 0.95 + 0.06, 0]}>
        <meshPhysicalMaterial
          color={theme.scene.body}
          transmission={0}
          ior={1.4}
          thickness={0.15}
          transparent
          opacity={0.16}
          roughness={0.08}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineSegments geometry={isoEdges} position={[-0.5, BELT_Y + 0.95 + 0.06, 0]}>
        <lineBasicMaterial color={theme.primary} transparent opacity={0.35} />
      </lineSegments>

      {/* 质检扫描门：门框 + 往复扫描光面 */}
      {[-0.62, 0.62].map((z) => (
        <mesh key={z} position={[SCAN_X, BELT_Y + 0.65, z]}>
          <boxGeometry args={[0.07, 1.3, 0.07]} />
          <meshStandardMaterial color={theme.scene.ink} roughness={0.4} metalness={0.8} />
        </mesh>
      ))}
      <mesh position={[SCAN_X, BELT_Y + 1.32, 0]}>
        <boxGeometry args={[0.07, 0.07, 1.31]} />
        <meshStandardMaterial
          color={theme.scene.ink}
          emissive={theme.scene.emissive}
          emissiveIntensity={0.6}
          roughness={0.4}
          metalness={0.7}
        />
      </mesh>
      <mesh ref={scanRef} position={[SCAN_X, BELT_Y + 0.6, 0]}>
        <boxGeometry args={[0.015, 1.1, 0.5]} />
        <meshBasicMaterial
          ref={scanMatRef}
          color={theme.primary}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 三色状态灯塔：黑灯工厂里唯一常亮的东西 */}
      <group position={[4.35, BELT_Y + 0.06, 0.9]}>
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.03, 0.045, 1, 10]} />
          <meshStandardMaterial color={theme.scene.ink} roughness={0.45} metalness={0.8} />
        </mesh>
        <mesh ref={lampRedRef} position={[0, 1.06, 0]}>
          <sphereGeometry args={[0.075, 14, 10]} />
          <meshStandardMaterial color="#7f1d1d" emissive="#ef4444" emissiveIntensity={0.08} roughness={0.3} />
        </mesh>
        <mesh ref={lampAmberRef} position={[0, 0.92, 0]}>
          <sphereGeometry args={[0.075, 14, 10]} />
          <meshStandardMaterial color={COL_AMBER} emissive={COL_AMBER} emissiveIntensity={0.2} roughness={0.3} />
        </mesh>
        <mesh ref={lampGreenRef} position={[0, 0.78, 0]}>
          <sphereGeometry args={[0.075, 14, 10]} />
          <meshStandardMaterial color={COL_PASS} emissive={COL_PASS} emissiveIntensity={0.2} roughness={0.3} />
        </mesh>
      </group>

      {/* 顶部条形灯：黑灯不是全黑，是只留下设备需要的光 */}
      {[-2.4, 1.6].map((x) => (
        <group key={x} position={[x, 2.6, 0]}>
          <mesh>
            <boxGeometry args={[1.7, 0.05, 0.14]} />
            <meshStandardMaterial
              color={theme.scene.light}
              emissive={theme.scene.light}
              emissiveIntensity={2.4}
              toneMapped
            />
          </mesh>
          <pointLight position={[0, -0.3, 0]} color={theme.scene.light} intensity={1.6} distance={6.5} />
        </group>
      ))}

      {/* 背景管廊：远处几根竖管与横梁，撑起厂房纵深（雾会把它压淡） */}
      {V_PIPE_X.map((x) => (
        <mesh key={x} position={[x, 0.4, PIPE_Z]}>
          <cylinderGeometry args={[0.09, 0.09, 5.4, 10]} />
          <meshStandardMaterial color={theme.scene.ink} roughness={0.6} metalness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, H_PIPE_Y, PIPE_Z]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.07, 0.07, 8.4, 10]} />
        <meshStandardMaterial color={theme.scene.ink} roughness={0.6} metalness={0.6} />
      </mesh>
      {/* 管路内的物料流动光点：密闭管路自己把配料送到位 */}
      <PipeFlow tRef={tRef} theme={theme} />
      {/* 灌装工位的蒸汽泡 */}
      <VaporWisp tRef={tRef} theme={theme} />
    </group>
  )
}
