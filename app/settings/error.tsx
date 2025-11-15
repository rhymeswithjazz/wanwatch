'use client';

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="bg-destructive/10 border border-destructive/20 text-destructive p-8 rounded-lg">
        <h2 className="text-2xl font-bold mb-3">Failed to load settings</h2>
        <p className="mb-2 text-destructive/90">
          Unable to load application settings. Please try again.
        </p>
        {error.message && (
          <p className="text-sm font-mono bg-destructive/5 p-2 rounded mb-4">
            {error.message}
          </p>
        )}
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="px-4 py-2 bg-destructive text-white rounded-md hover:bg-destructive/90"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.href = '/dashboard'}
            className="px-4 py-2 bg-muted text-foreground rounded-md hover:bg-muted/80"
          >
            Go to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
