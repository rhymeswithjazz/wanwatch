import { signOut } from '@/lib/auth';
import LogsViewer from '@/components/logs-viewer';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { Logo } from '@/components/logo';
import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'System Logs',
  description: 'View and search system logs',
};

export default async function LogsPage() {
  // Middleware handles auth redirect
  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <Logo className="w-10 h-10 text-primary" />
          <h1 className="text-3xl font-bold">
            System Logs
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard">
            <Button variant="outline">Dashboard</Button>
          </Link>
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
      <LogsViewer />
    </div>
  );
}
