export class Sound {
  constructor() {
    this.ctx = null;
    this.engines = [];
    this.boostNoise = [];
    this.master = null;
  }

  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.42;
    this.master.connect(this.ctx.destination);
    this._noiseBuf = this._makeNoise();
    for (let i = 0; i < 2; i++) this._makeEngine(i);
  }

  _makeNoise() {
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _makeEngine(i) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 60;
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 30;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.Q.value = 2;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    osc.connect(lp); sub.connect(lp); lp.connect(g); g.connect(this.master);
    osc.start(); sub.start();

    const nsrc = this.ctx.createBufferSource();
    nsrc.buffer = this._noiseBuf; nsrc.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.8;
    const ng = this.ctx.createGain(); ng.gain.value = 0;
    nsrc.connect(bp); bp.connect(ng); ng.connect(this.master);
    nsrc.start();

    this.engines[i] = { osc, sub, g, lp };
    this.boostNoise[i] = { ng, bp };
  }

  engine(i, speed01, boosting, active) {
    if (!this.ctx) return;
    const e = this.engines[i];
    const f = 55 + speed01 * 190 + (boosting ? 45 : 0);
    e.osc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05);
    e.sub.frequency.setTargetAtTime(f * 0.5, this.ctx.currentTime, 0.05);
    e.lp.frequency.setTargetAtTime(500 + speed01 * 1400, this.ctx.currentTime, 0.1);
    e.g.gain.setTargetAtTime(active ? 0.045 + speed01 * 0.05 : 0, this.ctx.currentTime, 0.08);
    this.boostNoise[i].ng.gain.setTargetAtTime(boosting ? 0.06 : 0, this.ctx.currentTime, 0.1);
    this.boostNoise[i].bp.frequency.setTargetAtTime(boosting ? 2200 : 1000, this.ctx.currentTime, 0.15);
  }

  _tone(freq, dur, type = 'sine', gain = 0.2, when = 0, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  _noiseBurst(dur, freq, gain = 0.3, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const s = this.ctx.createBufferSource();
    s.buffer = this._noiseBuf;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(lp); lp.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur + 0.05);
  }

  ready() { this._tone(660, 0.09, 'square', 0.12); }
  count(final) { this._tone(final ? 880 : 550, final ? 0.4 : 0.14, 'square', 0.18); }
  checkpoint() { this._tone(780, 0.08, 'sine', 0.16); this._tone(1170, 0.14, 'sine', 0.14, 0.07); }
  lap() { [523, 659, 784].forEach((f, i) => this._tone(f, 0.16, 'triangle', 0.2, i * 0.09)); }
  finalLap() { [659, 784, 988, 1175].forEach((f, i) => this._tone(f, 0.15, 'triangle', 0.2, i * 0.08)); }
  finish(win) {
    if (win) [523, 659, 784, 1047, 1319].forEach((f, i) => this._tone(f, 0.3, 'triangle', 0.22, i * 0.11));
    else [392, 330, 262].forEach((f, i) => this._tone(f, 0.3, 'triangle', 0.18, i * 0.14));
  }
  crash(v = 1) { this._noiseBurst(0.25, 500, 0.3 * v); this._tone(90, 0.2, 'sine', 0.25, 0, 40); }
  bump() { this._noiseBurst(0.12, 700, 0.18); }
  scrape() { this._noiseBurst(0.1, 3200, 0.07); }
}
