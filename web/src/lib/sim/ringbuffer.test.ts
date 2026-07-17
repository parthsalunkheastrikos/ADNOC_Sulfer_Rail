import { describe, expect, it } from "vitest";
import { RingBuffer } from "./ringbuffer";

describe("RingBuffer", () => {
  it("returns pushed values oldest -> newest before wrapping", () => {
    const rb = new RingBuffer(5);
    rb.push(1);
    rb.push(2);
    rb.push(3);
    expect(Array.from(rb.toOrderedArray())).toEqual([1, 2, 3]);
    expect(rb.length).toBe(3);
  });

  it("overwrites the oldest entries once capacity is exceeded", () => {
    const rb = new RingBuffer(3);
    rb.push(1);
    rb.push(2);
    rb.push(3);
    rb.push(4); // overwrites 1
    rb.push(5); // overwrites 2
    expect(Array.from(rb.toOrderedArray())).toEqual([3, 4, 5]);
    expect(rb.length).toBe(3);
  });

  it("toOrderedArray(n) returns only the most recent n entries", () => {
    const rb = new RingBuffer(10);
    for (let i = 1; i <= 7; i++) rb.push(i);
    expect(Array.from(rb.toOrderedArray(3))).toEqual([5, 6, 7]);
  });

  it("handles an empty buffer", () => {
    const rb = new RingBuffer(4);
    expect(Array.from(rb.toOrderedArray())).toEqual([]);
    expect(rb.length).toBe(0);
  });
});
