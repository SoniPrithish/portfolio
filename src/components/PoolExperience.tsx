import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import {
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  MathUtils,
  Matrix4,
  MeshPhysicalMaterial,
  PMREMGenerator,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

import { brand } from '../data/portfolio'
import { GRAPHICS_PRESETS } from '../lib/siteConfig'
import { PoolAudioEngine } from '../lib/audio/PoolAudioEngine'
import { createBallAtlasTexture, createBallMaterial, createClothTextures, createWoodTextures } from '../lib/pool/ballVisuals'
import { PoolSimulation } from '../lib/pool/PoolSimulation'
import { usePortfolioStore } from '../store/usePortfolioStore'
import { FocusPanel } from './FocusPanel'
import { TopNav } from './TopNav'

type AimStatusProps = {
  canShoot: boolean
  power: number
  deviceTier: 'mobile' | 'desktop'
}

function AimStatus({ canShoot, power, deviceTier }: AimStatusProps) {
  return (
    <div className="aim-status" aria-live="polite">
      <span className="eyebrow">Shot control</span>
      <strong>{canShoot ? 'Table is open' : 'Balls in motion'}</strong>
      <div className="aim-status__meter" aria-hidden="true">
        <span style={{ transform: `scaleX(${Math.max(0.04, power)})` }} />
      </div>
      <p>
        {deviceTier === 'mobile'
          ? 'Drag to aim, adjust the power slider, then tap Shoot.'
          : 'Move to aim, click and pull back from the cue ball, then release to fire.'}
      </p>
    </div>
  )
}

interface SpinSelectorProps {
  spin: { x: number; y: number }
  onChange: (spin: { x: number; y: number }) => void
}

function SpinSelector({ spin, onChange }: SpinSelectorProps) {
  const controlRef = useRef<HTMLDivElement | null>(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    const endDrag = () => {
      draggingRef.current = false
    }

    window.addEventListener('pointerup', endDrag)
    return () => window.removeEventListener('pointerup', endDrag)
  }, [])

  const updateSpin = (clientX: number, clientY: number) => {
    const element = controlRef.current
    if (!element) {
      return
    }

    const rect = element.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const radius = rect.width * 0.34
    const offsetX = (clientX - centerX) / radius
    const offsetY = (clientY - centerY) / radius
    const length = Math.hypot(offsetX, offsetY)
    const scale = length > 1 ? 1 / length : 1

    onChange({
      x: offsetX * scale,
      y: -offsetY * scale,
    })
  }

  return (
    <section className="spin-selector" aria-label="Cue ball English selector">
      <div className="spin-selector__header">
        <div>
          <span className="eyebrow">English</span>
          <strong>Spin the cue ball</strong>
        </div>
        <button type="button" onClick={() => onChange({ x: 0, y: 0 })}>
          Center
        </button>
      </div>
      <div
        ref={controlRef}
        className="spin-selector__dial"
        onPointerDown={(event) => {
          draggingRef.current = true
          updateSpin(event.clientX, event.clientY)
        }}
        onPointerMove={(event) => {
          if (!draggingRef.current) {
            return
          }
          updateSpin(event.clientX, event.clientY)
        }}
        role="application"
        aria-label="Drag the marker to add topspin, backspin, or side spin"
      >
        <span className="spin-selector__axis spin-selector__axis--horizontal" />
        <span className="spin-selector__axis spin-selector__axis--vertical" />
        <span
          className="spin-selector__marker"
          style={{
            transform: `translate(calc(-50% + ${spin.x * 34}px), calc(-50% + ${spin.y * -34}px))`,
          }}
        />
      </div>
      <div className="spin-selector__legend" aria-hidden="true">
        <span>Top</span>
        <span>Left</span>
        <span>Right</span>
        <span>Draw</span>
      </div>
    </section>
  )
}

