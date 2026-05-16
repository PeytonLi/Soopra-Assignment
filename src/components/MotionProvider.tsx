"use client";

import { MotionConfig } from "motion/react";

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.7 }}
    >
      {children}
    </MotionConfig>
  );
}
