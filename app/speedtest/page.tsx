import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Header } from '@/components/header';
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

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Standard Header Section */}
      <div className="mb-6">
        <Header />
      </div>

      {/* Standard Page Title Section */}
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-muted-foreground">
          Speed Tests
        </h2>
      </div>

      {/* Page Content */}
      <SpeedTestDisplay />
    </div>
  );
}
