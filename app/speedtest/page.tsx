import { auth, signOut } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Header } from '@/components/header';
import { NavMenu } from '@/components/nav-menu';
import { ThemeToggle } from '@/components/theme-toggle';
import SpeedTestDisplay from '@/components/speed-test-display';

export const metadata = {
  title: 'Speed Tests - WanWatch',
  description: 'View internet speed test results and history',
};

export default async function SpeedTestPage() {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  const handleSignOut = async () => {
    'use server';
    await signOut();
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <Header />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <NavMenu onSignOut={handleSignOut} />
        </div>
      </div>

      <main className="flex-1 px-6 py-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Speed Tests</h2>
            <p className="text-muted-foreground">
              Monitor your internet connection speed over time
            </p>
          </div>

          <SpeedTestDisplay />
        </div>
      </main>
    </div>
  );
}
