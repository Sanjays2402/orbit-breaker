export type GamePhase = 'ready' | 'playing' | 'paused' | 'gameover'
export type DifficultyMode = 'drift' | 'classic' | 'hyper'
export type ToastTone = 'event' | 'powerup' | 'achievement'

export interface GameToast {
  title: string
  message: string
  tone: ToastTone
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
  achievementsUnlocked: number
  achievementsTotal: number
}

export interface RoundStats {
  score: number
  time: number
  shards: number
  nearMisses: number
  threatsBroken: number
  powerUps: number
  maxCombo: number
  difficulty: DifficultyMode
  isHighScore: boolean
}

export interface GameCallbacks {
  onSnapshot: (snapshot: GameSnapshot) => void
  onPhaseChange: (phase: GamePhase, stats?: RoundStats) => void
  onToast: (toast: GameToast) => void
  announce: (message: string) => void
}
