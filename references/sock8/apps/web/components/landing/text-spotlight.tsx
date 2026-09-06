'use client';

import type React from 'react';

import { motion } from 'framer-motion';
import { type ReactNode, useState } from 'react';
import { useIsMobile } from '../../hooks/use-is-mobile';

interface TextSpotlightProps {
  children: ReactNode;
  className?: string;
}

export function TextSpotlight({ children, className = '' }: TextSpotlightProps) {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const isMobile = useIsMobile();

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <motion.div
      className={`relative overflow-hidden ${className}`}
      onMouseMove={handleMouseMove}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
    >
      {/* Spotlight effect */}
      {isHovered && !isMobile && (
        <motion.div
          className="bg-gradient-radial from-phthalo-green/30 pointer-events-none absolute h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full to-transparent opacity-0"
          animate={{
            opacity: 0.8,
            width: '40%',
            height: '300%',
          }}
          transition={{ duration: 0.2 }}
          style={{
            left: mousePosition.x,
            top: mousePosition.y,
            background: 'radial-gradient(circle, rgba(0, 128, 96, 0.15) 0%, rgba(0, 0, 0, 0) 70%)',
          }}
        />
      )}

      {children}
    </motion.div>
  );
}
