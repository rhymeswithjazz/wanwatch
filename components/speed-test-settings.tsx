'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';

export function SpeedTestSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Speed Test Configuration</CardTitle>
        <CardDescription>
          Internet speed testing powered by Ookla Speedtest
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Speed test settings are configured via environment variables. To enable speed
            testing, add the following to your <code className="bg-muted px-1 py-0.5 rounded">.env</code> file:
          </AlertDescription>
        </Alert>

        <div className="bg-muted p-4 rounded-lg font-mono text-sm space-y-2">
          <div>
            <span className="text-muted-foreground"># Enable speed testing</span>
          </div>
          <div>
            <span className="text-primary">ENABLE_SPEED_TEST</span>=true
          </div>
          <div className="mt-4">
            <span className="text-muted-foreground"># Speed test interval (in seconds)</span>
          </div>
          <div>
            <span className="text-muted-foreground"># Default: 1800 (30 minutes)</span>
          </div>
          <div>
            <span className="text-primary">SPEED_TEST_INTERVAL_SECONDS</span>=1800
          </div>
        </div>

        <div className="space-y-2 text-sm text-muted-foreground">
          <h4 className="font-semibold text-foreground">Important Notes:</h4>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Speed tests use the Ookla Speedtest CLI (industry standard)</li>
            <li>First test may take longer as the CLI binary is downloaded</li>
            <li>Tests measure download speed, upload speed, ping, and jitter</li>
            <li>Recommended interval: 30-60 minutes to avoid excessive testing</li>
            <li>Each test takes approximately 30-60 seconds to complete</li>
            <li>Free for personal, non-commercial use only</li>
          </ul>
        </div>

        <div className="pt-4 border-t">
          <h4 className="font-semibold text-sm mb-2">After Changing Settings:</h4>
          <p className="text-sm text-muted-foreground">
            Restart the application for changes to take effect:
          </p>
          <div className="bg-muted p-2 rounded mt-2 font-mono text-xs">
            docker-compose restart
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
