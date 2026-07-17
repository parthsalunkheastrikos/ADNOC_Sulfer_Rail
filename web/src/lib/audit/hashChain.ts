// Illustrative tamper-evident chaining for the S-20 Audit Explorer — NOT a
// cryptographic hash (FNV-1a, 32-bit) and NOT wired to any real signing
// infrastructure. Demonstrates the *shape* of a hash-chained audit log
// (each record's digest depends on the previous one, so any edit downstream
// breaks the chain) for the CAO persona; a real Phase-A+ implementation
// would use a proper keyed hash over the plant's actual audit store.
import type { OperatorEvent } from "@/types/domain";

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export interface ChainedEvent {
  event: OperatorEvent;
  hash: string;
  prevHash: string;
}

/** `events` should be oldest → newest; returns the same order with a running digest chained onto each record. */
export function computeChain(events: OperatorEvent[]): ChainedEvent[] {
  const out: ChainedEvent[] = [];
  let prevHash = "00000000";
  for (const event of events) {
    const hash = fnv1a(`${prevHash}|${event.id}|${event.ts}|${event.label}|${event.detail}|${event.trigger}`);
    out.push({ event, hash, prevHash });
    prevHash = hash;
  }
  return out;
}
