'use client';

import { motion } from 'framer-motion';
import { WaitlistButton } from '../waitlist/waitlist-button';
import { useWaitlist } from '../waitlist/waitlist-provider';
import { AnimationWrapper } from './animation-wrapper';

export default function CTASection() {
  const { incrementCount } = useWaitlist();

  return (
    <AnimationWrapper delay={0.3}>
      <section className="mx-auto mb-16 mt-24 max-w-5xl">
        <motion.div
          className="from-phthalo-green/20 to-phthalo-green/5 border-phthalo-green/30 rounded-2xl border bg-gradient-to-br p-8 md:p-12"
          whileHover={{ boxShadow: '0 0 70px rgba(0, 128, 96, 0.15)' }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex flex-col items-center gap-6 text-center">
            <motion.h2
              className="text-2xl font-bold md:text-3xl"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              Tired of bloated real-time services?
            </motion.h2>
            <motion.p
              className="max-w-2xl text-xl text-gray-300"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              We're building the real-time infra layer we always wanted — simple, composable, and
              built for how we build apps today.
            </motion.p>
            <motion.div
              className="mt-4"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              <WaitlistButton onSuccess={incrementCount} />
            </motion.div>
            <motion.p
              className="mt-4 max-w-lg text-sm text-gray-400"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
            >
              Join the waitlist and get early access to [removed] when we launch.
            </motion.p>
          </div>
        </motion.div>
      </section>
    </AnimationWrapper>
  );
}
