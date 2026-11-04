// Time buckets for one Signal K path over a sliding window. Live samples and
// History API rows both land in a fixed number of buckets, so a 30 minute
// window and a 24 hour one cost the same to keep and to draw.
//
// Angles (paths in rad) are kept as offsets from a reference angle, so a
// value swinging across north stays one narrow band instead of spanning the
// whole compass, and averages are circular means.

export const BUCKETS = 240

const TWO_PI = 2 * Math.PI

/** The angle `a` wrapped into (-π, π]. */
export function wrapAngle(a: number): number {
  const r = (((a + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI
  return r === 0 ? Math.PI : r - Math.PI
}

interface Bucket {
  /** Bucket number since the epoch: floor(time / bucketMs). */
  index: number
  /** Angles: the first value seen; lo, hi and the mean are relative to it. */
  ref: number
  lo: number
  hi: number
  sum: number
  sin: number
  cos: number
  n: number
}

/** One bucket as drawn: its age span and value span in plot units. */
export interface Band {
  /** Milliseconds between the bucket's newest edge and now. */
  ageStart: number
  ageEnd: number
  lo: number
  hi: number
}

export interface WindowStats {
  /** Plot units are offsets from `centre` for angles, plain values otherwise. */
  centre: number
  min: number
  max: number
  avg: number
  bands: Band[]
}

export class Series {
  readonly windowMs: number
  readonly bucketMs: number
  readonly angular: boolean
  private buckets = new Map<number, Bucket>()

  constructor(windowMs: number, angular: boolean, buckets = BUCKETS) {
    this.windowMs = windowMs
    this.bucketMs = windowMs / buckets
    this.angular = angular
  }

  get size(): number {
    return this.buckets.size
  }

  /** A single reading. */
  add(time: number, value: number): void {
    this.merge(time, value, value, value)
  }

  /** An aggregate covering part of a bucket, as a History API row gives it. */
  merge(time: number, min: number, max: number, avg: number): void {
    if (![time, min, max, avg].every(Number.isFinite)) return
    const index = Math.floor(time / this.bucketMs)
    let bucket = this.buckets.get(index)
    if (!bucket) {
      bucket = {
        index,
        ref: this.angular ? avg : 0,
        lo: Infinity,
        hi: -Infinity,
        sum: 0,
        sin: 0,
        cos: 0,
        n: 0
      }
      this.buckets.set(index, bucket)
    }
    if (this.angular) {
      // A provider's min and max are linear, so across north they come
      // swapped (min 2°, max 358°); their offsets from the mean are not.
      const centre = wrapAngle(avg - bucket.ref)
      const a = wrapAngle(min - avg)
      const b = wrapAngle(max - avg)
      bucket.lo = Math.min(bucket.lo, centre + Math.min(0, a, b))
      bucket.hi = Math.max(bucket.hi, centre + Math.max(0, a, b))
      bucket.sin += Math.sin(avg)
      bucket.cos += Math.cos(avg)
    } else {
      bucket.lo = Math.min(bucket.lo, min, avg)
      bucket.hi = Math.max(bucket.hi, max, avg)
      bucket.sum += avg
    }
    bucket.n++
  }

  /** Drops the buckets that have left the window ending at `now`. */
  prune(now: number): void {
    const oldest = Math.floor((now - this.windowMs) / this.bucketMs)
    for (const index of this.buckets.keys()) {
      if (index < oldest) this.buckets.delete(index)
    }
  }

  clear(): void {
    this.buckets.clear()
  }

  /**
   * The window ending at `now`, or undefined while it holds nothing. Each
   * bucket counts once towards the average, whether it came from one live
   * reading or from a History API row that stands for many, so a stretch
   * with a fast sensor does not outweigh one seeded from history.
   */
  stats(now: number): WindowStats | undefined {
    this.prune(now)
    const live = [...this.buckets.values()].filter((b) => b.n > 0)
    if (live.length === 0) return undefined

    let centre = 0
    if (this.angular) {
      let sin = 0
      let cos = 0
      for (const b of live) {
        const mean = Math.atan2(b.sin, b.cos)
        sin += Math.sin(mean)
        cos += Math.cos(mean)
      }
      centre = Math.atan2(sin, cos)
    }

    let min = Infinity
    let max = -Infinity
    let total = 0
    const bands: Band[] = []
    for (const b of live) {
      const shift = this.angular ? wrapAngle(b.ref - centre) : 0
      const lo = b.lo + shift
      const hi = b.hi + shift
      min = Math.min(min, lo)
      max = Math.max(max, hi)
      if (!this.angular) total += b.sum / b.n
      const start = b.index * this.bucketMs
      bands.push({
        ageStart: Math.max(0, now - (start + this.bucketMs)),
        ageEnd: Math.max(0, now - start),
        lo,
        hi
      })
    }
    // An angle's average is the circular mean, which is the centre itself.
    return { centre, min, max, avg: this.angular ? 0 : total / live.length, bands }
  }
}
