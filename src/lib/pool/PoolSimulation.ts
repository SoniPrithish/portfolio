import { Color, MathUtils, Quaternion, Vector2, Vector3 } from 'three'

type BallType = 0 | 1 | 2 | 3

interface Pocket {
  index: number
  center: Vector2
  captureRadius: number
  lipRadius: number
  kind: 'corner' | 'side'
}

export interface SimBall {
  number: number
  type: BallType
  color: Color
  pos: Vector2
  prevPos: Vector2
  vel: Vector2
  orientation: Quaternion
  prevOrientation: Quaternion
  sideSpin: number
  forwardSpin: number
  sliding: number
  sleeping: boolean
  pocketed: boolean
  dropping: boolean
  dropProgress: number
  pocketIndex: number
}

interface PoolSimulationOptions {
  onPocketBall?: (ballNumber: number) => void
  onCueBallScratch?: () => void
  onEightBallFoul?: () => void
  canPocketEightBall?: () => boolean
  onBallCollision?: (intensity: number) => void
  onRailCollision?: (intensity: number) => void
}

const FIXED_DT = 1 / 120
const MAX_SUBSTEPS = 4
const BALL_RADIUS = 0.0285
const TABLE_WIDTH = 2.24
const TABLE_LENGTH = 1.16
const HALF_WIDTH = TABLE_WIDTH / 2
const HALF_LENGTH = TABLE_LENGTH / 2
const CORNER_GATE = 0.125
const SIDE_GATE = 0.155
const BALL_RESTITUTION = 0.96
const RAIL_RESTITUTION = 0.87
const CONTACT_FRICTION = 0.14
const ROLL_FRICTION = 0.88
const SLIDE_FRICTION = 1.95
const CURVE_FORCE = 0.16
const FOLLOW_FORCE = 0.58
const SIDE_THROW = 0.095
const SPIN_DECAY = 2.2
const SLEEP_SPEED = 0.035
const DROP_DURATION = 0.26
const MAX_SHOT_SPEED = 5.6
const MIN_SHOT_SPEED = 1.15

const POCKETS: Pocket[] = [
  {
    index: 0,
    center: new Vector2(-HALF_WIDTH - 0.03, -HALF_LENGTH - 0.03),
    captureRadius: 0.102,
    lipRadius: 0.138,
    kind: 'corner',
  },
  {
    index: 1,
    center: new Vector2(0, -HALF_LENGTH - 0.018),
    captureRadius: 0.086,
    lipRadius: 0.112,
    kind: 'side',
  },
  {
    index: 2,
    center: new Vector2(HALF_WIDTH + 0.03, -HALF_LENGTH - 0.03),
    captureRadius: 0.102,
    lipRadius: 0.138,
    kind: 'corner',
  },
  {
    index: 3,
    center: new Vector2(-HALF_WIDTH - 0.03, HALF_LENGTH + 0.03),
    captureRadius: 0.102,
    lipRadius: 0.138,
    kind: 'corner',
  },
  {
    index: 4,
    center: new Vector2(0, HALF_LENGTH + 0.018),
    captureRadius: 0.086,
    lipRadius: 0.112,
    kind: 'side',
  },
  {
    index: 5,
    center: new Vector2(HALF_WIDTH + 0.03, HALF_LENGTH + 0.03),
    captureRadius: 0.102,
    lipRadius: 0.138,
    kind: 'corner',
  },
]

const TEMP_A = new Vector2()
const TEMP_B = new Vector2()
const TEMP_C = new Vector2()
const TEMP_AXIS = new Vector3()
const TEMP_VEC3 = new Vector3()
const TEMP_QUAT = new Quaternion()
const TEMP_QUAT_B = new Quaternion()

const BALL_COLORS = [
  '#ffffff',
  '#f2c230',
  '#2559d9',
  '#d84b35',
  '#6943d1',
  '#ff7c3f',
  '#1ba16c',
  '#7d1820',
  '#111111',
  '#f2c230',
  '#2559d9',
  '#d84b35',
  '#6943d1',
  '#ff7c3f',
  '#1ba16c',
  '#7d1820',
]

