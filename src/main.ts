import './style.css'
import { AudioController } from './audio.ts'
import { OrbitGame } from './game.ts'
import type {
  DifficultyMode,
  GamePhase,
  GameSnapshot,
  GameToast,
  RoundStats,
} from './types.ts'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="game-shell">
    <canvas
      id="game-canvas"
      role="img"
      aria-label="Orbit Breaker game field. Pilot a ship around the glowing core, dodge threats, and collect energy shards."
    ></canvas>
    <div class="scanlines" aria-hidden="true"></div>
    <div class="vignette" aria-hidden="true"></div>

    <header class="topbar" aria-label="Game status">
      <div class="brand-lockup" aria-label="Orbit Breaker">
        <span class="brand-mark" aria-hidden="true"><i></i></span>
        <span class="brand-name">ORBIT <b>BREAKER</b></span>
      </div>

      <div class="score-cluster">
        <div class="score-item score-item--primary">
          <span>Score</span>
          <strong id="score">000000</strong>
        </div>
        <div class="score-divider" aria-hidden="true"></div>
        <div class="score-item">
          <span id="high-score-label">Best</span>
          <strong id="high-score">000000</strong>
        </div>
      </div>

      <div class="top-actions">
        <button id="sound-button" class="icon-button" type="button" aria-label="Mute sound" title="Toggle sound">
          <svg class="sound-on" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9v6h4l5 4V5L8 9H4Zm12.5-.5a5 5 0 0 1 0 7M19 6a9 9 0 0 1 0 12" />
          </svg>
          <svg class="sound-off" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9v6h4l5 4V5L8 9H4Zm12 1 5 5m0-5-5 5" />
          </svg>
        </button>
        <button id="pause-button" class="icon-button" type="button" aria-label="Pause game" title="Pause (P)" disabled>
          <svg class="pause-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6v12M16 6v12" /></svg>
          <svg class="play-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 9 6-9 6V6Z" /></svg>
        </button>
      </div>
    </header>

    <aside class="level-chip" aria-label="Current level">
      <span>Level</span>
      <strong id="level">01</strong>
    </aside>

    <aside id="combo-chip" class="combo-chip" aria-live="polite">
      <span>Flow</span>
      <strong><b id="combo">1.0</b>×</strong>
    </aside>

    <section id="boss-hud" class="boss-hud" aria-label="Void Warden integrity" aria-live="polite" hidden>
      <div class="boss-heading">
        <span>Void Warden <b id="boss-wave">I</b></span>
        <strong><b id="boss-health">3</b> / <span id="boss-max-health">3</span></strong>
      </div>
      <div class="boss-track" aria-hidden="true"><i id="boss-fill"></i></div>
    </section>

    <section id="effects-tray" class="effects-tray" aria-label="Active boosts" aria-live="polite" hidden>
      <div id="shield-effect" class="effect-chip effect-chip--shield" hidden>
        <i aria-hidden="true"></i><span>Aegis</span><b>1 hit</b>
      </div>
      <div id="chrono-effect" class="effect-chip effect-chip--chrono" hidden>
        <i aria-hidden="true"></i><span>Chrono</span><b id="chrono-time">0s</b>
      </div>
      <div id="magnet-effect" class="effect-chip effect-chip--magnet" hidden>
        <i aria-hidden="true"></i><span>Magnet</span><b id="magnet-time">0s</b>
      </div>
      <div id="overdrive-effect" class="effect-chip effect-chip--overdrive" hidden>
        <i aria-hidden="true"></i><span>Overdrive</span><b>+25%</b>
      </div>
    </section>

    <section class="bottom-hud" aria-label="Ship status">
      <div class="lives-block">
        <span class="hud-label">Hull</span>
        <div id="lives" class="lives" aria-label="3 lives remaining"></div>
      </div>

      <div class="energy-block">
        <div class="energy-copy">
          <span class="hud-label">Pulse charge</span>
          <strong><span id="energy-value">40</span>%</strong>
        </div>
        <div class="energy-track" aria-hidden="true"><i id="energy-fill"></i></div>
      </div>
    </section>

    <button id="pulse-button" class="pulse-button" type="button" aria-label="Release pulse; costs 30 percent charge" disabled>
      <span class="pulse-ring" aria-hidden="true"></span>
      <span class="pulse-copy"><b>Pulse</b><small>30 charge</small></span>
      <kbd>Space</kbd>
    </button>

    <div id="toast-stack" class="toast-stack" aria-live="polite" aria-atomic="false"></div>

    <div id="overlay" class="overlay" data-phase="ready">
      <section id="ready-panel" class="panel hero-panel" aria-labelledby="game-title">
        <div class="eyebrow"><span></span> Signal acquired <span></span></div>
        <div class="hero-emblem" aria-hidden="true">
          <i class="emblem-core"></i>
          <i class="emblem-orbit"></i>
          <i class="emblem-ship"></i>
        </div>
        <h1 id="game-title"><span>Orbit</span> Breaker</h1>
        <p class="tagline">Ride the ring. Thread the chaos. Chase the glow.</p>

        <div class="difficulty-picker">
          <div class="picker-heading">
            <span>Flight mode</span>
            <strong id="achievement-count">0 / 7 badges</strong>
          </div>
          <div class="difficulty-options" role="group" aria-label="Flight difficulty">
            <button type="button" data-difficulty="drift" aria-pressed="false">
              <b>Drift</b><small>Calm · 0.8× score</small>
            </button>
            <button type="button" data-difficulty="classic" aria-pressed="true">
              <b>Classic</b><small>Balanced · 1× score</small>
            </button>
            <button type="button" data-difficulty="hyper" aria-pressed="false">
              <b>Hyper</b><small>Intense · 1.5× score</small>
            </button>
          </div>
        </div>

        <div class="career-strip" aria-label="Pilot career statistics">
          <div><strong id="career-runs">0</strong><span>Runs</span></div>
          <div><strong id="career-bosses">0</strong><span>Wardens</span></div>
          <div><strong id="career-flow">1.0×</strong><span>Best flow</span></div>
          <div><strong id="career-shards">0</strong><span>Shards</span></div>
        </div>

        <div class="mission-grid" aria-label="How to play">
          <div class="mission-card">
            <span class="mission-number">01</span>
            <div><strong>Move</strong><small>Arrow keys, A / D, or drag</small></div>
            <div class="key-pair" aria-hidden="true"><kbd>←</kbd><kbd>→</kbd></div>
          </div>
          <div class="mission-card">
            <span class="mission-number">02</span>
            <div><strong>Collect</strong><small>Catch shards and boost capsules</small></div>
            <span class="mini-shard" aria-hidden="true"></span>
          </div>
          <div class="mission-card">
            <span class="mission-number">03</span>
            <div><strong>Break</strong><small>Pulse through nearby threats</small></div>
            <kbd class="wide-key" aria-hidden="true">Space</kbd>
          </div>
        </div>

        <button id="start-button" class="primary-button" type="button">
          <span>Launch run</span><i aria-hidden="true">↗</i>
        </button>
        <p class="microcopy">Near misses boost your flow multiplier</p>
      </section>

      <section id="paused-panel" class="panel compact-panel" aria-labelledby="paused-title" hidden>
        <div class="status-icon status-icon--pause" aria-hidden="true"><i></i><i></i></div>
        <span class="section-kicker">Flight suspended</span>
        <h2 id="paused-title">Paused</h2>
        <p>The orbit will hold until you’re ready.</p>
        <button id="resume-button" class="primary-button" type="button"><span>Resume run</span><i aria-hidden="true">→</i></button>
        <button id="restart-from-pause" class="text-button" type="button">Restart run</button>
      </section>

      <section id="gameover-panel" class="panel compact-panel results-panel" aria-labelledby="gameover-title" hidden>
        <div class="record-badge" id="record-badge" hidden>New orbit record</div>
        <span class="section-kicker">Signal lost · <b id="final-mode">Classic</b></span>
        <h2 id="gameover-title">Run complete</h2>
        <div class="final-score">
          <span>Final score</span>
          <strong id="final-score">000000</strong>
        </div>
        <div class="results-grid">
          <div><strong id="final-time">0:00</strong><span>Survived</span></div>
          <div><strong id="final-shards">0</strong><span>Shards</span></div>
          <div><strong id="final-near-misses">0</strong><span>Near misses</span></div>
          <div><strong id="final-broken">0</strong><span>Broken</span></div>
          <div><strong id="final-powerups">0</strong><span>Boosts</span></div>
          <div><strong id="final-bosses">0</strong><span>Wardens</span></div>
          <div><strong id="final-combo">1.0×</strong><span>Max flow</span></div>
          <div><strong id="final-overdrive">0s</strong><span>Overdrive</span></div>
        </div>
        <button id="restart-button" class="primary-button" type="button"><span>Fly again</span><i aria-hidden="true">↻</i></button>
      </section>
    </div>

    <p id="announcer" class="sr-only" aria-live="assertive"></p>
  </main>
