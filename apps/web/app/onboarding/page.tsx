'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// Import types from our components
import { OnboardingStep, ProfileData, UserData } from '@/components/onboarding/types';
import { TeamData } from '@/components/onboarding/schemas';

// Import components
import { OnboardingLayout } from '@/components/onboarding/layout';
import { ProfileStep } from '@/components/onboarding/steps/profile';
import { TeamStep } from '@/components/onboarding/steps/team';

// Import utilities
import { getDefaultTimezone } from '@/lib/utils/timezone';
import { authClient } from '@[removed]/auth/client';

/**
 * Onboarding Page
 * Responsible for the onboarding flow and state management
 */
export default function OnboardingPage() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('profile');
  const [progress, setProgress] = useState(50);
  const [teamNameManuallyChanged, setTeamNameManuallyChanged] = useState(false);

  // In a real app, this would come from authentication
  const userData: UserData = {
    email: session?.user.email || '',
    name: session?.user.name || '',
  };

  // Profile data with smart defaults
  const [profile, setProfile] = useState<ProfileData>({
    name: session?.user.name || '',
    jobTitle: '',
    picture: session?.user.image || null,
    notificationsEnabled: true,
    timezone: getDefaultTimezone(),
  });

  // Team data with smart defaults
  const [team, setTeam] = useState<TeamData>({
    name: '',
    picture: null,
    members: [],
  });

  useEffect(() => {
    if (session?.user.name) {
      setProfile((current) => ({
        ...current,
        name: session.user.name,
        picture: session.user.image || null,
      }));
    }
  }, [session]);

  // Function to handle step changes
  const goToStep = (step: OnboardingStep) => {
    setCurrentStep(step);
    switch (step) {
      case 'profile':
        setProgress(50);
        break;
      case 'team':
        setProgress(100);
        break;
    }
  };

  const handleNextStep = () => {
    if (currentStep === 'profile' && profile.name) goToStep('team');
  };

  const handlePreviousStep = () => {
    if (currentStep === 'team') goToStep('profile');
  };

  const handleKeyboardNavigation = (direction: 'next' | 'previous') => {
    if (direction === 'next') {
      handleNextStep();
    } else {
      handlePreviousStep();
    }
  };

  // Render current step
  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'profile':
        return (
          <ProfileStep
            profile={profile}
            setProfile={setProfile}
            onNext={handleNextStep}
            onBack={handlePreviousStep}
          />
        );

      case 'team':
        return (
          <TeamStep
            team={team}
            setTeam={setTeam}
            onNext={() => {}} // No longer needed but keeping prop for compatibility
            onBack={handlePreviousStep}
            userEmail={userData.email}
            setTeamNameManuallyChanged={setTeamNameManuallyChanged}
            profile={profile}
          />
        );

      default:
        return null;
    }
  };

  return (
    <OnboardingLayout
      currentStep={currentStep}
      progress={progress}
      onKeyboardNavigation={handleKeyboardNavigation}
    >
      {renderCurrentStep()}
    </OnboardingLayout>
  );
}
