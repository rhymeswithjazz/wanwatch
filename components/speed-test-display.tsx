'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, DataTableColumnHeader } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Activity, ArrowDown, ArrowUp, Gauge, Play, Loader2 } from 'lucide-react';
import { ColumnDef } from '@tanstack/react-table';
import { memo, useState } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { useToast } from '@/hooks/use-toast';

interface SpeedTestData {
  id: number;
  timestamp: Date;
  downloadMbps: number;
  uploadMbps: number;
  pingMs: number;
  jitterMs?: number;
  serverName?: string;
  serverCountry?: string;
}

interface SpeedTestResponse {
  latest: SpeedTestData | null;
  history: SpeedTestData[];
  averages: {
    downloadMbps: number;
    uploadMbps: number;
    pingMs: number;
  };
}

const fetcher = (url: string) =>
  fetch(url, { credentials: 'include' }).then((res) => {
    if (!res.ok) throw new Error('Failed to fetch');
    return res.json();
  });

const formatSpeed = (mbps: number) => {
  return `${mbps.toFixed(2)} Mbps`;
};

const formatPing = (ms: number) => {
  return `${ms.toFixed(1)} ms`;
};

// Speed Test Stats Cards
const SpeedTestCards = memo(
  ({
    latest,
    averages,
  }: {
    latest: SpeedTestData | null;
    averages: { downloadMbps: number; uploadMbps: number; pingMs: number };
  }) => {
    if (!latest) {
      return (
        <Card>
          <CardHeader>
            <CardDescription>No speed test data available</CardDescription>
            <CardTitle className="text-muted-foreground">
              Enable speed testing in your environment configuration
            </CardTitle>
          </CardHeader>
        </Card>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <ArrowDown className="h-4 w-4" />
              Download Speed
            </CardDescription>
            <CardTitle className="text-2xl">{formatSpeed(latest.downloadMbps)}</CardTitle>
            <CardDescription className="text-xs">
              Avg: {formatSpeed(averages.downloadMbps)}
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <ArrowUp className="h-4 w-4" />
              Upload Speed
            </CardDescription>
            <CardTitle className="text-2xl">{formatSpeed(latest.uploadMbps)}</CardTitle>
            <CardDescription className="text-xs">
              Avg: {formatSpeed(averages.uploadMbps)}
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Gauge className="h-4 w-4" />
              Ping
            </CardDescription>
            <CardTitle className="text-2xl">{formatPing(latest.pingMs)}</CardTitle>
            <CardDescription className="text-xs">
              Avg: {formatPing(averages.pingMs)}
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Jitter
            </CardDescription>
            <CardTitle className="text-2xl">
              {latest.jitterMs ? formatPing(latest.jitterMs) : 'N/A'}
            </CardTitle>
            <CardDescription className="text-xs">
              {latest.serverName && latest.serverCountry
                ? `${latest.serverName}, ${latest.serverCountry}`
                : 'Server info unavailable'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
);
SpeedTestCards.displayName = 'SpeedTestCards';

// Define column definitions
const speedTestColumns: ColumnDef<SpeedTestData>[] = [
  {
    accessorKey: 'timestamp',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date & Time" />,
    cell: ({ row }) => {
      const date = new Date(row.getValue('timestamp'));
      return date.toLocaleString();
    },
  },
  {
    accessorKey: 'downloadMbps',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Download" />,
    cell: ({ row }) => formatSpeed(row.getValue('downloadMbps')),
  },
  {
    accessorKey: 'uploadMbps',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Upload" />,
    cell: ({ row }) => formatSpeed(row.getValue('uploadMbps')),
  },
  {
    accessorKey: 'pingMs',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Ping" />,
    cell: ({ row }) => formatPing(row.getValue('pingMs')),
  },
  {
    accessorKey: 'serverName',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Server" />,
    cell: ({ row }) => {
      const serverName = row.getValue('serverName') as string | undefined;
      const serverCountry = row.original.serverCountry;
      if (!serverName) return 'N/A';
      return serverCountry ? `${serverName}, ${serverCountry}` : serverName;
    },
  },
];

const SpeedTestHistoryTable = memo(({ history }: { history: SpeedTestData[] }) => {
  if (history.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">No speed tests recorded</div>
    );
  }

  return (
    <DataTable
      columns={speedTestColumns}
      data={history}
      searchKey="timestamp"
      searchPlaceholder="Search by date..."
    />
  );
});
SpeedTestHistoryTable.displayName = 'SpeedTestHistoryTable';

export default function SpeedTestDisplay() {
  const [isRunning, setIsRunning] = useState(false);
  const { toast } = useToast();

  const {
    data: speedTestData,
    error,
    isLoading,
    mutate,
  } = useSWR<SpeedTestResponse>('/api/speedtest', fetcher, {
    refreshInterval: 60000, // 60s polling
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 10000,
    onError: (err) => console.error('Speed test fetch error:', err),
  });

  const runSpeedTest = async () => {
    setIsRunning(true);
    toast({
      title: 'Speed test started',
      description: 'This may take 30-60 seconds...',
    });

    try {
      const response = await fetch('/api/speedtest/run', {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();

        // Handle rate limiting specifically
        if (response.status === 429) {
          throw new Error(errorData.error || 'Rate limit exceeded');
        }

        throw new Error(errorData.error || 'Speed test failed');
      }

      const result = await response.json();

      toast({
        title: 'Speed test completed!',
        description: `Download: ${result.result.downloadMbps.toFixed(2)} Mbps, Upload: ${result.result.uploadMbps.toFixed(2)} Mbps`,
      });

      // Refresh the speed test page data
      mutate();

      // Also refresh the dashboard stats so the latest speed shows there immediately
      globalMutate('/api/stats');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Speed test failed',
        description: error instanceof Error ? error.message : 'Failed to run speed test',
      });
    } finally {
      setIsRunning(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Speed Tests</CardTitle>
            <CardDescription>Loading speed test data...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Speed Tests</CardTitle>
            <CardDescription className="text-destructive">
              Failed to load speed test data
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { latest, history, averages } = speedTestData || {
    latest: null,
    history: [],
    averages: { downloadMbps: 0, uploadMbps: 0, pingMs: 0 },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          {latest && latest.timestamp && (
            <p className="text-sm text-muted-foreground">
              Last tested: {new Date(latest.timestamp).toLocaleString()}
            </p>
          )}
        </div>
        <Button onClick={runSpeedTest} disabled={isRunning} size="lg">
          {isRunning ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Running Test...
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              Run Speed Test Now
            </>
          )}
        </Button>
      </div>

      <SpeedTestCards latest={latest} averages={averages} />

      <Card>
        <CardHeader>
          <CardTitle>Speed Test History</CardTitle>
          <CardDescription>Last {history.length} speed tests</CardDescription>
        </CardHeader>
        <CardContent>
          <SpeedTestHistoryTable history={history} />
        </CardContent>
      </Card>
    </div>
  );
}
