'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, DataTableColumnHeader } from '@/components/ui/data-table';
import { ChartDataPoint, NetworkInfo, Outage, Stats, TimePeriod } from '@/types/dashboard';
import { ColumnDef } from '@tanstack/react-table';
import { memo, useCallback, useState, useTransition } from 'react';
import useSWR from 'swr';

// Fetcher function for SWR
const fetcher = (url: string) => fetch(url, { credentials: 'include' })
  .then(res => {
    if (!res.ok) throw new Error('Failed to fetch');
    return res.json();
  });

// Helper function for formatting duration
const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

// Memoized StatusCards component - only re-renders when stats values change
const StatusCards = memo(({
  activeOutage,
  totalOutages,
  totalDowntimeSec,
  avgOutageDurationSec
}: {
  activeOutage: Outage | null;
  totalOutages: number;
  totalDowntimeSec: number;
  avgOutageDurationSec: number;
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Status</CardDescription>
          <CardTitle className={activeOutage ? 'text-destructive' : 'text-success'}>
            {activeOutage ? 'OFFLINE' : 'ONLINE'}
          </CardTitle>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Total Outages</CardDescription>
          <CardTitle>{totalOutages}</CardTitle>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Total Downtime</CardDescription>
          <CardTitle>{formatDuration(totalDowntimeSec)}</CardTitle>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Avg Outage</CardDescription>
          <CardTitle>{formatDuration(avgOutageDurationSec)}</CardTitle>
        </CardHeader>
      </Card>
    </div>
  );
});
StatusCards.displayName = 'StatusCards';

// Memoized NetworkInfo component - only re-renders when network info changes
const NetworkInfoDisplay = memo(({ networkInfo }: { networkInfo: NetworkInfo | null }) => {
  if (!networkInfo) return null;

  return (
    <div className="text-sm mt-2 space-y-0.5">
      <div>
        <span className="text-foreground font-bold">IP:</span>{' '}
        <span className="text-muted-foreground">{networkInfo.ipv4}</span>
      </div>
      <div>
        <span className="text-foreground font-bold">Location:</span>{' '}
        <span className="text-muted-foreground">{networkInfo.city}, {networkInfo.region}</span>
      </div>
      <div>
        <span className="text-foreground font-bold">Provider:</span>{' '}
        <span className="text-muted-foreground">{networkInfo.isp}</span>
      </div>
    </div>
  );
});
NetworkInfoDisplay.displayName = 'NetworkInfoDisplay';

// Memoized TimePeriodButtons component - only re-renders when selected period changes
const TimePeriodButtons = memo(({
  timePeriod,
  isPending,
  onPeriodChange
}: {
  timePeriod: TimePeriod;
  isPending: boolean;
  onPeriodChange: (period: TimePeriod) => void;
}) => {
  const timePeriodLabels: Record<TimePeriod, string> = {
    '5m': '5 Min',
    '15m': '15 Min',
    '1h': '1 Hour',
    '6h': '6 Hours',
    '24h': '24 Hours',
    'all': 'All'
  };

  return (
    <div className="flex flex-wrap gap-2">
      {(['5m', '15m', '1h', '6h', '24h', 'all'] as TimePeriod[]).map(period => (
        <Button
          key={period}
          onClick={() => onPeriodChange(period)}
          disabled={isPending}
          variant={timePeriod === period ? 'default' : 'outline'}
          className={timePeriod === period ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''}
          size="sm"
        >
          {timePeriodLabels[period]}
        </Button>
      ))}
    </div>
  );
});
TimePeriodButtons.displayName = 'TimePeriodButtons';

