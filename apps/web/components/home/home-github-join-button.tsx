'use client';

import { triggerConfetti } from '@/lib/confetti';
import { waitlistStorage } from '@/lib/waitlistStorage';
import { Button } from '@[removed]/ui/components/button';
import { Check, Github, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useHomeWaitlist } from './home-waitlist-provider';

export function HomeGithubJoinButton() {
  const [isLoading, setIsLoading] = useState(false);
  const { incrementCount, isJoined } = useHomeWaitlist();
  const [localIsSuccess, setLocalIsSuccess] = useState(false);

  const popupRef = useRef<Window | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const confettiTriggeredRef = useRef(false);

  useEffect(() => {
    if (isJoined) {
      setLocalIsSuccess(true);
    }
  }, [isJoined]);

  const cleanupPopup = useCallback(() => {
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }
    popupRef.current = null;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const handleSuccess = useCallback(async () => {
    setLocalIsSuccess(true);
    setIsLoading(false);
    waitlistStorage.markAsJoined();
    incrementCount();
    cleanupPopup();

    if (!confettiTriggeredRef.current) {
      triggerConfetti();
      confettiTriggeredRef.current = true;
    }
  }, [incrementCount, cleanupPopup]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'waitlist-success') {
        return;
      }
      handleSuccess();
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      cleanupPopup();
    };
  }, [handleSuccess, cleanupPopup]);

  const handleJoinWaitlist = async () => {
    if (localIsSuccess || isLoading) return;
    setIsLoading(true);

    const width = 600,
      height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    popupRef.current = window.open(
      'about:blank',
      'github-oauth',
      `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes`,
    );

    if (!popupRef.current) {
      setIsLoading(false);
      alert('Popup was blocked by the browser. Please allow popups for this site.');
      return;
    }

    popupRef.current.document.write(
      `<html><head><title>Connecting to GitHub...</title><style>body{font-family:system-ui,-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background-color:#111;color:#fff;}h2{color:#00a67d;}</style></head><body><h2>Connecting to GitHub...</h2></body></html>`,
    );

    intervalRef.current = setInterval(() => {
      if (popupRef.current && popupRef.current.closed) {
        setIsLoading(false);
        cleanupPopup();
      }
    }, 500);

    try {
      const redirectUri = `${window.location.origin}/api/waitlist/auth/popup-callback`;
      const authUrlResponse = await fetch('/api/waitlist/auth/github/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redirectUri }),
      });

      if (!authUrlResponse.ok) {
        throw new Error('Failed to get authorization URL');
      }

      const { url: githubAuthUrl } = await authUrlResponse.json();

      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.location.href = githubAuthUrl;
      } else {
        setIsLoading(false);
        cleanupPopup();
      }
    } catch (error) {
      console.error('Error during GitHub OAuth initiation:', error);
      setIsLoading(false);
      cleanupPopup();
      if (!(error instanceof Error && error.message.includes('Popup was closed'))) {
        alert('Could not connect to GitHub. Please try again.');
      }
    }
  };

  const buttonText = localIsSuccess
    ? "You're on the list!"
    : isLoading
      ? 'Joining...'
      : 'Join Waitlist with GitHub';

  const IconComponent = localIsSuccess ? Check : isLoading ? Loader2 : Github;

  return (
    <Button
      size="lg"
      className="w-full gap-1 border sm:w-auto"
      onClick={handleJoinWaitlist}
      disabled={isLoading || localIsSuccess}
    >
      <IconComponent className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
      <span>{buttonText}</span>
    </Button>
  );
}
