'use client';

import { ReactNode, useEffect } from 'react';
import { OnboardingStep } from './types';
import { CommandIcon } from 'lucide-react';

interface OnboardingLayoutProps {
  /**
   * Current step
   */
  currentStep: OnboardingStep;

  /**
   * Progress percentage (0-100)
   */
  progress: number;

  /**
   * Handler for keyboard navigation
   */
  onKeyboardNavigation?: (direction: 'next' | 'previous') => void;

  /**
   * Children to render
   */
  children: ReactNode;
}

/**
 * Onboarding layout component with progress bar and keyboard shortcuts
 */
export function OnboardingLayout({
  currentStep,
  progress,
  onKeyboardNavigation,
  children,
}: OnboardingLayoutProps) {
  // Set up keyboard event listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!onKeyboardNavigation) return;

      // Alt + arrow keys for navigation
      if (e.altKey) {
        if (e.key === 'ArrowRight') {
          onKeyboardNavigation('next');
          e.preventDefault();
        } else if (e.key === 'ArrowLeft') {
          onKeyboardNavigation('previous');
          e.preventDefault();
        }
      }

      // Ctrl + Enter for next step
      if (e.ctrlKey && e.key === 'Enter') {
        onKeyboardNavigation('next');
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onKeyboardNavigation]);

  const getStepName = (step: OnboardingStep): string => {
    switch (step) {
      case 'profile':
        return 'Profile';
      case 'team':
        return 'Team';
      default:
        return '';
    }
  };

  const steps: OnboardingStep[] = ['profile', 'team'];

  return (
    <div className="bg-background/30 relative flex min-h-screen flex-col">
      {/* Progress Bar */}
      <div className="bg-muted/40 fixed left-0 right-0 top-0 z-50 h-1">
        <div
          className="bg-primary h-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      {/* Logo & Progress Steps */}
      <header className="container mx-auto max-w-screen-xl px-6 pt-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="bg-primary flex size-8 items-center justify-center rounded-lg">
              <CommandIcon className="text-primary-foreground size-4" />
            </div>
            <span className="text-lg font-medium tracking-tight">[removed]</span>
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            {steps.map((step, index) => {
              const isActive = currentStep === step;
              const isPast = steps.indexOf(currentStep) > index;

              return (
                <div key={step} className="flex items-center">
                  {index > 0 && (
                    <div className={`mx-1 h-px w-8 ${isPast ? 'bg-primary' : 'bg-border'}`} />
                  )}
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium
                      ${
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : isPast
                            ? 'bg-primary/10 text-primary border-primary/30 border'
                            : 'bg-muted/60 text-muted-foreground'
                      }`}
                  >
                    {index + 1}
                  </div>
                  <span
                    className={`ml-1.5 hidden text-xs font-medium md:inline-block
                      ${
                        isActive
                          ? 'text-foreground'
                          : isPast
                            ? 'text-primary/70'
                            : 'text-muted-foreground'
                      }`}
                  >
                    {getStepName(step)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Keyboard shortcuts indicator */}
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <kbd className="border-border/60 bg-muted/30 inline-flex min-w-5 items-center justify-center rounded-md border px-1.5 py-0.5">
              <span className="tracking-tight">⌥</span>←
            </kbd>
            <kbd className="border-border/60 bg-muted/30 inline-flex min-w-5 items-center justify-center rounded-md border px-1.5 py-0.5">
              <span className="tracking-tight">⌥</span>→
            </kbd>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-screen-xl flex-1 px-6 pb-12 pt-10">{children}</main>
    </div>
  );
}
