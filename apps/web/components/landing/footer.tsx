'use client';
import { motion } from 'framer-motion';

const Footer = () => {
  return (
    <footer className="bg-white py-6">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center justify-between md:flex-row">
          <motion.div
            className="mb-4 flex items-center gap-2 md:mb-0"
            whileHover={{ scale: 1.05 }}
            transition={{ type: 'spring', stiffness: 400, damping: 10 }}
          >
            <span className="font-mono text-sm">
              <span className="text-gray-500">© {new Date().getFullYear()} </span>
              <span className="text-gray-400">sock</span>
              <span className="text-phthalo-green/70">8</span>
            </span>
          </motion.div>
          <div className="flex items-center space-x-4">
            <a href="#" className="text-gray-500 hover:text-gray-700">
              Terms of Service
            </a>
            <a href="#" className="text-gray-500 hover:text-gray-700">
              Privacy Policy
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
