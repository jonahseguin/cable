'use client';

import {
  acceptInvitationAction,
  rejectInvitationAction,
} from '@/app/invite/[token]/invite-actions';
import type { Invitation } from '@/app/invite/[token]/page';
import { authClient } from '@sock8/auth/client';
import { Button } from '@sock8/ui/components/button';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import GitHubLoginButton from '../auth/github-login-button';

type Session = ReturnType<typeof authClient.useSession>['data'];

interface InviteFlowHandlerProps {
  invitation: Invitation | null;
  session: Session;
  token: string;
}

export default function InviteFlowHandler({ invitation, session, token }: InviteFlowHandlerProps) {
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleAccept = async () => {
    if (!invitation) return;
    setIsProcessing(true);
    setError(null);

    startTransition(async () => {
      const result = await acceptInvitationAction(invitation.id, token);
      if (result.success && result.redirectTo) {
        router.push(result.redirectTo);
      } else if (result.error) {
        setError(result.error);
      }
      setIsProcessing(false);
    });
  };

  const handleDecline = async () => {
    if (!invitation) return;
    setIsProcessing(true);
    setError(null);

    startTransition(async () => {
      const result = await rejectInvitationAction(invitation.id, token);
      if (result.success && result.redirectTo) {
        router.push(result.redirectTo);
      } else if (result.error) {
        setError(result.error);
      }
      setIsProcessing(false);
    });
  };

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
      router.push('/');
      router.refresh();
    } catch (signOutError) {
      console.error('Sign out error:', signOutError);
      setError('Failed to sign out. Please try again.');
    }
  };

  if (!invitation) {
    return (
      <div className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center">
        <div className="bg-card max-w-md rounded-lg p-8 text-center shadow-xl">
          <h1 className="text-destructive mb-4 text-2xl font-semibold">Invalid Invitation</h1>
          <p className="text-muted-foreground">
            This invitation link is invalid or has expired. Please check the link or contact the
            person who invited you.
          </p>
          <Button onClick={() => router.push('/')} className="mt-6">
            Go to Homepage
          </Button>
        </div>
      </div>
    );
  }

  const inviteEmail = invitation.email?.toLowerCase();
  const sessionEmail = session?.user?.email?.toLowerCase();

  if (!session) {
    return (
      <div className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center">
        <div className="bg-card max-w-md rounded-lg p-8 text-center shadow-xl">
          <h1 className="mb-2 text-2xl font-semibold">You&apos;ve been invited!</h1>
          {invitation.organizationName && (
            <p className="text-muted-foreground mb-1">
              to join{' '}
              <span className="text-foreground font-semibold">{invitation.organizationName}</span>
            </p>
          )}
          {inviteEmail && (
            <p className="text-muted-foreground mb-4">
              This invitation was sent to{' '}
              <span className="text-foreground font-semibold">{inviteEmail}</span>.
            </p>
          )}
          <p className="mb-6">Please log in to accept or decline this invitation.</p>
          <GitHubLoginButton
            callbackURL={`/invite/${token}`}
            errorCallbackURL={`/invite/${token}?error=login_failed`}
            buttonText="Login with GitHub to Respond"
          />
        </div>
      </div>
    );
  }

  if (inviteEmail && sessionEmail !== inviteEmail) {
    return (
      <div className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center">
        <div className="bg-card max-w-md rounded-lg p-8 text-center shadow-xl">
          <h1 className="text-warning mb-4 text-2xl font-semibold">Email Mismatch</h1>
          <p className="text-muted-foreground mb-1">
            This invitation was sent to{' '}
            <span className="text-foreground font-semibold">{inviteEmail}</span>.
          </p>
          <p className="text-muted-foreground mb-4">
            You are currently logged in as{' '}
            <span className="text-foreground font-semibold">{sessionEmail}</span>.
          </p>
          <p className="mb-6">
            Please log in with the correct GitHub account to respond to this invitation.
          </p>
          <GitHubLoginButton
            callbackURL={`/invite/${token}`}
            errorCallbackURL={`/invite/${token}?error=login_failed`}
            buttonText="Login with a Different Account"
          />
          <Button variant="link" onClick={handleSignOut} className="mt-2 text-xs">
            Logout ({sessionEmail})
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center">
      <div className="bg-card max-w-md rounded-lg p-8 text-center shadow-xl">
        <h1 className="mb-2 text-2xl font-semibold">You&apos;re Invited!</h1>
        {invitation.organizationName && (
          <p className="text-muted-foreground mb-4">
            You have been invited to join{' '}
            <span className="text-foreground font-semibold">{invitation.organizationName}</span>.
          </p>
        )}
        {!invitation.organizationName && (
          <p className="text-muted-foreground mb-4">You have an invitation pending.</p>
        )}
        {inviteEmail && (
          <p className="text-muted-foreground mb-1 text-sm">
            This invitation is for{' '}
            <span className="text-foreground font-semibold">{inviteEmail}</span>.
          </p>
        )}
        {session?.user?.email && (
          <p className="text-muted-foreground mb-6 text-sm">
            You are logged in as{' '}
            <span className="text-foreground font-semibold">{session.user.email}</span>.
          </p>
        )}

        {error && <p className="text-destructive mb-4">{error}</p>}

        <div className="flex justify-center gap-4">
          <Button
            onClick={handleAccept}
            disabled={isProcessing || isPending}
            className="bg-green-500 text-white hover:bg-green-600"
          >
            {isProcessing || isPending ? 'Accepting...' : 'Accept Invitation'}
          </Button>
          <Button onClick={handleDecline} disabled={isProcessing || isPending} variant="outline">
            {isProcessing || isPending ? 'Declining...' : 'Decline Invitation'}
          </Button>
        </div>
      </div>
    </div>
  );
}
