import { signOut } from '@/lib/auth';
import StatsDisplay from '@/components/stats-dashboard';
import { ThemeToggle } from '@/components/theme-toggle';
import { Logo } from '@/components/logo';
import { NavMenu } from '@/components/nav-menu';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'View real-time internet connectivity status and outage history',
};

export default async function DashboardPage() {
  // Middleware handles auth redirect

  const handleSignOut = async () => {
    'use server';
    await signOut();
  };

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
          <NavMenu onSignOut={handleSignOut} />
        </div>
      </div>
      <StatsDisplay />
    </div>
  );
}
