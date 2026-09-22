// Anchors the global clock at COURSE_NOW (set in the root .env) when the server
// starts, then lets it advance in real time from there. Importing this module
// for its side effect installs the override, so it must be imported before any
// route handler is registered.
//
//   - `Date.now()` and a bare `new Date()` report the anchored time.
//   - `new Date(value)` (any argument form) parses/constructs normally.
//
// If COURSE_NOW is absent or unparseable the offset is zero, i.e. the real
// system clock is used unchanged.

const RealDate = Date;

const realStart = RealDate.now();
const anchorRaw = process.env.COURSE_NOW;
const anchor = anchorRaw ? new RealDate(anchorRaw).getTime() : NaN;

// Difference between the anchored "now" and the real "now" at startup. Adding
// this to the real clock keeps time advancing normally from the anchor.
const offset = Number.isNaN(anchor) ? 0 : anchor - realStart;

class AnchoredDate extends RealDate {
  constructor(...args: any[]) {
    if (args.length === 0) {
      super(RealDate.now() + offset);
    } else {
      // Forward every other call shape (timestamp, ISO string, y/m/d, ...) to the real Date.
      super(...(args as []));
    }
  }

  static now(): number {
    return RealDate.now() + offset;
  }
}

globalThis.Date = AnchoredDate as DateConstructor;

if (offset !== 0) {
  console.log(
    `Clock anchored at COURSE_NOW=${anchorRaw} ` +
      `(offset ${Math.round(offset / 1000)}s from system clock)`,
  );
} else if (anchorRaw) {
  console.warn(`Ignoring unparseable COURSE_NOW=${anchorRaw}; using system clock`);
}
