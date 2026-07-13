import { AudioController } from './audio.ts'
import type {
  DifficultyMode,
  GameCallbacks,
  GamePhase,
  GameSnapshot,
  RoundStats,
} from './types.ts'

const TAU = Math.PI * 2
const HIGH_SCORE_KEY = 'orbit-breaker-high-score'
const DIFFICULTY_KEY = 'orbit-breaker-difficulty'
const ACHIEVEMENTS_KEY = 'orbit-breaker-achievements'
const PULSE_COST = 30

type PowerUpKind = 'shield' | 'chrono' | 'magnet'
type AchievementId =
  | 'first-light'
  | 'flow-rider'
  | 'ghost-orbit'
  | 'breaker'
  | 'power-trip'
  | 'star-chaser'

interface DifficultyConfig {
  hazardSpeed: number
  spawnInterval: number
  scoreMultiplier: number
}

const DIFFICULTIES: Record<DifficultyMode, DifficultyConfig> = {
  drift: { hazardSpeed: 0.78, spawnInterval: 1.18, scoreMultiplier: 0.8 },
  classic: { hazardSpeed: 1, spawnInterval: 1, scoreMultiplier: 1 },
  hyper: { hazardSpeed: 1.26, spawnInterval: 0.76, scoreMultiplier: 1.5 },
}

const ACHIEVEMENTS: Record<AchievementId, string> = {
  'first-light': 'Catch your first energy shard',
  'flow-rider': 'Reach a 5× Flow multiplier',
  'ghost-orbit': 'Survive 30 seconds without hull damage',
  breaker: 'Break 5 threats in one run',
  'power-trip': 'Collect all three power-up types in one run',
  'star-chaser': 'Score 5,000 points in one run',
}

interface Hazard {
  angle: number
  radius: number
  speed: number
  size: number
  rotation: number
  spin: number
  wobble: number
  wobbleSpeed: number
  wobblePhase: number
  passedOrbit: boolean
  kind: 'rock' | 'comet' | 'mine'
}

interface Shard {
  angle: number
  radius: number
  speed: number
  size: number
  rotation: number
  spin: number
  drift: number
  color: string
}

interface PowerUp {
  angle: number
  radius: number
  speed: number
  size: number
  rotation: number
  spin: number
  kind: PowerUpKind
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
  drag: number
  shape: 'dot' | 'streak'
}

interface Star {
  x: number
  y: number
  size: number
  alpha: number
  phase: number
  speed: number
  color: string
}

interface TrailPoint {
  x: number
  y: number
  life: number
  maxLife: number
}

interface PulseWave {
  x: number
  y: number
  radius: number
  speed: number
  life: number
  maxLife: number
}

interface Point {
  x: number
  y: number
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function shortestAngle(target: number, current: number): number {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current))
}

