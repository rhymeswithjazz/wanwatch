'use client';

import { useEffect, useState, useMemo, useTransition } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
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

type TimePeriod = '5m' | '15m' | '1h' | '6h' | '24h' | 'all';

// Helper function for formatting duration
const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

export default function StatsDisplay() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('15m');
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

    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const handleTimePeriodChange = (period: TimePeriod) => {
    startTransition(() => {
      setTimePeriod(period);
    });
  };

  const filteredChecks = useMemo(() => {
    if (!stats) return [];

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

    // Limit to max 500 points for performance
    return downsampleData(filtered, 500);
  }, [stats, timePeriod]);

  const chartData = useMemo(() => {
    return [...filteredChecks].reverse().map(check => ({
      ...check,
      status: 1
    }));
  }, [filteredChecks]);

  // Define columns for the outage history table
  // This must be before any conditional returns to follow Rules of Hooks
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

  if (loading) return <div className="p-5">Loading...</div>;
  if (!stats) return (
    <div className="p-5 text-destructive">
      Unable to load dashboard data. Please check the console for errors or try refreshing the page.
    </div>
  );

  // Calculate dynamic bar size based on number of data points
  const calculateBarSize = (dataLength: number) => {
    if (dataLength <= 10) return 40;
    if (dataLength <= 30) return 30;
    if (dataLength <= 60) return 20;
    if (dataLength <= 120) return 15;
    if (dataLength <= 300) return 10;
    if (dataLength <= 600) return 5;
    return 3;
  };

  const dynamicBarSize = calculateBarSize(filteredChecks.length);

  const timePeriodLabels: Record<TimePeriod, string> = {
    '5m': '5 Min',
    '15m': '15 Min',
    '1h': '1 Hour',
    '6h': '6 Hours',
    '24h': '24 Hours',
    'all': 'All'
  };

  const formatXAxisTime = (time: any) => {
    const date = new Date(time);
    switch (timePeriod) {
      case '5m':
      case '15m':
        // Show time only with seconds
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      case '1h':
        // Show time only
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      case '6h':
        // Show short date + time
        return date.toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      case '24h':
      case 'all':
        // Show date only
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      default:
        return date.toLocaleTimeString();
    }
  };

  return (
    <div className="space-y-4">
      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Status</CardDescription>
            <CardTitle className={stats.activeOutage ? 'text-destructive' : 'text-green-600'}>
              {stats.activeOutage ? 'OFFLINE' : 'ONLINE'}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Outages</CardDescription>
            <CardTitle>{stats.totalOutages}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Downtime</CardDescription>
            <CardTitle>{formatDuration(stats.totalDowntimeSec)}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Outage</CardDescription>
            <CardTitle>{formatDuration(stats.avgOutageDurationSec)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

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
            <CardTitle>Recent Connection Status</CardTitle>
            <div className="flex flex-wrap gap-2">
              {(['5m', '15m', '1h', '6h', '24h', 'all'] as TimePeriod[]).map(period => (
                <Button
                  key={period}
                  onClick={() => handleTimePeriodChange(period)}
                  disabled={isPending}
                  variant={timePeriod === period ? 'default' : 'outline'}
                  size="sm"
                >
                  {timePeriodLabels[period]}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-3 text-sm flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-600 rounded-sm"></div>
              <span>Connected</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-destructive rounded-sm"></div>
              <span>Disconnected</span>
            </div>
            <div className="text-muted-foreground text-sm ml-auto">
              {(() => {
                const originalCount = timePeriod === 'all'
                  ? stats.recentChecks.length
                  : stats.recentChecks.filter(item => {
                      const now = new Date();
                      const cutoffTime = new Date();
                      switch (timePeriod) {
                        case '5m': cutoffTime.setMinutes(now.getMinutes() - 5); break;
                        case '15m': cutoffTime.setMinutes(now.getMinutes() - 15); break;
                        case '1h': cutoffTime.setHours(now.getHours() - 1); break;
                        case '6h': cutoffTime.setHours(now.getHours() - 6); break;
                        case '24h': cutoffTime.setHours(now.getHours() - 24); break;
                      }
                      return new Date(item.timestamp) >= cutoffTime;
                    }).length;

                return originalCount > 500
                  ? `Showing ${filteredChecks.length} of ${originalCount.toLocaleString()} checks (downsampled)`
                  : `Showing ${filteredChecks.length} checks`;
              })()}
            </div>
          </div>
          {filteredChecks.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              No data available for this time period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300} key={`${timePeriod}-${filteredChecks.length}`}>
              <BarChart
                data={chartData}
                barSize={dynamicBarSize}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatXAxisTime}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  className="text-xs"
                />
                <YAxis
                  domain={[0, 1]}
                  ticks={[0, 1]}
                  tickFormatter={(value) => value ? 'Online' : 'Offline'}
                  className="text-xs"
                />
                <Tooltip
                  labelFormatter={(time) => new Date(time).toLocaleString()}
                  formatter={(value: any, name: any, props: any) => {
                    const isConnected = props.payload.isConnected;
                    return [isConnected ? 'Connected' : 'Disconnected', 'Status'];
                  }}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--popover-foreground))'
                  }}
                />
                <Bar dataKey="status" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.isConnected ? '#16a34a' : 'hsl(var(--destructive))'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Outage History Table */}
      <Card>
        <CardHeader>
          <CardTitle>Outage History</CardTitle>
          <CardDescription>
            View and search through all recorded outages
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats.outageHistory.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              No outages recorded
            </div>
          ) : (
            <DataTable
              columns={outageColumns}
              data={stats.outageHistory}
              searchKey="startTime"
              searchPlaceholder="Search by date..."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
