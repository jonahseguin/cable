'use client';

const WAITLIST_STORAGE_KEY = '[removed]_waitlist_joined';

// Skip localStorage in development mode
const isDev = process.env.NODE_ENV === 'development';

/**
 * Storage utility for waitlist state management
 * In development mode, storage is bypassed for easier testing
 */
export const waitlistStorage = {
  /**
   * Check if the user has already joined the waitlist
   */
  hasJoined: (): boolean => {
    if (typeof window === 'undefined') return false;
    if (isDev) return false;

    return localStorage.getItem(WAITLIST_STORAGE_KEY) === 'true';
  },

  /**
   * Mark the user as joined in localStorage
   */
  markAsJoined: (): void => {
    if (typeof window === 'undefined' || isDev) return;

    localStorage.setItem(WAITLIST_STORAGE_KEY, 'true');
  },

  /**
   * Clear the joined status (for testing)
   */
  clearJoinedStatus: (): void => {
    if (typeof window === 'undefined') return;

    if (!isDev) {
      localStorage.removeItem(WAITLIST_STORAGE_KEY);
    }
  },
};
