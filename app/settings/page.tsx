import { redirect } from 'next/navigation';
import { auth, signOut } from '@/lib/auth';
import { Header } from '@/components/header';
import { SettingsTabs } from '@/components/settings-tabs';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Configure monitoring targets, intervals, and application preferences',
};

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
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <Header onSignOut={handleSignOut} />
      </div>

      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-muted-foreground">Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage monitoring targets and application configuration
        </p>
      </div>

      <SettingsTabs />
    </div>
  );
}
