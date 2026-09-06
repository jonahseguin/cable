'use client';

import { Badge } from '@[removed]/ui/components/badge';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { WaitlistButton } from '../waitlist/waitlist-button';
import { useWaitlist } from '../waitlist/waitlist-provider';
import { AnimationWrapper } from './animation-wrapper';
import { GlowingBadge } from './glowing-badge';
import { HeroText } from './hero-text';
import { TerminalIllustration } from './terminal-illustration';
import { useIsMobile } from '@/hooks/use-is-mobile';

export default function HeroSection({
  waitlistEnabled,
  displayWaitlistCount,
  displayWailistRecentUsers,
}: {
  waitlistEnabled: boolean;
  displayWaitlistCount: boolean;
  displayWailistRecentUsers: boolean;
}) {
  const { count, recentUsers, incrementCount } = useWaitlist();
  const isMobile = useIsMobile();

  return (
    <section className="mx-auto mt-16 max-w-7xl md:mt-24">
      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
        <AnimationWrapper>
          <div className="flex flex-col items-start text-left">
            <GlowingBadge className="mb-6">COMING SOON</GlowingBadge>

            <div className="mb-6">
              <HeroText />
            </div>

            <motion.p
              className="mb-8 max-w-lg text-lg text-gray-400"
              initial={isMobile ? { opacity: 0, y: 20 } : { opacity: 0 }}
              animate={isMobile ? { opacity: 1, y: 0 } : { opacity: 1 }}
              transition={isMobile ? undefined : { duration: 0.6, delay: 0.4 }}
            >
              A minimal API for real-time communication.
              <br />
              Type-safe, Next.js-first, and designed for how modern apps are built today.
            </motion.p>

            <motion.div
              className="mb-8 flex flex-col gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
            >
              {waitlistEnabled && <WaitlistButton onSuccess={incrementCount} />}

              <motion.div
                className="flex items-center gap-2 font-mono text-sm text-gray-400"
                whileHover={{ scale: 1.05 }}
                transition={{ type: 'spring', stiffness: 400, damping: 10 }}
              >
                {displayWailistRecentUsers && recentUsers.length > 0 && (
                  <div className="flex -space-x-2">
                    {recentUsers.map((user, i) => (
                      <motion.div
                        key={i}
                        className="from-phthalo-green/80 flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-black bg-gradient-to-br to-emerald-600/80 text-xs text-white"
                        whileHover={{ scale: 1.2, zIndex: 10 }}
                        transition={{
                          type: 'spring',
                          stiffness: 400,
                          damping: 10,
                        }}
                        title={user.username || undefined}
                      >
                        {user.avatarUrl ? (
                          <Image
                            src={user.avatarUrl}
                            alt={user.username || `GitHub user`}
                            width={32}
                            height={32}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          String.fromCharCode(65 + i)
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}
                {(displayWaitlistCount || displayWailistRecentUsers) && (
                  <span className="whitespace-break-spaces text-xs">
                    <motion.span
                      className="text-phthalo-green text-sm font-bold"
                      animate={{
                        color: ['#008060', '#00a67d', '#008060'],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Number.POSITIVE_INFINITY,
                      }}
                    >
                      {displayWaitlistCount && count > 0 ? count : ''}
                    </motion.span>{' '}
                    developers have already joined the waitlist!
                  </span>
                )}
              </motion.div>
            </motion.div>

            <motion.div
              className="mt-2 flex flex-wrap gap-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.7 }}
            >
              {[
                'edge-native',
                'end-to-end type-safe',
                'zero boilerplate',
                'composable',
                'low latency',
                'next.js-first',
              ].map((tag, i) => (
                <motion.div
                  key={tag}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.8 + i * 0.1 }}
                  whileHover={{
                    scale: 1.05,
                    backgroundColor: 'rgba(0, 128, 96, 0.2)',
                    borderColor: 'rgba(0, 128, 96, 0.4)',
                  }}
                >
                  <Badge
                    variant="outline"
                    className="border-phthalo-green/30 bg-black/50 px-3 py-1 text-gray-300 backdrop-blur-sm"
                  >
                    <span className="font-mono text-xs">{tag}</span>
                  </Badge>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </AnimationWrapper>

        <AnimationWrapper
          variants={{
            hidden: { opacity: 0, scale: 0.9 },
            visible: { opacity: 1, scale: 1 },
          }}
          delay={0.3}
        >
          <TerminalIllustration />
        </AnimationWrapper>
      </div>
    </section>
  );
}
