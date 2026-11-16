// 24절기: computed from the sun's apparent ecliptic longitude (Meeus, low-precision), in KST.
export const SOLAR_TERMS = [
  ['소한', 285], ['대한', 300], ['입춘', 315], ['우수', 330], ['경칩', 345], ['춘분', 0],
  ['청명', 15], ['곡우', 30], ['입하', 45], ['소만', 60], ['망종', 75], ['하지', 90],
  ['소서', 105], ['대서', 120], ['입추', 135], ['처서', 150], ['백로', 165], ['추분', 180],
  ['한로', 195], ['상강', 210], ['입동', 225], ['소설', 240], ['대설', 255], ['동지', 270],
];

const rad = (d) => (d * Math.PI) / 180;
const norm = (d) => ((d % 360) + 360) % 360;

function sunLongitude(jd) {
  const T = (jd - 2451545) / 36525;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(rad(M))
    + (0.019993 - 0.000101 * T) * Math.sin(rad(2 * M))
    + 0.000289 * Math.sin(rad(3 * M));
  const omega = 125.04 - 1934.136 * T;
  return norm(L0 + C - 0.00569 - 0.00478 * Math.sin(rad(omega)));
}

const cache = new Map();

/** Map of "YYYY-MM-DD" → term name for the given year (KST, UTC+9). */
export function solarTermsOfYear(year, offsetHours = 9) {
  const key = `${year}:${offsetHours}`;
  if (cache.has(key)) return cache.get(key);
  const out = new Map();
  SOLAR_TERMS.forEach(([name, target], i) => {
    // Initial guess: Jan 6 + 15.2 days per term.
    let jd = Date.UTC(year, 0, 6) / 864e5 + 2440587.5 + i * 15.2184;
    for (let k = 0; k < 50; k++) {
      let delta = target - sunLongitude(jd);
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      jd += (delta * 365.2422) / 360;
      if (Math.abs(delta) < 1e-6) break;
    }
    const ms = (jd - 2440587.5) * 864e5 - 69 * 1000 + offsetHours * 3600e3; // TT→UT (ΔT≈69s), then local
    out.set(new Date(ms).toISOString().slice(0, 10), name);
  });
  cache.set(key, out);
  return out;
}
