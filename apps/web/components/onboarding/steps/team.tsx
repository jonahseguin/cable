'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronRightIcon, PlusIcon, ArrowLeftIcon, LightbulbIcon } from 'lucide-react';
import { Button } from '@[removed]/ui/components/button';
import { Input } from '@[removed]/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@[removed]/ui/components';
import { z } from 'zod';
import { StepProps, ProfileData } from '../types';
import { AvatarUpload } from '../avatar-upload';
import { TeamMemberList } from '../team-member-list';
import { completeTeamSetup } from '../../../app/onboarding/actions';
import { useRouter } from 'next/navigation';
import { TeamData, TeamRole, TeamMember, TeamSetupResponse } from '../schemas';

interface TeamStepProps extends StepProps {
  /**
   * Team data
   */
  team: TeamData;

  /**
   * Set team data
   */
  setTeam: React.Dispatch<React.SetStateAction<TeamData>>;

  /**
   * Current user's email
   */
  userEmail: string;

  /**
   * Profile data (for current user's picture)
   */
  profile: ProfileData;

  /**
   * Set whether the team name has been manually changed
   */
  setTeamNameManuallyChanged: React.Dispatch<React.SetStateAction<boolean>>;

  /**
   * Whether the form is currently being submitted
   */
  isSubmitting?: boolean;
}

/**
 * Team step component for onboarding
 */
