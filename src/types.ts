export type GamePhase = 'ready' | 'playing' | 'paused' | 'gameover'

export interface GameSnapshot {
  phase: GamePhase
  score: number
  highScore: number
  combo: number
  lives: number
  energy: number
  level: number
}

export interface RoundStats {
  score: number
  time: number
  shards: number
  nearMisses: number
  threatsBroken: number
  isHighScore: boolean
}

export interface GameCallbacks {
  onSnapshot: (snapshot: GameSnapshot) => void
  onPhaseChange: (phase: GamePhase, stats?: RoundStats) => void
  announce: (message: string) => void
}
