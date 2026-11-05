export class CookieAudio {
  private context: AudioContext | null = null;

  playTap(step: number, muted: boolean): void {
    if (step === 1) this.tone(620, 0.12, 'sine', 0.06, 460, 0, muted);
    else this.noise(0.09, 0.08, 700, muted);
  }

  playOpen(muted: boolean): void {
    this.noise(0.18, 0.16, 520, muted);
    this.tone(210, 0.22, 'triangle', 0.1, 70, 0, muted);
    this.tone(784, 0.18, 'sine', 0.05, null, 0.16, muted);
    this.tone(1174, 0.24, 'sine', 0.045, null, 0.26, muted);
  }

  playBlip(muted: boolean): void {
    this.tone(660, 0.1, 'sine', 0.05, 880, 0, muted);
  }

  private ctx(): AudioContext | null {
    const browser = window as Window & { webkitAudioContext?: typeof AudioContext };
    const AudioCtx = window.AudioContext || browser.webkitAudioContext;
    if (!AudioCtx) return null;
    this.context ??= new AudioCtx();
    if (this.context.state === 'suspended') void this.context.resume();
    return this.context;
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType,
    gainValue: number,
    slideTo: number | null,
    delay: number,
    muted: boolean,
  ): void {
    if (muted) return;
    const ac = this.ctx();
    if (!ac) return;
    const start = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), start + duration);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  private noise(duration: number, gainValue: number, frequency: number, muted: boolean): void {
    if (muted) return;
    const ac = this.ctx();
    if (!ac) return;
    const length = Math.floor(ac.sampleRate * duration);
    const buffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ac.createBufferSource();
    source.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    const gain = ac.createGain();
    gain.gain.value = gainValue;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);
    source.start();
  }
}
