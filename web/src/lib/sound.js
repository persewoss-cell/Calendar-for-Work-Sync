// Small synthesized sounds so no audio files are needed.
let ctx;
const audio = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());

function tone(freq, start, dur, type = 'sine', gain = 0.15) {
  const c = audio();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + dur);
  osc.connect(g).connect(c.destination);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + dur + 0.05);
}

const NOTE = { C: 523.25, D: 587.33, E: 659.25, F: 698.46, G: 783.99, A: 880 };

export const SOUNDS = {
  none: { label: '없음', play: () => {} },
  tick: { label: 'Tick', play: () => tone(1800, 0, 0.05, 'square', 0.05) },
  pop: { label: 'Pop', play: () => tone(600, 0, 0.12, 'sine', 0.2) },
  chime: { label: '차임', play: () => { tone(NOTE.E * 2, 0, 0.6); tone(NOTE.C * 2, 0.25, 0.8); } },
  bell: { label: '벨', play: () => [0, 0.4, 0.8].forEach((t) => tone(NOTE.A * 2, t, 0.35, 'triangle', 0.2)) },
  // 작은 별 (Twinkle Twinkle Little Star, traditional)
  twinkle: {
    label: '작은 별',
    play: () => 'CCGGAAG'.split('').forEach((n, i) => tone(NOTE[n], i * 0.3, i === 6 ? 0.55 : 0.28, 'triangle', 0.18)),
  },
};

export function playSound(name) {
  try {
    (SOUNDS[name] || SOUNDS.none).play();
  } catch {
    /* audio unavailable */
  }
}
