import { OAuthApp } from '@octokit/oauth-app';

// Create a singleton instance of the Octokit OAuth App for waitlist
export const waitlistGithubOAuth = new OAuthApp({
  clientId: process.env.WAITLIST_GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID || '',
  clientSecret: process.env.WAITLIST_GITHUB_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET || '',
});

// Helper function to get user information from an access token
export async function getUserFromToken(token: string) {
  try {
    const octokit = await waitlistGithubOAuth.getUserOctokit({
      token,
      scopes: ['user:email'],
    });

    const { data } = await octokit.request('GET /user');
    const emails = await octokit.request('GET /user/emails');

    // Find the primary email, or use the first one if no primary is found
    const primaryEmail = emails.data.find((email) => email.primary)?.email || emails.data[0]?.email;

    return {
      name: data.name,
      login: data.login,
      email: primaryEmail,
      avatar_url: data.avatar_url,
    };
  } catch (error) {
    console.error('Error fetching user information:', error);
    throw error;
  }
}
