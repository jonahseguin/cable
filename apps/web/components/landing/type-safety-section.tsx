'use client';

import { motion } from 'framer-motion';
import { CheckCircle, Code, Shield, Zap } from 'lucide-react';
import { AnimationWrapper } from './animation-wrapper';
import { GlowingBadge } from './glowing-badge';

export function TypeSafetySection() {
  return (
    <section className="relative overflow-hidden py-16">
      <div className="container relative z-10 mx-auto px-4">
        <AnimationWrapper>
          <div className="mb-10 flex flex-col items-center text-center">
            <GlowingBadge className="mb-4">END-TO-END TYPE SAFETY</GlowingBadge>
            <motion.h2
              className="mb-6 text-4xl font-bold md:text-5xl"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <span className="from-phthalo-green bg-gradient-to-r to-emerald-400 bg-clip-text text-transparent">
                Type-safe from server to client
              </span>
            </motion.h2>
            <motion.p
              className="max-w-2xl text-xl text-gray-300"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              No more guessing what data is being sent or received. Complete type safety across your
              entire application.
            </motion.p>
          </div>
        </AnimationWrapper>

        <AnimationWrapper delay={0.2}>
          <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Server Card */}
            <motion.div
              className="border-phthalo-green/30 shadow-phthalo-green/20 relative z-10 overflow-hidden rounded-xl border bg-black/60 shadow-2xl backdrop-blur-sm"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
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
                    lib/channels.ts
                  </motion.div>
                </div>
                <div className="invisible flex space-x-2">
                  <div className="h-3 w-3" />
                  <div className="h-3 w-3" />
                  <div className="h-3 w-3" />
                </div>
              </div>

              <div className="p-6 font-mono" style={{ minHeight: '260px' }}>
                <pre className="pointer-events-auto overflow-auto text-sm">
                  <code className="text-gray-300">
                    <span className="text-[#dcdcaa]">import</span> {'{ channels }'}{' '}
                    <span className="text-[#dcdcaa]">from</span>{' '}
                    <span className="text-[#ce9178]">{"'~/lib/sock8"}</span>;{'\n'}
                    <span className="text-[#dcdcaa]">import</span> {'{ z }'}{' '}
                    <span className="text-[#dcdcaa]">from</span>{' '}
                    <span className="text-[#ce9178]">{"'zod"}</span>;{'\n\n'}
                    <span className="text-phthalo-green">{'// Define schemas'}</span>
                    {'\n'}
                    <span className="text-[#dcdcaa]">const</span> messageSchema = z.
                    <span className="text-[#dcdcaa]">object</span>({'{'} text: z.string() {'}'});
                    {'\n\n'}
                    <span className="text-phthalo-green">
                      {"// Define the application's channel structure"}
                    </span>
                    {'\n'}
                    <span className="text-[#dcdcaa]">export const</span> appChannels = channels(
                    {'{'}
                    {'\n'}
                    {'  '}
                    <span className="text-[#ce9178]">{"'chat."}</span>
                    {'{roomId}'}
                    <span className="text-[#ce9178]">{"'"}</span>: {'{'} schema: messageSchema {'}'}
                    ,{'\n'}
                    {'  '}
                    <span className="text-[#ce9178]">{"'admin.logs'"}</span>: {'{'} schema:
                    z.string() {'}'},{'\n'}
                    {'}'});{'\n\n'}
                    <span className="text-phthalo-green">
                      {'// Export the type for client-side use'}
                    </span>
                    {'\n'}
                    <span className="text-[#dcdcaa]">export type</span> AppChannels ={' '}
                    <span className="text-[#dcdcaa]">typeof</span> appChannels;
                  </code>
                </pre>
              </div>
            </motion.div>

            {/* Client Card */}
            <motion.div
              className="border-phthalo-green/30 shadow-phthalo-green/20 relative z-10 overflow-hidden rounded-xl border bg-black/60 shadow-2xl backdrop-blur-sm"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
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
                    app/page.tsx
                  </motion.div>
                </div>
                <div className="invisible flex space-x-2">
                  <div className="h-3 w-3" />
                  <div className="h-3 w-3" />
                  <div className="h-3 w-3" />
                </div>
              </div>

              <div className="p-6 font-mono" style={{ minHeight: '260px' }}>
                <pre className="pointer-events-auto overflow-auto text-sm">
                  <code className="text-gray-300">
                    <span className="text-[#ce9178]">'use client'</span>;<br />
                    <br />
                    <span className="text-[#dcdcaa]">import</span> {'{ useChannels }'}{' '}
                    <span className="text-[#dcdcaa]">from</span>{' '}
                    <span className="text-[#ce9178]">'@sock8/next'</span>;<br />
                    <span className="text-[#dcdcaa]">import</span> {'{ channels }'}{' '}
                    <span className="text-[#dcdcaa]">from</span>{' '}
                    <span className="text-[#ce9178]">'@/lib/sock8'</span>;<br />
                    <br />
                    <span className="text-[#dcdcaa]">
                      export default function
                    </span> DashboardPage() {'{'}
                    <br />
                    {'  '}
                    <span className="text-[#dcdcaa]">const</span> {'{ data }'} = useChannels({'{'}
                    <br />
                    {'    '}chat: channels.chat.for({'{'} roomId:{' '}
                    <span className="text-[#ce9178]">'room-123'</span> {'}'}),
                    <br />
                    {'    '}logs: channels.admin.logs,
                    <br />
                    {'  }'});
                    <br />
                    <br />
                    {'  '}
                    <span className="text-[#dcdcaa]">return</span> (
                    <span className="text-[#dcdcaa]">&lt;&gt;</span>
                    <br />
                    {'    '}data.chat.map((<span className="text-[#dcdcaa]">&#123;</span> text{' '}
                    <span className="text-[#dcdcaa]">&#125;</span>, i) =&gt; (<br />
                    {'      '}
                    <span className="text-[#dcdcaa]">&lt;div</span> key=&#123;`chat-${'{'}i{'}'}
                    `&#125;<span className="text-[#dcdcaa]">&gt;</span>&#123;text&#125;
                    <span className="text-[#dcdcaa]">&lt;/div&gt;</span>
                    <br />
                    {'    '}))
                    <br />
                    {'    '}data.logs.map((log, i) =&gt; (<br />
                    {'      '}
                    <span className="text-[#dcdcaa]">&lt;div</span> key=&#123;`log-${'{'}i{'}'}
                    `&#125;<span className="text-[#dcdcaa]">&gt;</span>[admin] &#123;log&#125;
                    <span className="text-[#dcdcaa]">&lt;/div&gt;</span>
                    <br />
                    {'    '}))
                    <br />
                    {'  '}
                    <span className="text-[#dcdcaa]">&lt;/&gt;</span>);
                    <br />
                    {'}'}
                  </code>
                </pre>
              </div>
            </motion.div>
          </div>
        </AnimationWrapper>

        <div className="interactive grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: <Shield className="text-phthalo-green" size={24} />,
              title: 'Type Inference',
              description: 'Automatic type inference between server and client.',
            },
            {
              icon: <Zap className="text-phthalo-green" size={24} />,
              title: 'Runtime Validation',
              description: 'Zod schemas validate data at runtime for extra safety.',
            },
            {
              icon: <Code className="text-phthalo-green" size={24} />,
              title: 'IDE Integration',
              description: 'Full autocomplete and IntelliSense in your editor.',
            },
            {
              icon: <CheckCircle className="text-phthalo-green" size={24} />,
              title: 'Compile-Time Checks',
              description: 'Catch errors during development, not in production.',
            },
          ].map((feature, i) => (
            <AnimationWrapper key={feature.title} delay={0.2 + i * 0.1}>
              <motion.div
                className="border-phthalo-green/20 interactive h-full rounded-lg border bg-black/40 p-6 backdrop-blur-sm"
                whileHover={{
                  y: -5,
                  boxShadow: '0 10px 30px -10px rgba(0, 128, 96, 0.2)',
                  borderColor: 'rgba(0, 128, 96, 0.4)',
                }}
                transition={{ duration: 0.2 }}
              >
                <div className="bg-phthalo-green/10 mb-4 flex h-12 w-12 items-center justify-center rounded-full">
                  {feature.icon}
                </div>
                <h3 className="mb-2 text-xl font-bold text-white">{feature.title}</h3>
                <p className="text-gray-400">{feature.description}</p>
              </motion.div>
            </AnimationWrapper>
          ))}
        </div>
      </div>
    </section>
  );
}
