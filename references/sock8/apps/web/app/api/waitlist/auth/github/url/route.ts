import { waitlistGithubOAuth } from '@/lib/waitlist/github';
import { track } from '@vercel/analytics/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { redirectUri } = await request.json();

    if (!redirectUri) {
      return NextResponse.json({ error: 'No redirect URI provided' }, { status: 400 });
    }

    const clientId = process.env.WAITLIST_GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID;
    const clientSecret =
      process.env.WAITLIST_GITHUB_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'GitHub OAuth credentials not configured' },
        { status: 500 },
      );
    }

    await track('waitlist_join_init');

    // Generate the authorization URL using Octokit OAuth App
    const url = waitlistGithubOAuth.getWebFlowAuthorizationUrl({
      redirectUrl: redirectUri,
      scopes: ['user:email'],
    }).url;

    return NextResponse.json({ url });
  } catch (error) {
    console.error('Error generating GitHub authorization URL:', error);
    return NextResponse.json({ error: 'Failed to generate authorization URL' }, { status: 500 });
  }
}
