export type GamePhase = 'ready' | 'playing' | 'paused' | 'gameover'
export type DifficultyMode = 'drift' | 'classic' | 'hyper'
export type ToastTone = 'event' | 'powerup' | 'achievement'

export interface GameToast {
  title: string
  message: string
  tone: ToastTone
}

export interface CareerStats {
  runs: number
  bossDefeats: number
  bestCombo: number
  totalShards: number
}

export interface GameSnapshot {
  phase: GamePhase
  score: number
  highScore: number
  combo: number
  lives: number
  energy: number
  level: number
  difficulty: DifficultyMode
  shield: boolean
  timeWarp: number
  magnet: number
  overdrive: boolean
  bossActive: boolean
  bossHealth: number
  bossMaxHealth: number
  bossWave: number
  achievementsUnlocked: number
  achievementsTotal: number
  career: CareerStats
}

export interface RoundStats {
  score: number
  time: number
  shards: number
  nearMisses: number
  threatsBroken: number
  powerUps: number
  bosses: number
  maxCombo: number
  overdriveTime: number
  difficulty: DifficultyMode
  isHighScore: boolean
}

export interface GameCallbacks {
  onSnapshot: (snapshot: GameSnapshot) => void
  onPhaseChange: (phase: GamePhase, stats?: RoundStats) => void
  onToast: (toast: GameToast) => void
  announce: (message: string) => void
}
