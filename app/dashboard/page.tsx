import { auth, signOut } from '@/lib/auth';
import { redirect } from 'next/navigation';
import StatsDisplay from '@/components/stats-dashboard';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';

export default async function DashboardPage() {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">
          WanWatch
        </h1>
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
