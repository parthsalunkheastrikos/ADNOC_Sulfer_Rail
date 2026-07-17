// Fixed-capacity circular buffer of numbers — backs the trend-strip history
// without per-tick array shifting costs.
export class RingBuffer {
  private buf: Float32Array;
  private writeIdx = 0;
  private filled = 0;

  constructor(public readonly capacity: number) {
    this.buf = new Float32Array(capacity);
  }

  push(value: number) {
    this.buf[this.writeIdx] = value;
    this.writeIdx = (this.writeIdx + 1) % this.capacity;
    if (this.filled < this.capacity) this.filled++;
  }

  /** Oldest -> newest, length = min(filled, n ?? capacity) */
  toOrderedArray(n?: number): Float32Array {
    const count = Math.min(n ?? this.filled, this.filled);
    const out = new Float32Array(count);
    const start = (this.writeIdx - count + this.capacity * 2) % this.capacity;
    for (let i = 0; i < count; i++) {
      out[i] = this.buf[(start + i) % this.capacity];
    }
    return out;
  }

  get length() {
    return this.filled;
  }
}