function createBall(number: number): SimBall {
  const type: BallType = number === 0 ? 0 : number === 8 ? 3 : number < 8 ? 1 : 2

  return {
    number,
    type,
    color: new Color(BALL_COLORS[number]),
    pos: new Vector2(),
    prevPos: new Vector2(),
    vel: new Vector2(),
    orientation: new Quaternion(),
    prevOrientation: new Quaternion(),
    sideSpin: 0,
    forwardSpin: 0,
    sliding: 0,
    sleeping: true,
    pocketed: false,
    dropping: false,
    dropProgress: 0,
    pocketIndex: -1,
  }
}

function setVectorLength(vector: Vector2, length: number): void {
  if (vector.lengthSq() < 1e-8 || length <= 0) {
    vector.set(0, 0)
    return
  }

  vector.normalize().multiplyScalar(length)
}

function dampValue(value: number, damping: number, dt: number): number {
  return value * Math.exp(-damping * dt)
}

export class PoolSimulation {
  private readonly options: PoolSimulationOptions
  private readonly balls: SimBall[] = Array.from({ length: 16 }, (_, index) => createBall(index))
  private accumulator = 0
  private timeSinceImpactAudio = 0
  private timeSinceRailAudio = 0
  private pendingCueBallRespot = false

  constructor(options: PoolSimulationOptions = {}) {
    this.options = options
    this.resetRack('full')
  }

  get tableWidth(): number {
    return TABLE_WIDTH
  }

  get tableLength(): number {
    return TABLE_LENGTH
  }

  get ballRadius(): number {
    return BALL_RADIUS
  }

  getBalls(): readonly SimBall[] {
    return this.balls
  }

  getCueBall(): SimBall {
    return this.balls[0]
  }

  resetRack(mode: 'full' | '8ball' = 'full'): void {
    this.accumulator = 0
    this.timeSinceImpactAudio = 0
    this.timeSinceRailAudio = 0

    this.balls.forEach((ball, index) => {
      ball.vel.set(0, 0)
      ball.prevPos.set(0, 0)
      ball.pos.set(0, 0)
      ball.prevOrientation.identity()
      ball.orientation.identity()
      ball.sideSpin = 0
      ball.forwardSpin = 0
      ball.sliding = 0
      ball.sleeping = true
      
      if (mode === '8ball') {
        ball.pocketed = (index !== 0 && index !== 8)
      } else {
        ball.pocketed = false
      }
      
      ball.dropping = false
      ball.dropProgress = 0
      ball.pocketIndex = -1
    })

    const cueBall = this.balls[0]
    cueBall.pos.set(-TABLE_WIDTH * 0.31, 0)
    cueBall.prevPos.copy(cueBall.pos)

    if (mode === '8ball') {
      const eightBall = this.balls[8]
      eightBall.pos.set(TABLE_WIDTH * 0.23, 0)
      eightBall.prevPos.copy(eightBall.pos)
      return
    }

    const rowSpacing = BALL_RADIUS * 2.05
    const colSpacing = BALL_RADIUS * 1.78
    const rackCenterX = TABLE_WIDTH * 0.23
    const rackOrder = [1, 9, 10, 2, 8, 3, 11, 4, 15, 5, 12, 6, 13, 7, 14]
    let rackIndex = 0

    for (let col = 0; col < 5; col += 1) {
      const x = rackCenterX + col * rowSpacing
      const yStart = -col * colSpacing * 0.5

      for (let row = 0; row <= col; row += 1) {
        const ballNumber = rackOrder[rackIndex]
        rackIndex += 1
        const ball = this.balls[ballNumber]
        ball.pos.set(x, yStart + row * colSpacing)
        ball.prevPos.copy(ball.pos)
      }
    }
  }

  breakShot(power = 0.94): void {
    this.shoot(0, power, { x: 0.03, y: 0.08 })
  }

  shoot(angle: number, power: number, spin: { x: number; y: number }): boolean {
    const cueBall = this.getCueBall()
    if (cueBall.pocketed || !this.isRackSettled()) {
      return false
    }

    const shotSpeed = MathUtils.lerp(MIN_SHOT_SPEED, MAX_SHOT_SPEED, MathUtils.clamp(power, 0, 1))
    cueBall.vel.set(Math.cos(angle), Math.sin(angle)).multiplyScalar(shotSpeed)
    cueBall.vel.addScaledVector(new Vector2(-Math.sin(angle), Math.cos(angle)), spin.x * 0.35)
    cueBall.sideSpin = MathUtils.clamp(spin.x, -1, 1) * 1.55
    cueBall.forwardSpin = MathUtils.clamp(spin.y, -1, 1) * 1.35
    cueBall.sliding = 1
    cueBall.sleeping = false
    return true
  }