`

function element<T extends HTMLElement>(selector: string): T {
  const result = document.querySelector<T>(selector)
  if (!result) throw new Error(`Missing required element: ${selector}`)
  return result
}

function formatScore(score: number): string {
  return Math.max(0, Math.floor(score)).toString().padStart(6, '0')
}

function formatTime(seconds: number): string {
  const wholeSeconds = Math.floor(seconds)
  const minutes = Math.floor(wholeSeconds / 60)
  return `${minutes}:${(wholeSeconds % 60).toString().padStart(2, '0')}`
}

function formatWave(wave: number): string {
  return ['I', 'II', 'III', 'IV', 'V'][wave - 1] ?? String(wave)
}

const DIFFICULTY_LABELS: Record<DifficultyMode, string> = {
  drift: 'Drift',
  classic: 'Classic',
  hyper: 'Hyper',
}

const canvas = element<HTMLCanvasElement>('#game-canvas')
const overlay = element<HTMLDivElement>('#overlay')
const readyPanel = element<HTMLElement>('#ready-panel')
const pausedPanel = element<HTMLElement>('#paused-panel')
const gameoverPanel = element<HTMLElement>('#gameover-panel')
const scoreElement = element<HTMLElement>('#score')
const highScoreElement = element<HTMLElement>('#high-score')
const levelElement = element<HTMLElement>('#level')
const comboElement = element<HTMLElement>('#combo')
const comboChip = element<HTMLElement>('#combo-chip')
const bossHud = element<HTMLElement>('#boss-hud')
const bossFill = element<HTMLElement>('#boss-fill')
const bossHealth = element<HTMLElement>('#boss-health')
const bossMaxHealth = element<HTMLElement>('#boss-max-health')
const bossWave = element<HTMLElement>('#boss-wave')
const effectsTray = element<HTMLElement>('#effects-tray')
const shieldEffect = element<HTMLElement>('#shield-effect')
const chronoEffect = element<HTMLElement>('#chrono-effect')
const magnetEffect = element<HTMLElement>('#magnet-effect')
const overdriveEffect = element<HTMLElement>('#overdrive-effect')
const chronoTime = element<HTMLElement>('#chrono-time')
const magnetTime = element<HTMLElement>('#magnet-time')
const livesElement = element<HTMLElement>('#lives')
const energyValue = element<HTMLElement>('#energy-value')
const energyFill = element<HTMLElement>('#energy-fill')
const pauseButton = element<HTMLButtonElement>('#pause-button')
const pulseButton = element<HTMLButtonElement>('#pulse-button')
const soundButton = element<HTMLButtonElement>('#sound-button')
const announcer = element<HTMLElement>('#announcer')
const achievementCount = element<HTMLElement>('#achievement-count')
const careerRuns = element<HTMLElement>('#career-runs')
const careerBosses = element<HTMLElement>('#career-bosses')
const careerFlow = element<HTMLElement>('#career-flow')
const careerShards = element<HTMLElement>('#career-shards')
const toastStack = element<HTMLElement>('#toast-stack')
const difficultyButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-difficulty]')]
const audio = new AudioController()

function showToast(toast: GameToast): void {
  while (toastStack.children.length >= 3) toastStack.firstElementChild?.remove()

  const notification = document.createElement('div')
  notification.className = `game-toast game-toast--${toast.tone}`
  notification.innerHTML = '<i aria-hidden="true"></i><div><strong></strong><span></span></div>'
  notification.querySelector('strong')!.textContent = toast.title
  notification.querySelector('span')!.textContent = toast.message
  toastStack.append(notification)

  window.setTimeout(() => notification.classList.add('is-leaving'), 2800)
  window.setTimeout(() => notification.remove(), 3300)
}

function showPhase(phase: GamePhase, stats?: RoundStats): void {
  document.body.dataset.phase = phase
  overlay.dataset.phase = phase
  readyPanel.hidden = phase !== 'ready'
  pausedPanel.hidden = phase !== 'paused'
  gameoverPanel.hidden = phase !== 'gameover'
  overlay.hidden = phase === 'playing'

  pauseButton.disabled = phase === 'ready' || phase === 'gameover'
  pauseButton.classList.toggle('is-resume', phase === 'paused')
  pauseButton.setAttribute('aria-label', phase === 'paused' ? 'Resume game' : 'Pause game')
  pauseButton.title = phase === 'paused' ? 'Resume (P)' : 'Pause (P)'

  if (phase === 'gameover' && stats) {
    element<HTMLElement>('#final-score').textContent = formatScore(stats.score)
    element<HTMLElement>('#final-time').textContent = formatTime(stats.time)
    element<HTMLElement>('#final-shards').textContent = String(stats.shards)
    element<HTMLElement>('#final-near-misses').textContent = String(stats.nearMisses)
    element<HTMLElement>('#final-broken').textContent = String(stats.threatsBroken)
    element<HTMLElement>('#final-powerups').textContent = String(stats.powerUps)
    element<HTMLElement>('#final-bosses').textContent = String(stats.bosses)
    element<HTMLElement>('#final-combo').textContent = `${stats.maxCombo.toFixed(1)}×`
    element<HTMLElement>('#final-overdrive').textContent = `${Math.round(stats.overdriveTime)}s`
    element<HTMLElement>('#final-mode').textContent = DIFFICULTY_LABELS[stats.difficulty]
    element<HTMLElement>('#record-badge').hidden = !stats.isHighScore
    requestAnimationFrame(() => element<HTMLButtonElement>('#restart-button').focus())
  } else if (phase === 'paused') {
    requestAnimationFrame(() => element<HTMLButtonElement>('#resume-button').focus())
  }
}

function updateHud(snapshot: GameSnapshot): void {
  scoreElement.textContent = formatScore(snapshot.score)
  highScoreElement.textContent = formatScore(snapshot.highScore)
  const highScoreLabel = element<HTMLElement>('#high-score-label')
  highScoreLabel.textContent = `Best · ${DIFFICULTY_LABELS[snapshot.difficulty]}`
  levelElement.textContent = snapshot.level.toString().padStart(2, '0')
  comboElement.textContent = snapshot.combo.toFixed(1)
  comboChip.classList.toggle('is-active', snapshot.combo > 1.05)
  achievementCount.textContent = `${snapshot.achievementsUnlocked} / ${snapshot.achievementsTotal} badges`
  careerRuns.textContent = String(snapshot.career.runs)
  careerBosses.textContent = String(snapshot.career.bossDefeats)
  careerFlow.textContent = `${snapshot.career.bestCombo.toFixed(1)}×`
  careerShards.textContent = String(snapshot.career.totalShards)

  bossHud.hidden = !snapshot.bossActive || snapshot.phase !== 'playing'
  bossHealth.textContent = String(snapshot.bossHealth)
  bossMaxHealth.textContent = String(snapshot.bossMaxHealth)
  bossWave.textContent = formatWave(snapshot.bossWave)
  bossFill.style.width = `${snapshot.bossMaxHealth > 0 ? (snapshot.bossHealth / snapshot.bossMaxHealth) * 100 : 0}%`

  difficultyButtons.forEach((button) => {
    const selected = button.dataset.difficulty === snapshot.difficulty
    button.classList.toggle('is-selected', selected)
    button.setAttribute('aria-pressed', String(selected))
    button.disabled = snapshot.phase === 'playing' || snapshot.phase === 'paused'
  })

  const boostsVisible = snapshot.shield || snapshot.timeWarp > 0 || snapshot.magnet > 0 || snapshot.overdrive
  effectsTray.hidden = !boostsVisible || snapshot.phase === 'ready' || snapshot.phase === 'gameover'
  shieldEffect.hidden = !snapshot.shield
  chronoEffect.hidden = snapshot.timeWarp <= 0
  magnetEffect.hidden = snapshot.magnet <= 0
  overdriveEffect.hidden = !snapshot.overdrive
  chronoTime.textContent = `${Math.ceil(snapshot.timeWarp)}s`
  magnetTime.textContent = `${Math.ceil(snapshot.magnet)}s`
  document.body.classList.toggle('has-shield', snapshot.shield)
  document.body.classList.toggle('has-chrono', snapshot.timeWarp > 0)
  document.body.classList.toggle('has-magnet', snapshot.magnet > 0)
  document.body.classList.toggle('has-overdrive', snapshot.overdrive)
  document.body.classList.toggle('has-boss', snapshot.bossActive)

  const wholeEnergy = Math.round(snapshot.energy)
  energyValue.textContent = String(wholeEnergy)
  energyFill.style.width = `${wholeEnergy}%`
  pulseButton.style.setProperty('--charge', `${wholeEnergy * 3.6}deg`)
  pulseButton.disabled = snapshot.phase !== 'playing' || snapshot.energy < 30
  pulseButton.classList.toggle('is-ready', snapshot.phase === 'playing' && snapshot.energy >= 30)

  livesElement.innerHTML = Array.from(
    { length: 3 },
    (_, index) => `<i class="life ${index < snapshot.lives ? 'is-full' : ''}" aria-hidden="true"></i>`,
  ).join('')
  livesElement.setAttribute('aria-label', `${snapshot.lives} ${snapshot.lives === 1 ? 'life' : 'lives'} remaining`)
}

const game = new OrbitGame(canvas, audio, {
  onSnapshot: updateHud,
  onPhaseChange: showPhase,
  onToast: showToast,
  announce: (message) => {
    announcer.textContent = ''
    requestAnimationFrame(() => {
      announcer.textContent = message
    })
  },
})

element<HTMLButtonElement>('#start-button').addEventListener('click', () => game.start())
element<HTMLButtonElement>('#restart-button').addEventListener('click', () => game.start())
element<HTMLButtonElement>('#restart-from-pause').addEventListener('click', () => game.start())
element<HTMLButtonElement>('#resume-button').addEventListener('click', () => game.togglePause())
pauseButton.addEventListener('click', () => game.togglePause())
pulseButton.addEventListener('click', () => game.pulse())
difficultyButtons.forEach((button) => {
  button.addEventListener('click', () => {
    game.setDifficulty(button.dataset.difficulty as DifficultyMode)
  })
})

soundButton.classList.toggle('is-muted', audio.isMuted)
soundButton.setAttribute('aria-label', audio.isMuted ? 'Unmute sound' : 'Mute sound')
soundButton.addEventListener('click', () => {
  const muted = audio.toggle()
  soundButton.classList.toggle('is-muted', muted)
  soundButton.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound')
})

showPhase('ready')
