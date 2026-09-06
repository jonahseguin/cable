'use client';

import { HTMLMotionProps, SVGMotionProps, motion } from 'framer-motion';
import { ReactNode } from 'react';

interface MotionDivProps extends HTMLMotionProps<'div'> {
  children?: ReactNode;
}

export function MotionDiv({ children, ...props }: MotionDivProps) {
  return <motion.div {...props}>{children}</motion.div>;
}

interface MotionCircleProps extends SVGMotionProps<'circle'> {
  children?: ReactNode;
}

export function MotionCircle({ children, ...props }: MotionCircleProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fuckme = props as any;
  return <motion.circle {...fuckme}>{children}</motion.circle>;
}

interface MotionPathProps extends SVGMotionProps<'path'> {
  children?: ReactNode;
}

export function MotionPath({ children, ...props }: MotionPathProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fuckme = props as any;
  return <motion.path {...fuckme}>{children}</motion.path>;
}
