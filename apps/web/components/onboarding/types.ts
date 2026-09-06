/**
 * Onboarding types
 */

// Step types
export type OnboardingStep = 'profile' | 'team';

// Team roles
export type TeamRole = 'owner' | 'admin' | 'member';

// Team member interface
export interface TeamMember {
  id: string;
  email: string;
  role: TeamRole;
}

// Team data interface
export interface TeamData {
  name: string;
  picture: string | null;
  members: TeamMember[];
}

// Profile data interface
export interface ProfileData {
  name: string;
  jobTitle: string;
  picture: string | null;
  notificationsEnabled: boolean;
  timezone: string;
}

// User data interface
export interface UserData {
  email: string;
  name?: string;
}

// Onboarding data interface (combined data for API)
export interface OnboardingData {
  profile: ProfileData;
  team: TeamData;
}

// Navigation props
export interface OnboardingNavigationProps {
  onNext: () => void;
  onBack: () => void;
  isNextDisabled?: boolean;
}

// Common step interface
export interface StepProps extends OnboardingNavigationProps {
  className?: string;
}
