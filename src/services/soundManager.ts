/**
 * Procedural Sound Effects using Web Audio API
 */

class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted: boolean = false;

  private init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.masterGain.gain.value = this.muted ? 0 : 0.3; // Default volume
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : 0.3;
    }
    return this.muted;
  }

  isMuted() {
    return this.muted;
  }

  private playTone(freq: number, type: OscillatorType, duration: number, volume: number = 1) {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  // Tower Firing Sounds
  playFire(type: string) {
    switch (type) {
      case 'root':
        this.playTone(150, 'sine', 0.2, 0.8); // Thump
        break;
      case 'stem':
        this.playTone(400, 'square', 0.1, 0.4); // Mechanical click/shot
        break;
      case 'leaf':
        this.playTone(800, 'sawtooth', 0.05, 0.3); // Sharp slice
        break;
      case 'flower':
        this.playTone(600, 'sine', 0.4, 0.6); // Magic beam
        break;
    }
  }

  // Enemy Destruction
  playExplosion() {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    const duration = 0.5;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start();
  }

  // Base Hit
  playBaseHit() {
    this.playTone(80, 'triangle', 0.6, 1.2); // Heavy impact
    setTimeout(() => this.playTone(60, 'sine', 0.3, 0.8), 100);
  }

  // Game Over
  playGameOver() {
    this.playTone(400, 'sawtooth', 0.5, 0.8);
    setTimeout(() => this.playTone(300, 'sawtooth', 0.5, 0.8), 200);
    setTimeout(() => this.playTone(200, 'sawtooth', 0.8, 1.0), 400);
  }

  // Enemy Movement (Subtle)
  playStep() {
    this.playTone(100 + Math.random() * 50, 'square', 0.02, 0.05);
  }
}

export const soundManager = new SoundManager();