export function TeamStep({
  team,
  setTeam,
  onNext,
  onBack,
  userEmail,
  profile,
  setTeamNameManuallyChanged,
  className = '',
  isSubmitting = false,
}: TeamStepProps) {
  const teamNameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<TeamRole>('member');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(isSubmitting);

  // Track whether we've already added the current user to prevent duplicates
  const userAddedRef = useRef(false);

  // Auto-focus the team name field on mount
  useEffect(() => {
    if (teamNameInputRef.current) {
      teamNameInputRef.current.focus();
    }
  }, []);

  // Ensure current user is added as owner when the component mounts
  useEffect(() => {
    // Only add the current user if not already in the team and we haven't already done this
    if (
      userEmail &&
      !userAddedRef.current &&
      !team.members.some((member: TeamMember) => member.email === userEmail)
    ) {
      userAddedRef.current = true;
      setTeam((prev: TeamData) => ({
        ...prev,
        picture: prev.picture ?? profile.picture,
        members: [
          ...prev.members,
          {
            id: Date.now().toString(),
            email: userEmail,
            role: 'owner',
          },
        ],
      }));
    }
  }, [userEmail, setTeam]);

  // Handlers
  const handlePictureChange = (imageUrl: string) => {
    setTeam((prev: TeamData) => ({ ...prev, picture: imageUrl }));
  };

  const handleTeamNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTeamNameManuallyChanged(true);
    setTeam((prev: TeamData) => ({ ...prev, name: e.target.value }));
  };

  const validateEmail = (email: string): boolean => {
    // Use Zod for email validation
    const emailSchema = z.string().email();
    try {
      emailSchema.parse(email);
      return true;
    } catch (error) {
      return false;
    }
  };

  const addTeamMember = () => {
    if (!newMemberEmail) {
      return;
    }

    // Validate email format
    if (!validateEmail(newMemberEmail)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    // Don't allow adding the current user (they're already the owner)
    if (newMemberEmail === userEmail) {
      setEmailError('You are already the owner of this team');
      setNewMemberEmail('');
      return;
    }

    // Check if email already exists
    if (team.members.some((member: TeamMember) => member.email === newMemberEmail)) {
      setEmailError('This email is already added to the team');
      return;
    }

    // Clear any previous errors
    setEmailError(null);

    setTeam((prev: TeamData) => ({
      ...prev,
      members: [
        ...prev.members,
        {
          id: Date.now().toString(),
          email: newMemberEmail,
          role: newMemberRole,
        },
      ],
    }));
    setNewMemberEmail('');
    setNewMemberRole('member');

    // Focus back on email input for quick addition of multiple members
    setTimeout(() => {
      if (emailInputRef.current) {
        emailInputRef.current.focus();
      }
    }, 0);
  };

  const removeTeamMember = (id: string) => {
    // Don't allow removing the owner (current user)
    const memberToRemove = team.members.find((m: TeamMember) => m.id === id);
    if (memberToRemove && memberToRemove.email === userEmail && memberToRemove.role === 'owner') {
      alert('You cannot remove yourself as the owner of the team.');
      return;
    }

    setTeam((prev: TeamData) => ({
      ...prev,
      members: prev.members.filter((member: TeamMember) => member.id !== id),
    }));
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMemberEmail(e.target.value);
    // Clear error when user starts typing
    if (emailError) {
      setEmailError(null);
    }
  };

  // Accept empty team names since we'll use the placeholder as fallback
  const isCompleted = true;
  const router = useRouter();

  const handleSubmit = async () => {
    if (submitting) return;

    setSubmitting(true);
    try {
      // Create a copy of the team data that we can modify directly before submission
      const submissionData = { ...team };

      // Set the team name if empty
      if (!submissionData.name) {
        submissionData.name = profile.name ? `${profile.name}'s Team` : 'My Team';

        // Also update the state for consistency, but we won't wait for this
        setTeam((prev: TeamData) => ({
          ...prev,
          name: submissionData.name,
        }));
      }

      // Extract only the profile fields we need
      const profileSubmissionData = {
        name: profile.name,
        picture: profile.picture,
      };

      const result: TeamSetupResponse = await completeTeamSetup(
        submissionData,
        profileSubmissionData,
      );

      if (result.success) {
        // Redirect will happen on the server, but we can initiate client-side navigation too
        router.push('/dashboard');
      } else {
        // Handle error
        console.error('Failed to create team:', result.error);
        setSubmitting(false);
      }
    } catch (error) {
      console.error('Error completing onboarding:', error);
      setSubmitting(false);
    }
  };

  return (
    <div className={`mx-auto max-w-xl ${className}`}>
      <div className="mb-6">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Create your team</h1>
        <p className="text-muted-foreground/90 text-sm">
          Set up your team and invite colleagues to collaborate with you
        </p>
      </div>

      {/* Completion notice - moved up for better user flow */}
      <div className="bg-primary/5 border-primary/20 mb-6 flex items-center gap-3 rounded-lg border p-4">
        <div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full">
          <LightbulbIcon className="size-4" />
        </div>
        <div>
          <p className="text-sm font-medium">Almost done!</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            After completing this step, you'll be taken to your new dashboard
          </p>
        </div>
      </div>

      <div className="bg-card/40 mb-8 overflow-hidden rounded-xl border shadow-sm backdrop-blur-sm">
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          {/* Team Identity Section */}
          <div className="flex flex-col items-center gap-5 sm:flex-row">
            <div className="flex flex-row items-center sm:flex-col">
              <AvatarUpload
                imageUrl={team.picture}
                onImageChange={handlePictureChange}
                type="team"
                size="md"
              />
            </div>

            <div className="w-full flex-1">
              <label htmlFor="team-name" className="mb-1.5 block text-sm font-medium">
                Team Name
              </label>
              <Input
                id="team-name"
                placeholder={profile.name ? `${profile.name}'s Team` : 'My Team'}
                value={team.name}
                onChange={handleTeamNameChange}
                className="h-9 sm:h-10"
                ref={teamNameInputRef}
                tabIndex={0}
              />
            </div>
          </div>

          {/* Team Members Section */}
          <div className="pt-1">
            <label className="mb-1.5 block text-sm font-medium">Team Members</label>

            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    placeholder="colleague@example.com"
                    value={newMemberEmail}
                    onChange={handleEmailChange}
                    type="email"
                    className={`h-9 pr-36 sm:h-10 ${emailError ? 'border-destructive' : ''}`}
                    ref={emailInputRef}
                    aria-invalid={!!emailError}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTeamMember();
                      }
                    }}
                  />
                  {/* Role select positioned absolutely */}
                  <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                    <Select
                      value={newMemberRole}
                      onValueChange={(value: string) => setNewMemberRole(value as TeamRole)}
                    >
                      <SelectTrigger
                        className="h-8 border-0 bg-transparent pr-0 text-right shadow-none focus:ring-0"
                        tabIndex={0}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="member">Member</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {emailError && <p className="text-destructive mt-1 text-xs">{emailError}</p>}
                </div>
                <Button
                  type="button"
                  onClick={addTeamMember}
                  disabled={!newMemberEmail || submitting}
                  className="aspect-square h-9 px-3 sm:h-10"
                  variant="secondary"
                  tabIndex={0}
                >
                  <PlusIcon className="size-4" />
                </Button>
              </div>

              {team.members.length > 0 ? (
                <TeamMemberList
                  members={team.members}
                  currentUserEmail={userEmail}
                  currentUserProfilePicture={profile.picture}
                  onRemove={removeTeamMember}
                  className="mt-1"
                />
              ) : (
                <div className="bg-muted/20 flex flex-col items-center justify-center rounded-lg border border-dashed p-5 text-center">
                  <LightbulbIcon className="text-primary/40 mb-2 size-6" strokeWidth={1.5} />
                  <p className="text-muted-foreground text-sm font-medium">No team members yet</p>
                  <p className="text-muted-foreground/70 mt-1 max-w-52 text-xs">
                    Add members to collaborate with your team
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between">
        <Button
          variant="ghost"
          onClick={onBack}
          size="sm"
          className="text-muted-foreground hover:text-foreground h-9"
          disabled={submitting}
          tabIndex={0}
        >
          <ArrowLeftIcon className="mr-1.5 size-3.5" />
          Back
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!isCompleted || submitting}
          size="lg"
          className="h-10 px-5 shadow-sm"
          tabIndex={0}
        >
          {submitting ? (
            <>
              <svg
                className="mr-2 size-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Creating account...
            </>
          ) : (
            <>
              Complete Setup
              <ChevronRightIcon className="ml-1.5 size-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
