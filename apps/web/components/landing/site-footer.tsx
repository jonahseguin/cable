'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import Logo from '../../public/logo.png';

export default function SiteFooter() {
  return (
    <motion.footer
      className="border-phthalo-green/20 z-10 mt-auto w-full border-t py-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1, duration: 0.5 }}
    >
      <div className="container mx-auto max-w-7xl px-4">
        <div className="flex flex-col items-center justify-between md:flex-row">
          <motion.div
            className="mb-4 flex items-center gap-2 md:mb-0"
            whileHover={{ scale: 1.05 }}
            transition={{ type: 'spring', stiffness: 400, damping: 10 }}
          >
            <div className="relative h-6 w-6">
              <Image
                src={Logo}
                alt="sock8 logo"
                width={24}
                height={24}
                className="object-contain"
                priority
              />
            </div>
            <span className="text-foreground font-mono text-sm font-medium">
              © {new Date().getFullYear()} sock8
            </span>
          </motion.div>

          <div className="flex gap-6">
            <motion.a
              href="https://x.com/usesock8"
              className="hover:text-phthalo-green text-foreground text-sm transition-colors"
              whileHover={{
                scale: 1.1,
                color: '#008060',
                y: -2,
              }}
              transition={{ type: 'spring', stiffness: 400, damping: 10 }}
              target="_blank"
            >
              X
            </motion.a>
            <motion.a
              href="https://github.com/sock-8"
              className="hover:text-phthalo-green text-foreground text-sm transition-colors"
              whileHover={{
                scale: 1.1,
                color: '#008060',
                y: -2,
              }}
              transition={{ type: 'spring', stiffness: 400, damping: 10 }}
              target="_blank"
            >
              GitHub
            </motion.a>
          </div>
        </div>
      </div>
    </motion.footer>
  );
}
