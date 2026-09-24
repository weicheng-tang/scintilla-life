import { useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import type { StageTheme } from "@/lib/stageTheme"
import { makeRandom } from "./timeline"

/** 物流线的纵深位置：放在所有站台后方，像一条背景服务走廊——
    既贯穿四站把世界观连成一个整体，又不切过任何内容物 */
const RAIL_Z = -3.2

/**
 * 贯穿四个站台的装配线：四章不再是无缝硬切拼起来的四个孤岛，
 * 而是同一条生产轴上的四站——发光轨道从挖掘区一路铺到免疫区，
 * 粒子顺着流程方向流动，穿梭舱沿线下料，站与站之间立着细门环。
 * 切章时整个世界在站间滑移，观众看见上一站远去、下一站从雾里迎面而来。
 */
export function JourneyRail({
  theme,
  reduced,
  gap,
  coarse,
}: {
  theme: StageTheme
  reduced: boolean
  /** 相邻两站的间距（与 Stage3D 的世界滑移共用同一个常量） */
  gap: number
  coarse: boolean
}) {
  const flowRef = useRef<THREE.Points>(null)
  const shuttleRef = useRef<THREE.InstancedMesh>(null)
  const dummyRef = useRef(new THREE.Object3D())

  const SHUTTLE_COUNT = 3
  /** 轨道比最远的站台再多探出一点，两端都不悬空 */
  const railFrom = 2.4
  const railLen = gap * 3 + 4.8
  const railMidX = railFrom - railLen / 2

  const COUNT = coarse ? 64 : 96
  const flowData = useMemo(() => {
    const rnd = makeRandom(977)
    return Array.from({ length: COUNT }, () => ({
      u: rnd(),
      speed: 0.028 + rnd() * 0.05, // 单位：轨道全长每秒
      y: (rnd() - 0.5) * 1.1,
      z: (rnd() - 0.5) * 1.1,
      wobble: rnd() * Math.PI * 2,
    }))
  }, [COUNT])

  const flowGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const arr = new Float32Array(COUNT * 3)
    // 初始就是均匀分布：减少动效时 useFrame 早退，粒子停成一条安静的静态带
    for (let i = 0; i < COUNT; i += 1) {
      const d = flowData[i]
      arr[i * 3] = railFrom - d.u * railLen
      arr[i * 3 + 1] = d.y
      arr[i * 3 + 2] = d.z
    }
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3))
    return geo
  }, [COUNT, flowData, railFrom, railLen])

  useEffect(
    () => () => {
      flowGeo.dispose()
    },
    [flowGeo],
  )

  useFrame((state) => {
    if (reduced) return
    const t = state.clock.elapsedTime
    const flow = flowRef.current
    if (flow) {
      const attr = flowGeo.getAttribute("position") as THREE.BufferAttribute
      for (let i = 0; i < COUNT; i += 1) {
        const d = flowData[i]
        // 流向 -x：挖掘 → 锚定 → 工厂 → 免疫，正好是生产流程的方向
        const x = railFrom - (((t * d.speed + d.u) % 1) * railLen)
        attr.setXYZ(i, x, d.y + Math.sin(t * 0.5 + d.wobble) * 0.14, RAIL_Z + d.z + Math.cos(t * 0.4 + d.wobble) * 0.14)
      }
      attr.needsUpdate = true
    }
    const shuttles = shuttleRef.current
    if (shuttles) {
      const dummy = dummyRef.current
      for (let i = 0; i < SHUTTLE_COUNT; i += 1) {
        const u = (t * 0.045 + i / SHUTTLE_COUNT) % 1
        const x = railFrom - u * railLen
        dummy.position.set(x, Math.sin(t * 0.7 + i * 2.1) * 0.16, RAIL_Z + Math.cos(t * 0.55 + i * 1.7) * 0.16)
        const pulse = 0.08 + Math.sin(t * 3.2 + i * 2.4) * 0.012
        dummy.scale.setScalar(pulse)
        dummy.rotation.set(0, 0, 0)
        dummy.updateMatrix()
        shuttles.setMatrixAt(i, dummy.matrix)
      }
      shuttles.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <group>
      {/* 轨道本体：一根贯穿全部站台的极细发光线，additive 叠加进雾里 */}
      <mesh position={[railMidX, 0, RAIL_Z]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.012, 0.012, railLen, 6]} />
        <meshBasicMaterial
          color={theme.primary}
          transparent
          opacity={0.1}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 流动粒子：物流方向的可视化 */}
      <points ref={flowRef} geometry={flowGeo}>
        <pointsMaterial
          size={0.045}
          color={theme.scene.surface}
          transparent
          opacity={0.3}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped
        />
      </points>

      {/* 穿梭舱：三枚下料的小发光体沿轨道匀速巡航（在站台后方，不切过内容物） */}
      <instancedMesh ref={shuttleRef} args={[undefined, undefined, SHUTTLE_COUNT]}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial
          color={theme.scene.body}
          emissive={theme.scene.emissive}
          emissiveIntensity={1.5}
          toneMapped
        />
      </instancedMesh>

      {/* 站间门环：立在两站中点轨道上的细环，穿过它就是走进了下一站 */}
      {[gap / 2, (gap * 3) / 2, (gap * 5) / 2].map((x, i) => (
        <mesh key={`gate-${i}`} position={[-x, 0, RAIL_Z]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[gap * 0.072, 0.013, 8, 48]} />
          <meshBasicMaterial
            color={theme.primary}
            transparent
            opacity={0.07}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}
