import LogsViewer from '@/components/logs-viewer';
import { Header } from '@/components/header';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'System Logs',
  description: 'View and search system logs',
};

export default async function LogsPage() {
  // Middleware handles auth redirect

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <Header />
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