// Memoized TimelineChart component - only re-renders when filteredChecks or timePeriod changes
const TimelineChart = memo(({
  filteredChecks,
  timePeriod
}: {
  filteredChecks: ChartDataPoint[];
  timePeriod: TimePeriod;
}) => {
  const formatXAxisTime = useCallback((time: Date | string) => {
    const date = new Date(time);
    switch (timePeriod) {
      case '5m':
      case '15m':
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      case '1h':
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      case '6h':
        return date.toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      case '24h':
      case 'all':
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      default:
        return date.toLocaleTimeString();
    }
  }, [timePeriod]);

  if (filteredChecks.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        No data available for this time period
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Timeline Bar */}
      <div className="relative h-20 bg-muted rounded-lg overflow-hidden">
        <div className="flex h-full">
          {filteredChecks.map((check, index) => (
            <div
              key={index}
              className="h-full transition-colors hover:opacity-80 cursor-pointer group relative"
              style={{
                width: `${100 / filteredChecks.length}%`,
                backgroundColor: check.isConnected
                  ? 'hsl(var(--success))'
                  : 'hsl(var(--destructive))',
              }}
              title={`${new Date(check.timestamp).toLocaleString()}\n${
                check.isConnected ? 'Connected' : 'Disconnected'
              }`}
            >
              {/* Tooltip on hover */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                <div className="font-semibold">
                  {check.isConnected ? 'Connected' : 'Disconnected'}
                </div>
                <div className="text-muted-foreground">
                  {new Date(check.timestamp).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Time Labels */}
      <div className="flex justify-between text-xs text-muted-foreground px-1">
        <div>
          {filteredChecks[0]?.timestamp ? formatXAxisTime(filteredChecks[0].timestamp) : 'N/A'}
        </div>
        <div>
          {(() => {
            const lastCheck = filteredChecks[filteredChecks.length - 1];
            return lastCheck?.timestamp ? formatXAxisTime(lastCheck.timestamp) : 'N/A';
          })()}
        </div>
      </div>
    </div>
  );
});
TimelineChart.displayName = 'TimelineChart';

// Define column definitions at module level - outside component for better performance
const outageColumns: ColumnDef<Outage>[] = [
  {
    accessorKey: "startTime",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Start Time" />
    ),
    cell: ({ row }) => {
      const date = new Date(row.getValue("startTime"));
      return date.toLocaleString();
    },
  },
  {
    accessorKey: "endTime",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="End Time" />
    ),
    cell: ({ row }) => {
      const date = new Date(row.getValue("endTime"));
      return date.toLocaleString();
    },
  },
  {
    accessorKey: "durationSec",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Duration" />
    ),
    cell: ({ row }) => {
      return formatDuration(row.getValue("durationSec"));
    },
  },
];

// Memoized OutageHistoryTable component - only re-renders when outage history changes
const OutageHistoryTable = memo(({ outageHistory }: { outageHistory: Outage[] }) => {
  if (outageHistory.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        No outages recorded
      </div>
    );
  }

  return (
    <DataTable
      columns={outageColumns}
      data={outageHistory}
      searchKey="startTime"
      searchPlaceholder="Search by date..."
    />
  );
});
OutageHistoryTable.displayName = 'OutageHistoryTable';

export default function StatsDisplay() {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('24h');
  const [isPending, startTransition] = useTransition();

  // SWR handles all the fetching, caching, and revalidation
  const { data: stats, error: statsError, isLoading: statsLoading } = useSWR<Stats>(
    '/api/stats',
    fetcher,
    {
      refreshInterval: 60000, // 60s polling
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
      onError: (err) => console.error('Stats fetch error:', err),
    }
  );

  const { data: networkInfo } = useSWR<NetworkInfo>(
    '/api/network-info',
    fetcher,
    {
      refreshInterval: 600000, // 10 minutes
      revalidateOnFocus: true, // Refresh when tab gains focus
      dedupingInterval: 60000,
    }
  );

  const { data: chartDataResponse } = useSWR<{ chartData: ChartDataPoint[] }>(
    `/api/stats/chart-data?period=${timePeriod}`,
    fetcher,
    {
      refreshInterval: 30000, // 30s for chart data
      revalidateOnFocus: true,
    }
  );

  const chartData = chartDataResponse?.chartData || [];

  const handleTimePeriodChange = useCallback((period: TimePeriod) => {
    startTransition(() => {
      setTimePeriod(period);
    });
  }, []);

  if (statsLoading) return <div className="p-5">Loading...</div>;

  if (statsError || !stats) {
    return (
      <div className="p-5 text-destructive">
        Unable to load dashboard data. Please check the console for errors or try refreshing the page.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status Cards - Memoized */}
      <StatusCards
        activeOutage={stats.activeOutage}
        totalOutages={stats.totalOutages}
        totalDowntimeSec={stats.totalDowntimeSec}
        avgOutageDurationSec={stats.avgOutageDurationSec}
      />

      {/* Connection History Chart */}
      <Card className="relative">
        {isPending && (
          <div className="absolute inset-0 bg-background/80 dark:bg-background/80 flex items-center justify-center z-10 rounded-lg">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto mb-3"></div>
              <div className="text-sm text-muted-foreground">Loading data...</div>
            </div>
          </div>
        )}
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle>Recent Connection Status</CardTitle>
              <NetworkInfoDisplay networkInfo={networkInfo || null} />
            </div>
            <TimePeriodButtons
              timePeriod={timePeriod}
              isPending={isPending}
              onPeriodChange={handleTimePeriodChange}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-3 text-sm flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-success rounded-sm"></div>
              <span>Connected</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-destructive rounded-sm"></div>
              <span>Disconnected</span>
            </div>
          </div>
          <TimelineChart filteredChecks={chartData} timePeriod={timePeriod} />
        </CardContent>
      </Card>

      {/* Outage History Table - Memoized */}
      <Card>
        <CardHeader>
          <CardTitle>Outage History</CardTitle>
          <CardDescription>
            View and search through all recorded outages
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OutageHistoryTable outageHistory={stats.outageHistory} />
        </CardContent>
      </Card>
    </div>
  );
}