function distance(first: Point, second: Point): number {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

export class OrbitGame {
  private readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private readonly audio: AudioController
  private readonly callbacks: GameCallbacks
  private readonly keys = new Set<string>()
  private readonly reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  private readonly resizeObserver: ResizeObserver

  private phase: GamePhase = 'ready'
  private width = 0
  private height = 0
  private pixelRatio = 1
  private center: Point = { x: 0, y: 0 }
  private orbitRadius = 160
  private outerRadius = 500
  private coreRadius = 42
  private worldScale = 1
  private stars: Star[] = []
  private hazards: Hazard[] = []
  private shards: Shard[] = []
  private powerUps: PowerUp[] = []
  private particles: Particle[] = []
  private trail: TrailPoint[] = []
  private pulseWaves: PulseWave[] = []

  private difficulty = this.readDifficulty()
  private achievements = this.readAchievements()
  private score = 0
  private highScore = this.readHighScore()
  private combo = 1
  private maxCombo = 1
  private lives = 3
  private energy = 40
  private level = 1
  private elapsed = 0
  private shardsCollected = 0
  private nearMisses = 0
  private threatsBroken = 0
  private powerUpsCollected = 0
  private hitsTaken = 0
  private shield = false
  private timeWarp = 0
  private magnet = 0
  private collectedPowerUpKinds = new Set<PowerUpKind>()
  private lastComboEvent = 0

  private playerAngle = -Math.PI / 2
  private angularVelocity = 0
  private lastDirection = 1
  private invulnerability = 0
  private pointerActive = false
  private pointerId: number | null = null
  private pointerTargetAngle = -Math.PI / 2
  private hazardTimer = 0.75
  private shardTimer = 1.2
  private powerUpTimer = 7
  private powerUpSequenceIndex = 0
  private nextShardStorm = 28
  private snapshotTimer = 0
  private trailTimer = 0
  private ambientTime = 0
  private screenShake = 0
  private screenFlash = 0
  private coreFlash = 0
  private lastFrameTime = performance.now()
  private animationFrame = 0
  private reducedMotion = this.reducedMotionQuery.matches

  constructor(canvas: HTMLCanvasElement, audio: AudioController, callbacks: GameCallbacks) {
    this.canvas = canvas
    this.audio = audio
    this.callbacks = callbacks

    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser does not support 2D canvas rendering.')
    this.context = context

    this.resizeObserver = new ResizeObserver(this.handleResize)
    this.resizeObserver.observe(this.canvas)
    this.reducedMotionQuery.addEventListener('change', this.handleMotionPreference)
    document.addEventListener('keydown', this.handleKeyDown)
    document.addEventListener('keyup', this.handleKeyUp)
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
    this.canvas.addEventListener('pointerdown', this.handlePointerDown)
    this.canvas.addEventListener('pointermove', this.handlePointerMove)
    this.canvas.addEventListener('pointerup', this.handlePointerUp)
    this.canvas.addEventListener('pointercancel', this.handlePointerUp)

    this.resize()
    this.emitSnapshot()
    this.animationFrame = requestAnimationFrame(this.loop)
  }

  setDifficulty(mode: DifficultyMode): void {
    if (this.phase === 'playing' || this.phase === 'paused' || !DIFFICULTIES[mode]) return

    this.difficulty = mode
    try {
      localStorage.setItem(DIFFICULTY_KEY, mode)
    } catch {
      // The selection still applies to the current session when storage is blocked.
    }
    this.emitSnapshot()
  }

  start(): void {
    this.audio.unlock()
    this.resetRound()
    this.phase = 'playing'
    this.lastFrameTime = performance.now()
    this.audio.play('start')
    this.callbacks.onPhaseChange(this.phase)
    this.callbacks.announce('Run started. Dodge threats and collect energy shards.')
    this.emitSnapshot()
  }

  togglePause(): void {
    if (this.phase === 'playing') {
      this.pause()
    } else if (this.phase === 'paused') {
      this.resume()
    }
  }

  pulse(): void {
    if (this.phase !== 'playing' || this.energy < PULSE_COST) return

    this.audio.unlock()
    this.energy -= PULSE_COST
    const player = this.getPlayerPosition()
    const range = clamp(205 * this.worldScale, 145, 235)
    let broken = 0

    this.hazards = this.hazards.filter((hazard) => {
      const position = this.getPolarPosition(hazard.angle, hazard.radius)
      if (distance(player, position) > range) return true

      this.createBurst(position.x, position.y, '#ff5bd6', hazard.kind === 'mine' ? 22 : 14)
      broken += 1
      return false
    })

    if (broken > 0) {
      this.addScore(broken * 90 * this.combo)
      this.combo = Math.min(9.9, this.combo + broken * 0.2)
      this.maxCombo = Math.max(this.maxCombo, this.combo)
      this.threatsBroken += broken
      this.lastComboEvent = this.elapsed
      this.screenShake = this.reducedMotion ? 0 : Math.min(15, 4 + broken * 2)
      this.callbacks.announce(`Pulse broke ${broken} ${broken === 1 ? 'threat' : 'threats'}.`)
      this.checkAchievements()
    }

    this.pulseWaves.push({
      x: player.x,
      y: player.y,
      radius: 8,
      speed: 520 * this.worldScale,
      life: 0.55,
      maxLife: 0.55,
    })
    this.createBurst(player.x, player.y, '#5ffbf1', 18)
    this.audio.play('pulse')
    this.emitSnapshot()
  }

  destroy(): void {
    cancelAnimationFrame(this.animationFrame)
    this.resizeObserver.disconnect()
    this.reducedMotionQuery.removeEventListener('change', this.handleMotionPreference)
    document.removeEventListener('keydown', this.handleKeyDown)
    document.removeEventListener('keyup', this.handleKeyUp)
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
    this.canvas.removeEventListener('pointermove', this.handlePointerMove)
    this.canvas.removeEventListener('pointerup', this.handlePointerUp)
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp)
  }

  private resetRound(): void {
    this.hazards = []
    this.shards = []
    this.powerUps = []
    this.particles = []
    this.trail = []
    this.pulseWaves = []
    this.score = 0
    this.combo = 1
    this.maxCombo = 1
    this.lives = 3
    this.energy = 40
    this.level = 1
    this.elapsed = 0
    this.shardsCollected = 0
    this.nearMisses = 0
    this.threatsBroken = 0
    this.powerUpsCollected = 0
    this.hitsTaken = 0
    this.shield = false
    this.timeWarp = 0
    this.magnet = 0
    this.collectedPowerUpKinds.clear()
    this.lastComboEvent = 0
    this.playerAngle = -Math.PI / 2
    this.pointerTargetAngle = this.playerAngle
    this.angularVelocity = 0
    this.invulnerability = 0
    this.hazardTimer = 1
    this.shardTimer = 0.75
    this.powerUpTimer = 6
    this.powerUpSequenceIndex = 0
    this.nextShardStorm = 28
    this.snapshotTimer = 0
    this.screenShake = 0
    this.screenFlash = 0
    this.coreFlash = 0

    this.spawnShard(-Math.PI / 2 + 0.55)
    this.spawnShard(-Math.PI / 2 - 0.7)
  }

  private pause(): void {
    if (this.phase !== 'playing') return
    this.phase = 'paused'
    this.keys.clear()
    this.pointerActive = false
    this.callbacks.onPhaseChange(this.phase)
    this.callbacks.announce('Game paused.')
    this.emitSnapshot()
  }

  private resume(): void {
    if (this.phase !== 'paused') return
    this.phase = 'playing'
    this.lastFrameTime = performance.now()
    this.callbacks.onPhaseChange(this.phase)
    this.callbacks.announce('Game resumed.')
    this.emitSnapshot()
  }

  private endRound(): void {
    if (this.phase === 'gameover') return

    this.phase = 'gameover'
    this.keys.clear()
    this.pointerActive = false
    const finalScore = Math.floor(this.score)
    const isHighScore = finalScore > this.highScore

    if (isHighScore) {
      this.highScore = finalScore
      try {
        localStorage.setItem(HIGH_SCORE_KEY, String(finalScore))
      } catch {
        // The score remains available for this session when storage is blocked.
      }
    }

    const stats: RoundStats = {
      score: finalScore,
      time: this.elapsed,
      shards: this.shardsCollected,
      nearMisses: this.nearMisses,
      threatsBroken: this.threatsBroken,
      powerUps: this.powerUpsCollected,
      maxCombo: this.maxCombo,
      difficulty: this.difficulty,
      isHighScore,
    }

    this.audio.play('gameOver')
    this.emitSnapshot()
    this.callbacks.onPhaseChange(this.phase, stats)
    this.callbacks.announce(`Run over. Final score ${finalScore}.`)
  }

  private readonly loop = (time: number): void => {
    const delta = Math.min(0.04, Math.max(0, (time - this.lastFrameTime) / 1000))
    this.lastFrameTime = time
    this.ambientTime += delta

    if (this.phase === 'playing') {
      this.updateGame(delta)
    } else if (this.phase !== 'paused') {
      this.screenShake = Math.max(0, this.screenShake - delta * 35)
      this.screenFlash = Math.max(0, this.screenFlash - delta * 2.7)
      this.coreFlash = Math.max(0, this.coreFlash - delta * 3.5)
      this.updateEffects(delta)
    }

    this.render()
    this.animationFrame = requestAnimationFrame(this.loop)
  }

  private updateGame(delta: number): void {
    this.elapsed += delta
    this.invulnerability = Math.max(0, this.invulnerability - delta)
    this.timeWarp = Math.max(0, this.timeWarp - delta)
    this.magnet = Math.max(0, this.magnet - delta)
    this.screenShake = Math.max(0, this.screenShake - delta * 35)
    this.screenFlash = Math.max(0, this.screenFlash - delta * 2.7)
    this.coreFlash = Math.max(0, this.coreFlash - delta * 3.5)

    this.updatePlayer(delta)
    this.updateSpawning(delta)
    this.updateHazards(delta)
    if (this.phase !== 'playing') {
      this.updateEffects(delta)
      return
    }
    this.updateShards(delta)
    this.updatePowerUps(delta)
    this.updateEffects(delta)

    this.addScore(delta * (11 + this.level * 1.4) * this.combo)

    if (this.elapsed - this.lastComboEvent > 3.6 && this.combo > 1) {
      this.combo = Math.max(1, this.combo - delta * 0.42)
    }

    const nextLevel = Math.floor(this.elapsed / 18) + 1
    if (nextLevel > this.level) {
      this.level = nextLevel
      this.energy = Math.min(100, this.energy + 12)
      this.audio.play('levelUp')
      this.callbacks.announce(`Level ${this.level}. Threat speed increased.`)
      this.createBurst(this.center.x, this.center.y, '#ffd66b', 26)
    }

    this.maxCombo = Math.max(this.maxCombo, this.combo)
    this.checkAchievements()

    this.snapshotTimer += delta
    if (this.snapshotTimer >= 0.08) {
      this.snapshotTimer = 0
      this.emitSnapshot()
    }
  }

  private updatePlayer(delta: number): void {
    const left = this.keys.has('ArrowLeft') || this.keys.has('KeyA')
    const right = this.keys.has('ArrowRight') || this.keys.has('KeyD')
    const direction = Number(right) - Number(left)
    const maximumSpeed = 3.45 + Math.min(0.55, this.level * 0.035)

    if (this.pointerActive) {
      const difference = shortestAngle(this.pointerTargetAngle, this.playerAngle)
      const desiredVelocity = clamp(difference * 9.5, -maximumSpeed * 1.12, maximumSpeed * 1.12)
      this.angularVelocity += (desiredVelocity - this.angularVelocity) * Math.min(1, delta * 12)
    } else if (direction !== 0) {
      this.angularVelocity += direction * 11.5 * delta
      this.angularVelocity = clamp(this.angularVelocity, -maximumSpeed, maximumSpeed)
    } else {
      this.angularVelocity *= Math.pow(0.0008, delta)
    }

    if (Math.abs(this.angularVelocity) > 0.06) {
      this.lastDirection = Math.sign(this.angularVelocity)
    }

    this.playerAngle += this.angularVelocity * delta
    this.playerAngle = Math.atan2(Math.sin(this.playerAngle), Math.cos(this.playerAngle))

    this.trailTimer += delta
    if (this.trailTimer > (this.reducedMotion ? 0.055 : 0.025)) {
      this.trailTimer = 0
      const position = this.getPlayerPosition()
      this.trail.push({ x: position.x, y: position.y, life: 0.42, maxLife: 0.42 })
      if (this.trail.length > (this.reducedMotion ? 8 : 20)) this.trail.shift()
    }
  }

  private updateSpawning(delta: number): void {
    this.hazardTimer -= delta
    this.shardTimer -= delta
    this.powerUpTimer -= delta
    const difficulty = DIFFICULTIES[this.difficulty]

    if (this.hazardTimer <= 0) {
      const baseAngle = Math.random() * TAU
      this.spawnHazard(baseAngle)

      if (this.level >= 4 && Math.random() < Math.min(0.3, 0.08 + this.level * 0.018)) {
        const offset = 0.28 + Math.random() * 0.32
        this.spawnHazard(baseAngle + (Math.random() < 0.5 ? -offset : offset))
      }

      const interval = Math.max(0.38, 1.18 - this.level * 0.055)
      this.hazardTimer = interval * difficulty.spawnInterval * (0.78 + Math.random() * 0.5)
    }

    if (this.shardTimer <= 0) {
      this.spawnShard()
      this.shardTimer = Math.max(1.45, 2.45 - this.level * 0.035) * (0.82 + Math.random() * 0.4)
    }

    if (this.powerUpTimer <= 0 && this.powerUps.length < 2) {
      this.spawnPowerUp()
      this.powerUpTimer = 14 + Math.random() * 7
    }

    if (this.elapsed >= this.nextShardStorm) {
      this.triggerShardStorm()
      this.nextShardStorm += 30
    }
  }

  private updateHazards(delta: number): void {
    const player = this.getPlayerPosition()
    const timeScale = this.timeWarp > 0 ? 0.48 : 1

    for (let index = this.hazards.length - 1; index >= 0; index -= 1) {
      const hazard = this.hazards[index]
      hazard.radius -= hazard.speed * delta * timeScale
      hazard.rotation += hazard.spin * delta * timeScale
      hazard.angle +=
        Math.sin(this.ambientTime * hazard.wobbleSpeed + hazard.wobblePhase) *
        hazard.wobble *
        delta *
        timeScale

      const position = this.getPolarPosition(hazard.angle, hazard.radius)
      const collisionRadius = hazard.size + 13 * this.worldScale

      if (this.invulnerability <= 0 && distance(player, position) < collisionRadius) {
        this.hazards.splice(index, 1)
        this.createBurst(position.x, position.y, '#ff4f91', 24)
        this.takeHit()
        if (this.phase === 'gameover') return
        continue
      }

      if (!hazard.passedOrbit && hazard.radius < this.orbitRadius - hazard.size - 13) {
        hazard.passedOrbit = true
        if (distance(player, position) < hazard.size + 78 * this.worldScale) {
          this.nearMisses += 1
          this.combo = Math.min(9.9, this.combo + 0.24)
          this.maxCombo = Math.max(this.maxCombo, this.combo)
          this.energy = Math.min(100, this.energy + 5)
          this.addScore(55 * this.combo)
          this.lastComboEvent = this.elapsed
          this.audio.play('nearMiss')
          this.createNearMissSparks(position.x, position.y)
        }
      }

      if (hazard.radius < this.coreRadius + hazard.size * 0.35) {
        this.hazards.splice(index, 1)
        this.coreFlash = 1
        this.createBurst(position.x, position.y, '#ff8b5f', 8)
      }
    }
  }

  private updateShards(delta: number): void {
    const player = this.getPlayerPosition()

    for (let index = this.shards.length - 1; index >= 0; index -= 1) {
      const shard = this.shards[index]
      shard.radius -= shard.speed * delta
      shard.angle += shard.drift * delta
      shard.rotation += shard.spin * delta
      let position = this.getPolarPosition(shard.angle, shard.radius)

      if (this.magnet > 0 && distance(player, position) < 275 * this.worldScale) {
        const anglePull = shortestAngle(this.playerAngle, shard.angle)
        shard.angle += anglePull * Math.min(1, delta * 4.2)
        shard.radius += (this.orbitRadius - shard.radius) * Math.min(0.12, delta * 1.8)
        position = this.getPolarPosition(shard.angle, shard.radius)
      }

      if (distance(player, position) < shard.size + 17 * this.worldScale) {
        this.shards.splice(index, 1)
        this.collectShard(shard, position)
        continue
      }

      if (shard.radius < this.coreRadius) {
        this.shards.splice(index, 1)
      }
    }
  }

  private updatePowerUps(delta: number): void {
    const player = this.getPlayerPosition()

    for (let index = this.powerUps.length - 1; index >= 0; index -= 1) {
      const powerUp = this.powerUps[index]
      powerUp.radius -= powerUp.speed * delta
      powerUp.rotation += powerUp.spin * delta
      const position = this.getPolarPosition(powerUp.angle, powerUp.radius)

      if (distance(player, position) < powerUp.size + 19 * this.worldScale) {
        this.powerUps.splice(index, 1)
        this.collectPowerUp(powerUp, position)
        continue
      }

      if (powerUp.radius < this.coreRadius) {
        this.powerUps.splice(index, 1)
      }
    }
  }

  private updateEffects(delta: number): void {
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index]
      particle.life -= delta
      if (particle.life <= 0) {
        this.particles.splice(index, 1)
        continue
      }

      particle.x += particle.vx * delta
      particle.y += particle.vy * delta
      const drag = Math.pow(particle.drag, delta * 60)
      particle.vx *= drag
      particle.vy *= drag
    }

    for (let index = this.trail.length - 1; index >= 0; index -= 1) {
      this.trail[index].life -= delta
      if (this.trail[index].life <= 0) this.trail.splice(index, 1)
    }

    for (let index = this.pulseWaves.length - 1; index >= 0; index -= 1) {
      const wave = this.pulseWaves[index]
      wave.life -= delta
      wave.radius += wave.speed * delta
      if (wave.life <= 0) this.pulseWaves.splice(index, 1)
    }
  }

  private spawnHazard(angle = Math.random() * TAU): void {
    const roll = Math.random()
    const kind: Hazard['kind'] =
      this.level >= 3 && roll > 0.84 ? 'mine' : this.level >= 2 && roll < 0.28 ? 'comet' : 'rock'
    const baseSpeed = 76 + this.level * 7.5 + Math.random() * 24
    const sizeScale = this.worldScale * (0.9 + Math.random() * 0.25)

    this.hazards.push({
      angle,
      radius: this.outerRadius + Math.random() * 70,
      speed:
        (kind === 'comet' ? baseSpeed * 1.38 : kind === 'mine' ? baseSpeed * 0.72 : baseSpeed) *
        DIFFICULTIES[this.difficulty].hazardSpeed,
      size: (kind === 'mine' ? 23 : kind === 'comet' ? 10 : 15 + Math.random() * 7) * sizeScale,
      rotation: Math.random() * TAU,
      spin: (Math.random() - 0.5) * (kind === 'mine' ? 2.8 : 1.8),
      wobble: kind === 'comet' ? 0.07 : kind === 'mine' ? 0.025 : 0.012,
      wobbleSpeed: 1.2 + Math.random() * 2.1,
      wobblePhase: Math.random() * TAU,
      passedOrbit: false,
      kind,
    })
  }

  private spawnShard(angle = Math.random() * TAU, radiusFactor?: number): void {
    const color = Math.random() < 0.22 ? '#ff79df' : '#62fff2'
    this.shards.push({
      angle,
      radius: this.outerRadius * (radiusFactor ?? 0.86 + Math.random() * 0.08),
      speed: 54 + this.level * 2 + Math.random() * 8,
      size: (8 + Math.random() * 3) * this.worldScale,
      rotation: Math.random() * TAU,
      spin: (Math.random() < 0.5 ? -1 : 1) * (1.8 + Math.random() * 2),
      drift: (Math.random() - 0.5) * 0.09,
      color,
    })
  }

  private spawnPowerUp(): void {
    const kinds: PowerUpKind[] = ['shield', 'chrono', 'magnet']
    const kind = kinds[this.powerUpSequenceIndex % kinds.length]
    this.powerUpSequenceIndex += 1

    this.powerUps.push({
      angle: this.playerAngle + (Math.random() - 0.5) * 0.3,
      radius: this.outerRadius * (0.74 + Math.random() * 0.08),
      speed: 45 + this.level * 1.5,
      size: 14 * this.worldScale,
      rotation: Math.random() * TAU,
      spin: (Math.random() < 0.5 ? -1 : 1) * 1.2,
      kind,
    })
  }

  private triggerShardStorm(): void {
    const baseAngle = Math.random() * TAU
    for (let index = 0; index < 9; index += 1) {
      const angle = baseAngle + (index / 9) * TAU + (Math.random() - 0.5) * 0.12
      this.spawnShard(angle, 0.71 + index * 0.018)
    }

    this.audio.play('storm')
    this.createBurst(this.center.x, this.center.y, '#62fff2', 24)
    this.callbacks.onToast({
      title: 'Shard storm',
      message: 'Nine energy signatures inbound',
      tone: 'event',
    })
    this.callbacks.announce('Shard storm incoming. Nine energy signatures detected.')
  }

  private collectShard(shard: Shard, position: Point): void {
    this.shardsCollected += 1
    this.combo = Math.min(9.9, this.combo + (shard.color === '#ff79df' ? 0.75 : 0.5))
    this.maxCombo = Math.max(this.maxCombo, this.combo)
    this.energy = Math.min(100, this.energy + (shard.color === '#ff79df' ? 25 : 18))
    this.addScore((shard.color === '#ff79df' ? 180 : 120) * this.combo)
    this.lastComboEvent = this.elapsed
    this.createBurst(position.x, position.y, shard.color, 16)
    this.audio.play('collect')
    this.checkAchievements()
  }

  private collectPowerUp(powerUp: PowerUp, position: Point): void {
    let title = ''
    let message = ''

    if (powerUp.kind === 'shield') {
      this.shield = true
      title = 'Aegis online'
      message = 'The next impact is absorbed'
    } else if (powerUp.kind === 'chrono') {
      this.timeWarp = Math.max(this.timeWarp, 8)
      title = 'Chrono field'
      message = 'Threats slowed for 8 seconds'
    } else {
      this.magnet = Math.max(this.magnet, 10)
      title = 'Shard magnet'
      message = 'Nearby energy bends toward you'
    }

    this.powerUpsCollected += 1
    this.collectedPowerUpKinds.add(powerUp.kind)
    this.combo = Math.min(9.9, this.combo + 0.35)
    this.maxCombo = Math.max(this.maxCombo, this.combo)
    this.energy = Math.min(100, this.energy + 12)
    this.addScore(260 * this.combo)
    this.lastComboEvent = this.elapsed
    this.createBurst(position.x, position.y, powerUp.kind === 'chrono' ? '#ffd66b' : powerUp.kind === 'magnet' ? '#ff79df' : '#72a7ff', 24)
    this.audio.play('powerUp')
    this.callbacks.onToast({ title, message, tone: 'powerup' })
    this.callbacks.announce(`${title}. ${message}.`)
    this.checkAchievements()
    this.emitSnapshot()
  }

  private takeHit(): void {
    if (this.shield) {
      this.shield = false
      this.invulnerability = 1.2
      this.screenShake = this.reducedMotion ? 0 : 10
      const player = this.getPlayerPosition()
      this.createBurst(player.x, player.y, '#72a7ff', 26)
      this.pulseWaves.push({
        x: player.x,
        y: player.y,
        radius: 8,
        speed: 320 * this.worldScale,
        life: 0.4,
        maxLife: 0.4,
      })
      this.audio.play('shield')
      this.callbacks.onToast({
        title: 'Aegis shattered',
        message: 'Impact absorbed — hull intact',
        tone: 'event',
      })
      this.callbacks.announce('Aegis shield absorbed the impact.')
      this.emitSnapshot()
      return
    }

    this.hitsTaken += 1
    this.lives -= 1
    this.combo = 1
    this.energy = Math.max(0, this.energy - 18)
    this.invulnerability = 2.15
    this.screenShake = this.reducedMotion ? 0 : 18
    this.screenFlash = 1
    this.audio.play('hit')

    if (this.lives <= 0) {
      this.endRound()
    } else {
      this.callbacks.announce(`${this.lives} ${this.lives === 1 ? 'life' : 'lives'} remaining.`)
      this.emitSnapshot()
    }
  }

  private addScore(points: number): void {
    this.score += points * DIFFICULTIES[this.difficulty].scoreMultiplier
  }

  private checkAchievements(): void {
    if (this.shardsCollected >= 1) this.unlockAchievement('first-light')
    if (this.combo >= 5) this.unlockAchievement('flow-rider')
    if (this.elapsed >= 30 && this.hitsTaken === 0) this.unlockAchievement('ghost-orbit')
    if (this.threatsBroken >= 5) this.unlockAchievement('breaker')
    if (this.collectedPowerUpKinds.size >= 3) this.unlockAchievement('power-trip')
    if (this.score >= 5000) this.unlockAchievement('star-chaser')
  }

  private unlockAchievement(id: AchievementId): void {
    if (this.achievements.has(id)) return

    this.achievements.add(id)
    try {
      localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify([...this.achievements]))
    } catch {
      // Achievement progress remains available for the current session.
    }

    const message = ACHIEVEMENTS[id]
    this.audio.play('achievement')
    this.callbacks.onToast({ title: 'Badge unlocked', message, tone: 'achievement' })
    this.callbacks.announce(`Badge unlocked. ${message}.`)
    this.emitSnapshot()
  }

  private createBurst(x: number, y: number, color: string, requestedCount: number): void {
    const count = this.reducedMotion ? Math.ceil(requestedCount * 0.35) : requestedCount

    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * TAU
      const speed = 45 + Math.random() * 230
      const life = 0.3 + Math.random() * 0.55
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 1.2 + Math.random() * 3.6,
        color,
        drag: 0.94 + Math.random() * 0.035,
        shape: Math.random() < 0.4 ? 'streak' : 'dot',
      })
    }
  }

  private createNearMissSparks(x: number, y: number): void {
    const count = this.reducedMotion ? 3 : 8
    for (let index = 0; index < count; index += 1) {
      const tangent = this.playerAngle + Math.PI / 2 + (Math.random() - 0.5) * 0.7
      const speed = 80 + Math.random() * 100
      const life = 0.2 + Math.random() * 0.25
      this.particles.push({
        x,
        y,
        vx: Math.cos(tangent) * speed,
        vy: Math.sin(tangent) * speed,
        life,
        maxLife: life,
        size: 1 + Math.random() * 2.2,
        color: '#ffd66b',
        drag: 0.95,
        shape: 'streak',
      })
    }
  }

  private render(): void {
    const context = this.context
    context.clearRect(0, 0, this.width, this.height)
    this.drawBackground()

    context.save()
    if (this.screenShake > 0 && !this.reducedMotion) {
      context.translate(
        (Math.random() - 0.5) * this.screenShake,
        (Math.random() - 0.5) * this.screenShake,
      )
    }

    this.drawOrbitField()
    this.drawCore()
    this.drawTrail()
    this.drawShards()
    this.drawPowerUps()
    this.drawHazards()
    this.drawPulseWaves()
    this.drawPlayer()
    this.drawParticles()
    this.drawPointerGuide()
    context.restore()

    if (this.screenFlash > 0) {
      context.fillStyle = `rgba(255, 61, 127, ${this.screenFlash * 0.18})`
      context.fillRect(0, 0, this.width, this.height)
    }
  }

  private drawBackground(): void {
    const context = this.context
    const background = context.createRadialGradient(
      this.center.x,
      this.center.y,
      0,
      this.center.x,
      this.center.y,
      Math.max(this.width, this.height) * 0.82,
    )
    background.addColorStop(0, '#102044')
    background.addColorStop(0.34, '#09142f')
    background.addColorStop(0.72, '#050a1d')
    background.addColorStop(1, '#02050f')
    context.fillStyle = background
    context.fillRect(0, 0, this.width, this.height)

    const haze = context.createRadialGradient(
      this.width * 0.76,
      this.height * 0.2,
      0,
      this.width * 0.76,
      this.height * 0.2,
      Math.max(this.width, this.height) * 0.55,
    )
    haze.addColorStop(0, 'rgba(126, 62, 255, 0.09)')
    haze.addColorStop(1, 'rgba(126, 62, 255, 0)')
    context.fillStyle = haze
    context.fillRect(0, 0, this.width, this.height)

    for (const star of this.stars) {
      const twinkle = this.reducedMotion
        ? 1
        : 0.72 + Math.sin(this.ambientTime * star.speed + star.phase) * 0.28
      context.globalAlpha = star.alpha * twinkle
      context.fillStyle = star.color
      context.beginPath()
      context.arc(star.x, star.y, star.size, 0, TAU)
      context.fill()
    }
    context.globalAlpha = 1
  }

  private drawOrbitField(): void {
    const context = this.context
    context.save()
    context.translate(this.center.x, this.center.y)

    const breathing = this.reducedMotion ? 0 : Math.sin(this.ambientTime * 0.8) * 2
    context.strokeStyle = 'rgba(100, 244, 255, 0.18)'
    context.lineWidth = 1
    context.setLineDash([3, 12])
    context.lineDashOffset = this.reducedMotion ? 0 : -this.ambientTime * 8
    context.beginPath()
    context.arc(0, 0, this.orbitRadius + breathing, 0, TAU)
    context.stroke()

    context.strokeStyle = 'rgba(157, 107, 255, 0.08)'
    context.setLineDash([1, 18])
    context.beginPath()
    context.arc(0, 0, this.orbitRadius * 1.42, 0, TAU)
    context.stroke()
    context.beginPath()
    context.arc(0, 0, this.orbitRadius * 0.56, 0, TAU)
    context.stroke()

    context.setLineDash([])
    for (let index = 0; index < 4; index += 1) {
      const angle = this.ambientTime * (index % 2 === 0 ? 0.06 : -0.045) + index * (TAU / 4)
      const radius = this.orbitRadius * (1.42 + Math.sin(index * 3.1) * 0.02)
      context.fillStyle = index % 2 === 0 ? 'rgba(97, 255, 241, 0.5)' : 'rgba(184, 105, 255, 0.4)'
      context.beginPath()
      context.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, 1.8, 0, TAU)
      context.fill()
    }

    context.restore()
  }

  private drawCore(): void {
    const context = this.context
    const pulse = this.reducedMotion ? 0 : Math.sin(this.ambientTime * 2.1) * 0.06
    const radius = this.coreRadius * (1 + pulse + this.coreFlash * 0.08)

    context.save()
    context.translate(this.center.x, this.center.y)
    context.globalCompositeOperation = 'lighter'

    const glow = context.createRadialGradient(0, 0, 2, 0, 0, radius * 2.6)
    glow.addColorStop(0, `rgba(255, 255, 255, ${0.42 + this.coreFlash * 0.3})`)
    glow.addColorStop(0.2, 'rgba(92, 255, 241, 0.35)')
    glow.addColorStop(0.62, 'rgba(109, 74, 255, 0.12)')
    glow.addColorStop(1, 'rgba(109, 74, 255, 0)')
    context.fillStyle = glow
    context.beginPath()
    context.arc(0, 0, radius * 2.6, 0, TAU)
    context.fill()

    context.rotate(this.reducedMotion ? 0.3 : this.ambientTime * 0.22)
    context.strokeStyle = 'rgba(100, 255, 242, 0.55)'
    context.lineWidth = 1.5
    context.setLineDash([8, 8])
    context.beginPath()
    context.arc(0, 0, radius * 1.32, 0, TAU)
    context.stroke()

    context.rotate(this.reducedMotion ? 0.5 : -this.ambientTime * 0.5)
    context.strokeStyle = 'rgba(199, 115, 255, 0.46)'
    context.beginPath()
    context.arc(0, 0, radius * 0.86, 0.25, Math.PI * 1.35)
    context.stroke()

    context.setLineDash([])
    const core = context.createRadialGradient(-radius * 0.22, -radius * 0.24, 0, 0, 0, radius)
    core.addColorStop(0, '#ffffff')
    core.addColorStop(0.18, '#9dfff7')
    core.addColorStop(0.52, '#4cc8e7')
    core.addColorStop(0.8, '#7757e9')
    core.addColorStop(1, '#20195b')
    context.fillStyle = core
    context.beginPath()
    context.arc(0, 0, radius * 0.68, 0, TAU)
    context.fill()
    context.restore()
  }

  private drawTrail(): void {
    if (this.trail.length < 2) return
    const context = this.context
    context.save()
    context.globalCompositeOperation = 'lighter'
    context.lineCap = 'round'

    for (let index = 1; index < this.trail.length; index += 1) {
      const previous = this.trail[index - 1]
      const point = this.trail[index]
      const alpha = point.life / point.maxLife
      context.strokeStyle = `rgba(87, 255, 239, ${alpha * 0.38})`
      context.lineWidth = Math.max(0.6, alpha * 4.2 * this.worldScale)
      context.beginPath()
      context.moveTo(previous.x, previous.y)
      context.lineTo(point.x, point.y)
      context.stroke()
    }

    context.restore()
  }

  private drawShards(): void {
    const context = this.context
    const player = this.getPlayerPosition()
    context.save()
    context.globalCompositeOperation = 'lighter'

    for (const shard of this.shards) {
      const position = this.getPolarPosition(shard.angle, shard.radius)

      if (this.magnet > 0 && distance(player, position) < 275 * this.worldScale) {
        context.strokeStyle = 'rgba(255, 121, 223, 0.12)'
        context.lineWidth = 1
        context.beginPath()
        context.moveTo(player.x, player.y)
        context.lineTo(position.x, position.y)
        context.stroke()
      }

      const glowSize = shard.size * 3.5
      const glow = context.createRadialGradient(position.x, position.y, 0, position.x, position.y, glowSize)
      glow.addColorStop(0, shard.color === '#ff79df' ? 'rgba(255, 121, 223, 0.55)' : 'rgba(98, 255, 242, 0.5)')
      glow.addColorStop(1, 'rgba(60, 255, 240, 0)')
      context.fillStyle = glow
      context.beginPath()
      context.arc(position.x, position.y, glowSize, 0, TAU)
      context.fill()

      context.save()
      context.translate(position.x, position.y)
      context.rotate(shard.rotation)
      context.fillStyle = shard.color
      context.strokeStyle = 'rgba(255, 255, 255, 0.9)'
      context.lineWidth = 1
      context.beginPath()
      context.moveTo(0, -shard.size * 1.35)
      context.lineTo(shard.size * 0.72, 0)
      context.lineTo(0, shard.size * 1.35)
      context.lineTo(-shard.size * 0.72, 0)
      context.closePath()
      context.fill()
      context.stroke()
      context.restore()
    }

    context.restore()
  }

  private drawPowerUps(): void {
    const context = this.context

    for (const powerUp of this.powerUps) {
      const position = this.getPolarPosition(powerUp.angle, powerUp.radius)
      const color = powerUp.kind === 'shield' ? '#72a7ff' : powerUp.kind === 'chrono' ? '#ffd66b' : '#ff79df'

      context.save()
      context.translate(position.x, position.y)
      context.rotate(powerUp.rotation)
      context.globalCompositeOperation = 'lighter'

      const glow = context.createRadialGradient(0, 0, 0, 0, 0, powerUp.size * 3.2)
      glow.addColorStop(0, `${color}88`)
      glow.addColorStop(1, `${color}00`)
      context.fillStyle = glow
      context.beginPath()
      context.arc(0, 0, powerUp.size * 3.2, 0, TAU)
      context.fill()

      context.strokeStyle = color
      context.fillStyle = 'rgba(8, 17, 42, 0.92)'
      context.lineWidth = 2
      context.shadowColor = color
      context.shadowBlur = 12
      context.beginPath()
      for (let vertex = 0; vertex < 6; vertex += 1) {
        const angle = (vertex / 6) * TAU - Math.PI / 2
        const x = Math.cos(angle) * powerUp.size
        const y = Math.sin(angle) * powerUp.size
        if (vertex === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      }
      context.closePath()
      context.fill()
      context.stroke()
      context.shadowBlur = 0

      if (powerUp.kind === 'shield') {
        context.beginPath()
        context.arc(0, 0, powerUp.size * 0.48, Math.PI * 0.15, Math.PI * 0.85)
        context.lineTo(0, powerUp.size * 0.6)
        context.closePath()
        context.stroke()
      } else if (powerUp.kind === 'chrono') {
        context.beginPath()
        context.arc(0, 0, powerUp.size * 0.5, 0, TAU)
        context.moveTo(0, 0)
        context.lineTo(0, -powerUp.size * 0.34)
        context.moveTo(0, 0)
        context.lineTo(powerUp.size * 0.28, powerUp.size * 0.18)
        context.stroke()
      } else {
        context.beginPath()
        context.arc(0, 0, powerUp.size * 0.52, -Math.PI * 0.1, Math.PI * 1.1)
        context.stroke()
        context.fillStyle = color
        context.fillRect(powerUp.size * 0.38, -powerUp.size * 0.42, powerUp.size * 0.22, powerUp.size * 0.35)
        context.fillRect(-powerUp.size * 0.6, -powerUp.size * 0.42, powerUp.size * 0.22, powerUp.size * 0.35)
      }

      context.restore()
    }
  }

  private drawHazards(): void {
    for (const hazard of this.hazards) {
      const position = this.getPolarPosition(hazard.angle, hazard.radius)
      if (hazard.kind === 'comet') {
        this.drawComet(hazard, position)
      } else if (hazard.kind === 'mine') {
        this.drawMine(hazard, position)
      } else {
        this.drawRock(hazard, position)
      }
    }
  }

  private drawRock(hazard: Hazard, position: Point): void {
    const context = this.context
    context.save()
    context.translate(position.x, position.y)
    context.rotate(hazard.rotation)

    const glow = context.createRadialGradient(0, 0, 0, 0, 0, hazard.size * 2.1)
    glow.addColorStop(0, 'rgba(255, 115, 105, 0.2)')
    glow.addColorStop(1, 'rgba(255, 80, 105, 0)')
    context.fillStyle = glow
    context.beginPath()
    context.arc(0, 0, hazard.size * 2.1, 0, TAU)
    context.fill()

    context.fillStyle = '#452540'
    context.strokeStyle = '#ff745f'
    context.lineWidth = 1.5
    context.beginPath()
    for (let vertex = 0; vertex < 8; vertex += 1) {
      const angle = (vertex / 8) * TAU
      const irregularity = 0.78 + Math.sin(vertex * 4.31 + hazard.wobblePhase) * 0.16
      const radius = hazard.size * irregularity
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius
      if (vertex === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    }
    context.closePath()
    context.fill()
    context.stroke()

    context.fillStyle = 'rgba(255, 146, 113, 0.35)'
    context.beginPath()
    context.arc(-hazard.size * 0.2, -hazard.size * 0.18, hazard.size * 0.2, 0, TAU)
    context.fill()
    context.restore()
  }

  private drawComet(hazard: Hazard, position: Point): void {
    const context = this.context
    context.save()
    context.translate(position.x, position.y)
    context.rotate(hazard.angle)
    context.globalCompositeOperation = 'lighter'

    const tail = context.createLinearGradient(0, 0, hazard.size * 6, 0)
    tail.addColorStop(0, 'rgba(255, 210, 124, 0.72)')
    tail.addColorStop(0.35, 'rgba(255, 92, 147, 0.3)')
    tail.addColorStop(1, 'rgba(255, 92, 147, 0)')
    context.strokeStyle = tail
    context.lineWidth = hazard.size * 0.8
    context.lineCap = 'round'
    context.beginPath()
    context.moveTo(0, 0)
    context.lineTo(hazard.size * 6, 0)
    context.stroke()

    const head = context.createRadialGradient(-2, -2, 0, 0, 0, hazard.size * 1.4)
    head.addColorStop(0, '#ffffff')
    head.addColorStop(0.24, '#ffd17c')
    head.addColorStop(0.6, '#ff5c93')
    head.addColorStop(1, 'rgba(255, 70, 130, 0)')
    context.fillStyle = head
    context.beginPath()
    context.arc(0, 0, hazard.size * 1.4, 0, TAU)
    context.fill()
    context.restore()
  }

  private drawMine(hazard: Hazard, position: Point): void {
    const context = this.context
    context.save()
    context.translate(position.x, position.y)
    context.rotate(hazard.rotation)

    context.shadowColor = '#d85cff'
    context.shadowBlur = 13
    context.strokeStyle = '#df77ff'
    context.fillStyle = '#29194e'
    context.lineWidth = 2

    for (let spike = 0; spike < 8; spike += 1) {
      const angle = (spike / 8) * TAU
      context.beginPath()
      context.moveTo(Math.cos(angle - 0.1) * hazard.size * 0.72, Math.sin(angle - 0.1) * hazard.size * 0.72)
      context.lineTo(Math.cos(angle) * hazard.size * 1.35, Math.sin(angle) * hazard.size * 1.35)
      context.lineTo(Math.cos(angle + 0.1) * hazard.size * 0.72, Math.sin(angle + 0.1) * hazard.size * 0.72)
      context.closePath()
      context.fill()
      context.stroke()
    }

    context.beginPath()
    context.arc(0, 0, hazard.size * 0.72, 0, TAU)
    context.fill()
    context.stroke()
    context.shadowBlur = 0
    context.fillStyle = '#ff5bd6'
    context.beginPath()
    context.arc(0, 0, hazard.size * 0.18, 0, TAU)
    context.fill()
    context.restore()
  }

  private drawPulseWaves(): void {
    const context = this.context
    context.save()
    context.globalCompositeOperation = 'lighter'

    for (const wave of this.pulseWaves) {
      const alpha = wave.life / wave.maxLife
      context.strokeStyle = `rgba(98, 255, 241, ${alpha * 0.9})`
      context.lineWidth = Math.max(1, alpha * 8 * this.worldScale)
      context.beginPath()
      context.arc(wave.x, wave.y, wave.radius, 0, TAU)
      context.stroke()

      context.strokeStyle = `rgba(212, 112, 255, ${alpha * 0.45})`
      context.lineWidth = Math.max(1, alpha * 3 * this.worldScale)
      context.beginPath()
      context.arc(wave.x, wave.y, wave.radius * 0.82, 0, TAU)
      context.stroke()
    }

    context.restore()
  }

  private drawPlayer(): void {
    if (this.phase === 'ready') return
    if (this.invulnerability > 0 && Math.floor(this.invulnerability * 12) % 2 === 0) return

    const context = this.context
    const position = this.getPlayerPosition()
    const shipSize = clamp(1.05 * this.worldScale, 0.72, 1.18)
    const facing = this.lastDirection >= 0 ? 1 : -1

    this.drawPlayerAuras(position)

    context.save()
    context.translate(position.x, position.y)
    context.rotate(this.playerAngle + (facing > 0 ? Math.PI / 2 : -Math.PI / 2))
    context.scale(facing > 0 ? shipSize : -shipSize, shipSize)
    context.globalCompositeOperation = 'lighter'

    const engineLength = 10 + Math.min(10, Math.abs(this.angularVelocity) * 2.5)
    const engine = context.createLinearGradient(-13, 0, -13 - engineLength, 0)
    engine.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
    engine.addColorStop(0.28, 'rgba(86, 255, 241, 0.85)')
    engine.addColorStop(1, 'rgba(103, 93, 255, 0)')
    context.fillStyle = engine
    context.beginPath()
    context.moveTo(-10, -4)
    context.lineTo(-13 - engineLength, 0)
    context.lineTo(-10, 4)
    context.closePath()
    context.fill()

    context.shadowColor = '#5ffff2'
    context.shadowBlur = 16
    context.fillStyle = '#eaffff'
    context.strokeStyle = '#61fff1'
    context.lineWidth = 1.5
    context.beginPath()
    context.moveTo(18, 0)
    context.lineTo(-10, 10)
    context.lineTo(-5, 0)
    context.lineTo(-10, -10)
    context.closePath()
    context.fill()
    context.stroke()

    context.shadowBlur = 0
    context.fillStyle = '#8c6fff'
    context.beginPath()
    context.moveTo(8, 0)
    context.lineTo(-7, 5)
    context.lineTo(-3, 0)
    context.lineTo(-7, -5)
    context.closePath()
    context.fill()
    context.restore()
  }

  private drawPlayerAuras(position: Point): void {
    if (!this.shield && this.timeWarp <= 0 && this.magnet <= 0) return

    const context = this.context
    const radius = 29 * this.worldScale
    context.save()
    context.translate(position.x, position.y)
    context.rotate(this.reducedMotion ? 0 : this.ambientTime * 0.8)
    context.globalCompositeOperation = 'lighter'

    if (this.shield) {
      context.strokeStyle = 'rgba(114, 167, 255, 0.82)'
      context.lineWidth = 2
      context.setLineDash([8, 5])
      context.beginPath()
      context.arc(0, 0, radius, 0, TAU)
      context.stroke()
    }

    if (this.timeWarp > 0) {
      context.strokeStyle = 'rgba(255, 214, 107, 0.5)'
      context.lineWidth = 1.5
      context.setLineDash([2, 7])
      context.beginPath()
      context.arc(0, 0, radius * 1.2, 0, TAU)
      context.stroke()
    }

    if (this.magnet > 0) {
      context.strokeStyle = 'rgba(255, 121, 223, 0.42)'
      context.lineWidth = 1
      context.setLineDash([1, 8])
      context.beginPath()
      context.arc(0, 0, radius * 1.42, 0, TAU)
      context.stroke()
    }

    context.restore()
  }

  private drawParticles(): void {
    const context = this.context
    context.save()
    context.globalCompositeOperation = 'lighter'
    context.lineCap = 'round'

    for (const particle of this.particles) {
      const alpha = particle.life / particle.maxLife
      context.globalAlpha = alpha
      context.fillStyle = particle.color
      context.strokeStyle = particle.color

      if (particle.shape === 'streak') {
        context.lineWidth = particle.size
        context.beginPath()
        context.moveTo(particle.x, particle.y)
        context.lineTo(particle.x - particle.vx * 0.035, particle.y - particle.vy * 0.035)
        context.stroke()
      } else {
        context.beginPath()
        context.arc(particle.x, particle.y, particle.size * alpha, 0, TAU)
        context.fill()
      }
    }

    context.globalAlpha = 1
    context.restore()
  }

  private drawPointerGuide(): void {
    if (!this.pointerActive || this.phase !== 'playing') return
    const context = this.context
    const position = this.getPolarPosition(this.pointerTargetAngle, this.orbitRadius)
    context.save()
    context.strokeStyle = 'rgba(98, 255, 241, 0.42)'
    context.lineWidth = 1
    context.setLineDash([3, 5])
    context.beginPath()
    context.arc(position.x, position.y, 19 * this.worldScale, 0, TAU)
    context.stroke()
    context.restore()
  }

  private getPlayerPosition(): Point {
    return this.getPolarPosition(this.playerAngle, this.orbitRadius)
  }

  private getPolarPosition(angle: number, radius: number): Point {
    return {
      x: this.center.x + Math.cos(angle) * radius,
      y: this.center.y + Math.sin(angle) * radius,
    }
  }

  private emitSnapshot(): void {
    const snapshot: GameSnapshot = {
      phase: this.phase,
      score: Math.floor(this.score),
      highScore: this.highScore,
      combo: this.combo,
      lives: this.lives,
      energy: this.energy,
      level: this.level,
      difficulty: this.difficulty,
      shield: this.shield,
      timeWarp: this.timeWarp,
      magnet: this.magnet,
      achievementsUnlocked: this.achievements.size,
      achievementsTotal: Object.keys(ACHIEVEMENTS).length,
    }
    this.callbacks.onSnapshot(snapshot)
  }

  private readHighScore(): number {
    try {
      const score = Number(localStorage.getItem(HIGH_SCORE_KEY) ?? 0)
      return Number.isFinite(score) && score > 0 ? Math.floor(score) : 0
    } catch {
      return 0
    }
  }

  private readDifficulty(): DifficultyMode {
    try {
      const mode = localStorage.getItem(DIFFICULTY_KEY)
      if (mode === 'drift' || mode === 'classic' || mode === 'hyper') return mode
    } catch {
      // Fall through to the default difficulty.
    }
    return 'classic'
  }

  private readAchievements(): Set<AchievementId> {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(ACHIEVEMENTS_KEY) ?? '[]')
      if (!Array.isArray(saved)) return new Set()

      return new Set(
        saved.filter(
          (value): value is AchievementId =>
            typeof value === 'string' && value in ACHIEVEMENTS,
        ),
      )
    } catch {
      return new Set()
    }
  }

  private readonly handleResize = (): void => {
    this.resize()
  }

  private resize(): void {
    const rectangle = this.canvas.getBoundingClientRect()
    this.width = Math.max(1, rectangle.width || window.innerWidth)
    this.height = Math.max(1, rectangle.height || window.innerHeight)
    this.pixelRatio = Math.min(2, window.devicePixelRatio || 1)

    const targetWidth = Math.round(this.width * this.pixelRatio)
    const targetHeight = Math.round(this.height * this.pixelRatio)
    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.canvas.width = targetWidth
      this.canvas.height = targetHeight
      this.context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0)
    }

    this.center = { x: this.width / 2, y: this.height / 2 }
    const shortestSide = Math.min(this.width, this.height)
    this.worldScale = clamp(shortestSide / 760, 0.62, 1.15)
    this.orbitRadius = clamp(shortestSide * 0.235, 94, 215)
    this.coreRadius = clamp(shortestSide * 0.058, 27, 48)
    this.outerRadius = Math.hypot(this.width, this.height) * 0.58
    this.createStars()
  }

  private createStars(): void {
    const targetCount = this.reducedMotion
      ? Math.floor((this.width * this.height) / 22000)
      : Math.floor((this.width * this.height) / 11500)
    const count = clamp(targetCount, 35, 170)
    this.stars = Array.from({ length: count }, () => ({
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      size: 0.35 + Math.random() * 1.25,
      alpha: 0.18 + Math.random() * 0.55,
      phase: Math.random() * TAU,
      speed: 0.35 + Math.random() * 1.4,
      color: Math.random() < 0.12 ? '#b9a7ff' : Math.random() < 0.2 ? '#8ffcf5' : '#ffffff',
    }))
  }

  private readonly handleMotionPreference = (event: MediaQueryListEvent): void => {
    this.reducedMotion = event.matches
    this.screenShake = 0
    this.createStars()
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const target = event.target
    const isButton = target instanceof HTMLButtonElement

    if (event.code === 'Escape' || event.code === 'KeyP') {
      event.preventDefault()
      this.togglePause()
      return
    }

    if (isButton) return

    if (event.code === 'Enter' && (this.phase === 'ready' || this.phase === 'gameover')) {
      event.preventDefault()
      this.start()
      return
    }

    if (event.code === 'Space' && this.phase === 'playing') {
      event.preventDefault()
      if (!event.repeat) this.pulse()
      return
    }

    if (
      this.phase === 'playing' &&
      (event.code === 'ArrowLeft' ||
        event.code === 'ArrowRight' ||
        event.code === 'KeyA' ||
        event.code === 'KeyD')
    ) {
      event.preventDefault()
      this.keys.add(event.code)
    }
  }

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code)
  }

  private readonly handleVisibilityChange = (): void => {
    if (document.hidden && this.phase === 'playing') this.pause()
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (this.phase !== 'playing') return
    this.audio.unlock()
    this.pointerActive = true
    this.pointerId = event.pointerId
    this.updatePointerTarget(event)
    this.canvas.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.pointerActive || event.pointerId !== this.pointerId) return
    this.updatePointerTarget(event)
    event.preventDefault()
  }

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return
    this.pointerActive = false
    this.pointerId = null
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId)
  }

  private updatePointerTarget(event: PointerEvent): void {
    const rectangle = this.canvas.getBoundingClientRect()
    const x = event.clientX - rectangle.left
    const y = event.clientY - rectangle.top
    this.pointerTargetAngle = Math.atan2(y - this.center.y, x - this.center.x)
  }
}
