'use client';

import { authClient } from '@sock8/auth/client';
import { Button } from '@sock8/ui/components/button';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';

export default function LoginButton({ enabled = false }: { enabled?: boolean }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      await authClient.signIn.social({
        provider: 'github',
        callbackURL: '/dashboard',
        errorCallbackURL: '/',
      });
    } catch (error) {
      console.error('Login error:', error);
      setIsLoading(false);
    }
  };

  if (!enabled && process.env.NODE_ENV === 'production') return null;

  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      transition={{ type: 'spring', stiffness: 400, damping: 10 }}
    >
      <Button
        onClick={handleLogin}
        disabled={isLoading}
        size="sm"
        className="border-border/70 text-primary bg-primary/10 hover:bg-primary/30 hover:text-foreground flex items-center gap-2 border backdrop-blur-sm"
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <></>}
        <span>{isLoading ? 'Loading...' : 'Sign In'}</span>
      </Button>
    </motion.div>
  );
}