  isRackSettled(): boolean {
    return this.balls.every((ball) => {
      if (ball.pocketed || ball.dropping) {
        return true
      }

      return ball.sleeping || ball.vel.lengthSq() < SLEEP_SPEED * SLEEP_SPEED
    })
  }

  step(deltaSeconds: number): number {
    const clampedDelta = Math.min(0.05, deltaSeconds)
    this.accumulator += clampedDelta
    let substeps = 0

    this.timeSinceImpactAudio += clampedDelta
    this.timeSinceRailAudio += clampedDelta

    while (this.accumulator >= FIXED_DT && substeps < MAX_SUBSTEPS) {
      this.balls.forEach((ball) => {
        ball.prevPos.copy(ball.pos)
        ball.prevOrientation.copy(ball.orientation)
      })

      this.simulateFixedStep(FIXED_DT)
      this.accumulator -= FIXED_DT
      substeps += 1
    }

    if (substeps === MAX_SUBSTEPS) {
      this.accumulator = 0
    }

    return this.accumulator / FIXED_DT
  }

  getInterpolatedPosition(ball: SimBall, alpha: number, target: Vector3): Vector3 {
    const pocketLift = ball.dropping ? MathUtils.lerp(0, -0.16, ball.dropProgress) : 0
    const x = MathUtils.lerp(ball.prevPos.x, ball.pos.x, alpha)
    const z = MathUtils.lerp(ball.prevPos.y, ball.pos.y, alpha)
    target.set(x, BALL_RADIUS + pocketLift, z)
    return target
  }

  getInterpolatedOrientation(ball: SimBall, alpha: number, target: Quaternion): Quaternion {
    return target.slerpQuaternions(ball.prevOrientation, ball.orientation, alpha)
  }

  private simulateFixedStep(dt: number): void {
    this.integrateMotion(dt)
    this.resolveBallCollisions()
    this.resolveBallCollisions()
    this.handleRailsAndPockets(dt)
    this.advancePocketDrops(dt)
  }

  private integrateMotion(dt: number): void {
    this.balls.forEach((ball) => {
      if (ball.pocketed || ball.dropping) {
        return
      }

      if (ball.sleeping) {
        return
      }

      const speed = ball.vel.length()
      if (speed > 1e-4) {
        const direction = TEMP_A.copy(ball.vel).normalize()
        const curveAmount = ball.sideSpin * speed * CURVE_FORCE
        ball.vel.x += -direction.y * curveAmount * dt
        ball.vel.y += direction.x * curveAmount * dt

        const spinDrive = ball.forwardSpin * FOLLOW_FORCE * dt * (0.35 + ball.sliding * 0.65)
        ball.vel.addScaledVector(direction, spinDrive)

        const friction = (ROLL_FRICTION + SLIDE_FRICTION * ball.sliding) * dt
        const nextSpeed = Math.max(0, ball.vel.length() - friction)
        setVectorLength(ball.vel, nextSpeed)

        ball.sideSpin = dampValue(ball.sideSpin, SPIN_DECAY, dt)
        ball.forwardSpin = dampValue(ball.forwardSpin, SPIN_DECAY * 0.7, dt)
        ball.sliding = Math.max(0, ball.sliding - dt * 2.8)
        ball.pos.addScaledVector(ball.vel, dt)

        this.integrateOrientation(ball, dt)
      }

      if (ball.vel.lengthSq() < SLEEP_SPEED * SLEEP_SPEED && Math.abs(ball.sideSpin) < 0.04 && Math.abs(ball.forwardSpin) < 0.04) {
        ball.vel.set(0, 0)
        ball.sideSpin = 0
        ball.forwardSpin = 0
        ball.sliding = 0
        ball.sleeping = true
      } else {
        ball.sleeping = false
      }
    })
  }

