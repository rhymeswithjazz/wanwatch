import { auth, signOut } from '@/lib/auth';
import StatsDisplay from '@/components/stats-dashboard';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { Logo } from '@/components/logo';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'View real-time internet connectivity status and outage history',
};

export default async function DashboardPage() {
  // Middleware handles auth redirect - just get session for display
  const session = await auth();

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <Logo className="w-10 h-10 text-primary" />
          <h1 className="text-3xl font-bold">
            WanWatch
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <form
            action={async () => {
              'use server';
              await signOut();
            }}
          >
            <Button
              type="submit"
              variant="destructive"
            >
              Sign Out
            </Button>
          </form>
        </div>
      </div>
      <StatsDisplay />
    </div>
  );
}
