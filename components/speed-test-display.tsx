'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, DataTableColumnHeader } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, ArrowDown, ArrowUp, Gauge, Play, Loader2 } from 'lucide-react';
import { ColumnDef } from '@tanstack/react-table';
import { memo, useState } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { useToast } from '@/hooks/use-toast';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

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

// Helper function to sample data for smoother visualization
const sampleData = (data: SpeedTestData[]) => {
  if (data.length <= 20) return data;
  const step = Math.ceil(data.length / 20);
  return data.filter((_, index) => index % step === 0);
};

// Transform history data for charts
const prepareChartData = (history: SpeedTestData[]) => {
  const reversedHistory = [...history].reverse();
  const sampledHistory = sampleData(reversedHistory);

  return sampledHistory.map((test) => ({
    // Store as timestamp number for proper axis handling
    time: new Date(test.timestamp).getTime(),
    download: Number(test.downloadMbps.toFixed(2)),
    upload: Number(test.uploadMbps.toFixed(2)),
    ping: Number(test.pingMs.toFixed(1)),
  }));
};

// Format X-axis tick based on data range
const formatXAxisTick = (timestamp: number, dataRange: number) => {
  const date = new Date(timestamp);
  const oneDayMs = 24 * 60 * 60 * 1000;

  if (dataRange <= oneDayMs) {
    // Less than a day: show time only
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (dataRange <= 7 * oneDayMs) {
    // Less than a week: show day and time
    return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  } else {
    // More than a week: show date
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
};

// Calculate the time range of the data
const getDataRange = (chartData: { time: number }[]) => {
  if (chartData.length < 2) return 0;
  const first = chartData[0];
  const last = chartData[chartData.length - 1];
  if (!first || !last) return 0;
  return last.time - first.time;
};

// Download Only Chart
const DownloadChart = memo(({ history }: { history: SpeedTestData[] }) => {
  const chartData = prepareChartData(history);
  const dataRange = getDataRange(chartData);

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} />
        <XAxis
          dataKey="time"
          type="number"
          domain={['dataMin', 'dataMax']}
          scale="time"
          tickFormatter={(ts) => formatXAxisTick(ts, dataRange)}
          className="text-xs"
          tick={{ fill: 'hsl(var(--muted-foreground))' }}
          height={40}
          minTickGap={50}
        />
        <YAxis
          className="text-xs"
          tick={{ fill: 'hsl(var(--muted-foreground))' }}
          label={{
            value: 'Download (Mbps)',
            angle: -90,
            position: 'insideLeft',
            style: { fill: 'hsl(var(--muted-foreground))' },
          }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
          labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
          labelFormatter={(ts) => new Date(ts).toLocaleString()}
        />
        <Line
          type="monotone"
          dataKey="download"
          stroke="hsl(var(--primary))"
          strokeWidth={3}
          dot={false}
          activeDot={{ r: 5 }}
          name="Download (Mbps)"
        />
      </LineChart>
    </ResponsiveContainer>
  );
});
DownloadChart.displayName = 'DownloadChart';

// Upload Only Chart
const UploadChart = memo(({ history }: { history: SpeedTestData[] }) => {
  const chartData = prepareChartData(history);
  const dataRange = getDataRange(chartData);

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} />
        <XAxis
          dataKey="time"
          type="number"
          domain={['dataMin', 'dataMax']}
          scale="time"
          tickFormatter={(ts) => formatXAxisTick(ts, dataRange)}
          className="text-xs"
          tick={{ fill: 'hsl(var(--muted-foreground))' }}
          height={40}
          minTickGap={50}
        />
        <YAxis
          className="text-xs"
          tick={{ fill: 'hsl(var(--muted-foreground))' }}
          label={{
            value: 'Upload (Mbps)',
            angle: -90,
            position: 'insideLeft',
            style: { fill: 'hsl(var(--muted-foreground))' },
          }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
          labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
          labelFormatter={(ts) => new Date(ts).toLocaleString()}
        />
        <Line
          type="monotone"
          dataKey="upload"
          stroke="hsl(var(--success))"
          strokeWidth={3}
          dot={false}
          activeDot={{ r: 5 }}
          name="Upload (Mbps)"
        />
      </LineChart>
    </ResponsiveContainer>
  );
});
UploadChart.displayName = 'UploadChart';

