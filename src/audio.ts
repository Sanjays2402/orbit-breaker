type SoundName =
  | 'start'
  | 'collect'
  | 'nearMiss'
  | 'hit'
  | 'pulse'
  | 'break'
  | 'levelUp'
  | 'gameOver'

const MUTE_KEY = 'orbit-breaker-muted'

export class AudioController {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private muted = this.readMutedPreference()

  get isMuted(): boolean {
    return this.muted
  }

  unlock(): void {
    const context = this.ensureContext()
    if (context?.state === 'suspended') {
      void context.resume()
    }
  }

  toggle(): boolean {
    this.muted = !this.muted
    try {
      localStorage.setItem(MUTE_KEY, String(this.muted))
    } catch {
      // Audio still works when storage is unavailable.
    }

    if (!this.muted) {
      this.unlock()
      this.play('start')
    }

    return this.muted
  }

  play(sound: SoundName): void {
    if (this.muted) return

    const context = this.ensureContext()
    if (!context || !this.master) return

    const now = context.currentTime

    switch (sound) {
      case 'start':
        this.tone(220, 440, 0.18, 'sine', 0.09, now)
        this.tone(440, 660, 0.16, 'triangle', 0.05, now + 0.09)
        break
      case 'collect':
        this.tone(620, 880, 0.1, 'sine', 0.075, now)
        this.tone(930, 1180, 0.09, 'triangle', 0.045, now + 0.045)
        break
      case 'nearMiss':
        this.tone(190, 260, 0.08, 'sawtooth', 0.035, now)
        break
      case 'hit':
        this.noise(0.24, 0.16, now)
        this.tone(120, 45, 0.3, 'sawtooth', 0.09, now)
        break
      case 'pulse':
        this.tone(130, 720, 0.38, 'sine', 0.12, now)
        this.noise(0.16, 0.055, now + 0.04)
        break
      case 'break':
        this.tone(360, 110, 0.12, 'square', 0.035, now)
        break
      case 'levelUp':
        this.tone(330, 520, 0.16, 'triangle', 0.055, now)
        this.tone(520, 790, 0.18, 'triangle', 0.055, now + 0.11)
        break
      case 'gameOver':
        this.tone(260, 160, 0.34, 'triangle', 0.08, now)
        this.tone(170, 65, 0.5, 'sine', 0.08, now + 0.25)
        break
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.context && this.master) return this.context

    const AudioContextClass = window.AudioContext
    if (!AudioContextClass) return null

    this.context = new AudioContextClass()
    this.master = this.context.createGain()
    this.master.gain.value = 0.55
    this.master.connect(this.context.destination)
    return this.context
  }

  private tone(
    startFrequency: number,
    endFrequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    startTime: number,
  ): void {
    if (!this.context || !this.master) return

    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()

    oscillator.type = type
    oscillator.frequency.setValueAtTime(startFrequency, startTime)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), startTime + duration)

    gain.gain.setValueAtTime(0.0001, startTime)
    gain.gain.exponentialRampToValueAtTime(volume, startTime + Math.min(0.025, duration * 0.25))
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)

    oscillator.connect(gain)
    gain.connect(this.master)
    oscillator.start(startTime)
    oscillator.stop(startTime + duration + 0.02)
  }

  private noise(duration: number, volume: number, startTime: number): void {
    if (!this.context || !this.master) return

    const frameCount = Math.ceil(this.context.sampleRate * duration)
    const buffer = this.context.createBuffer(1, frameCount, this.context.sampleRate)
    const channel = buffer.getChannelData(0)

    for (let index = 0; index < frameCount; index += 1) {
      channel[index] = (Math.random() * 2 - 1) * (1 - index / frameCount)
    }

    const source = this.context.createBufferSource()
    const filter = this.context.createBiquadFilter()
    const gain = this.context.createGain()

    source.buffer = buffer
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(520, startTime)
    filter.frequency.exponentialRampToValueAtTime(90, startTime + duration)
    gain.gain.setValueAtTime(volume, startTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)

    source.connect(filter)
    filter.connect(gain)
    gain.connect(this.master)
    source.start(startTime)
  }

  private readMutedPreference(): boolean {
    try {
      return localStorage.getItem(MUTE_KEY) === 'true'
    } catch {
      return false
    }
  }
}
