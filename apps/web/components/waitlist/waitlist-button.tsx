'use client';

import { triggerConfetti } from '@/lib/confetti';
import { waitlistStorage } from '@/lib/waitlistStorage';
import { Button } from '@[removed]/ui/components/button';
import { motion } from 'framer-motion';
import { Check, Github, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useWaitlist } from '../waitlist/waitlist-provider';

interface WaitlistButtonProps {
  size?: 'default' | 'sm';
  onSuccess?: () => void;
}

export function WaitlistButton({ size = 'default', onSuccess }: WaitlistButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasIncrementedRef = useRef(false);
  const confettiTriggeredRef = useRef(false);
  const { incrementCount, refreshRecentUsers } = useWaitlist();

  const handleSuccess = async () => {
    // Set success state
    setIsSuccess(true);
    waitlistStorage.markAsJoined();

    // Call onSuccess callback only once
    if (onSuccess && !hasIncrementedRef.current) {
      onSuccess();
      hasIncrementedRef.current = true;
    }

    // Increment waitlist count if needed
    if (!hasIncrementedRef.current) {
      incrementCount();
      hasIncrementedRef.current = true;
    }

    // Always refresh the recent users when joining is successful
    await refreshRecentUsers();

    // Trigger confetti only once
    if (!confettiTriggeredRef.current) {
      triggerConfetti();
      confettiTriggeredRef.current = true;
    }
  };

  // Check if user has already joined on initial load
  useEffect(() => {
    if (waitlistStorage.hasJoined()) {
      setIsSuccess(true);
    }
  }, []);

  // Clean up interval on unmount
  useEffect(() => {
    return () => cleanupPopupCheck();
  }, []);

  // Handle message from popup window
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'waitlist-success') {
        // Remove listener immediately to prevent duplicate handling
        window.removeEventListener('message', handleMessage);

        cleanupPopupCheck();
        setIsLoading(false);
        handleSuccess();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const cleanupPopupCheck = () => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }
  };

  const handleJoinWaitlist = async () => {
    if (isSuccess || isLoading) return;

    setIsLoading(true);
    cleanupPopupCheck();

    try {
      // Configure and open popup
      const dimensions = {
        width: 600,
        height: 700,
        left: window.screen.width / 2 - 300,
        top: window.screen.height / 2 - 350,
      };

      const popup = window.open(
        'about:blank',
        'github-oauth',
        `width=${dimensions.width},height=${dimensions.height},top=${dimensions.top},left=${dimensions.left},resizable=yes,scrollbars=yes`,
      );

      if (!popup) {
        throw new Error('Popup was blocked by the browser');
      }

      popupRef.current = popup;

      // Check if popup is closed
      checkIntervalRef.current = setInterval(() => {
        if (popup.closed) {
          cleanupPopupCheck();
          setIsLoading(false);
          popupRef.current = null;
        }
      }, 500);

      // Show loading state in popup
      popup.document.write(`
        <html>
          <head>
            <title>Connecting to GitHub...</title>
            <style>
              body {
                font-family: system-ui, -apple-system, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background-color: #111;
                color: #fff;
              }
              h2 {
                color: #00a67d;
              }
            </style>
          </head>
          <body>
            <h2>Connecting to GitHub...</h2>
          </body>
        </html>
      `);

      // Get authorization URL
      const response = await fetch('/api/waitlist/auth/github/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          redirectUri: `${window.location.origin}/api/waitlist/auth/popup-callback`,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get authorization URL');
      }

      const { url } = await response.json();

      if (!popup.closed) {
        popup.location.href = url;
      } else {
        cleanupPopupCheck();
        setIsLoading(false);
        popupRef.current = null;
      }
    } catch (error) {
      cleanupPopupCheck();
      setIsLoading(false);
      popupRef.current = null;

      if (error instanceof Error && error.message.includes('blocked')) {
        alert('Please allow popups for this site to join the waitlist');
      }
    }
  };

  // Determine button content based on state
  const buttonContent = isSuccess ? (
    <div className="flex items-center justify-center">
      <Check className={`mr-2 ${size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} text-black`} />
      <span>{size === 'sm' ? 'Joined!' : "You're on the waitlist!"}</span>
    </div>
  ) : isLoading ? (
    <div className="flex items-center justify-center">
      <Loader2
        className={`mr-2 ${size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} animate-spin text-black`}
      />
      <span>{size === 'sm' ? 'Connecting...' : 'Connecting to GitHub...'}</span>
    </div>
  ) : (
    <div className="flex items-center justify-center">
      <Github className={`mr-2 ${size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} text-black`} />
      <span>{size === 'sm' ? 'Join Waitlist' : 'Join Waitlist with GitHub'}</span>
    </div>
  );

  const buttonClasses = `
    bg-phthalo-green hover:bg-phthalo-green/90 text-black font-medium
    ${size === 'sm' ? '' : 'px-8 py-6 h-auto'}
    ${isSuccess ? 'bg-emerald-400 hover:bg-emerald-400' : ''}
  `;

  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: isSuccess ? 1 : 0.98 }}
      animate={isSuccess ? { scale: [1, 1.05, 1] } : {}}
      transition={isSuccess ? { duration: 0.5 } : { type: 'spring', stiffness: 400, damping: 10 }}
      className="pointer-events-auto"
    >
      <Button
        onClick={handleJoinWaitlist}
        disabled={isLoading}
        size={size === 'sm' ? 'default' : 'lg'}
        className={`${buttonClasses} rounded-md transition-shadow duration-300 hover:shadow-[0_0_15px_5px_rgba(0,166,125,0.4)]`}
      >
        <span className="relative">{buttonContent}</span>
      </Button>
    </motion.div>
  );
}
