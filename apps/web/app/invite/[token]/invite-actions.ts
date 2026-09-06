'use server';

import { auth } from '@[removed]/auth';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

interface ActionResult {
  success: boolean;
  error?: string | null;
  redirectTo?: string;
}

export async function acceptInvitationAction(
  invitationId: string,
  token: string,
): Promise<ActionResult> {
  try {
    const authHeaders = await headers();
    await auth.api.acceptInvitation({
      body: { invitationId },
      headers: authHeaders,
    });
    revalidatePath(`/invite/${token}`);
    revalidatePath('/dashboard');
    return { success: true, redirectTo: '/dashboard' };
  } catch (error) {
    console.error('Failed to accept invitation:', error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to accept invitation. Please try again.',
    };
  }
}

export async function rejectInvitationAction(
  invitationId: string,
  token: string,
): Promise<ActionResult> {
  try {
    const authHeaders = await headers();
    await auth.api.rejectInvitation({
      body: { invitationId },
      headers: authHeaders,
    });
    revalidatePath(`/invite/${token}`);
    return { success: true, redirectTo: '/' };
  } catch (error) {
    console.error('Failed to decline invitation:', error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to decline invitation. Please try again.',
    };
  }
}
