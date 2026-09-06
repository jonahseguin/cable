import { getUserFromToken, waitlistGithubOAuth } from '@/lib/waitlist/github';
import { db } from '@sock8/db';
import { waitlist } from '@sock8/db/schema';
import { track } from '@vercel/analytics/server';
import { NextRequest } from 'next/server';

/**
 * OAuth callback handler for GitHub authentication
 * Processes the authentication result and adds user to waitlist
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code) {
    return createResponse('Error', 'No authorization code provided', 400);
  }

  try {
    // Exchange code for an access token
    const { authentication } = await waitlistGithubOAuth.createToken({
      code,
      state: state || undefined,
    });

    // Get user information using the token
    const user = await getUserFromToken(authentication.token);

    if (!user?.email) {
      return createResponse('Error', 'No email found in GitHub profile', 400);
    }

    // Add user to waitlist with GitHub info
    await db
      .insert(waitlist)
      .values({
        email: user.email,
        username: user.login,
        avatarUrl: user.avatar_url,
      })
      .onDuplicateKeyUpdate({
        set: {
          email: user.email,
          username: user.login,
          avatarUrl: user.avatar_url,
        },
      });

    await track('waitlist_join', {
      email: user.email,
      username: user.login,
    });

    return createResponse('Success', "You've been added to the sock8 waitlist.", 200, true);
  } catch (error) {
    console.error('Error in waitlist popup callback', error);
    await track('waitlist_join_error');
    return createResponse('Error', 'Authentication failed', 500);
  }
}

/**
 * Create a response HTML page for the popup
 */
function createResponse(title: string, message: string, status: number, isSuccess = false) {
  const successScript = isSuccess
    ? `
      try {
        window.opener.postMessage({ type: 'waitlist-success' }, '*');
      } catch (e) {
        console.error("Error sending message", e);
      }
    `
    : '';

  return new Response(
    `
    <html>
      <head>
        <title>${title}</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            background-color: #111;
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
          }
          .container {
            text-align: center;
            padding: 2rem;
            border-radius: 0.5rem;
            border: 1px solid ${isSuccess ? 'rgba(0, 128, 96, 0.3)' : 'rgba(255, 0, 0, 0.2)'};
            background-color: rgba(0, 0, 0, 0.5);
            max-width: 90%;
            width: 400px;
          }
          h2 {
            color: ${isSuccess ? '#00a67d' : '#ff3333'};
            margin-top: 0;
          }
          p {
            margin-bottom: 1.5rem;
          }
          .footnote {
            opacity: 0.7;
            font-size: 0.9rem;
          }
        </style>
        <script>
          ${successScript}
          // Close window after a short delay
          setTimeout(() => window.close(), 1500);
        </script>
      </head>
      <body>
        <div class="container">
          <h2>${title}</h2>
          <p>${message}</p>
          <p class="footnote">This window will close automatically.</p>
        </div>
      </body>
    </html>
    `,
    {
      status,
      headers: {
        'Content-Type': 'text/html',
      },
    },
  );
}
