import LandingPage from '@/components/landing/landing-page';
import {
  allowLoginFlag,
  displayWailistRecentUsersFlag,
  displayWaitlistCountFlag,
  precomputeFlags,
  waitlistEnabledFlag,
} from '@/lib/flags';
import { generatePermutations } from 'flags/next';

export async function generateStaticParams() {
  const codes = await generatePermutations(precomputeFlags);
  return codes.map((code) => ({ code }));
}

type Params = Promise<{ code: string }>;

export default async function HomePage({ params }: { params: Params }) {
  const { code } = await params;

  const allowLogin = await allowLoginFlag(code, precomputeFlags);
  const waitlistEnabled = await waitlistEnabledFlag(code, precomputeFlags);
  const displayWaitlistCount = await displayWaitlistCountFlag(code, precomputeFlags);
  const displayWailistRecentUsers = await displayWailistRecentUsersFlag(code, precomputeFlags);

  return (
    <LandingPage
      allowLogin={allowLogin}
      waitlistEnabled={waitlistEnabled}
      displayWaitlistCount={displayWaitlistCount}
      displayWailistRecentUsers={displayWailistRecentUsers}
    />
  );
}