  private integrateOrientation(ball: SimBall, dt: number): void {
    const speed = ball.vel.length()
    if (speed < 1e-5) {
      return
    }

    TEMP_AXIS.set(ball.vel.y, 0, -ball.vel.x)
    if (TEMP_AXIS.lengthSq() > 0) {
      TEMP_AXIS.normalize()
    }

    const rollSpeed = speed / BALL_RADIUS
    TEMP_QUAT.setFromAxisAngle(TEMP_AXIS, rollSpeed * dt)

    if (Math.abs(ball.sideSpin) > 0.001) {
      TEMP_VEC3.set(0, 1, 0)
      TEMP_QUAT_B.setFromAxisAngle(TEMP_VEC3, ball.sideSpin * dt * 0.45)
      TEMP_QUAT.multiply(TEMP_QUAT_B)
    }

    ball.orientation.multiply(TEMP_QUAT).normalize()
  }

  private resolveBallCollisions(): void {
    for (let i = 0; i < this.balls.length; i += 1) {
      const ballA = this.balls[i]
      if (ballA.pocketed || ballA.dropping) {
        continue
      }

      for (let j = i + 1; j < this.balls.length; j += 1) {
        const ballB = this.balls[j]
        if (ballB.pocketed || ballB.dropping) {
          continue
        }

        TEMP_A.copy(ballB.pos).sub(ballA.pos)
        const minDistance = BALL_RADIUS * 2
        const distanceSq = TEMP_A.lengthSq()

        if (distanceSq <= 0 || distanceSq >= minDistance * minDistance) {
          continue
        }

        const distance = Math.sqrt(distanceSq)
        const normal = TEMP_A.divideScalar(distance)
        const tangent = TEMP_B.set(-normal.y, normal.x)
        const overlap = minDistance - distance

        ballA.pos.addScaledVector(normal, -overlap * 0.5)
        ballB.pos.addScaledVector(normal, overlap * 0.5)

        const relativeVelocity = TEMP_C.copy(ballB.vel).sub(ballA.vel)
        const separatingSpeed = relativeVelocity.dot(normal)
        if (separatingSpeed > 0) {
          continue
        }

        const impulse = -(1 + BALL_RESTITUTION) * separatingSpeed * 0.5
        ballA.vel.addScaledVector(normal, -impulse)
        ballB.vel.addScaledVector(normal, impulse)

        const tangentialSpeed = relativeVelocity.dot(tangent)
        const frictionImpulse = MathUtils.clamp(-tangentialSpeed * CONTACT_FRICTION, -0.22, 0.22)
        ballA.vel.addScaledVector(tangent, -frictionImpulse)
        ballB.vel.addScaledVector(tangent, frictionImpulse)

        this.applyEnglishTransfer(ballA, ballB, normal, tangent, Math.abs(separatingSpeed))

        ballA.sliding = Math.max(ballA.sliding, 0.65)
        ballB.sliding = Math.max(ballB.sliding, 0.65)
        ballA.sleeping = false
        ballB.sleeping = false

        if (this.timeSinceImpactAudio > 0.035) {
          this.options.onBallCollision?.(Math.abs(separatingSpeed))
          this.timeSinceImpactAudio = 0
        }
      }
    }
  }

  private applyEnglishTransfer(
    ballA: SimBall,
    ballB: SimBall,
    normal: Vector2,
    tangent: Vector2,
    impactSpeed: number,
  ): void {
    const cueBall = ballA.number === 0 ? ballA : ballB.number === 0 ? ballB : null
    if (!cueBall) {
      return
    }

    const cueIsA = cueBall === ballA
    const forwardDirection = cueIsA ? normal : TEMP_A.copy(normal).multiplyScalar(-1)
    const followAmount = MathUtils.clamp(cueBall.forwardSpin * impactSpeed * 0.22, -0.5, 0.42)
    cueBall.vel.addScaledVector(forwardDirection, followAmount)

    const sideAmount = MathUtils.clamp(cueBall.sideSpin * impactSpeed * SIDE_THROW, -0.22, 0.22)
    cueBall.vel.addScaledVector(tangent, cueIsA ? sideAmount : -sideAmount)

    const objectBall = cueIsA ? ballB : ballA
    objectBall.vel.addScaledVector(tangent, cueIsA ? sideAmount * 0.4 : -sideAmount * 0.4)

    cueBall.forwardSpin *= 0.48
    cueBall.sideSpin *= 0.56
  }

