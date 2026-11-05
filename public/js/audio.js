// public/js/audio.js - Synthesized Game Audio via Web Audio API
class SoundFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineGain = null;
    this.engineOsc = null;
    this.engineFilter = null;
    this.isEngineRunning = false;
    this.skidGain = null;
    this.skidSource = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();
    this.initialized = true;

    // Master volume
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    this.setupEngine();
    this.setupSkid();
    this.setupNitro();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : 0.35, this.ctx.currentTime);
    }
    return this.muted;
  }

  setupEngine() {
    if (!this.ctx) return;
    // Dual oscillator setup for realistic engine roar
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.setValueAtTime(55, this.ctx.currentTime);

    this.engineOscSub = this.ctx.createOscillator();
    this.engineOscSub.type = 'triangle';
    this.engineOscSub.frequency.setValueAtTime(27.5, this.ctx.currentTime);

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.setValueAtTime(260, this.ctx.currentTime);

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    this.engineOsc.connect(this.engineFilter);
    this.engineOscSub.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    try {
      this.engineOsc.start();
      this.engineOscSub.start();
      this.isEngineRunning = true;
    } catch (e) {
      // Audio autoplay policy
    }
  }

  setupSkid() {
    if (!this.ctx) return;
    // White noise generator for tire skids
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    this.skidSource = this.ctx.createBufferSource();
    this.skidSource.buffer = noiseBuffer;
    this.skidSource.loop = true;

    this.skidFilter = this.ctx.createBiquadFilter();
    this.skidFilter.type = 'bandpass';
    this.skidFilter.frequency.setValueAtTime(1100, this.ctx.currentTime);
    this.skidFilter.Q.setValueAtTime(3.0, this.ctx.currentTime);

    this.skidGain = this.ctx.createGain();
    this.skidGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    this.skidSource.connect(this.skidFilter);
    this.skidFilter.connect(this.skidGain);
    this.skidGain.connect(this.masterGain);

    try {
      this.skidSource.start();
    } catch (e) {}
  }

  setupNitro() {
    if (!this.ctx) return;
    // High-pitched turbo whistle + rocket roar
    this.nitroOsc = this.ctx.createOscillator();
    this.nitroOsc.type = 'sawtooth';
    this.nitroOsc.frequency.setValueAtTime(440, this.ctx.currentTime);

    this.nitroFilter = this.ctx.createBiquadFilter();
    this.nitroFilter.type = 'bandpass';
    this.nitroFilter.frequency.setValueAtTime(1400, this.ctx.currentTime);
    this.nitroFilter.Q.setValueAtTime(4.0, this.ctx.currentTime);

    this.nitroGain = this.ctx.createGain();
    this.nitroGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    this.nitroOsc.connect(this.nitroFilter);
    this.nitroFilter.connect(this.nitroGain);
    this.nitroGain.connect(this.masterGain);

    try {
      this.nitroOsc.start();
    } catch (e) {}
  }

  setNitro(isBoosting) {
    if (!this.ctx || this.muted || !this.nitroGain) return;
    const t = this.ctx.currentTime;
    if (isBoosting) {
      this.nitroOsc.frequency.setTargetAtTime(680, t, 0.05);
      this.nitroFilter.frequency.setTargetAtTime(1800, t, 0.05);
      this.nitroGain.gain.setTargetAtTime(0.22, t, 0.05);
    } else {
      this.nitroGain.gain.setTargetAtTime(0.0, t, 0.08);
    }
  }

  updateEngine(speed, maxSpeed, isDriving) {
    if (!this.ctx || this.muted || !this.engineOsc) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const ratio = Math.min(Math.abs(speed) / (maxSpeed || 8.5), 1.0);
    const targetFreq = 45 + ratio * 140;
    const targetSub = targetFreq * 0.5;
    const targetFilter = 220 + ratio * 650;
    const targetGain = isDriving ? (0.08 + ratio * 0.12) : 0.04;

    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(targetFreq, t, 0.05);
    this.engineOscSub.frequency.setTargetAtTime(targetSub, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(targetFilter, t, 0.05);
    this.engineGain.gain.setTargetAtTime(targetGain, t, 0.05);
  }

  setSkid(isSkidding) {
    if (!this.ctx || this.muted || !this.skidGain) return;
    const target = isSkidding ? 0.16 : 0.0;
    this.skidGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.04);
  }

  // Crash / Bump sound effect (Car vs Car or Car vs Wall)
  playCrash(intensity = 1.0) {
    if (!this.ctx || this.muted) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const t = this.ctx.currentTime;
    const clampedIntensity = Math.min(Math.max(intensity, 0.3), 1.5);

    // 1. Low punch / sub boom
    const boomOsc = this.ctx.createOscillator();
    const boomGain = this.ctx.createGain();
    boomOsc.type = 'triangle';
    boomOsc.frequency.setValueAtTime(140, t);
    boomOsc.frequency.exponentialRampToValueAtTime(30, t + 0.25);
    boomGain.gain.setValueAtTime(0.4 * clampedIntensity, t);
    boomGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    boomOsc.connect(boomGain);
    boomGain.connect(this.masterGain);
    boomOsc.start(t);
    boomOsc.stop(t + 0.25);

    // 2. Metal crunch noise burst
    const crunchBuffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.2), this.ctx.sampleRate);
    const data = crunchBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.05));
    }
    const crunch = this.ctx.createBufferSource();
    crunch.buffer = crunchBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(900, t);
    filter.Q.setValueAtTime(1.5, t);

    const crunchGain = this.ctx.createGain();
    crunchGain.gain.setValueAtTime(0.35 * clampedIntensity, t);
    crunchGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    crunch.connect(filter);
    filter.connect(crunchGain);
    crunchGain.connect(this.masterGain);

    crunch.start(t);
  }

  // Countdown beep (pitch: normal for 3, 2, 1; high for GO)
  playCountdownBeep(isGo = false) {
    if (!this.ctx || this.muted) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const freq = isGo ? 880 : 440;
    const dur = isGo ? 0.5 : 0.2;

    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + dur);
  }

  // Checkpoint chime
  playCheckpoint() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, t); // D5
    osc.frequency.setValueAtTime(880, t + 0.08); // A5

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.25);
  }

  // Win fanfare
  playWinFanfare() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const notes = [
      { f: 523.25, time: 0.0, dur: 0.15 }, // C5
      { f: 659.25, time: 0.15, dur: 0.15 }, // E5
      { f: 783.99, time: 0.30, dur: 0.15 }, // G5
      { f: 1046.50, time: 0.45, dur: 0.6 }  // C6
    ];

    notes.forEach(n => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.f, t + n.time);
      gain.gain.setValueAtTime(0.28, t + n.time);
      gain.gain.exponentialRampToValueAtTime(0.001, t + n.time + n.dur);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t + n.time);
      osc.stop(t + n.time + n.dur);
    });
  }
}

window.soundFX = new SoundFX();

