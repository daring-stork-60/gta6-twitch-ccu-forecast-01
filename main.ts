// Forecast GTA VI's launch-day Twitch viewers, hour by hour (hours 2..24).
//
// Idea: on a rolling-midnight console launch, hour 1 (00:00-01:00 UTC) only
// covers the regions that have already unlocked (New Zealand through Europe),
// while the Americas unlock at 05:00Z and 08:00Z, so the day's curve grows
// after hour 1 -- and how much it grows depends on how big hour 1 already is.
// A launch whose hour 1 is already huge is a launch whose audience is spread
// across the early timezones, so it grows little; a launch with a small hour 1
// is one whose audience is still asleep in the Americas, so it grows a lot.
//
// That shows up in the kit's 38 comparable launches as a tight linear law in
// log space: for each hour h, log(viewers_h / viewers_1) is roughly linear in
// log(viewers_1), with R^2 near 0.9 late in the day once simultaneous-global
// launches (whose hour 1 falls before their unlock) are set aside. So this
// program fits, per hour, an ordinary least-squares line of the log ratio on
// log hour-1 across the rolling-midnight, non-early-access comparables, and
// spreads the quantiles by the residuals' own spread. No other feature helped:
// the category's pre-release level and hour-1 channel count carry no signal
// once hour 1 is known, so they are not used.
//
// Guards, because the final's hour-1 print may sit outside the observed range:
// the log hour-1 used for prediction is clamped to the comparables' observed
// range (no extrapolation past the biggest launch on record), the median
// log ratio is clamped to the plausible band seen across rolling launches,
// and the spread is floored and capped. Everything is pure arithmetic over
// sorted arrays, so two runs write byte-identical output. Node 22, standard
// library only, no network, no randomness.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The quantile levels the contest scores, in the order each row lists them. */
const LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];
/** The standard normal's quantile at each level. */
const Z = [-1.645, -0.674, 0, 0.674, 1.645];
/** Quantile spread is the residual spread times this (plateau 0.85-1.0 in validation). */
const SPREAD_MULT = 0.9;
/** The residual spread is floored and capped at these log units. */
const SD_FLOOR = 0.25;
const SD_CAP = 0.6;
/** The median log ratio is clamped to this plausible band (rolling launches span about -0.1..2.4). */
const MED_FLOOR = -0.6;
const MED_CAP = 2.6;
/** A reference set smaller than this falls back to every clean comparable. */
const MIN_ROLLING = 6;

interface HourlyPoint {
  from: string;
  viewers: number;
  channels?: number | null;
}

interface Comparable {
  name: string;
  day_start: string;
  unlock: string;
  hourly: HourlyPoint[];
}

interface CaseFile {
  levels: number[];
  known: Array<{ hour: number; viewers: number }>;
  forecast: Array<{ hour: number }>;
  comparables: Comparable[];
}

