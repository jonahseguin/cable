'use client';

import { Button } from '@[removed]/ui/components/button';
import { Github, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { waitlistStorage } from '@/lib/waitlistStorage';

interface WaitlistFormProps {
  compact?: boolean;
}

export default function WaitlistForm({ compact = false }: WaitlistFormProps) {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleGithubAuth = async () => {
    setLoading(true);

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
        setLoading(false);
        return;
      }

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
        setLoading(false);
      }

      // Listen for success message
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === 'waitlist-success') {
          window.removeEventListener('message', handleMessage);
          popup.close();
          setSubmitted(true);
          setLoading(false);
          waitlistStorage.markAsJoined();
        }
      };

      window.addEventListener('message', handleMessage);

      // Check if popup closed
      const checkInterval = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkInterval);
          window.removeEventListener('message', handleMessage);
          setLoading(false);
        }
      }, 500);
    } catch (error) {
      console.error('Authentication error:', error);
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-md bg-gradient-to-r from-[#0F4C3A]/30 via-[#2d9d78]/30 to-[#0F4C3A]/30 p-3 text-center">
        <div className="gradient-text font-mono text-sm">
          <span>{`You're on the waitlist! We'll notify you when [removed] launches.`}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <Button
        onClick={handleGithubAuth}
        disabled={loading}
        className="gradient-button flex h-10 w-full items-center justify-center gap-2 rounded-md border-0 px-4 font-mono text-sm text-white"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Authenticating with GitHub...</span>
          </>
        ) : (
          <>
            <Github className="h-4 w-4" />
            <span>Join Waitlist with GitHub</span>
          </>
        )}
      </Button>
    </div>
  );
}
