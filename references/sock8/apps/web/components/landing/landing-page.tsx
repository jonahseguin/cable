import AnimatedDivider from '@/components/landing/animated-divider';
import BackgroundEffects from '@/components/landing/background-effects';
import CTASection from '@/components/landing/cta-section';
import FeaturesSection from '@/components/landing/features-section';
import HeroSection from '@/components/landing/hero-section';
import SiteFooter from '@/components/landing/site-footer';
import SiteHeader from '@/components/landing/site-header';
import { TypeSafetySection } from '@/components/landing/type-safety-section';
import WaitlistProvider from '@/components/waitlist/waitlist-provider';

export type LandingPageProps = {
  allowLogin: boolean;
  waitlistEnabled: boolean;
  displayWaitlistCount: boolean;
  displayWailistRecentUsers: boolean;
};

export default function LandingPage({
  allowLogin,
  waitlistEnabled,
  displayWaitlistCount,
  displayWailistRecentUsers,
}: LandingPageProps) {
  return (
    <WaitlistProvider>
      <main
        className="relative flex min-h-screen flex-col overflow-hidden bg-black text-white"
        id="landing-page"
      >
        {/* <TypeSafetyScene /> */}
        <BackgroundEffects />

        <div className="container relative z-10 mx-auto px-4 py-12">
          <SiteHeader allowLogin={allowLogin} />
          <HeroSection
            waitlistEnabled={waitlistEnabled}
            displayWaitlistCount={displayWaitlistCount}
            displayWailistRecentUsers={displayWailistRecentUsers}
          />
          <TypeSafetySection />
          <AnimatedDivider />
          <FeaturesSection />
          <CTASection />
        </div>

        <SiteFooter />
      </main>
    </WaitlistProvider>
  );
}
