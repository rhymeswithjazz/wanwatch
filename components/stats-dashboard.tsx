'use client';

import { useEffect, useState, useMemo, useTransition, useCallback, memo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { DataTable, DataTableColumnHeader } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';

interface Stats {
  totalOutages: number;
  activeOutage: any;
  totalDowntimeSec: number;
  avgOutageDurationSec: number;
  recentChecks: any[];
  outageHistory: any[];
}

interface NetworkInfo {
  ipv4: string;
  ipv6: string;
  city: string;
  region: string;
  country: string;
  isp: string;
  timezone: string;
  asn: string;
}

type TimePeriod = '5m' | '15m' | '1h' | '6h' | '24h' | 'all';

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
  activeOutage: any;
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
          className={timePeriod === period ? 'bg-primary text-white hover:bg-primary/90' : ''}
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
  filteredChecks: any[];
  timePeriod: TimePeriod;
}) => {
  const formatXAxisTime = useCallback((time: any) => {
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
          {formatXAxisTime(filteredChecks[0]?.timestamp)}
        </div>
        <div>
          {formatXAxisTime(filteredChecks[filteredChecks.length - 1]?.timestamp)}
        </div>
      </div>
    </div>
  );
});
TimelineChart.displayName = 'TimelineChart';

// Memoized OutageHistoryTable component - only re-renders when outage history changes
const OutageHistoryTable = memo(({ outageHistory }: { outageHistory: any[] }) => {
  const outageColumns: ColumnDef<any>[] = useMemo(() => [
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
  ], []);

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
  const [stats, setStats] = useState<Stats | null>(null);
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('24h');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats', {
          credentials: 'include'
        });

        if (!res.ok) {
          console.error('Failed to fetch stats:', res.status, res.statusText);
          setLoading(false);
          return;
        }

        const data = await res.json();

        if (data.error) {
          console.error('Stats API error:', data.error);
          setLoading(false);
          return;
        }

        setStats(data);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching stats:', error);
        setLoading(false);
      }
    };

    // Fetch network info once on mount (not in an interval)
    const fetchNetworkInfo = async () => {
      try {
        const res = await fetch('/api/network-info');
        if (res.ok) {
          const data = await res.json();
          if (!data.error) {
            setNetworkInfo(data);
          }
        }
      } catch (error) {
        console.error('Error fetching network info:', error);
        // Silently fail - network info is optional
      }
    };

    fetchStats();
    fetchNetworkInfo(); // Only fetch once, no interval
    const interval = setInterval(fetchStats, 30000); // Refresh stats every 30s
    return () => clearInterval(interval);
  }, []);

  const handleTimePeriodChange = useCallback((period: TimePeriod) => {
    startTransition(() => {
      setTimePeriod(period);
    });
  }, [startTransition]);

  const filteredChecks = useMemo(() => {
    if (!stats) return [];

    // Define max bars to show for each time period
    // With 30-second intervals, this creates a clean, readable chart
    const getMaxBarsForPeriod = (period: TimePeriod): number => {
      switch (period) {
        case '5m':
          return 10;   // All 10 bars (every 30s)
        case '15m':
          return 30;   // All 30 bars (every 30s)
        case '1h':
          return 60;   // 60 bars (aggregate every 2 checks = 1 min per bar)
        case '6h':
          return 72;   // 72 bars (aggregate every 10 checks = 5 min per bar)
        case '24h':
          return 96;   // 96 bars (aggregate every 30 checks = 15 min per bar)
        case 'all':
          return 200;  // Max 200 bars for full history
      }
    };

    const filterDataByPeriod = (data: any[], period: TimePeriod) => {
      if (period === 'all') return data;

      const now = new Date();
      const cutoffTime = new Date();

      switch (period) {
        case '5m':
          cutoffTime.setMinutes(now.getMinutes() - 5);
          break;
        case '15m':
          cutoffTime.setMinutes(now.getMinutes() - 15);
          break;
        case '1h':
          cutoffTime.setHours(now.getHours() - 1);
          break;
        case '6h':
          cutoffTime.setHours(now.getHours() - 6);
          break;
        case '24h':
          cutoffTime.setHours(now.getHours() - 24);
          break;
      }

      return data.filter(item => new Date(item.timestamp) >= cutoffTime);
    };

    const downsampleData = (data: any[], maxPoints: number) => {
      if (data.length <= maxPoints) return data;

      const step = Math.ceil(data.length / maxPoints);
      const downsampled = [];

      for (let i = 0; i < data.length; i += step) {
        // Take a slice for this bucket
        const bucket = data.slice(i, i + step);

        // If any check in this bucket is disconnected, show as disconnected
        const hasDisconnection = bucket.some(check => !check.isConnected);

        // Use the middle item from the bucket as representative
        const representative = bucket[Math.floor(bucket.length / 2)];

        downsampled.push({
          ...representative,
          isConnected: !hasDisconnection // Show red if any disconnection in bucket
        });
      }

      return downsampled;
    };

    const filtered = filterDataByPeriod(stats.recentChecks, timePeriod);
    const maxBars = getMaxBarsForPeriod(timePeriod);

    // Downsample to fixed number of bars for consistent chart appearance
    return downsampleData(filtered, maxBars);
  }, [stats, timePeriod]);

  if (loading) return <div className="p-5">Loading...</div>;
  if (!stats) return (
    <div className="p-5 text-destructive">
      Unable to load dashboard data. Please check the console for errors or try refreshing the page.
    </div>
  );

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
              <NetworkInfoDisplay networkInfo={networkInfo} />
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
          <TimelineChart filteredChecks={filteredChecks} timePeriod={timePeriod} />
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
