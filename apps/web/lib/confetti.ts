'use client';

import confetti from 'canvas-confetti';

/**
 * Brand color-themed confetti celebration effect
 * Launches multiple bursts of confetti in [removed] brand colors
 */
export function triggerConfetti() {
  const count = 200;
  const defaults = {
    origin: { y: 0.7 },
    zIndex: 1000,
  };

  // Helper function to launch confetti with specific options
  const fire = (particleRatio: number, opts: confetti.Options) => {
    confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio),
    });
  };

  // Brand colors - define as explicit string array to avoid type issues
  const colors: string[] = ['#00a67d', '#00d4ff', '#66cfb5', '#008060', '#33D778'];

  // Center burst
  fire(0.25, {
    spread: 26,
    startVelocity: 55,
    colors: [colors[0], colors[1], colors[2]].filter(Boolean) as string[],
    origin: { y: 0.7 },
  });

  // Left side burst
  fire(0.2, {
    spread: 60,
    colors: [colors[0], colors[1], colors[2]].filter(Boolean) as string[],
    origin: { x: 0.1, y: 0.9 },
  });

  // Right side burst
  fire(0.2, {
    spread: 60,
    colors: [colors[4], colors[1], colors[2]].filter(Boolean) as string[],
    origin: { x: 0.9, y: 0.9 },
  });

  // Vertical burst
  fire(0.35, {
    spread: 100,
    decay: 0.91,
    scalar: 0.8,
    colors: [colors[0], colors[1], colors[2]].filter(Boolean) as string[],
    origin: { y: 0.6 },
  });
}
