/**
 * Zero-dependency Web Audio procedural industrial SFX synthesizer, event bus,
 * mix hierarchy (UI / SFX / Ambient -> Master -> Limiter -> Mono Merger),
 * and adaptive orbital ambient layer.
 */

export type AudioEventId =
  | 'ui_tick'
  | 'ui_error'
  | 'ui_modal_open'
  | 'ui_modal_close'
  | 'ui_save'
  | 'build_place'
  | 'build_rotate'
  | 'build_remove'
  | 'belt_drag_step'
  | 'mine_hit'
  | 'bp_copy'
  | 'bp_stamp'
  | 'hub_load'
  | 'tech_unlock'
  | 'rocket_launch'
  | 'victory_fanfare'
  | 'power_brownout'
  | 'power_restored'
  | 'sim_pause'
  | 'alt_mode';

export type AudioBusId = 'master' | 'ui' | 'sfx' | 'ambient';

export interface AudioVolumes {
  master: number;
  ui: number;
  sfx: number;
  ambient: number;
}

const AUDIO_PREFS_KEY = 'aetherforge_audio_prefs_v1';
const MAX_CONCURRENT_VOICES = 18;

const EVENT_COOLDOWNS_MS: Record<AudioEventId, number> = {
  ui_tick: 28,
  ui_error: 120,
  ui_modal_open: 70,
  ui_modal_close: 70,
  ui_save: 150,
  build_place: 40,
  build_rotate: 35,
  build_remove: 45,
  belt_drag_step: 48,
  mine_hit: 85,
  bp_copy: 100,
  bp_stamp: 80,
  hub_load: 80,
  tech_unlock: 180,
  rocket_launch: 250,
  victory_fanfare: 300,
  power_brownout: 500,
  power_restored: 500,
  sim_pause: 60,
  alt_mode: 50,
};

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function setParamSmooth(param: AudioParam, value: number, now: number, tc = 0.08): void {
  if (typeof param.setTargetAtTime === 'function') {
    param.setTargetAtTime(value, now, tc);
  } else {
    param.setValueAtTime(value, now);
  }
}

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private uiGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private monoMixGain: GainNode | null = null;
  private monoMerger: ChannelMergerNode | null = null;

  // Ambient adaptive nodes
  private ambientInitialized = false;
  private windSource: AudioBufferSourceNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private windLfo: OscillatorNode | null = null;
  private humOscLow: OscillatorNode | null = null;
  private humOscHigh: OscillatorNode | null = null;
  private humFilter: BiquadFilterNode | null = null;
  private humGain: GainNode | null = null;

  // Cached noise buffers
  private launchNoiseBuffer: AudioBuffer | null = null;
  private windNoiseBuffer: AudioBuffer | null = null;

  private muted = false;
  private mono = false;
  private volumes: AudioVolumes = {
    master: 0.85,
    ui: 0.8,
    sfx: 0.85,
    ambient: 0.5,
  };

  private readonly lastEmitMs = new Map<AudioEventId, number>();
  private readonly voiceEndTimes = new Float64Array(MAX_CONCURRENT_VOICES);
  private voiceCursor = 0;
  private pitchRng = 0x13579bdf;

  public constructor() {
    this.loadPrefs();
  }

  private loadPrefs(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(AUDIO_PREFS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<{
        muted: boolean;
        mono: boolean;
        volumes: Partial<AudioVolumes>;
      }>;
      if (typeof parsed.muted === 'boolean') this.muted = parsed.muted;
      if (typeof parsed.mono === 'boolean') this.mono = parsed.mono;
      if (parsed.volumes && typeof parsed.volumes === 'object') {
        if (typeof parsed.volumes.master === 'number') this.volumes.master = clamp01(parsed.volumes.master);
        if (typeof parsed.volumes.ui === 'number') this.volumes.ui = clamp01(parsed.volumes.ui);
        if (typeof parsed.volumes.sfx === 'number') this.volumes.sfx = clamp01(parsed.volumes.sfx);
        if (typeof parsed.volumes.ambient === 'number') this.volumes.ambient = clamp01(parsed.volumes.ambient);
      }
    } catch {
      // Ignore storage access failures in sandboxed browsers
    }
  }

  private savePrefs(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(
        AUDIO_PREFS_KEY,
        JSON.stringify({
          muted: this.muted,
          mono: this.mono,
          volumes: this.volumes,
        })
      );
    } catch {
      // Ignore quota / privacy mode failures
    }
  }

  private nextPitchFactor(spread = 0.06): number {
    this.pitchRng = (Math.imul(this.pitchRng, 1664525) + 1013904223) >>> 0;
    const norm = (this.pitchRng / 4294967295) * 2 - 1;
    return 1 + norm * spread;
  }

  private nowMs(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  private ensureMixGraph(): void {
    if (!this.ctx || this.masterGain) return;
    const ctx = this.ctx;

    this.uiGain = ctx.createGain();
    this.sfxGain = ctx.createGain();
    this.ambientGain = ctx.createGain();
    this.masterGain = ctx.createGain();

    this.uiGain.gain.setValueAtTime(this.volumes.ui, ctx.currentTime);
    this.sfxGain.gain.setValueAtTime(this.volumes.sfx, ctx.currentTime);
    this.ambientGain.gain.setValueAtTime(this.volumes.ambient, ctx.currentTime);
    this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volumes.master, ctx.currentTime);

    this.uiGain.connect(this.masterGain);
    this.sfxGain.connect(this.masterGain);
    this.ambientGain.connect(this.masterGain);

    if (typeof ctx.createDynamicsCompressor === 'function') {
      this.compressor = ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-10, ctx.currentTime);
      this.compressor.knee.setValueAtTime(12, ctx.currentTime);
      this.compressor.ratio.setValueAtTime(6, ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.003, ctx.currentTime);
      this.compressor.release.setValueAtTime(0.15, ctx.currentTime);
      this.masterGain.connect(this.compressor);
    }

    this.applyOutputRouting();
  }

  private applyOutputRouting(): void {
    if (!this.ctx || !this.masterGain) return;
    const outputSource: AudioNode = this.compressor ?? this.masterGain;

    try {
      outputSource.disconnect();
    } catch {
      // Ignore if not previously connected
    }

    if (this.mono) {
      if (!this.monoMixGain) {
        this.monoMixGain = this.ctx.createGain();
        this.monoMixGain.channelCount = 1;
        this.monoMixGain.channelCountMode = 'explicit';
        this.monoMixGain.channelInterpretation = 'speakers';
      }
      if (!this.monoMerger && typeof this.ctx.createChannelMerger === 'function') {
        this.monoMerger = this.ctx.createChannelMerger(1);
      }

      outputSource.connect(this.monoMixGain);
      if (this.monoMerger) {
        try {
          this.monoMixGain.disconnect();
          this.monoMerger.disconnect();
        } catch {
          // Ignore if fresh
        }
        this.monoMixGain.connect(this.monoMerger, 0, 0);
        this.monoMerger.connect(this.ctx.destination);
      } else {
        this.monoMixGain.connect(this.ctx.destination);
      }
    } else {
      outputSource.connect(this.ctx.destination);
    }
  }

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtor) {
        this.ctx = new AudioCtor();
      }
    }
    if (this.ctx) {
      this.ensureMixGraph();
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
    }
  }

  public dispose(): void {
    try {
      this.windSource?.stop();
      this.windLfo?.stop();
      this.humOscLow?.stop();
      this.humOscHigh?.stop();
      if (this.ctx && typeof this.ctx.close === 'function') {
        void this.ctx.close();
      }
    } catch {
      // Ignore teardown errors
    }
    this.ctx = null;
    this.uiGain = null;
    this.sfxGain = null;
    this.ambientGain = null;
    this.masterGain = null;
    this.compressor = null;
    this.monoMixGain = null;
    this.monoMerger = null;
    this.windSource = null;
    this.windFilter = null;
    this.windGain = null;
    this.windLfo = null;
    this.humOscLow = null;
    this.humOscHigh = null;
    this.humFilter = null;
    this.humGain = null;
    this.ambientInitialized = false;
    this.launchNoiseBuffer = null;
    this.windNoiseBuffer = null;
    this.voiceEndTimes.fill(0);
    this.voiceCursor = 0;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.muted) {
      this.unlock();
    }
    if (this.ctx && this.masterGain) {
      setParamSmooth(
        this.masterGain.gain,
        this.muted ? 0 : this.volumes.master,
        this.ctx.currentTime,
        0.03
      );
    }
    this.savePrefs();
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public isMono(): boolean {
    return this.mono;
  }

  public setMono(enabled: boolean): void {
    this.mono = Boolean(enabled);
    if (this.ctx && this.masterGain) {
      this.applyOutputRouting();
    }
    this.savePrefs();
  }

  public setVolume(bus: AudioBusId, value: number): void {
    const v = clamp01(value);
    this.volumes[bus] = v;
    if (this.ctx) {
      const now = this.ctx.currentTime;
      if (bus === 'master' && this.masterGain) {
        setParamSmooth(this.masterGain.gain, this.muted ? 0 : v, now, 0.04);
      } else if (bus === 'ui' && this.uiGain) {
        setParamSmooth(this.uiGain.gain, v, now, 0.04);
      } else if (bus === 'sfx' && this.sfxGain) {
        setParamSmooth(this.sfxGain.gain, v, now, 0.04);
      } else if (bus === 'ambient' && this.ambientGain) {
        setParamSmooth(this.ambientGain.gain, v, now, 0.06);
      }
    }
    this.savePrefs();
  }

  public getVolumes(): AudioVolumes {
    return { ...this.volumes };
  }

  private getLaunchNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.launchNoiseBuffer && this.launchNoiseBuffer.sampleRate === ctx.sampleRate) {
      return this.launchNoiseBuffer;
    }
    const dur = 1.6;
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // shortcut: pre-baked LCG noise buffers (1.6s launch + 3s looping wind), move to AudioWorklet if continuous procedural music is added
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (((i * 16807) % 2147483647) / 1073741824 - 1) * 0.7;
    }
    this.launchNoiseBuffer = buffer;
    return buffer;
  }

  private getWindNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.windNoiseBuffer && this.windNoiseBuffer.sampleRate === ctx.sampleRate) {
      return this.windNoiseBuffer;
    }
    const dur = 3.0;
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 0x2468ace1;
    let brown = 0;
    for (let i = 0; i < bufferSize; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const white = (seed / 4294967295) * 2 - 1;
      brown = (brown + 0.02 * white) / 1.02;
      data[i] = brown * 2.8;
    }
    // Crossfade end into start for seamless loop
    const fadeLen = Math.min(2048, Math.floor(bufferSize * 0.1));
    for (let i = 0; i < fadeLen; i++) {
      const t = i / fadeLen;
      data[bufferSize - fadeLen + i] = data[bufferSize - fadeLen + i] * (1 - t) + data[i] * t;
    }
    this.windNoiseBuffer = buffer;
    return buffer;
  }

  private ensureAmbientLayer(): void {
    if (!this.ctx || !this.ambientGain || this.ambientInitialized) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // 1. Exoplanet orbital wind (looping filtered brown noise + gentle LFO)
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = this.getWindNoiseBuffer(ctx);
    windSrc.loop = true;

    const windFilt = ctx.createBiquadFilter();
    windFilt.type = 'bandpass';
    windFilt.frequency.setValueAtTime(260, now);
    windFilt.Q.setValueAtTime(1.1, now);

    const windG = ctx.createGain();
    windG.gain.setValueAtTime(0.0001, now);

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.08, now);
    const lfoG = ctx.createGain();
    lfoG.gain.setValueAtTime(85, now);
    lfo.connect(lfoG);
    lfoG.connect(windFilt.frequency);

    windSrc.connect(windFilt);
    windFilt.connect(windG);
    windG.connect(this.ambientGain);
    windSrc.start(now);
    lfo.start(now);

    this.windSource = windSrc;
    this.windFilter = windFilt;
    this.windGain = windG;
    this.windLfo = lfo;

    // 2. Industrial factory machine hum (55 Hz + 110 Hz harmonic drone)
    const humLow = ctx.createOscillator();
    humLow.type = 'sawtooth';
    humLow.frequency.setValueAtTime(55, now);

    const humHigh = ctx.createOscillator();
    humHigh.type = 'triangle';
    humHigh.frequency.setValueAtTime(110.5, now);

    const humFilt = ctx.createBiquadFilter();
    humFilt.type = 'lowpass';
    humFilt.frequency.setValueAtTime(160, now);
    humFilt.Q.setValueAtTime(1.5, now);

    const humG = ctx.createGain();
    humG.gain.setValueAtTime(0.0001, now);

    humLow.connect(humFilt);
    humHigh.connect(humFilt);
    humFilt.connect(humG);
    humG.connect(this.ambientGain);
    humLow.start(now);
    humHigh.start(now);

    this.humOscLow = humLow;
    this.humOscHigh = humHigh;
    this.humFilter = humFilt;
    this.humGain = humG;
    this.ambientInitialized = true;
  }

  public updateAmbient(activeMachines: number, satisfaction: number, paused: boolean): void {
    if (!this.ctx || !this.ambientGain) return;
    this.ensureAmbientLayer();
    if (!this.windGain || !this.windFilter || !this.humGain || !this.humFilter || !this.humOscLow || !this.humOscHigh) {
      return;
    }

    const now = this.ctx.currentTime;
    const load = Math.min(1, Math.max(0, activeMachines) / 40);
    const sat = clamp01(satisfaction);

    if (this.muted || paused) {
      setParamSmooth(this.windGain.gain, this.muted ? 0.0001 : 0.024, now, 0.14);
      setParamSmooth(this.humGain.gain, 0.0001, now, 0.12);
      return;
    }

    const targetWind = 0.055 - load * 0.015;
    const targetHum = (0.012 + load * 0.068) * (0.35 + 0.65 * sat);
    const targetCutoff = 135 + load * 210 * sat;
    const pitchScale = 0.85 + 0.15 * sat;

    setParamSmooth(this.windGain.gain, targetWind, now, 0.18);
    setParamSmooth(this.windFilter.frequency, 240 + load * 90, now, 0.25);
    setParamSmooth(this.humGain.gain, targetHum, now, 0.18);
    setParamSmooth(this.humFilter.frequency, targetCutoff, now, 0.2);
    setParamSmooth(this.humOscLow.frequency, 55 * pitchScale, now, 0.2);
    setParamSmooth(this.humOscHigh.frequency, 110.5 * pitchScale, now, 0.2);
  }

  private tryReserveVoice(endTimeSec: number): boolean {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    for (let i = 0; i < MAX_CONCURRENT_VOICES; i++) {
      const idx = (this.voiceCursor + i) % MAX_CONCURRENT_VOICES;
      if (this.voiceEndTimes[idx] <= now) {
        this.voiceEndTimes[idx] = endTimeSec;
        this.voiceCursor = (idx + 1) % MAX_CONCURRENT_VOICES;
        return true;
      }
    }
    return false;
  }

  private scheduleTone(
    bus: GainNode,
    type: OscillatorType,
    startHz: number,
    endHz: number,
    peakGain: number,
    durSec: number,
    offsetSec = 0,
    cutoffHz?: number
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + offsetSec;
    if (!this.tryReserveVoice(t0 + durSec + 0.01)) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, startHz), t0);
    if (endHz !== startHz) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endHz), t0 + Math.max(0.01, durSec * 0.9));
    }

    gain.gain.setValueAtTime(peakGain, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + durSec);

    if (cutoffHz && typeof ctx.createBiquadFilter === 'function') {
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(cutoffHz, t0);
      osc.connect(filt);
      filt.connect(gain);
    } else {
      osc.connect(gain);
    }
    gain.connect(bus);

    osc.start(t0);
    osc.stop(t0 + durSec + 0.01);
  }

  public emit(event: AudioEventId): void {
    if (this.muted || !this.ctx) return;
    this.ensureMixGraph();
    if (!this.uiGain || !this.sfxGain) return;

    const nowMs = this.nowMs();
    const cooldown = EVENT_COOLDOWNS_MS[event] ?? 40;
    const prevMs = this.lastEmitMs.get(event) ?? -1e9;
    if (nowMs - prevMs < cooldown) return;
    this.lastEmitMs.set(event, nowMs);

    const ui = this.uiGain;
    const sfx = this.sfxGain;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    switch (event) {
      case 'ui_tick': {
        const p = this.nextPitchFactor(0.04);
        this.scheduleTone(ui, 'sine', 680 * p, 680 * p, 0.04, 0.035);
        break;
      }
      case 'ui_error': {
        this.scheduleTone(ui, 'sawtooth', 195, 138, 0.075, 0.13, 0, 620);
        this.scheduleTone(ui, 'triangle', 148, 112, 0.06, 0.12, 0.045, 500);
        break;
      }
      case 'ui_modal_open': {
        this.scheduleTone(ui, 'sine', 440, 440, 0.055, 0.07, 0);
        this.scheduleTone(ui, 'triangle', 660, 660, 0.05, 0.09, 0.045);
        break;
      }
      case 'ui_modal_close': {
        this.scheduleTone(ui, 'sine', 520, 340, 0.05, 0.085);
        break;
      }
      case 'ui_save': {
        this.scheduleTone(ui, 'triangle', 523.25, 523.25, 0.06, 0.09, 0);
        this.scheduleTone(ui, 'triangle', 783.99, 783.99, 0.07, 0.13, 0.055);
        break;
      }
      case 'sim_pause': {
        this.scheduleTone(ui, 'sine', 330, 220, 0.055, 0.095);
        break;
      }
      case 'alt_mode': {
        this.scheduleTone(ui, 'sine', 880, 1175, 0.045, 0.065);
        break;
      }
      case 'build_place': {
        const p = this.nextPitchFactor(0.06);
        this.scheduleTone(sfx, 'triangle', 220 * p, 95 * p, 0.14, 0.08);
        this.scheduleTone(sfx, 'sine', 680 * p, 240 * p, 0.04, 0.035);
        break;
      }
      case 'build_rotate': {
        const p = this.nextPitchFactor(0.06);
        this.scheduleTone(sfx, 'triangle', 480 * p, 310 * p, 0.06, 0.05);
        break;
      }
      case 'build_remove': {
        const p = this.nextPitchFactor(0.06);
        this.scheduleTone(sfx, 'sawtooth', 170 * p, 70 * p, 0.085, 0.1, 0, 900);
        break;
      }
      case 'belt_drag_step': {
        const p = this.nextPitchFactor(0.07);
        this.scheduleTone(sfx, 'triangle', 380 * p, 210 * p, 0.055, 0.038);
        break;
      }
      case 'mine_hit': {
        const p = this.nextPitchFactor(0.06);
        this.scheduleTone(sfx, 'square', 420 * p, 180 * p, 0.07, 0.06, 0, 1400);
        break;
      }
      case 'bp_copy': {
        this.scheduleTone(sfx, 'sine', 540, 1080, 0.07, 0.11);
        break;
      }
      case 'bp_stamp': {
        const p = this.nextPitchFactor(0.04);
        this.scheduleTone(sfx, 'triangle', 260 * p, 110 * p, 0.12, 0.095);
        this.scheduleTone(sfx, 'triangle', 520 * p, 440 * p, 0.06, 0.08, 0.02);
        break;
      }
      case 'hub_load': {
        this.scheduleTone(sfx, 'triangle', 330, 495, 0.09, 0.13);
        this.scheduleTone(sfx, 'sine', 660, 880, 0.05, 0.1, 0.04);
        break;
      }
      case 'tech_unlock': {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        for (let i = 0; i < notes.length; i++) {
          this.scheduleTone(sfx, 'triangle', notes[i], notes[i], 0.11, 0.24, i * 0.075);
        }
        break;
      }
      case 'rocket_launch': {
        const dur = 1.6;
        if (this.tryReserveVoice(now + dur)) {
          const noise = ctx.createBufferSource();
          noise.buffer = this.getLaunchNoiseBuffer(ctx);

          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(160, now);
          filter.frequency.exponentialRampToValueAtTime(1200, now + 0.6);
          filter.frequency.exponentialRampToValueAtTime(220, now + dur);

          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0.01, now);
          gain.gain.linearRampToValueAtTime(0.22, now + 0.35);
          gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

          noise.connect(filter);
          filter.connect(gain);
          gain.connect(sfx);

          noise.start(now);
          noise.stop(now + dur);
        }
        this.scheduleTone(sfx, 'sine', 90, 42, 0.16, 1.1, 0);
        const notes = [523.25, 659.25, 783.99, 1046.5];
        for (let i = 0; i < notes.length; i++) {
          this.scheduleTone(sfx, 'triangle', notes[i], notes[i], 0.1, 0.24, i * 0.075);
        }
        break;
      }
      case 'victory_fanfare': {
        const chord = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
        for (let i = 0; i < chord.length; i++) {
          this.scheduleTone(sfx, 'triangle', chord[i], chord[i], 0.1, 0.36, i * 0.09);
        }
        this.scheduleTone(sfx, 'sine', 261.63, 261.63, 0.12, 0.75, 0.25);
        break;
      }
      case 'power_brownout': {
        this.scheduleTone(sfx, 'sawtooth', 240, 85, 0.1, 0.32, 0, 750);
        this.scheduleTone(sfx, 'triangle', 165, 65, 0.09, 0.34, 0.04, 480);
        break;
      }
      case 'power_restored': {
        this.scheduleTone(sfx, 'triangle', 140, 440, 0.09, 0.22, 0);
        this.scheduleTone(sfx, 'triangle', 440, 440, 0.08, 0.22, 0.1);
        this.scheduleTone(sfx, 'triangle', 659.25, 659.25, 0.08, 0.25, 0.14);
        break;
      }
    }
  }

  public playPlace(): void {
    this.emit('build_place');
  }

  public playRemove(): void {
    this.emit('build_remove');
  }

  public playMine(): void {
    this.emit('mine_hit');
  }

  public playUiTick(): void {
    this.emit('ui_tick');
  }

  public playTechUnlock(): void {
    this.emit('tech_unlock');
  }

  public playRocketLaunch(): void {
    this.emit('rocket_launch');
  }
}
