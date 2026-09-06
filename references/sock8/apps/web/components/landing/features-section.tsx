'use client';

import { motion } from 'framer-motion';
import { AnimationWrapper } from './animation-wrapper';
import { FeatureCard } from './feature-card';
import { Lock, Globe, FileCode, Code2, BarChart3, Puzzle } from 'lucide-react';

export default function FeaturesSection() {
  const features = [
    {
      icon: <Lock className="text-phthalo-green" size={24} />,
      title: 'Token-based access',
      description: 'You decide who can listen. Simple, stateless, controlled.',
    },
    {
      icon: <Globe className="text-phthalo-green" size={24} />,
      title: 'Edge-native',
      description: 'Connections terminate at the edge — minimal latency, no regional lock-in.',
    },
    {
      icon: <FileCode className="text-phthalo-green" size={24} />,
      title: 'Type-safe with Zod',
      description: 'Validated, schema-driven messages, fully typed in your app.',
    },
    {
      icon: <Code2 className="text-phthalo-green" size={24} />,
      title: 'Next.js-first',
      description: 'Hooks, server helpers, API routes — built for the modern stack.',
    },
    {
      icon: <BarChart3 className="text-phthalo-green" size={24} />,
      title: 'Pay for what you use',
      description: 'No hidden limits, no lock-in, no surprises.',
    },
    {
      icon: <Puzzle className="text-phthalo-green" size={24} />,
      title: 'Composable by design',
      description: 'We give you the pipes, you build the product.',
    },
  ];

  return (
    <section className="mx-auto mt-12 max-w-7xl md:mt-16">
      <AnimationWrapper>
        <motion.h2
          className="mb-4 text-center text-3xl font-bold"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <span className="from-phthalo-green bg-gradient-to-r to-emerald-400 bg-clip-text text-transparent">
            Just the pipes.
          </span>
        </motion.h2>
        <motion.p
          className="mx-auto mb-12 max-w-2xl text-center text-gray-400"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          You own the logic. We handle the streams. No opinions, no bloat.
        </motion.p>
      </AnimationWrapper>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
        {features.map((feature, i) => (
          <AnimationWrapper key={feature.title} delay={0.1 * i}>
            <FeatureCard
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
            />
          </AnimationWrapper>
        ))}
      </div>
    </section>
  );
}