// Combined Chart with Dual Y-Axis
const CombinedChart = memo(({ history }: { history: SpeedTestData[] }) => {
  const chartData = prepareChartData(history);
  const dataRange = getDataRange(chartData);

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} />
        <XAxis
          dataKey="time"
          type="number"
          domain={['dataMin', 'dataMax']}
          scale="time"
          tickFormatter={(ts) => formatXAxisTick(ts, dataRange)}
          className="text-xs"
          tick={{ fill: 'hsl(var(--muted-foreground))' }}
          height={40}
          minTickGap={50}
        />
        <YAxis
          yAxisId="download"
          className="text-xs"
          tick={{ fill: 'hsl(var(--primary))' }}
          label={{
            value: 'Download (Mbps)',
            angle: -90,
            position: 'insideLeft',
            style: { fill: 'hsl(var(--primary))' },
          }}
        />
        <YAxis
          yAxisId="upload"
          orientation="right"
          className="text-xs"
          tick={{ fill: 'hsl(var(--success))' }}
          label={{
            value: 'Upload (Mbps)',
            angle: 90,
            position: 'insideRight',
            style: { fill: 'hsl(var(--success))' },
          }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
          labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
          labelFormatter={(ts) => new Date(ts).toLocaleString()}
        />
        <Legend
          wrapperStyle={{
            paddingTop: '20px',
          }}
        />
        <Line
          yAxisId="download"
          type="monotone"
          dataKey="download"
          stroke="hsl(var(--primary))"
          strokeWidth={3}
          dot={false}
          activeDot={{ r: 5 }}
          name="Download"
        />
        <Line
          yAxisId="upload"
          type="monotone"
          dataKey="upload"
          stroke="hsl(var(--success))"
          strokeWidth={3}
          dot={false}
          activeDot={{ r: 5 }}
          name="Upload"
        />
      </LineChart>
    </ResponsiveContainer>
  );
});
CombinedChart.displayName = 'CombinedChart';

// Speed Test Chart Component with Tabs
const SpeedTestChart = memo(({ history }: { history: SpeedTestData[] }) => {
  if (history.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        No speed test data available for chart
      </div>
    );
  }

  return (
    <Tabs defaultValue="download" className="w-full">
      <TabsList className="grid w-full max-w-md mx-auto grid-cols-3">
        <TabsTrigger value="download">Download</TabsTrigger>
        <TabsTrigger value="upload">Upload</TabsTrigger>
        <TabsTrigger value="combined">Combined</TabsTrigger>
      </TabsList>
      <TabsContent value="download" className="mt-6">
        <DownloadChart history={history} />
      </TabsContent>
      <TabsContent value="upload" className="mt-6">
        <UploadChart history={history} />
      </TabsContent>
      <TabsContent value="combined" className="mt-6">
        <CombinedChart history={history} />
      </TabsContent>
    </Tabs>
  );
});
SpeedTestChart.displayName = 'SpeedTestChart';

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
      <div className="flex items-center justify-end">
        {/* <div>
          {latest && latest.timestamp && (
            <p className="text-sm text-muted-foreground">
              Last tested: {new Date(latest.timestamp).toLocaleString()}
            </p>
          )}
        </div> */}
        <Button onClick={runSpeedTest} disabled={isRunning} size="sm">
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
          <CardTitle>Speed Trends</CardTitle>
          <CardDescription>Download and upload speeds over time</CardDescription>
        </CardHeader>
        <CardContent>
          <SpeedTestChart history={history} />
        </CardContent>
      </Card>

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
