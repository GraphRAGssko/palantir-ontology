/**
 * Anchors Date.now() and bare `new Date()` to COURSE_NOW,
 * then advances normally from there. Explicit `new Date(value)`
 * still parses as usual.
 *
 * Import this module (side-effect only) before any application code.
 */

const anchor = process.env["COURSE_NOW"];

if (anchor) {
  const anchorMs = new Date(anchor).getTime();
  if (Number.isNaN(anchorMs)) {
    throw new Error(`COURSE_NOW is not a valid date: ${anchor}`);
  }

  const realNow = Date.now;
  const bootReal = realNow.call(Date);
  const offset = anchorMs - bootReal; // negative if COURSE_NOW is in the past

  // Override Date.now()
  Date.now = () => realNow.call(Date) + offset;

  // Override the Date constructor
  const OrigDate = globalThis.Date as DateConstructor;
  const _OrigDate = OrigDate; // capture for use inside the new constructor

  function AnchoredDate(this: Date): string;
  function AnchoredDate(this: Date, value: string | number | Date): void;
  function AnchoredDate(
    this: Date,
    year: number,
    monthIndex: number,
    date?: number,
    hours?: number,
    minutes?: number,
    seconds?: number,
    ms?: number,
  ): void;
  function AnchoredDate(this: Date, ...args: unknown[]) {
    if (!new.target) {
      // Called as a function — return a string like the original
      return new _OrigDate(Date.now()).toString();
    }
    if (args.length === 0) {
      // Bare `new Date()` → use the shifted clock
      return new _OrigDate(Date.now());
    }
    // Explicit arguments → delegate unchanged
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    return new (_OrigDate as any)(...args);
  }

  // Copy static methods and prototype
  AnchoredDate.prototype = _OrigDate.prototype;
  Object.setPrototypeOf(AnchoredDate, _OrigDate);
  // Re-point Date.now to our override (setPrototypeOf copies the original)
  (AnchoredDate as unknown as DateConstructor).now = Date.now;

  globalThis.Date = AnchoredDate as unknown as DateConstructor;

  console.log(`Course clock anchored at ${new Date().toISOString()}`);
}
