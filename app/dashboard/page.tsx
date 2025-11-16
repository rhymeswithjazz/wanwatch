import { signOut } from '@/lib/auth';
import StatsDisplay from '@/components/stats-dashboard';
import { Header } from '@/components/header';
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
      <div className="mb-6">
        <Header onSignOut={handleSignOut} />
      </div>
      <StatsDisplay />
    </div>
  );
}
