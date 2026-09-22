// Pure helpers for the Batch Investigation Workspace: sugar-curve lookup,
// target comparison, and the date window used by the maintenance metric.
//
// Sugar/gravity falls over a fermentation, so a batch is "behind" target when
// its current reading sits ABOVE the curve (it hasn't dropped enough yet).

/** How far a batch's sugar reading may sit from target before it's flagged. */
export const SUGAR_GREEN = 0.005; // strictly under this: on track
export const SUGAR_AMBER = 0.008; // within this: drifting; beyond: off target
/** Minimum amount ABOVE target before a batch counts as "behind". */
export const BEHIND_THRESHOLD = 0.008;

export const MAINTENANCE_WINDOW_DAYS = 7;

// Gravity readings carry ~3 decimals; this absorbs float noise around the band
// edges. The green/amber edge is EXCLUSIVE: a batch sitting exactly on 0.005
// (e.g. 1.018 − 1.013) counts as drifting/amber, not on-track. fp noise can land
// such a delta a hair either side of 0.005 (e.g. 0.00499999.. or 0.00500000..),
// so the green test subtracts EPSILON to band both consistently as amber.
const EPSILON = 1e-9;

export type SugarBand = "green" | "amber" | "red";

/** Coerce a Postgres NUMERIC (which arrives as a string) to a number or null. */
export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Target sugar level for a given fermentation day, linearly interpolated
 * between the recipe curve's milestones and clamped at either end.
 * The curve is keyed by `day_N` → gravity, e.g. {day_1: 1.050, day_8: 1.012}.
 */
export function targetSugarAtDay(
  curve: Record<string, number> | null | undefined,
  day: number | null,
): number | null {
  if (!curve || day === null) return null;

  const points = Object.entries(curve)
    .map(([key, value]) => [Number(key.replace(/^day_/, "")), Number(value)] as const)
    .filter(([d, v]) => Number.isFinite(d) && Number.isFinite(v))
    .sort((a, b) => a[0] - b[0]);

  if (points.length === 0) return null;
  if (day <= points[0][0]) return points[0][1];
  if (day >= points[points.length - 1][0]) return points[points.length - 1][1];

  for (let i = 0; i < points.length - 1; i++) {
    const [d0, v0] = points[i];
    const [d1, v1] = points[i + 1];
    if (day >= d0 && day <= d1) {
      const t = (day - d0) / (d1 - d0);
      return v0 + t * (v1 - v0);
    }
  }
  return points[points.length - 1][1];
}

/** Signed gap of current sugar over target (positive = behind / under-fermented). */
export function sugarDelta(
  current: number | null,
  target: number | null,
): number | null {
  if (current === null || target === null) return null;
  return current - target;
}

/** Color band from the absolute distance to target. */
export function sugarBand(delta: number | null): SugarBand | null {
  if (delta === null) return null;
  const abs = Math.abs(delta);
  if (abs < SUGAR_GREEN - EPSILON) return "green";
  if (abs <= SUGAR_AMBER + EPSILON) return "amber";
  return "red";
}

/** A batch is behind when its sugar sits at least the threshold above target. */
export function isBehindTarget(delta: number | null): boolean {
  return delta !== null && delta >= BEHIND_THRESHOLD - EPSILON;
}

/** True when `iso` falls within the last `windowDays` up to and including `now`. */
export function withinLastDays(
  iso: string | null | undefined,
  now: Date,
  windowDays = MAINTENANCE_WINDOW_DAYS,
): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  const start = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  return t >= start && t <= now.getTime();
}

export interface DateWindow {
  start: Date;
  end: Date;
}

/**
 * The batch's fermentation window: from its planned start through the recipe's
 * full fermentation duration. Used to flag maintenance that overlapped it.
 */
export function fermentationWindow(
  plannedStart: string | null | undefined,
  fermentationDays: number | null,
): DateWindow | null {
  if (!plannedStart) return null;
  const start = new Date(plannedStart);
  if (!Number.isFinite(start.getTime())) return null;
  const days = fermentationDays ?? 0;
  return { start, end: new Date(start.getTime() + days * 24 * 60 * 60 * 1000) };
}

/** True when `iso` falls inside the given window (inclusive). */
export function withinWindow(
  iso: string | null | undefined,
  window: DateWindow | null,
): boolean {
  if (!iso || !window) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return t >= window.start.getTime() && t <= window.end.getTime();
}
