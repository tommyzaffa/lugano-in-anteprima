/**
 * Ambiente sonoro procedurale opzionale (onde del lago e brusio lontano),
 * generato con Web Audio: nessun file audio, disattivato di default.
 */
class Ambient {
  private ctx: AudioContext | null = null;
  private nodes: AudioNode[] = [];
  private gain: GainNode | null = null;

  start() {
    if (this.ctx) return;
    try {
      const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const len = ctx.sampleRate * 3;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let b = 0;
      for (let i = 0; i < len; i++) { b = 0.985 * b + 0.015 * (Math.random() * 2 - 1); d[i] = b * 3; }
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
      const waves = ctx.createGain(); waves.gain.value = 0.25;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.12;
      const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.15;
      lfo.connect(lfoGain).connect(waves.gain);
      const master = ctx.createGain(); master.gain.value = 0; master.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 2);
      src.connect(lp).connect(waves).connect(master).connect(ctx.destination);
      src.start(); lfo.start();
      this.ctx = ctx; this.gain = master; this.nodes = [src, lfo];
    } catch { this.ctx = null; }
  }

  stop() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    try { this.gain?.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4); } catch { /* */ }
    setTimeout(() => { this.nodes.forEach((n: any) => { try { n.stop?.(); } catch { /* */ } }); void ctx.close(); }, 500);
    this.ctx = null; this.nodes = []; this.gain = null;
  }
}
export const ambient = new Ambient();
