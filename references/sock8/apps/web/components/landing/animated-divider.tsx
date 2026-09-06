'use client';

import { useIsMobile } from '@/hooks/use-is-mobile';
import { motion } from 'framer-motion';

/**
 * Animated gradient divider
 * Provides a visual separator with a fade-in animation
 */
export default function AnimatedDivider() {
  const isMobile = useIsMobile();

  const className =
    'via-phthalo-green/30 my-16 h-px w-full bg-gradient-to-r from-transparent to-transparent';

  if (isMobile) {
    return <div className={className} />;
  }

  return (
    <motion.div
      className={className}
      initial={{ scaleX: 0, opacity: 0 }}
      whileInView={{ scaleX: 1, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8 }}
    />
  );
}
