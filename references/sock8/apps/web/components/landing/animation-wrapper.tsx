'use client';

import { useIsMobile } from '@/hooks/use-is-mobile';
import { motion, useAnimation, type Variant } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';

interface AnimationWrapperProps {
  children: ReactNode;
  variants?: {
    hidden: Variant;
    visible: Variant;
  };
  className?: string;
  delay?: number;
  duration?: number;
  threshold?: number;
}

export function AnimationWrapper({
  children,
  variants,
  className = '',
  delay = 0,
  duration = 0.5,
  threshold = 0.1,
}: AnimationWrapperProps) {
  const controls = useAnimation();
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const isMobile = useIsMobile();

  const defaultVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration,
        delay,
        ease: [0.25, 0.1, 0.25, 1.0],
      },
    },
  };

  const currentVariants = variants || defaultVariants;

  useEffect(() => {
    if (isMobile) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry && entry.isIntersecting && !isInView) {
          setIsInView(true);
          controls.start('visible');
        }
      },
      {
        threshold,
        rootMargin: '0px 0px -100px 0px',
      },
    );

    const currentRef = ref.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [controls, isInView, threshold, isMobile]);

  if (isMobile) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={controls}
      variants={currentVariants}
      className={className}
    >
      {children}
    </motion.div>
  );
}
