'use client';

import { useEffect, useState } from 'react';

/**
 * Hook to detect if the current device is a mobile device
 * Uses a media query to check if the viewport width is less than 768px
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Check if window is defined (browser environment)
    if (typeof window === 'undefined') {
      return;
    }

    // Function to determine if the device is mobile based on screen width
    const checkMobile = () => {
      const mobileMediaQuery = window.matchMedia('(max-width: 768px)');
      setIsMobile(mobileMediaQuery.matches);
    };

    // Initial check
    checkMobile();

    // Set up event listener for window resize
    window.addEventListener('resize', checkMobile);

    // Clean up event listener
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  return isMobile;
}
