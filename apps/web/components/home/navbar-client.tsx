'use client';

import LoginButton from '@/components/landing/login-button';

export function NavbarClient({ allowLogin }: { allowLogin: boolean }) {
  // const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-6">
        {allowLogin && <LoginButton enabled={allowLogin} />}
        {/* <Button variant="default" size="sm" className="hidden md:inline-flex">
          Get Started
        </Button> */}
        {/* <button
          className="text-foreground/60 hover:text-foreground md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button> */}
      </div>

      {/* Mobile menu */}
      {/* {mobileMenuOpen && (
        <div className="bg-background/95 animate-in slide-in-from-top-2 md:hidden">
          <div className="space-y-1 px-6 pb-4 pt-3">
            <Link href="/features" className="block py-2 text-base font-medium">
              Features
            </Link>
            <Link href="/docs" className="block py-2 text-base font-medium">
              Documentation
            </Link>
            <Link href="/pricing" className="block py-2 text-base font-medium">
              Pricing
            </Link>
            <Link href="/blog" className="block py-2 text-base font-medium">
              Blog
            </Link>
            <Link href="/login" className="block py-2 text-base font-medium">
              Sign in
            </Link>
            <Button className="mt-4 w-full">Get Started</Button>
          </div>
        </div>
      )} */}
    </>
  );
}
