'use client';

import { useEffect, useState, useMemo, useTransition } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';

interface Stats {
  totalOutages: number;
  activeOutage: any;
  totalDowntimeSec: number;
  avgOutageDurationSec: number;
  recentChecks: any[];
  outageHistory: any[];
}

type TimePeriod = '5m' | '15m' | '1h' | '6h' | '24h' | 'all';

export default function StatsDisplay() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('15m');
  const [isPending, startTransition] = useTransition();
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

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

  if (loading) return <div className="p-5">Loading...</div>;
  if (!stats) return (
    <div className="p-5 text-destructive">
      Unable to load dashboard data. Please check the console for errors or try refreshing the page.
    </div>
  );

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

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
          <div className="flex justify-between items-center">
            <CardTitle>Outage History</CardTitle>
            <CardDescription>{stats.outageHistory.length} total outages</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {stats.outageHistory.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              No outages recorded
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Start Time</TableHead>
                    <TableHead>End Time</TableHead>
                    <TableHead>Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const totalPages = Math.ceil(stats.outageHistory.length / itemsPerPage);
                    const startIndex = (currentPage - 1) * itemsPerPage;
                    const endIndex = startIndex + itemsPerPage;
                    const paginatedOutages = stats.outageHistory.slice(startIndex, endIndex);

                    return paginatedOutages.map((outage, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          {new Date(outage.startTime).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {new Date(outage.endTime).toLocaleString()}
                        </TableCell>
                        <TableCell>{formatDuration(outage.durationSec)}</TableCell>
                      </TableRow>
                    ));
                  })()}
                </TableBody>
              </Table>

              {/* Pagination Controls */}
              {(() => {
                const totalPages = Math.ceil(stats.outageHistory.length / itemsPerPage);

                if (totalPages <= 1) return null;

                const pageNumbers = [];
                const maxVisiblePages = 7;

                let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
                let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

                if (endPage - startPage < maxVisiblePages - 1) {
                  startPage = Math.max(1, endPage - maxVisiblePages + 1);
                }

                for (let i = startPage; i <= endPage; i++) {
                  pageNumbers.push(i);
                }

                return (
                  <div className="flex justify-between items-center mt-4 pt-4 border-t">
                    <div className="text-sm text-muted-foreground">
                      Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, stats.outageHistory.length)} of {stats.outageHistory.length}
                    </div>

                    <div className="flex gap-1">
                      <Button
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        variant="outline"
                        size="sm"
                      >
                        Previous
                      </Button>

                      {startPage > 1 && (
                        <>
                          <Button
                            onClick={() => setCurrentPage(1)}
                            variant="outline"
                            size="sm"
                            className="min-w-[40px]"
                          >
                            1
                          </Button>
                          {startPage > 2 && (
                            <span className="px-1 py-1.5 text-muted-foreground">...</span>
                          )}
                        </>
                      )}

                      {pageNumbers.map(page => (
                        <Button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          variant={currentPage === page ? 'default' : 'outline'}
                          size="sm"
                          className="min-w-[40px]"
                        >
                          {page}
                        </Button>
                      ))}

                      {endPage < totalPages && (
                        <>
                          {endPage < totalPages - 1 && (
                            <span className="px-1 py-1.5 text-muted-foreground">...</span>
                          )}
                          <Button
                            onClick={() => setCurrentPage(totalPages)}
                            variant="outline"
                            size="sm"
                            className="min-w-[40px]"
                          >
                            {totalPages}
                          </Button>
                        </>
                      )}

                      <Button
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        variant="outline"
                        size="sm"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
