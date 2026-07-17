// Programmatic audio engine using the Web Audio API — no external audio files,
// so it loads instantly and works offline / behind the GFW.

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxOn = true;
    this.bgmOn = true;
    this.bgmTimer = null;
    this.bgmStep = 0;
  }

  // Must be called from a user gesture (browsers block autoplay otherwise).
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
  }

  _beep({ freq = 440, dur = 0.12, type = "sine", gain = 0.2, when = 0 }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  playSfx(kind) {
    if (!this.sfxOn || !this.ctx) return;
    switch (kind) {
      case "select":
        this._beep({ freq: 660, dur: 0.08, type: "triangle", gain: 0.15 });
        break;
      case "match":
        this._beep({ freq: 784, dur: 0.1, type: "triangle", gain: 0.18 });
        this._beep({ freq: 1047, dur: 0.12, type: "triangle", gain: 0.16, when: 0.08 });
        break;
      case "error":
        this._beep({ freq: 180, dur: 0.16, type: "sawtooth", gain: 0.14 });
        break;
      case "hint":
        this._beep({ freq: 880, dur: 0.1, type: "sine", gain: 0.14 });
        break;
      case "shuffle":
        this._beep({ freq: 300, dur: 0.1, type: "square", gain: 0.1 });
        this._beep({ freq: 500, dur: 0.1, type: "square", gain: 0.1, when: 0.06 });
        break;
      case "win": {
        const notes = [523, 659, 784, 1047];
        notes.forEach((f, i) =>
          this._beep({ freq: f, dur: 0.22, type: "triangle", gain: 0.2, when: i * 0.12 })
        );
        break;
      }
      case "lose":
        this._beep({ freq: 400, dur: 0.25, type: "sawtooth", gain: 0.16 });
        this._beep({ freq: 260, dur: 0.35, type: "sawtooth", gain: 0.16, when: 0.2 });
        break;
      case "levelup": {
        const notes = [659, 784, 988, 1319];
        notes.forEach((f, i) =>
          this._beep({ freq: f, dur: 0.18, type: "triangle", gain: 0.18, when: i * 0.1 })
        );
        break;
      }
      default:
        break;
    }
  }

  // Gentle looping pentatonic arpeggio as background music.
  startBgm() {
    if (!this.bgmOn || !this.ctx || this.bgmTimer) return;
    const scale = [392, 440, 523, 587, 659, 784, 880]; // G major pentatonic-ish
    const bass = [98, 110, 131, 147];
    const stepMs = 380;
    this.bgmStep = 0;
    const tick = () => {
      if (!this.ctx) return;
      const i = this.bgmStep;
      const note = scale[(i * 3) % scale.length];
      this._beep({ freq: note, dur: 0.32, type: "sine", gain: 0.06 });
      if (i % 4 === 0) {
        this._beep({ freq: bass[(i / 4) % bass.length], dur: 0.6, type: "triangle", gain: 0.05 });
      }
      this.bgmStep = (i + 1) % 64;
    };
    tick();
    this.bgmTimer = setInterval(tick, stepMs);
  }

  stopBgm() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  setSfx(on) {
    this.sfxOn = on;
  }

  setBgm(on) {
    this.bgmOn = on;
    if (on) this.startBgm();
    else this.stopBgm();
  }
}

export const audio = new AudioEngine();
