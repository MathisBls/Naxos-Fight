let context = null;

function ensure() {
  if (!context) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    context = new AudioContextClass();
  }
  if (context.state === 'suspended') context.resume();
  return context;
}

function tone(startFrequency, endFrequency, seconds, type, volume) {
  const ctx = ensure();
  if (!ctx) return;
  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(startFrequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + seconds);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + seconds + 0.02);
}

function noise(seconds, volume, frequency) {
  const ctx = ensure();
  if (!ctx) return;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = buffer;
  filter.type = 'bandpass';
  filter.frequency.value = frequency;
  gain.gain.value = volume;
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start();
}

export const sound = {
  unlock: ensure,
  cursor: () => tone(880, 660, 0.06, 'square', 0.05),
  denied: () => tone(160, 110, 0.18, 'square', 0.06),
  confirm: () => { tone(523, 1046, 0.18, 'square', 0.06); tone(784, 1568, 0.22, 'triangle', 0.05); },
  whoosh: () => noise(0.12, 0.25, 1800),
  impact: () => { tone(150, 50, 0.14, 'square', 0.12); noise(0.1, 0.35, 900); },
  jump: () => tone(300, 700, 0.12, 'square', 0.04),
  land: () => noise(0.08, 0.2, 400),
  step: () => noise(0.04, 0.08, 600),
};