/** One past launch reduced to what the forecast needs. */
interface Reference {
  p1: number;
  day: number[];
  rolling: boolean;
  clean: boolean;
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const round2 = (x: number): number => Math.round(x * 100) / 100;

/** Whether a comparable launched at rolling midnight local time. */
const isRolling = (unlock: string): boolean => /midnight local|rolling/i.test(unlock);

/** Whether a comparable's shape is distorted by early access or a weak launch. */
const isClean = (unlock: string): boolean =>
  !/early-access-contaminated/i.test(unlock) && !/Tier:\s*weak/i.test(unlock);

/**
 * A comparable's release-day curve, hour 0..23 from its day_start, or null
 * when any hour is missing (the target's own pre-release history has none).
 */
const releaseDay = (c: Comparable): number[] | null => {
  const start = Date.parse(c.day_start);
  if (!Number.isFinite(start)) return null;
  const byHour = new Map<number, number>();
  for (const p of c.hourly ?? []) {
    const t = Date.parse(p.from);
    if (!Number.isFinite(t) || typeof p.viewers !== 'number' || p.viewers <= 0) continue;
    const h = Math.round((t - start) / 3600000);
    if (h >= 0 && h < 24 && !byHour.has(h)) byHour.set(h, p.viewers);
  }
  if (byHour.size < 24) return null;
  return Array.from({ length: 24 }, (_, h) => byHour.get(h) as number);
};

const buildReferences = (comparables: Comparable[]): Reference[] => {
  const refs: Reference[] = [];
  for (const c of comparables ?? []) {
    if (/Grand Theft Auto VI/i.test(c.name)) continue;
    const day = releaseDay(c);
    if (day === null || day[0] <= 0) continue;
    refs.push({ p1: day[0], day, rolling: isRolling(c.unlock ?? ''), clean: isClean(c.unlock ?? '') });
  }
  refs.sort((a, b) => a.p1 - b.p1);
  return refs;
};

/**
 * The five quantiles of one hour's viewers: the fitted log-ratio line at the
 * case's (clamped) log hour-1, spread by the line's residual spread.
 * `logRange` is the training set's [min, max] log hour-1, computed once by
 * the caller so no hour's fit extrapolates past the biggest launch on record.
 */
const hourQuantiles = (
  refs: Reference[],
  p1: number,
  hour: number,
  logRange: [number, number],
): number[] => {
  const idx = hour - 1;
  const xs = refs.map((r) => Math.log(r.p1));
  const ys = refs.map((r) => Math.log(r.day[idx] / r.p1));
  const n = refs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let den = 0;
  let num = 0;
  for (let i = 0; i < n; i++) {
    den += (xs[i] - mx) * (xs[i] - mx);
    num += (xs[i] - mx) * (ys[i] - my);
  }
  const slope = den > 0 ? num / den : 0;
  const intercept = my - slope * mx;
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const e = ys[i] - (intercept + slope * xs[i]);
    sse += e * e;
  }
  const sd = clamp(Math.sqrt(sse / n), SD_FLOOR, SD_CAP);
  const lp = clamp(Math.log(Math.max(1, p1)), logRange[0], logRange[1]);
  const med = clamp(intercept + slope * lp, MED_FLOOR, MED_CAP);
  const q = Z.map((z) => round2(clamp(p1 * Math.exp(med + z * sd * SPREAD_MULT), 1, 1e9)));
  for (let j = 1; j < q.length; j++) if (q[j] < q[j - 1]) q[j] = q[j - 1];
  return q;
};

/** The persistence fallback: every hour stays at hour 1's print, spread widening like the house baseline. */
const persistenceQuantiles = (p1: number, hour: number): number[] => {
  const q = Z.map((z) => round2(clamp(p1 * Math.exp(z * 0.15 * Math.sqrt(hour - 1)), 1, 1e9)));
  for (let j = 1; j < q.length; j++) if (q[j] < q[j - 1]) q[j] = q[j - 1];
  return q;
};

const forecastCase = (c: CaseFile): Array<{ hour: number; q: number[] }> => {
  if (c.levels.length !== LEVELS.length || c.levels.some((t, j) => t !== LEVELS[j])) {
    throw new Error(`case asks for levels ${JSON.stringify(c.levels)}, not ${JSON.stringify(LEVELS)}`);
  }
  const first = (c.known ?? []).find((k) => k.hour === 1);
  const p1 = Math.max(1, first !== undefined && Number.isFinite(first.viewers) ? first.viewers : 1);
  const all = buildReferences(c.comparables);
  let refs = all.filter((r) => r.rolling && r.clean);
  if (refs.length < MIN_ROLLING) refs = all.filter((r) => r.clean);
  if (refs.length < 3) refs = all;
  const useRegression = refs.length >= 3;
  const logRange: [number, number] = useRegression
    ? [
        Math.min(...refs.map((r) => Math.log(r.p1))),
        Math.max(...refs.map((r) => Math.log(r.p1))),
      ]
    : [0, 0];
  const wanted = (c.forecast ?? []).length > 0
    ? [...c.forecast]
    : Array.from({ length: 23 }, (_, i) => ({ hour: i + 2 }));
  const hours = wanted.sort((a, b) => a.hour - b.hour);
  return hours.map(({ hour }) => ({
    hour,
    q: useRegression ? hourQuantiles(refs, p1, hour, logRange) : persistenceQuantiles(p1, hour),
  }));
};

mkdirSync(OUTPUT_DIR, { recursive: true });
// Every case file, in name order, so two runs write the same bytes.
const inputs = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();
for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as CaseFile;
  const hours = forecastCase(c);
  writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify({ hours })}\n`);
}
