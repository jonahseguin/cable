'use client';

import { useState } from 'react';
import { Button } from '@[removed]/ui/components/button';
import { Input } from '@[removed]/ui/components/input';
import { ArrowRight } from 'lucide-react';
import { HomeGithubJoinButton } from './home-github-join-button';

export function SignupForm() {
  const [email, setEmail] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);

  return (
    <div className="animate-in fade-in slide-in-from-top-4 mt-10 flex flex-col items-center gap-3">
      <div className="flex flex-col items-center">
        <HomeGithubJoinButton />
      </div>

      {/*
      {showEmailForm ? (
        <div className="w-full max-w-md">
          <div className="flex flex-col gap-2">
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              type="email"
              className="h-10 w-full"
            />
            <Button variant="outline" className="w-full">
              Join Waitlist
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowEmailForm(true)}
          className="text-foreground/60 hover:text-foreground text-sm underline transition-colors"
        >
          Or join with email instead
        </button>
      )}
      */}
    </div>
  );
}
