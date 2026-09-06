'use client';

import LoginButton from '@/components/landing/login-button';
import SockLogo from '@/components/landing/sock-logo';
import { motion } from 'framer-motion';

export default function SiteHeader({ allowLogin }: { allowLogin: boolean }) {
  return (
    <motion.header
      className="mx-auto flex max-w-7xl items-center justify-between py-6"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div
        className="pointer-events-auto flex items-center"
        whileHover={{ scale: 1.05 }}
        transition={{ type: 'spring', stiffness: 400, damping: 10 }}
      >
        <span className="flex items-center font-sans text-2xl font-bold">
          <SockLogo />
          <span className="text-foreground">sock</span>
          <span className="text-phthalo-green ml-[1px] -translate-y-0.5 font-mono">8</span>
        </span>
      </motion.div>

      <LoginButton enabled={allowLogin} />

      {/* <div className="flex items-center gap-4">
        <motion.div
          whileHover={{ scale: 1.05 }}
          transition={{ type: "spring", stiffness: 400, damping: 10 }}
          className="interactive"
        >
          
          <Badge
            variant="outline"
            className="bg-black/50 backdrop-blur-sm border-phthalo-green/30 text-phthalo-green px-3 py-1 interactive"
          >
            <span className="font-mono">COMING SOON</span>
          </Badge>
        </motion.div>
        <motion.a
          href="#"
          className="text-sm text-gray-400 hover:text-white transition-colors interactive"
          whileHover={{ scale: 1.05, color: "#ffffff" }}
          transition={{ type: "spring", stiffness: 400, damping: 10 }}
        >
          Docs
        </motion.a>
        <motion.a
          href="#"
          className="text-sm text-gray-400 hover:text-white transition-colors interactive"
          whileHover={{ scale: 1.05, color: "#ffffff" }}
          transition={{ type: "spring", stiffness: 400, damping: 10 }}
        >
          Pricing
        </motion.a>
        <motion.a
          href="#"
          className="text-sm text-gray-400 hover:text-white transition-colors interactive"
          whileHover={{ scale: 1.05, color: "#ffffff" }}
          transition={{ type: "spring", stiffness: 400, damping: 10 }}
        >
          GitHub
        </motion.a>
      </div> */}
    </motion.header>
  );
}
