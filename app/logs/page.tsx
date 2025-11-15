import { signOut } from '@/lib/auth';
import LogsViewer from '@/components/logs-viewer';
import { ThemeToggle } from '@/components/theme-toggle';
import { Header } from '@/components/header';
import { NavMenu } from '@/components/nav-menu';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'System Logs',
  description: 'View and search system logs',
};

export default async function LogsPage() {
  // Middleware handles auth redirect

  const handleSignOut = async () => {
    'use server';
    await signOut();
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex justify-between items-center mb-6">
        <Header />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <NavMenu onSignOut={handleSignOut} />
        </div>
      </div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-muted-foreground">
          System Logs
        </h2>
      </div>
      <LogsViewer />
    </div>
  );
}
