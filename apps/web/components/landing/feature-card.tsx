'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
}

export function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <motion.div
      className="to-phthalo-green/10 border-phthalo-green/20 interactive group relative flex h-full flex-col overflow-hidden rounded-xl border bg-gradient-to-br from-black p-6"
      whileHover={{
        y: -4,
        boxShadow: '0 10px 30px -10px rgba(0, 128, 96, 0.2)',
        borderColor: 'rgba(0, 128, 96, 0.4)',
      }}
      transition={{ duration: 0.2 }}
    >
      {/* Animated gradient spotlight effect on hover */}
      <motion.div
        className="from-phthalo-green/20 pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent opacity-0"
        initial={{ opacity: 0, scale: 0 }}
        whileHover={{ opacity: 1, scale: 2 }}
        transition={{ duration: 0.5 }}
        style={{ originX: 0, originY: 0 }}
      />

      <motion.div
        className="bg-phthalo-green/20 relative z-10 mb-4 flex h-12 w-12 items-center justify-center rounded-lg"
        whileHover={{ rotate: [0, -5, 5, -5, 0] }}
        transition={{ duration: 0.5 }}
      >
        {icon}
      </motion.div>

      <motion.h3
        className="group-hover:text-phthalo-green relative z-10 mb-2 text-xl font-bold text-white transition-colors"
        initial={{ x: 0 }}
        whileHover={{ x: 5 }}
        transition={{ duration: 0.2 }}
      >
        {title}
      </motion.h3>

      <p className="relative z-10 mt-auto text-gray-400">{description}</p>
    </motion.div>
  );
}
