'use client';

import { waitlistStorage } from '@/lib/waitlistStorage';
import { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';

/**
 * User data structure for waitlist members
 */
interface WaitlistUser {
  username: string | null;
  avatarUrl: string | null;
}

/**
 * Context for waitlist state and actions
 */
interface WaitlistContextType {
  count: number;
  recentUsers: WaitlistUser[];
  incrementCount: () => void;
  refreshRecentUsers: () => Promise<void>;
}

const WaitlistContext = createContext<WaitlistContextType>({
  count: 0,
  recentUsers: [],
  incrementCount: () => {},
  refreshRecentUsers: async () => {},
});

export const useWaitlist = () => useContext(WaitlistContext);

interface WaitlistProviderProps {
  children: ReactNode;
  initialCount?: number;
  initialRecentUsers?: WaitlistUser[];
}

/**
 * Provider component for waitlist functionality
 * Manages waitlist count and recent user state
 */
export default function WaitlistProvider({
  children,
  initialCount = 0,
  initialRecentUsers = [],
}: WaitlistProviderProps) {
  const [count, setCount] = useState(initialCount);
  const [recentUsers, setRecentUsers] = useState<WaitlistUser[]>(initialRecentUsers);
  const wasIncrementedRef = useRef(false);

  const fetchWaitlistData = async () => {
    try {
      const response = await fetch('/api/waitlist/count');
      if (response.ok) {
        const data = await response.json();
        return data;
      }
      return null;
    } catch (error) {
      console.error('Failed to fetch waitlist data:', error);
      return null;
    }
  };

  // Refresh only the recent users list without incrementing the counter
  const refreshRecentUsers = async () => {
    const data = await fetchWaitlistData();
    if (data) {
      setRecentUsers(data.recentUsers);
    }
  };

  // on mount
  useEffect(() => {
    // Check if user already joined
    if (typeof window !== 'undefined' && waitlistStorage.hasJoined()) {
      wasIncrementedRef.current = true;
    }

    // Fetch waitlist data
    if (typeof window !== 'undefined') {
      fetchWaitlistData().then((data) => {
        if (data) {
          setCount(data.count);
          setRecentUsers(data.recentUsers);
        }
      });
    }
  }, []);

  // Increment count with protection against multiple increments
  const incrementCount = () => {
    if (wasIncrementedRef.current) return;

    setCount((prev) => prev + 1);
    wasIncrementedRef.current = true;
  };

  return (
    <WaitlistContext.Provider value={{ count, recentUsers, incrementCount, refreshRecentUsers }}>
      {children}
    </WaitlistContext.Provider>
  );
}
