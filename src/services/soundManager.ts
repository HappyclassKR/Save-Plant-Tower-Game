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

  // Tower Firing Sounds - Cheerful & Bright
  playFire(type: string) {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    switch (type) {
      case 'root':
        // Crystalline "Ping"
        this.playTone(1200, 'sine', 0.1, 0.4);
        setTimeout(() => this.playTone(1500, 'sine', 0.05, 0.3), 50);
        break;
      case 'stem':
        // Bright "Pew"
        this.playTone(800, 'square', 0.1, 0.3);
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
        break;
      case 'leaf':
        // High-pitched "Zip"
        this.playTone(2000, 'sawtooth', 0.05, 0.2);
        break;
      case 'flower':
        // Magical "Twinkle"
        this.playTone(1000, 'sine', 0.3, 0.5);
        setTimeout(() => this.playTone(1400, 'sine', 0.2, 0.4), 100);
        setTimeout(() => this.playTone(1800, 'sine', 0.1, 0.3), 200);
        break;
    }
  }

  // Enemy Destruction - "Pop" and "Sparkle"
  playExplosion() {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    // Cute Pop Sound
    this.playTone(600, 'sine', 0.1, 0.6);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(600, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);

    // Sparkle layer
    setTimeout(() => {
      this.playTone(2500 + Math.random() * 1000, 'sine', 0.05, 0.2);
    }, 50);
  }

  // Base Hit - Cartoonish "Ouch"
  playBaseHit() {
    // Descending "Boing"
    this.playTone(400, 'triangle', 0.3, 0.8);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(400, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.6, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }

  // Upgrade Sound - Rising Arpeggio
  playUpgrade() {
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 'sine', 0.2, 0.4), i * 80);
    });
  }

  // Wave Start - Bright Fanfare
  playWaveStart() {
    const notes = [392.00, 523.25, 659.25, 783.99]; // G4, C5, E5, G5
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 'triangle', 0.3, 0.5), i * 120);
    });
  }

  // Victory Sound - Celebratory
  playVictory() {
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C5, E5, G5, C6, E6
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 'sine', 0.4, 0.5), i * 100);
    });
  }

  // Success Sound - Correct Answer
  playSuccess() {
    this.playTone(659.25, 'sine', 0.1, 0.4); // E5
    setTimeout(() => this.playTone(880.00, 'sine', 0.2, 0.4), 100); // A5
  }

  // Failure Sound - Incorrect Answer
  playFailure() {
    this.playTone(392.00, 'sine', 0.2, 0.4); // G4
    setTimeout(() => this.playTone(311.13, 'sine', 0.3, 0.4), 150); // Eb4
  }

  // Click Sound - UI Interaction
  playClick() {
    this.playTone(1200, 'sine', 0.05, 0.2);
  }

  // Placement Sound - Cute "Plop"
  playPlacement() {
    this.playTone(400, 'sine', 0.1, 0.4);
    setTimeout(() => this.playTone(600, 'sine', 0.1, 0.3), 50);
  }

  // Game Over - Cartoonish Descending
  playGameOver() {
    const notes = [440, 349.23, 293.66, 220]; // A4, F4, D4, A3
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 'sawtooth', 0.6, 0.6), i * 250);
    });
  }

  // Enemy Movement - Light "Tiptoe"
  playStep() {
    this.playTone(1500 + Math.random() * 500, 'sine', 0.02, 0.03);
  }
}

export const soundManager = new SoundManager();
