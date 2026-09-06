'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function TerminalIllustration() {
  const [typingText, setTypingText] = useState('');
  const [showCommands, setShowCommands] = useState<number>(0);
  const fullText = 'bun add @[removed]/client @[removed]/server';

  // Typing animation
  useEffect(() => {
    if (typingText.length < fullText.length) {
      const timeout = setTimeout(() => {
        setTypingText(fullText.slice(0, typingText.length + 1));
      }, 50);

      return () => clearTimeout(timeout);
    } else if (showCommands === 0) {
      // After typing finishes, show first command result
      const timeout = setTimeout(() => setShowCommands(1), 500);
      return () => clearTimeout(timeout);
    } else if (showCommands === 1) {
      // After first command, show second command
      const timeout = setTimeout(() => setShowCommands(2), 1000);
      return () => clearTimeout(timeout);
    }
  }, [typingText, showCommands]);

  return (
    <div className="relative">
      {/* Decorative elements */}
      <motion.div
        className="bg-phthalo-green/20 absolute -left-20 -top-20 h-40 w-40 rounded-full blur-3xl"
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.6, 0.8, 0.6],
        }}
        transition={{
          duration: 4,
          repeat: Number.POSITIVE_INFINITY,
          repeatType: 'reverse',
        }}
      />

      <motion.div
        className="bg-phthalo-green/10 absolute -bottom-20 -right-20 h-60 w-60 rounded-full blur-3xl"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: 5,
          repeat: Number.POSITIVE_INFINITY,
          repeatType: 'reverse',
        }}
      />

      {/* Terminal-like illustration */}
      <motion.div
        className="border-phthalo-green/30 shadow-phthalo-green/20 relative z-10 overflow-hidden rounded-xl border bg-black/60 shadow-2xl backdrop-blur-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        style={{ minHeight: '320px' }} // Fixed height to prevent layout shifts
      >
        <div className="bg-phthalo-green/10 border-phthalo-green/30 flex items-center border-b px-4 py-2">
          <div className="flex space-x-2">
            <motion.div
              className="h-3 w-3 rounded-full bg-red-500/70"
              whileHover={{ scale: 1.2 }}
            />
            <motion.div
              className="h-3 w-3 rounded-full bg-yellow-500/70"
              whileHover={{ scale: 1.2 }}
            />
            <motion.div
              className="h-3 w-3 rounded-full bg-green-500/70"
              whileHover={{ scale: 1.2 }}
            />
          </div>
          <div className="flex flex-1 justify-center">
            <motion.div
              className="text-phthalo-green/80 font-mono text-xs"
              whileHover={{
                color: '#00a67d',
                transition: { duration: 0.2 },
              }}
            >
              dev@[removed].com
            </motion.div>
          </div>
          <div className="invisible flex space-x-2">
            <div className="h-3 w-3" />
            <div className="h-3 w-3" />
            <div className="h-3 w-3" />
          </div>
        </div>

        <div className="p-6 font-mono" style={{ minHeight: '260px' }}>
          <div className="mb-4 flex items-start gap-3">
            <span className="text-gray-500">$</span>
            <div>
              <motion.span className="text-phthalo-green" whileHover={{ color: '#00a67d' }}>
                {typingText}
              </motion.span>
              <AnimatePresence>
                {typingText.length < fullText.length && (
                  <motion.span
                    className="bg-phthalo-green/80 ml-0.5 inline-block h-5 w-2"
                    animate={{ opacity: [1, 0, 1] }}
                    exit={{ opacity: 0 }}
                    transition={{
                      repeat: Number.POSITIVE_INFINITY,
                      duration: 0.8,
                    }}
                  />
                )}
              </AnimatePresence>
            </div>
          </div>

          <AnimatePresence>
            {showCommands >= 1 && (
              <motion.div
                className="mb-4 flex items-start gap-3"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={{ duration: 0.3 }}
              >
                <span className="text-gray-500">$</span>
                <div className="flex flex-col gap-1">
                  <span className="text-phthalo-green">bunx @[removed]/cli init</span>
                  <motion.span
                    className="text-sm text-gray-400"
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    ✓ Project configured
                  </motion.span>
                  <motion.span
                    className="text-sm text-gray-400"
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    ✓ Types generated
                  </motion.span>
                  <motion.span
                    className="text-sm text-gray-400"
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 }}
                  >
                    ✓ Ready for real-time!
                  </motion.span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showCommands >= 2 && (
              <motion.div
                className="flex items-start gap-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <span className="text-gray-500">$</span>
                <div className="flex items-center">
                  {/* <span className="text-white">_</span> */}
                  <motion.span
                    className="bg-phthalo-green/80 ml-0.5 inline-block h-5 w-2"
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{
                      repeat: Number.POSITIVE_INFINITY,
                      duration: 0.8,
                    }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
