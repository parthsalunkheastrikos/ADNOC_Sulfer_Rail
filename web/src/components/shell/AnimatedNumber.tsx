"use client";
import { useEffect, useRef } from "react";
import { motion, useSpring, useTransform, useMotionValue, useReducedMotion } from "motion/react";

/**
 * Smoothly tweens between successive numeric values (KPI tiles / hero
 * figures) instead of snapping — motion-package "number ticker" per the
 * demo-credibility audit's Phase 3 craft pass. Falls back to a plain
 * (non-animated) span under prefers-reduced-motion.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  className,
}: {
  value: number;
  decimals?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const motionVal = useMotionValue(value);
  const spring = useSpring(motionVal, { stiffness: 120, damping: 24, mass: 0.6 });
  const display = useTransform(spring, (v) =>
    v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
  );
  const ref = useRef<HTMLSpanElement>(null);
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  useEffect(() => {
    motionVal.set(value);
  }, [value, motionVal]);

  useEffect(() => {
    if (reduced && ref.current) ref.current.textContent = formatted;
  }, [reduced, formatted]);

  if (reduced) {
    return (
      <span ref={ref} className={className}>
        {formatted}
      </span>
    );
  }

  return <motion.span className={className}>{display}</motion.span>;
}
