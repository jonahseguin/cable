'use client';

import { useEffect, useRef } from 'react';
import { ChevronRightIcon, ClockIcon, BellIcon } from 'lucide-react';
import { Button } from '@[removed]/ui/components/button';
import { Input } from '@[removed]/ui/components/input';
import { Switch } from '@[removed]/ui/components/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@[removed]/ui/components';
import { StepProps, ProfileData } from '../types';
import { SUPPORTED_TIMEZONES } from '@/lib/utils/timezone';

interface ProfileStepProps extends StepProps {
  /**
   * Profile data
   */
  profile: ProfileData;

  /**
   * Set profile data
   */
  setProfile: React.Dispatch<React.SetStateAction<ProfileData>>;
}

/**
 * Profile step component for onboarding
 */
export function ProfileStep({
  profile,
  setProfile,
  onNext,
  onBack,
  className = '',
}: ProfileStepProps) {
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the name input on mount if it's empty
  useEffect(() => {
    if (nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, []);

  const isCompleted = !!profile.name;

  return (
    <div className={`mx-auto max-w-xl ${className}`}>
      <div className="mb-6">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Tell us about yourself</h1>
        <p className="text-muted-foreground/90 text-sm">
          Help us personalize your experience and make collaboration easier
        </p>
      </div>

      <div className="bg-card/40 mb-8 overflow-hidden rounded-xl border shadow-sm backdrop-blur-sm">
        <div className="flex flex-col gap-6 p-5 sm:p-6">
          {/* Name and Job Title Row */}
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="full-name" className="mb-1.5 block text-sm font-medium">
                Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="full-name"
                placeholder="Your name (e.g. John Smith)"
                value={profile.name}
                onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))}
                className="h-9 sm:h-10"
                required
                ref={nameInputRef}
                tabIndex={0}
              />
            </div>

            <div>
              <label htmlFor="job-title" className="mb-1.5 block text-sm font-medium">
                Job Title
              </label>
              <Input
                id="job-title"
                placeholder="Software Engineer, Designer, etc."
                value={profile.jobTitle || ''}
                onChange={(e) => setProfile((prev) => ({ ...prev, jobTitle: e.target.value }))}
                className="h-9 sm:h-10"
                tabIndex={0}
              />
            </div>
          </div>

          {/* Preferences Section */}
          <div className="border-border/50 border-t pt-5">
            <div className="space-y-5">
              {/* Timezone Section */}
              <div className="bg-card/60 border-border rounded-lg border p-4">
                <div className="flex gap-3">
                  <div className="bg-primary/10 flex size-8 flex-shrink-0 items-center justify-center rounded-full">
                    <ClockIcon className="text-primary size-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-4">
                      <label htmlFor="timezone" className="whitespace-nowrap text-sm font-medium">
                        Timezone
                      </label>
                      <Select
                        value={profile.timezone}
                        onValueChange={(value: string) =>
                          setProfile((prev) => ({ ...prev, timezone: value }))
                        }
                      >
                        <SelectTrigger className="h-9 sm:h-10" tabIndex={0}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-[240px]" position="popper">
                          {SUPPORTED_TIMEZONES.map((timezone) => (
                            <SelectItem key={timezone.value} value={timezone.value}>
                              {timezone.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notifications Section */}
              <div className="bg-card/60 border-border rounded-lg border p-4">
                <div className="flex gap-3">
                  <div className="bg-primary/10 flex size-8 flex-shrink-0 items-center justify-center rounded-full">
                    <BellIcon className="text-primary size-4" />
                  </div>
                  <div className="flex-1">
                    <div className="mb-1.5 flex items-center justify-between">
                      <label htmlFor="notifications" className="text-sm font-medium">
                        Email Notifications
                      </label>
                      <Switch
                        id="notifications"
                        checked={profile.notificationsEnabled}
                        onCheckedChange={(checked) =>
                          setProfile((prev) => ({ ...prev, notificationsEnabled: checked }))
                        }
                        tabIndex={0}
                      />
                    </div>
                    <p className="text-muted-foreground text-xs">Get updates about your account</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={onNext}
          disabled={!isCompleted}
          size="lg"
          className="h-10 px-5 shadow-sm"
          tabIndex={0}
        >
          Continue
          <ChevronRightIcon className="ml-1.5 size-4" />
        </Button>
      </div>
    </div>
  );
}
