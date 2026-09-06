'use client';

import { waitlistStorage } from '@/lib/waitlistStorage'; // Assuming this path is correct or adjust if needed
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
interface HomeWaitlistContextType {
  count: number;
  recentUsers: WaitlistUser[];
  incrementCount: () => void;
  refreshRecentUsers: () => Promise<void>;
  isJoined: boolean;
  isLoadingData: boolean;
}

const HomeWaitlistContext = createContext<HomeWaitlistContextType>({
  count: 0,
  recentUsers: [],
  incrementCount: () => {},
  refreshRecentUsers: async () => {},
  isJoined: false,
  isLoadingData: true,
});

export const useHomeWaitlist = () => useContext(HomeWaitlistContext);

interface HomeWaitlistProviderProps {
  children: ReactNode;
}

/**
 * Provider component for waitlist functionality for the home page
 * Manages waitlist count and recent user state
 */
export default function HomeWaitlistProvider({ children }: HomeWaitlistProviderProps) {
  const [count, setCount] = useState(0);
  const [recentUsers, setRecentUsers] = useState<WaitlistUser[]>([]);
  const [isJoined, setIsJoined] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const wasIncrementedRef = useRef(false);

  const fetchWaitlistData = async () => {
    setIsLoadingData(true);
    try {
      const response = await fetch('/api/waitlist/count');
      if (response.ok) {
        const data = await response.json();
        setCount(data.count || 0);
        setRecentUsers(data.recentUsers || []);
        return data;
      }
      return null;
    } catch (error) {
      console.error('Failed to fetch waitlist data:', error);
      setCount(0);
      setRecentUsers([]);
      return null;
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (waitlistStorage.hasJoined()) {
        setIsJoined(true);
        wasIncrementedRef.current = true;
      }
      fetchWaitlistData();
    }
  }, []);

  const incrementCount = () => {
    if (!wasIncrementedRef.current) {
      setCount((prev) => prev + 1);
      wasIncrementedRef.current = true;
    }
    setIsJoined(true);
    fetchWaitlistData();
  };

  const refreshRecentUsers = async () => {
    await fetchWaitlistData();
  };

  return (
    <HomeWaitlistContext.Provider
      value={{ count, recentUsers, incrementCount, refreshRecentUsers, isJoined, isLoadingData }}
    >
      {' '}
      {children}{' '}
    </HomeWaitlistContext.Provider>
  );
}
