'use client';

import { motion } from 'framer-motion';
import { useIsMobile } from '../../hooks/use-is-mobile';

export function HeroText() {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="mb-2">
        <h1 className="text-4xl font-bold leading-tight md:text-5xl lg:text-6xl">
          <span className="text-white">WebSockets that</span>{' '}
          <span className="from-phthalo-green bg-gradient-to-r to-emerald-400 bg-clip-text text-transparent">
            don&apos;t suck.
          </span>
        </h1>
      </div>
    );
  }

  const commonInitial = { opacity: 1, y: 0 };
  const commonAnimate = { opacity: 1, y: 0 };

  const h1Initial = isMobile ? commonInitial : { opacity: 0 };
  const h1Animate = isMobile ? commonAnimate : { opacity: 1 };

  const spanInitial = isMobile ? commonInitial : { opacity: 0, y: 20 };
  const spanAnimate = isMobile ? commonAnimate : { opacity: 1, y: 0 };

  const divInitial = isMobile ? commonInitial : { opacity: 0, y: 20 };
  const divAnimate = isMobile ? commonAnimate : { opacity: 1, y: 0 };

  return (
    <motion.h1
      className="text-4xl font-bold leading-tight md:text-5xl lg:text-6xl"
      initial={h1Initial}
      animate={h1Animate}
      transition={isMobile ? undefined : { duration: 0.6 }}
    >
      <div className="mb-2">
        <motion.span
          className="text-white"
          initial={spanInitial}
          animate={spanAnimate}
          transition={isMobile ? undefined : { duration: 0.5, delay: 0.1 }}
        >
          WebSockets
        </motion.span>{' '}
        <motion.span
          className="text-white"
          initial={spanInitial}
          animate={spanAnimate}
          transition={isMobile ? undefined : { duration: 0.5, delay: 0.2 }}
        >
          that
        </motion.span>
      </div>
      <motion.div
        initial={divInitial}
        animate={divAnimate}
        transition={isMobile ? undefined : { duration: 0.5, delay: 0.4 }}
      >
        <span className="from-phthalo-green bg-gradient-to-r to-emerald-400 bg-clip-text text-transparent">
          don&apos;t suck.
        </span>
      </motion.div>
    </motion.h1>
  );
}
