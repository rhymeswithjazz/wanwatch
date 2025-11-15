import { redirect } from 'next/navigation';
import { auth, signOut } from '@/lib/auth';
import { Header } from '@/components/header';
import { NavMenu } from '@/components/nav-menu';
import { ThemeToggle } from '@/components/theme-toggle';
import TargetsManager from '@/components/targets-manager';
import { ThemeSelector } from '@/components/theme-selector';

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const handleSignOut = async () => {
    'use server';
    await signOut();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="flex justify-between items-center mb-6">
          <Header />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <NavMenu onSignOut={handleSignOut} />
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-semibold">Settings</h2>
          <p className="text-muted-foreground mt-1">
            Manage monitoring targets and application configuration
          </p>
        </div>

        <div className="space-y-6">
          <ThemeSelector />
          <TargetsManager />
        </div>
      </div>
    </div>
  );
}
