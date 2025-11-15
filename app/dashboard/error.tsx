'use client';

import { Button } from '@/components/ui/button';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="bg-destructive/10 border border-destructive/20 text-destructive p-8 rounded-lg">
        <h2 className="text-2xl font-bold mb-3">Something went wrong!</h2>
        <p className="mb-2 text-destructive/90">
          Unable to load the dashboard. Please try again.
        </p>
        {error.message && (
          <p className="text-sm font-mono bg-destructive/5 p-2 rounded mb-4">
            {error.message}
          </p>
        )}
        <div className="flex gap-3">
          <Button
            onClick={reset}
            variant="destructive"
          >
            Try again
          </Button>
          <Button
            onClick={() => window.location.href = '/'}
            variant="outline"
          >
            Go home
          </Button>
        </div>
      </div>
    </div>
  );
}
