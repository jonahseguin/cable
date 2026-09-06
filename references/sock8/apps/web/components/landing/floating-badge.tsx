'use client';

import { type ReactNode, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

interface FloatingBadgeProps {
  className?: string;
  rotate?: number;
  children: ReactNode;
}

export function FloatingBadge({ className = '', rotate = 0, children }: FloatingBadgeProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Create motion values with springs for smoother animation
  const y = useMotionValue(0);
  const x = useMotionValue(0);

  // Apply spring physics
  const springConfig = { damping: 15, stiffness: 300 };
  const ySpring = useSpring(y, springConfig);
  const xSpring = useSpring(x, springConfig);

  // Random gentle floating motion
  const floatY = useTransform(useMotionValue(Math.random()), [0, 1], [-5, 5]);

  const floatX = useTransform(useMotionValue(Math.random()), [0, 1], [-3, 3]);

  return (
    <motion.div
      className={`bg-phthalo-green/20 border-phthalo-green/30 text-phthalo-green z-10 
                cursor-pointer rounded-md border px-3 py-1.5 font-mono 
                text-xs shadow-lg backdrop-blur-sm ${className}`}
      initial={{ rotate }}
      animate={{
        y: isHovered ? [0, -8, 0] : [0, floatY.get(), 0],
        x: isHovered ? 0 : [0, floatX.get(), 0],
        rotate: isHovered ? 0 : rotate,
        scale: isHovered ? 1.05 : 1,
      }}
      transition={{
        y: {
          repeat: Number.POSITIVE_INFINITY,
          duration: isHovered ? 1 : 3 + Math.random() * 2,
          repeatType: 'reverse',
        },
        x: {
          repeat: Number.POSITIVE_INFINITY,
          duration: 4 + Math.random() * 2,
          repeatType: 'reverse',
        },
        rotate: { duration: 0.3 },
        scale: { duration: 0.2 },
      }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      style={{ y: ySpring, x: xSpring }}
    >
      {children}
    </motion.div>
  );
}