  private handleRailsAndPockets(_dt: number): void {
    this.balls.forEach((ball) => {
      if (ball.pocketed || ball.dropping) {
        return
      }

      let hitRail = false
      hitRail = this.resolvePocketLips(ball) || hitRail

      const inCornerGate = Math.abs(ball.pos.x) > HALF_WIDTH - CORNER_GATE
      const inSideGate = Math.abs(ball.pos.x) < SIDE_GATE

      if (ball.pos.x - BALL_RADIUS < -HALF_WIDTH && !this.isInsideVerticalPocketGate(ball.pos.y)) {
        ball.pos.x = -HALF_WIDTH + BALL_RADIUS
        ball.vel.x = Math.abs(ball.vel.x) * RAIL_RESTITUTION
        ball.vel.y *= 0.985
        ball.sideSpin *= 0.82
        hitRail = true
      } else if (ball.pos.x + BALL_RADIUS > HALF_WIDTH && !this.isInsideVerticalPocketGate(ball.pos.y)) {
        ball.pos.x = HALF_WIDTH - BALL_RADIUS
        ball.vel.x = -Math.abs(ball.vel.x) * RAIL_RESTITUTION
        ball.vel.y *= 0.985
        ball.sideSpin *= 0.82
        hitRail = true
      }

      if (ball.pos.y - BALL_RADIUS < -HALF_LENGTH && !(inSideGate || inCornerGate)) {
        ball.pos.y = -HALF_LENGTH + BALL_RADIUS
        ball.vel.y = Math.abs(ball.vel.y) * RAIL_RESTITUTION
        ball.vel.x *= 0.985
        ball.sideSpin *= 0.78
        hitRail = true
      } else if (ball.pos.y + BALL_RADIUS > HALF_LENGTH && !(inSideGate || inCornerGate)) {
        ball.pos.y = HALF_LENGTH - BALL_RADIUS
        ball.vel.y = -Math.abs(ball.vel.y) * RAIL_RESTITUTION
        ball.vel.x *= 0.985
        ball.sideSpin *= 0.78
        hitRail = true
      }

      if (hitRail) {
        ball.sliding = Math.max(ball.sliding, 0.36)
        ball.sleeping = false

        if (this.timeSinceRailAudio > 0.055) {
          this.options.onRailCollision?.(ball.vel.length())
          this.timeSinceRailAudio = 0
        }
      }

      this.captureIfPocketed(ball)
    })
  }

  private isInsideVerticalPocketGate(z: number): boolean {
    return Math.abs(z) > HALF_LENGTH - CORNER_GATE
  }

  private resolvePocketLips(ball: SimBall): boolean {
    let touchedLip = false

    for (const pocket of POCKETS) {
      TEMP_A.copy(ball.pos).sub(pocket.center)
      const distance = TEMP_A.length()
      if (distance <= 1e-4 || distance >= pocket.lipRadius) {
        continue
      }

      if (distance > pocket.captureRadius + BALL_RADIUS * 0.4) {
        const normal = TEMP_A.divideScalar(distance)
        const target = pocket.captureRadius + BALL_RADIUS * 0.48
        if (distance < target) {
          ball.pos.copy(pocket.center).addScaledVector(normal, target)
          const separating = ball.vel.dot(normal)
          if (separating < 0) {
            ball.vel.addScaledVector(normal, -(1 + RAIL_RESTITUTION) * separating)
            touchedLip = true
          }
        }
      }
    }

    return touchedLip
  }

  private captureIfPocketed(ball: SimBall): void {
    for (const pocket of POCKETS) {
      TEMP_A.copy(pocket.center).sub(ball.pos)
      const distance = TEMP_A.length()
      const speed = ball.vel.length()
      let towardPocket = 1

      if (distance > 0 && speed > 1e-5) {
        const invDistance = 1 / distance
        const invSpeed = 1 / speed
        towardPocket = (TEMP_A.x * invDistance) * (ball.vel.x * invSpeed) + (TEMP_A.y * invDistance) * (ball.vel.y * invSpeed)
      }

      const allowCapture = distance < pocket.captureRadius && (speed < 2.8 || towardPocket > -0.15)

      if (!allowCapture) {
        continue
      }

      // Handle cue ball scratch — respot instead of permanently pocketing
      if (ball.number === 0) {
        ball.vel.set(0, 0)
        ball.sideSpin = 0
        ball.forwardSpin = 0
        ball.sliding = 0
        ball.sleeping = true
        ball.dropping = true
        ball.dropProgress = 0
        ball.pocketIndex = pocket.index
        ball.pos.copy(pocket.center)
        this.pendingCueBallRespot = true
        this.options.onCueBallScratch?.()
        return
      }

      if (ball.number === 8 && this.options.canPocketEightBall && !this.options.canPocketEightBall()) {
        this.options.onEightBallFoul?.()
        this.respotEightBall()
        return
      }

      ball.vel.set(0, 0)
      ball.sideSpin = 0
      ball.forwardSpin = 0
      ball.sliding = 0
      ball.sleeping = true
      ball.dropping = true
      ball.dropProgress = 0
      ball.pocketIndex = pocket.index
      ball.pos.copy(pocket.center)
      this.options.onPocketBall?.(ball.number)
      return
    }
  }

