'use client';

import { motion } from 'framer-motion';
import { Activity, RotateCcw, Server, Shield, Users } from 'lucide-react';
import { AnimationWrapper } from './animation-wrapper';
import { WaitlistButton } from '../waitlist/waitlist-button';

export default function TechnicalFeaturesSection() {
  return (
    <AnimationWrapper delay={0.2}>
      <section className="mt-24">
        <motion.div
          className="from-phthalo-green/10 border-phthalo-green/20 rounded-2xl border bg-gradient-to-br to-black p-8 md:p-12"
          whileHover={{ boxShadow: '0 0 50px rgba(0, 128, 96, 0.1)' }}
          transition={{ duration: 0.5 }}
        >
          <div className="mx-auto max-w-5xl">
            <motion.h2
              className="mb-6 text-3xl font-bold"
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              Enterprise-grade reliability
            </motion.h2>

            <motion.p
              className="mb-12 max-w-3xl text-xl text-gray-300"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              Built for production workloads with the technical features you need for
              mission-critical applications.
            </motion.p>

            <div className="mb-12 grid grid-cols-1 gap-8 md:grid-cols-2">
              {/* Presence API */}
              <motion.div
                className="border-phthalo-green/20 rounded-lg border bg-black/40 p-6 backdrop-blur-sm"
                whileHover={{
                  y: -5,
                  boxShadow: '0 10px 30px -10px rgba(0, 128, 96, 0.2)',
                  borderColor: 'rgba(0, 128, 96, 0.4)',
                }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex flex-col gap-4">
                  <div className="flex items-start gap-4">
                    <div className="bg-phthalo-green/10 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full">
                      <Users className="text-phthalo-green" size={24} />
                    </div>
                    <div>
                      <h3 className="mb-2 text-xl font-bold text-white">Presence API</h3>
                      <p className="text-gray-400">
                        Real-time user presence with automatic state synchronization. Track who's
                        online, typing, or viewing specific content with minimal code.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Guaranteed Delivery */}
              <motion.div
                className="border-phthalo-green/20 rounded-lg border bg-black/40 p-6 backdrop-blur-sm"
                whileHover={{
                  y: -5,
                  boxShadow: '0 10px 30px -10px rgba(0, 128, 96, 0.2)',
                  borderColor: 'rgba(0, 128, 96, 0.4)',
                }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex flex-col gap-4">
                  <div className="flex items-start gap-4">
                    <div className="bg-phthalo-green/10 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full">
                      <Shield className="text-phthalo-green" size={24} />
                    </div>
                    <div>
                      <h3 className="mb-2 text-xl font-bold text-white">Guaranteed Delivery</h3>
                      <p className="text-gray-400">
                        Automatic message deduplication and at-least-once delivery semantics.
                        Messages are persisted until delivery is confirmed, with configurable retry
                        policies.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

            <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-3">
              {/* Additional technical features */}
              {[
                {
                  icon: <Activity className="text-phthalo-green" size={20} />,
                  title: 'Connection Recovery',
                  description:
                    'Automatic reconnection with session resumption and missed message replay.',
                },
                {
                  icon: <RotateCcw className="text-phthalo-green" size={20} />,
                  title: 'Idempotent Operations',
                  description:
                    'Safely retry operations without side effects using idempotency keys.',
                },
                {
                  icon: <Server className="text-phthalo-green" size={20} />,
                  title: 'Message Persistence',
                  description:
                    'Optional message history with configurable TTL and replay capabilities.',
                },
              ].map((feature, i) => (
                <motion.div
                  key={feature.title}
                  className="border-phthalo-green/10 rounded-lg border bg-black/30 p-4 backdrop-blur-sm"
                  whileHover={{
                    y: -3,
                    borderColor: 'rgba(0, 128, 96, 0.3)',
                  }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="mb-2 flex items-center gap-3">
                    <div className="bg-phthalo-green/10 flex h-8 w-8 items-center justify-center rounded-full">
                      {feature.icon}
                    </div>
                    <h4 className="font-bold text-white">{feature.title}</h4>
                  </div>
                  <p className="text-sm text-gray-400">{feature.description}</p>
                </motion.div>
              ))}
            </div>

            <motion.div
              className="text-center"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5 }}
            >
              <motion.p className="mb-6 text-lg text-gray-300" whileHover={{ scale: 1.01 }}>
                <span className="font-bold text-white">
                  Enterprise-grade reliability without the enterprise complexity.
                </span>
              </motion.p>
              <WaitlistButton size="sm" />
            </motion.div>
          </div>
        </motion.div>
      </section>
    </AnimationWrapper>
  );
}
