'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, DataTableColumnHeader } from '@/components/ui/data-table';
import { Activity, ArrowDown, ArrowUp, Gauge } from 'lucide-react';
import { ColumnDef } from '@tanstack/react-table';
import { memo } from 'react';
import useSWR from 'swr';

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
  const {
    data: speedTestData,
    error,
    isLoading,
  } = useSWR<SpeedTestResponse>('/api/speedtest', fetcher, {
    refreshInterval: 60000, // 60s polling
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 10000,
    onError: (err) => console.error('Speed test fetch error:', err),
  });

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
      <SpeedTestCards latest={latest} averages={averages} />

      {latest && latest.timestamp && (
        <Card>
          <CardHeader>
            <CardDescription className="text-xs text-muted-foreground">
              Last tested: {new Date(latest.timestamp).toLocaleString()}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

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
