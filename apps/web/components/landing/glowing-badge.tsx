'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface GlowingBadgeProps {
  children: ReactNode;
  className?: string;
}

export function GlowingBadge({ children, className = '' }: GlowingBadgeProps) {
  return (
    <motion.div
      className={`bg-phthalo-green/10 border-phthalo-green/30 relative inline-flex items-center gap-2 
                  overflow-hidden rounded-full border 
                  px-3 py-1 ${className}`}
      whileHover={{
        scale: 1.05,
        borderColor: 'rgba(0, 128, 96, 0.5)',
      }}
      transition={{ duration: 0.2 }}
    >
      {/* Glow effect */}
      <motion.div
        className="bg-phthalo-green/20 absolute inset-0 blur-md"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.2, 0.3, 0.2],
        }}
        transition={{
          duration: 2,
          repeat: Number.POSITIVE_INFINITY,
          repeatType: 'reverse',
        }}
      />

      <motion.span
        className="bg-phthalo-green relative z-10 h-2 w-2 rounded-full"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [1, 0.7, 1],
        }}
        transition={{
          duration: 1.5,
          repeat: Number.POSITIVE_INFINITY,
          repeatType: 'reverse',
        }}
      />

      <span className="text-phthalo-green relative z-10 font-mono text-xs">{children}</span>
    </motion.div>
  );
}
