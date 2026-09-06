'use client';

import { authClient } from '@[removed]/auth/client';
import { Button } from '@[removed]/ui/components/button';
import { motion } from 'framer-motion';
import { Github, Loader2 } from 'lucide-react';
import { useState } from 'react';

interface GitHubLoginButtonProps {
  callbackURL: string;
  errorCallbackURL: string;
  buttonText?: string;
  loadingText?: string;
  className?: string;
}

export default function GitHubLoginButton({
  callbackURL,
  errorCallbackURL,
  buttonText = 'Login with GitHub',
  loadingText = 'Connecting...',
  className,
}: GitHubLoginButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      await authClient.signIn.social({
        provider: 'github',
        callbackURL,
        errorCallbackURL,
      });
    } catch (error) {
      console.error('Login error:', error);
      setIsLoading(false); // Reset loading state on error
    }
    // setIsLoading(false) will not be reached if signIn.social redirects successfully
  };

  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      transition={{ type: 'spring', stiffness: 400, damping: 10 }}
      className="flex justify-center"
    >
      <Button
        onClick={handleLogin}
        disabled={isLoading}
        variant="outline"
        className={`border-phthalo-green/30 text-phthalo-green flex items-center gap-2 bg-black/50 backdrop-blur-sm ${className}`}
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
        <span>{isLoading ? loadingText : buttonText}</span>
      </Button>
    </motion.div>
  );
}