type PoolSceneProps = {
  simulation: PoolSimulation
  graphicsPreset: keyof typeof GRAPHICS_PRESETS
  deviceTier: 'mobile' | 'desktop'
  introPhase: 'idle' | 'playing' | 'complete' | 'skipped'
  inputLocked: boolean
  powerPreview: number
  aimAngleRef: MutableRefObject<number>
  aimTargetRef: MutableRefObject<number>
  chargingRef: MutableRefObject<boolean>
  powerRef: MutableRefObject<number>
  onPowerPreview: (power: number) => void
  onCanShootChange: (canShoot: boolean) => void
  onShoot: (power: number, intro?: boolean) => void
  onPrimeAudio: () => void
  onIntroComplete: () => void
  onPerformance: (fps: number, physicsMs: number) => void
}

function PoolScene({
  simulation,
  graphicsPreset,
  deviceTier,
  introPhase,
  inputLocked,
  powerPreview,
  aimAngleRef,
  aimTargetRef,
  chargingRef,
  powerRef,
  onPowerPreview,
  onCanShootChange,
  onShoot,
  onPrimeAudio,
  onIntroComplete,
  onPerformance,
}: PoolSceneProps) {
  const preset = GRAPHICS_PRESETS[graphicsPreset]
  const { camera, gl, scene } = useThree()
  const ballMeshRef = useRef<InstancedMesh | null>(null)
  const shadowMeshRef = useRef<InstancedMesh | null>(null)
  const cueGroupRef = useRef<Group | null>(null)
  const canShootRef = useRef(simulation.isRackSettled())
  const introProgressRef = useRef(0)
  const introBreakTriggeredRef = useRef(false)
  const fpsFramesRef = useRef(0)
  const fpsElapsedRef = useRef(0)
  const physicsMsRef = useRef(0)

  const ballGeometry = useMemo(() => new SphereGeometry(simulation.ballRadius, 36, 36), [simulation.ballRadius])
  const shadowGeometry = useMemo(() => new CircleGeometry(simulation.ballRadius * 1.1, 18), [simulation.ballRadius])
  const cueGeometry = useMemo(() => new CylinderGeometry(0.008, 0.012, 1.05, 14), [])
  const cueTipGeometry = useMemo(() => new CylinderGeometry(0.005, 0.008, 0.14, 12), [])
  const clothTextures = useMemo(() => createClothTextures(preset.textureScale), [preset.textureScale])
  const woodTextures = useMemo(() => createWoodTextures(preset.textureScale), [preset.textureScale])
  const ballAtlas = useMemo(() => createBallAtlasTexture(), [])
  const ballMaterial = useMemo(() => createBallMaterial(ballAtlas), [ballAtlas])
  const shadowMaterial = useMemo(
    () =>
      new MeshPhysicalMaterial({
        color: '#000000',
        transparent: true,
        opacity: 0.2,
        side: DoubleSide,
        roughness: 1,
      }),
    [],
  )
  const dummyMatrix = useMemo(() => new Matrix4(), [])
  const dummyPosition = useMemo(() => new Vector3(), [])
  const dummyQuaternion = useMemo(() => new Quaternion(), [])
  const dummyScale = useMemo(() => new Vector3(1, 1, 1), [])

  useEffect(() => {
    const colors = new Float32Array(16 * 3)
    const numbers = new Float32Array(16)
    const types = new Float32Array(16)

    simulation.getBalls().forEach((ball, index) => {
      colors[index * 3 + 0] = ball.color.r
      colors[index * 3 + 1] = ball.color.g
      colors[index * 3 + 2] = ball.color.b
      numbers[index] = ball.number
      types[index] = ball.type
    })

    ballGeometry.setAttribute('instanceColor', new InstancedBufferAttribute(colors, 3))
    ballGeometry.setAttribute('instanceBallNumber', new InstancedBufferAttribute(numbers, 1))
    ballGeometry.setAttribute('instanceBallType', new InstancedBufferAttribute(types, 1))
  }, [ballGeometry, simulation])

  useEffect(() => {
    const generator = new PMREMGenerator(gl)
    const environment = generator.fromScene(new RoomEnvironment(), 0.045).texture
    scene.environment = environment

    return () => {
      scene.environment = null
      environment.dispose()
      generator.dispose()
    }
  }, [gl, scene])

  useEffect(() => {
    const ballMaterialTyped = ballMaterial as MeshPhysicalMaterial
    ballMaterialTyped.envMapIntensity = preset.envIntensity
    ballMaterialTyped.needsUpdate = true
  }, [ballMaterial, preset.envIntensity])

  useEffect(() => {
    camera.position.set(0, 1.48, -1.54)
  }, [camera])

  const updateAimFromPoint = (point: Vector3) => {
    const cueBall = simulation.getCueBall()
    if (cueBall.pocketed) {
      return
    }

    const dx = point.x - cueBall.pos.x
    const dz = point.z - cueBall.pos.y
    if (Math.abs(dx) < 1e-4 && Math.abs(dz) < 1e-4) {
      return
    }

    if (deviceTier === 'mobile' || !chargingRef.current) {
      aimTargetRef.current = Math.atan2(dz, dx)
    }

    if (deviceTier === 'desktop' && chargingRef.current) {
      const aimX = Math.cos(aimAngleRef.current)
      const aimZ = Math.sin(aimAngleRef.current)
      const pullDistance = Math.max(0, -(dx * aimX + dz * aimZ))
      const nextPower = Math.min(1, pullDistance / 0.45)
      powerRef.current = nextPower
      onPowerPreview(nextPower)
    }
  }

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (inputLocked || introPhase !== 'complete') {
      return
    }

    updateAimFromPoint(event.point)
  }

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (inputLocked || introPhase !== 'complete' || !canShootRef.current) {
      return
    }

    onPrimeAudio()

    if (deviceTier === 'desktop') {
      chargingRef.current = true
      updateAimFromPoint(event.point)
    }
  }

  const handlePointerUp = () => {
    if (deviceTier !== 'desktop') {
      return
    }

    if (!chargingRef.current) {
      return
    }

    chargingRef.current = false
    const shotPower = powerRef.current
    if (shotPower > 0.05) {
      onShoot(shotPower)
    }
    powerRef.current = 0
    onPowerPreview(0)
  }

  useFrame((state, delta) => {
    aimAngleRef.current = MathUtils.damp(aimAngleRef.current, aimTargetRef.current, 8, delta)

    const physicsStart = performance.now()
    const alpha = simulation.step(delta)
    physicsMsRef.current = physicsMsRef.current * 0.82 + (performance.now() - physicsStart) * 0.18

    fpsFramesRef.current += 1
    fpsElapsedRef.current += delta

    if (fpsElapsedRef.current > 0.45) {
      onPerformance(fpsFramesRef.current / fpsElapsedRef.current, physicsMsRef.current)
      fpsFramesRef.current = 0
      fpsElapsedRef.current = 0
    }

    const rackSettled = simulation.isRackSettled()
    if (rackSettled !== canShootRef.current) {
      canShootRef.current = rackSettled
      onCanShootChange(rackSettled)
    }

    const cueBall = simulation.getCueBall()

    if ((introPhase === 'playing' || introPhase === 'skipped') && !introBreakTriggeredRef.current) {
      introProgressRef.current = introPhase === 'skipped' ? 1 : Math.min(1, introProgressRef.current + delta / 4.5)

      const t = introProgressRef.current
      camera.position.set(
        Math.sin(t * Math.PI * 1.15) * 0.48,
        1.05 + (1 - t) * 0.44,
        -1.74 + t * 1.12,
      )
      camera.lookAt(0, 0.7, 0.2)

      if (t >= 0.72) {
        introBreakTriggeredRef.current = true
        onPrimeAudio()
        onShoot(0.92, true)
        onIntroComplete()
      }
    } else {
      const targetCameraX = Math.sin(aimAngleRef.current) * 0.12
      const targetCameraZ = -1.54 + Math.cos(aimAngleRef.current) * 0.04
      camera.position.x = MathUtils.damp(camera.position.x, targetCameraX, 3.8, delta)
      camera.position.y = MathUtils.damp(camera.position.y, 1.42, 3.8, delta)
      camera.position.z = MathUtils.damp(camera.position.z, targetCameraZ, 3.8, delta)
      camera.lookAt(0, 0.72, 0.12)
    }

    if (ballMeshRef.current) {
      simulation.getBalls().forEach((ball, index) => {
        if (ball.pocketed) {
          dummyPosition.set(0, -10, 0)
          dummyQuaternion.identity()
          dummyScale.setScalar(0.001)
        } else {
          simulation.getInterpolatedPosition(ball, alpha, dummyPosition)
          simulation.getInterpolatedOrientation(ball, alpha, dummyQuaternion)
          const size = ball.dropping ? 1 - ball.dropProgress * 0.55 : 1
          dummyScale.setScalar(size)
        }

        dummyMatrix.compose(dummyPosition, dummyQuaternion, dummyScale)
        ballMeshRef.current?.setMatrixAt(index, dummyMatrix)

        if (shadowMeshRef.current) {
          if (ball.pocketed || preset.enableShadows) {
            dummyPosition.set(0, -10, 0)
            dummyQuaternion.setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)
            dummyScale.setScalar(0.001)
          } else {
            simulation.getInterpolatedPosition(ball, alpha, dummyPosition)
            dummyPosition.y = 0.001
            dummyQuaternion.setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)
            const shadowScale = Math.max(0.25, 1 - ball.dropProgress * 0.7)
            dummyScale.set(shadowScale, shadowScale, shadowScale)
          }

          dummyMatrix.compose(dummyPosition, dummyQuaternion, dummyScale)
          shadowMeshRef.current.setMatrixAt(index, dummyMatrix)
        }
      })

      ballMeshRef.current.instanceMatrix.needsUpdate = true
      if (shadowMeshRef.current) {
        shadowMeshRef.current.instanceMatrix.needsUpdate = true
      }
    }

    if (cueGroupRef.current) {
      const showCue = !cueBall.pocketed && canShootRef.current && introPhase === 'complete' && !inputLocked
      cueGroupRef.current.visible = showCue
      if (showCue) {
        const cueOffset = 0.48 + powerPreview * 0.22
        cueGroupRef.current.position.set(cueBall.pos.x, 0.008, cueBall.pos.y)
        cueGroupRef.current.rotation.y = -aimAngleRef.current
        cueGroupRef.current.position.x -= Math.cos(aimAngleRef.current) * cueOffset
        cueGroupRef.current.position.z -= Math.sin(aimAngleRef.current) * cueOffset
      }
    }

    state.gl.setClearColor(new Color('#07120e'), 1)
  })

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight
        castShadow={preset.enableShadows}
        intensity={1.4}
        position={[0.8, 2.4, -0.8]}
        shadow-mapSize-width={preset.shadowMapSize}
        shadow-mapSize-height={preset.shadowMapSize}
        shadow-camera-near={0.2}
        shadow-camera-far={5}
        shadow-camera-left={-1.8}
        shadow-camera-right={1.8}
        shadow-camera-top={1.8}
        shadow-camera-bottom={-1.8}
      />
      <pointLight intensity={0.42} position={[-0.8, 1.8, 0.7]} color="#b68f63" />
      <pointLight intensity={0.26} position={[0.8, 1.5, -0.9]} color="#244f5c" />

      <group position={[0, 0, 0]}>
        <mesh position={[0, -0.11, 0]} receiveShadow={preset.enableShadows}>
          <boxGeometry args={[1.85, 0.12, 2.92]} />
          <meshPhysicalMaterial color="#281a14" roughness={0.78} metalness={0.08} />
        </mesh>

        <mesh position={[0, 0, 0]} receiveShadow={preset.enableShadows}>
          <boxGeometry args={[simulation.tableWidth + 0.32, 0.1, simulation.tableLength + 0.32]} />
          <meshPhysicalMaterial
            map={woodTextures.map}
            roughnessMap={woodTextures.roughnessMap}
            roughness={0.38}
            clearcoat={1}
            clearcoatRoughness={0.12}
            metalness={0.04}
            color="#6d472d"
          />
        </mesh>

        <mesh position={[0, 0.052, 0]} receiveShadow={preset.enableShadows}>
          <boxGeometry args={[simulation.tableWidth + 0.06, 0.06, simulation.tableLength + 0.06]} />
          <meshPhysicalMaterial color="#332219" roughness={0.58} metalness={0.06} />
        </mesh>

        <mesh position={[0, 0.084, 0]} receiveShadow={preset.enableShadows}>
          <boxGeometry args={[simulation.tableWidth, 0.022, simulation.tableLength]} />
          <meshPhysicalMaterial
            map={clothTextures.map}
            roughnessMap={clothTextures.roughnessMap}
            normalMap={clothTextures.normalMap}
            roughness={0.84}
            metalness={0}
            color="#0f6b4a"
          />
        </mesh>

        {[
          [-simulation.tableWidth / 2 - 0.028, 0.085, -simulation.tableLength / 2 - 0.028],
          [0, 0.085, -simulation.tableLength / 2 - 0.02],
          [simulation.tableWidth / 2 + 0.028, 0.085, -simulation.tableLength / 2 - 0.028],
          [-simulation.tableWidth / 2 - 0.028, 0.085, simulation.tableLength / 2 + 0.028],
          [0, 0.085, simulation.tableLength / 2 + 0.02],
          [simulation.tableWidth / 2 + 0.028, 0.085, simulation.tableLength / 2 + 0.028],
        ].map((position, index) => (
          <mesh key={index} position={position as [number, number, number]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[index % 3 === 1 ? 0.078 : 0.092, 28]} />
            <meshBasicMaterial color="#040404" />
          </mesh>
        ))}

        <instancedMesh
          ref={ballMeshRef}
          args={[ballGeometry, ballMaterial, simulation.getBalls().length]}
          castShadow={preset.enableShadows}
          receiveShadow={preset.enableShadows}
          position={[0, 0.095, 0]}
        />

        {!preset.enableShadows ? (
          <instancedMesh
            ref={shadowMeshRef}
            args={[shadowGeometry, shadowMaterial, simulation.getBalls().length]}
            position={[0, 0.095, 0]}
          />
        ) : null}

        <group ref={cueGroupRef} position={[0, 0.095, 0]}>
          <mesh geometry={cueGeometry} rotation={[Math.PI / 2, 0, 0]} castShadow={preset.enableShadows}>
            <meshPhysicalMaterial color="#d8c1a1" roughness={0.38} clearcoat={0.8} clearcoatRoughness={0.18} />
          </mesh>
          <mesh
            geometry={cueTipGeometry}
            rotation={[Math.PI / 2, 0, 0]}
            position={[0, 0, 0.59]}
            castShadow={preset.enableShadows}
          >
            <meshPhysicalMaterial color="#3d9cb7" roughness={0.42} />
          </mesh>
        </group>

        <mesh
          position={[0, 0.11, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerOut={handlePointerUp}
        >
          <planeGeometry args={[simulation.tableWidth * 1.18, simulation.tableLength * 1.18]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      </group>
    </>
  )
}

export default function PoolExperience() {
  const accessibilityMode = usePortfolioStore((state) => state.accessibilityMode)
  const webglReady = usePortfolioStore((state) => state.webglReady)
  const graphicsPreset = usePortfolioStore((state) => state.graphicsPreset)
  const introPhase = usePortfolioStore((state) => state.introPhase)
  const activePanel = usePortfolioStore((state) => state.activePanel)
  const shotsTaken = usePortfolioStore((state) => state.shotsTaken)
  const pocketedCount = usePortfolioStore((state) => state.pocketedCount)
  const unlockedSections = usePortfolioStore((state) => state.unlockedSections)
  const viewedProjects = usePortfolioStore((state) => state.viewedProjects)
  const soundEnabled = usePortfolioStore((state) => state.soundEnabled)
  const volume = usePortfolioStore((state) => state.volume)
  const advancedAudio = usePortfolioStore((state) => state.advancedAudio)
  const guidedMode = usePortfolioStore((state) => state.guidedMode)
  const devStatsVisible = usePortfolioStore((state) => state.devStatsVisible)
  const spin = usePortfolioStore((state) => state.spin)
  const deviceTier = usePortfolioStore((state) => state.deviceTier)
  const performance = usePortfolioStore((state) => state.performance)
  const rackVersion = usePortfolioStore((state) => state.rackVersion)

  const setAccessibilityMode = usePortfolioStore((state) => state.setAccessibilityMode)
  const setGraphicsPreset = usePortfolioStore((state) => state.setGraphicsPreset)
  const acceptGraphicsReduction = usePortfolioStore((state) => state.acceptGraphicsReduction)
  const setPerformance = usePortfolioStore((state) => state.setPerformance)
  const setIntroPhase = usePortfolioStore((state) => state.setIntroPhase)
  const openPanel = usePortfolioStore((state) => state.openPanel)
  const closePanel = usePortfolioStore((state) => state.closePanel)
  const recordShot = usePortfolioStore((state) => state.recordShot)
  const handlePocketedBall = usePortfolioStore((state) => state.handlePocketedBall)
  const notifyEightBallFoul = usePortfolioStore((state) => state.notifyEightBallFoul)
  const toggleGuidedMode = usePortfolioStore((state) => state.toggleGuidedMode)
  const toggleDevStats = usePortfolioStore((state) => state.toggleDevStats)
  const toggleSound = usePortfolioStore((state) => state.toggleSound)
  const setVolume = usePortfolioStore((state) => state.setVolume)
  const setAdvancedAudio = usePortfolioStore((state) => state.setAdvancedAudio)
  const setSpin = usePortfolioStore((state) => state.setSpin)
  const resetRackProgress = usePortfolioStore((state) => state.resetRackProgress)

  const simulation = useMemo(
    () =>
      new PoolSimulation({
        onPocketBall: (ballNumber) => {
          handlePocketedBall(ballNumber)
          audioRef.current?.playPocket()
        },
        canPocketEightBall: () => usePortfolioStore.getState().viewedProjects.length > 0,
        onEightBallFoul: () => {
          notifyEightBallFoul()
          audioRef.current?.playRail(0.9)
        },
        onBallCollision: (intensity) => {
          audioRef.current?.playCollision(intensity)
        },
        onRailCollision: (intensity) => {
          audioRef.current?.playRail(intensity)
        },
      }),
    [handlePocketedBall, notifyEightBallFoul],
  )

  const audioRef = useRef<PoolAudioEngine | null>(null)
  const [canShoot, setCanShoot] = useState(simulation.isRackSettled())
  const [powerPreview, setPowerPreview] = useState(deviceTier === 'mobile' ? 0.56 : 0)
  const [qualityOpen, setQualityOpen] = useState(false)
  const aimAngleRef = useRef(Math.PI / 2)
  const aimTargetRef = useRef(Math.PI / 2)
  const chargingRef = useRef(false)
  const powerRef = useRef(0)
  const spinRef = useRef(spin)

  useEffect(() => {
    audioRef.current = new PoolAudioEngine()
    return () => {
      audioRef.current?.destroy()
      audioRef.current = null
    }
  }, [])

  useEffect(() => {
    spinRef.current = spin
  }, [spin])

  useEffect(() => {
    audioRef.current?.setEnabled(soundEnabled)
  }, [soundEnabled])

  useEffect(() => {
    audioRef.current?.setVolume(volume)
  }, [volume])

  useEffect(() => {
    audioRef.current?.setEnhanced(advancedAudio)
  }, [advancedAudio])

  useEffect(() => {
    simulation.resetRack()
    aimAngleRef.current = Math.PI / 2
    aimTargetRef.current = Math.PI / 2
    chargingRef.current = false
    powerRef.current = 0
    setPowerPreview(deviceTier === 'mobile' ? 0.56 : 0)
    setCanShoot(simulation.isRackSettled())
  }, [deviceTier, rackVersion, simulation])

  const primeAudio = useCallback(() => {
    void audioRef.current?.prime()
  }, [])

  const fireShot = useCallback(
    (power: number, intro = false) => {
      primeAudio()

      const didShoot = intro
        ? (simulation.breakShot(power), true)
        : simulation.shoot(aimAngleRef.current, power, spinRef.current)

      if (didShoot) {
        if (!intro) {
          recordShot()
        }
        audioRef.current?.playCue(power)
      }

      if (!intro) {
        setPowerPreview(deviceTier === 'mobile' ? power : 0)
      }
    },
    [deviceTier, primeAudio, recordShot, simulation],
  )

  const handleResetRack = () => {
    simulation.resetRack()
    resetRackProgress()
    setIntroPhase('complete')
    setCanShoot(true)
    chargingRef.current = false
    powerRef.current = 0
    setPowerPreview(deviceTier === 'mobile' ? 0.56 : 0)
  }

  const sectionsUnlockedCount =
    Number(unlockedSections.about) + Number(unlockedSections.skills) + Number(unlockedSections.contact)

  const guidedMessage = useMemo(() => {
    if (!guidedMode) {
      return null
    }

    if (!unlockedSections.about) {
      return 'Sink any solid to unlock the About brief.'
    }

    if (!unlockedSections.skills) {
      return 'Striped balls unlock the skills board.'
    }

    if (viewedProjects.length === 0) {
      return 'Pocket any numbered ball to open a project panel.'
    }

    if (!unlockedSections.contact) {
      return 'The 8-ball is now live. Sink it to unlock contact.'
    }

    return 'Rack is open. Keep exploring or switch to Accessibility Mode at any time.'
  }, [guidedMode, unlockedSections.about, unlockedSections.contact, unlockedSections.skills, viewedProjects.length])

  const toggleAccessibility = () => {
    if (!webglReady && !accessibilityMode) {
      return
    }

    setAccessibilityMode(!accessibilityMode)
  }

  return (
    <div className="experience-shell">
      <TopNav
        immersive
        accessibilityMode={accessibilityMode}
        webglReady={webglReady}
        onToggleAccessibility={toggleAccessibility}
      />

      <section className="experience-stage" aria-label="Interactive 8-ball portfolio">
        <Canvas
          className="experience-canvas"
          shadows={GRAPHICS_PRESETS[graphicsPreset].enableShadows}
          dpr={[1, GRAPHICS_PRESETS[graphicsPreset].maxDpr]}
          gl={{ antialias: graphicsPreset !== 'low', powerPreference: 'high-performance' }}
          camera={{ position: [0, 1.48, -1.54], fov: deviceTier === 'mobile' ? 42 : 36 }}
        >
          <PoolScene
            simulation={simulation}
            graphicsPreset={graphicsPreset}
            deviceTier={deviceTier}
            introPhase={introPhase}
            inputLocked={Boolean(activePanel)}
            powerPreview={powerPreview}
            aimAngleRef={aimAngleRef}
            aimTargetRef={aimTargetRef}
            chargingRef={chargingRef}
            powerRef={powerRef}
            onPowerPreview={setPowerPreview}
            onCanShootChange={setCanShoot}
            onShoot={fireShot}
            onPrimeAudio={primeAudio}
            onIntroComplete={() => setIntroPhase('complete')}
            onPerformance={(fps, physicsMs) =>
              setPerformance({
                fps,
                physicsMs,
                suggestionVisible: fps < 52 && graphicsPreset !== 'low',
              })
            }
          />
        </Canvas>

        <div className="experience-vignette" aria-hidden="true" />
        <div className="experience-glow" aria-hidden="true" />

        <aside className="hud-card hud-card--stats" aria-label="Portfolio scoreboard">
          <p className="eyebrow">Tournament overlay</p>
          <h1>{brand.name}</h1>
          <p className="hud-card__role">{brand.role}</p>
          <div className="stat-grid">
            <div>
              <span>Shots</span>
              <strong>{shotsTaken}</strong>
            </div>
            <div>
              <span>Pocketed</span>
              <strong>{pocketedCount}</strong>
            </div>
            <div>
              <span>Projects viewed</span>
              <strong>{viewedProjects.length}</strong>
            </div>
            <div>
              <span>Sections unlocked</span>
              <strong>{sectionsUnlockedCount}</strong>
            </div>
          </div>

          <div className="hud-links">
            <button type="button" onClick={() => openPanel({ kind: 'about' })}>
              About Brief
            </button>
            <button type="button" onClick={() => openPanel({ kind: 'skills' })}>
              Skills Board
            </button>
            <button type="button" onClick={toggleAccessibility}>
              Accessibility Mode
            </button>
          </div>

          <AimStatus canShoot={canShoot} power={powerPreview} deviceTier={deviceTier} />
        </aside>

        <aside className="hud-card hud-card--controls">
          <div className="hud-card__controls">
            <button type="button" onClick={() => setQualityOpen((value) => !value)}>
              Graphics Preset
            </button>
            <button type="button" onClick={toggleSound}>
              {soundEnabled ? 'Mute Sound' : 'Enable Sound'}
            </button>
            <button type="button" onClick={handleResetRack}>
              Reset Rack
            </button>
            <button type="button" onClick={() => openPanel({ kind: 'help' })}>
              Help / Controls
            </button>
            <button type="button" onClick={toggleGuidedMode}>
              {guidedMode ? 'Hide Guided Mode' : 'Show Guided Mode'}
            </button>
            <button type="button" onClick={toggleDevStats}>
              {devStatsVisible ? 'Hide Perf' : 'Show Perf'}
            </button>
          </div>

          {qualityOpen ? (
            <section className="quality-panel" aria-label="Graphics and audio settings">
              <div className="quality-panel__preset-row">
                {(['low', 'medium', 'high', 'ultra'] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={graphicsPreset === preset ? 'is-active' : ''}
                    onClick={() => setGraphicsPreset(preset)}
                  >
                    {GRAPHICS_PRESETS[preset].label}
                  </button>
                ))}
              </div>
              <label className="slider-field">
                <span>Volume</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={(event) => setVolume(Number(event.target.value))}
                />
              </label>
              <label className="toggle-field">
                <input
                  type="checkbox"
                  checked={advancedAudio}
                  onChange={(event) => setAdvancedAudio(event.target.checked)}
                />
                <span>Enhanced audio layering</span>
              </label>
              <p className="quality-panel__meta">
                {Math.round(performance.fps)} FPS · {performance.physicsMs.toFixed(2)} ms physics
              </p>
            </section>
          ) : null}
        </aside>

        <SpinSelector spin={spin} onChange={setSpin} />

        {guidedMessage ? <div className="guided-banner">{guidedMessage}</div> : null}

        {deviceTier === 'mobile' ? (
          <section className="mobile-shot-bar">
            <label className="slider-field">
              <span>Power</span>
              <input
                type="range"
                min="0.05"
                max="1"
                step="0.01"
                value={powerPreview}
                onChange={(event) => {
                  const nextPower = Number(event.target.value)
                  setPowerPreview(nextPower)
                  powerRef.current = nextPower
                }}
              />
            </label>
            <button
              type="button"
              disabled={!canShoot || Boolean(activePanel) || introPhase !== 'complete'}
              onClick={() => fireShot(powerPreview)}
            >
              Shoot
            </button>
          </section>
        ) : null}

        {introPhase === 'playing' ? (
          <button className="skip-intro-button" type="button" onClick={() => setIntroPhase('skipped')}>
            Skip Intro
          </button>
        ) : null}

        {performance.suggestionVisible ? (
          <div className="performance-banner" role="status">
            <span>Performance dipped. Reduce graphics for a smoother rack.</span>
            <button type="button" onClick={acceptGraphicsReduction}>
              Reduce Graphics
            </button>
          </div>
        ) : null}

        {devStatsVisible ? (
          <div className="dev-stats">
            <span>{Math.round(performance.fps)} FPS</span>
            <span>{performance.physicsMs.toFixed(2)} ms physics</span>
            <span>{graphicsPreset.toUpperCase()}</span>
          </div>
        ) : null}
      </section>

      <FocusPanel panel={activePanel} onClose={closePanel} />
    </div>
  )
}