  private advancePocketDrops(dt: number): void {
    this.balls.forEach((ball) => {
      if (!ball.dropping) {
        return
      }

      ball.dropProgress = Math.min(1, ball.dropProgress + dt / DROP_DURATION)
      if (ball.dropProgress >= 1) {
        ball.dropping = false

        // Cue ball scratch: respot instead of permanent pocket
        if (ball.number === 0 && this.pendingCueBallRespot) {
          this.pendingCueBallRespot = false
          this.respotCueBall()
          return
        }

        ball.pocketed = true
      }
    })
  }

  private respotCueBall(): void {
    const cueBall = this.balls[0]
    // Respot behind the head string (the break end of the table)
    const headStringY = -TABLE_LENGTH * 0.31
    const candidateSpots = [
      new Vector2(0, headStringY),
      new Vector2(-BALL_RADIUS * 4, headStringY),
      new Vector2(BALL_RADIUS * 4, headStringY),
      new Vector2(0, headStringY - BALL_RADIUS * 3),
      new Vector2(0, headStringY + BALL_RADIUS * 3),
    ]

    for (const spot of candidateSpots) {
      const hasCollision = this.balls.some((ball) => {
        if (ball.number === 0 || ball.pocketed || ball.dropping) {
          return false
        }
        return ball.pos.distanceToSquared(spot) < (BALL_RADIUS * 2.4) ** 2
      })

      if (!hasCollision) {
        cueBall.pos.copy(spot)
        cueBall.prevPos.copy(spot)
        cueBall.vel.set(0, 0)
        cueBall.sideSpin = 0
        cueBall.forwardSpin = 0
        cueBall.sliding = 0
        cueBall.sleeping = true
        cueBall.pocketed = false
        cueBall.dropping = false
        cueBall.dropProgress = 0
        cueBall.pocketIndex = -1
        return
      }
    }

    // Fallback: place at center of head string area
    cueBall.pos.set(0, headStringY)
    cueBall.prevPos.copy(cueBall.pos)
    cueBall.vel.set(0, 0)
    cueBall.sideSpin = 0
    cueBall.forwardSpin = 0
    cueBall.sliding = 0
    cueBall.sleeping = true
    cueBall.pocketed = false
    cueBall.dropping = false
    cueBall.dropProgress = 0
    cueBall.pocketIndex = -1
  }

  private respotEightBall(): void {
    const eightBall = this.balls[8]
    const candidateSpots = [
      new Vector2(0, 0),
      new Vector2(0, TABLE_LENGTH * 0.1),
      new Vector2(0, -TABLE_LENGTH * 0.08),
      new Vector2(-BALL_RADIUS * 4, 0),
      new Vector2(BALL_RADIUS * 4, 0),
    ]

    for (const spot of candidateSpots) {
      const hasCollision = this.balls.some((ball) => {
        if (ball.number === 8 || ball.pocketed || ball.dropping) {
          return false
        }

        return ball.pos.distanceToSquared(spot) < (BALL_RADIUS * 2.4) ** 2
      })

      if (!hasCollision) {
        eightBall.pos.copy(spot)
        eightBall.prevPos.copy(spot)
        eightBall.vel.set(0, 0)
        eightBall.sideSpin = 0
        eightBall.forwardSpin = 0
        eightBall.sliding = 0
        eightBall.sleeping = true
        eightBall.pocketed = false
        eightBall.dropping = false
        eightBall.dropProgress = 0
        eightBall.pocketIndex = -1
        return
      }
    }

    eightBall.pos.set(0, 0)
    eightBall.prevPos.copy(eightBall.pos)
    eightBall.vel.set(0, 0)
    eightBall.sleeping = true
    eightBall.pocketed = false
    eightBall.dropping = false
    eightBall.dropProgress = 0
    eightBall.pocketIndex = -1
  }
}
