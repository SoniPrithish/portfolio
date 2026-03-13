type AudioCtor = typeof AudioContext

function getAudioContextConstructor(): AudioCtor | null {
  if (typeof window === 'undefined') {
    return null
  }

  const ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: AudioCtor }).webkitAudioContext
  return ctor ?? null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export class PoolAudioEngine {
  private context: AudioContext | null = null
  private masterGain: GainNode | null = null
  private ambientGain: GainNode | null = null
  private enabled = true
  private volume = 0.62
  private enhanced = true
  private ambientOscillators: OscillatorNode[] = []
  private noiseBuffer: AudioBuffer | null = null

  async prime(): Promise<void> {
    const AudioContextCtor = getAudioContextConstructor()
    if (!AudioContextCtor) {
      return
    }

    if (!this.context) {
      this.context = new AudioContextCtor()
      this.masterGain = this.context.createGain()
      this.masterGain.gain.value = this.volume
      this.masterGain.connect(this.context.destination)

      this.ambientGain = this.context.createGain()
      this.ambientGain.gain.value = 0
      this.ambientGain.connect(this.masterGain)
      this.noiseBuffer = this.createNoiseBuffer()
    }

    if (this.context.state === 'suspended') {
      await this.context.resume()
    }

    this.syncAmbient()
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (this.masterGain) {
      this.masterGain.gain.value = enabled ? this.volume : 0
    }

    this.syncAmbient()
  }

  setVolume(volume: number): void {
    this.volume = clamp(volume, 0, 1)
    if (this.masterGain && this.enabled) {
      this.masterGain.gain.value = this.volume
    }
  }

  setEnhanced(enabled: boolean): void {
    this.enhanced = enabled
    this.syncAmbient()
  }

  playCue(power: number): void {
    this.triggerTone(160 + power * 120, 0.1 + power * 0.12, 0.08 + power * 0.12, 'triangle')
    if (this.enhanced) {
      this.triggerNoise(0.035 + power * 0.02, 1200, 0.05)
    }
  }

  playCollision(intensity: number): void {
    const gain = clamp(intensity * 0.09, 0.025, 0.11)
    this.triggerTone(360 + intensity * 220, gain, 0.045, 'sine')
  }

  playRail(intensity: number): void {
    const gain = clamp(intensity * 0.07, 0.02, 0.08)
    this.triggerTone(260 + intensity * 120, gain, 0.055, 'square')
  }

  playPocket(): void {
    this.triggerTone(120, 0.08, 0.22, 'triangle')
    this.triggerNoise(0.06, 320, 0.16)
  }

  destroy(): void {
    this.stopAmbient()
    if (this.context) {
      void this.context.close()
      this.context = null
    }
  }

  private createNoiseBuffer(): AudioBuffer | null {
    if (!this.context) {
      return null
    }

    const buffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < channel.length; i += 1) {
      channel[i] = (Math.random() * 2 - 1) * 0.35
    }

    return buffer
  }

  private triggerTone(
    frequency: number,
    gainValue: number,
    duration: number,
    type: OscillatorType,
  ): void {
    if (!this.context || !this.masterGain || !this.enabled) {
      return
    }

    const now = this.context.currentTime
    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()

    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, now)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * 0.68), now + duration)

    gain.gain.setValueAtTime(gainValue, now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

    oscillator.connect(gain)
    gain.connect(this.masterGain)
    oscillator.start(now)
    oscillator.stop(now + duration)
  }

  private triggerNoise(gainValue: number, lowpass: number, duration: number): void {
    if (!this.context || !this.masterGain || !this.enabled || !this.noiseBuffer) {
      return
    }

    const now = this.context.currentTime
    const source = this.context.createBufferSource()
    source.buffer = this.noiseBuffer

    const filter = this.context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = lowpass

    const gain = this.context.createGain()
    gain.gain.setValueAtTime(gainValue, now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

    source.connect(filter)
    filter.connect(gain)
    gain.connect(this.masterGain)
    source.start(now)
    source.stop(now + duration)
  }

  private syncAmbient(): void {
    if (!this.context || !this.ambientGain) {
      return
    }

    if (!this.enabled || !this.enhanced) {
      this.stopAmbient()
      this.ambientGain.gain.value = 0
      return
    }

    if (this.ambientOscillators.length > 0) {
      this.ambientGain.gain.value = this.volume * 0.08
      return
    }

    this.ambientGain.gain.value = this.volume * 0.08

    const tones: Array<{ frequency: number; detune: number; type: OscillatorType }> = [
      { frequency: 48, detune: -4, type: 'sine' },
      { frequency: 96, detune: 2, type: 'triangle' },
    ]

    this.ambientOscillators = tones.map((tone) => {
      const oscillator = this.context!.createOscillator()
      oscillator.type = tone.type
      oscillator.frequency.value = tone.frequency
      oscillator.detune.value = tone.detune
      oscillator.connect(this.ambientGain!)
      oscillator.start()
      return oscillator
    })
  }

  private stopAmbient(): void {
    this.ambientOscillators.forEach((oscillator) => {
      try {
        oscillator.stop()
      } catch {
        // Ignore repeated stop calls during cleanup.
      }
      oscillator.disconnect()
    })

    this.ambientOscillators = []
  }
}
