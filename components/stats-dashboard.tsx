'use client';

import { useEffect, useState, useMemo, useTransition } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

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

  if (loading) return <div style={{ padding: '20px' }}>Loading...</div>;
  if (!stats) return (
    <div style={{ padding: '20px', color: '#dc2626' }}>
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

  const cardStyle = {
    background: 'white',
    padding: '24px',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
    marginBottom: '16px'
  };

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '16px',
    marginBottom: '32px'
  };

  return (
    <div>
      {/* Status Cards */}
      <div style={gridStyle}>
        <div style={cardStyle}>
          <h3 style={{ color: '#666', fontSize: '14px', margin: '0 0 8px 0' }}>Status</h3>
          <p style={{
            fontSize: '24px',
            fontWeight: 'bold',
            margin: 0,
            color: stats.activeOutage ? '#dc2626' : '#16a34a'
          }}>
            {stats.activeOutage ? 'OFFLINE' : 'ONLINE'}
          </p>
        </div>

        <div style={cardStyle}>
          <h3 style={{ color: '#666', fontSize: '14px', margin: '0 0 8px 0' }}>Total Outages</h3>
          <p style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>{stats.totalOutages}</p>
        </div>

        <div style={cardStyle}>
          <h3 style={{ color: '#666', fontSize: '14px', margin: '0 0 8px 0' }}>Total Downtime</h3>
          <p style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>
            {formatDuration(stats.totalDowntimeSec)}
          </p>
        </div>

        <div style={cardStyle}>
          <h3 style={{ color: '#666', fontSize: '14px', margin: '0 0 8px 0' }}>Avg Outage</h3>
          <p style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>
            {formatDuration(stats.avgOutageDurationSec)}
          </p>
        </div>
      </div>

      {/* Connection History Chart */}
      <div style={{ ...cardStyle, position: 'relative' }}>
        {isPending && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(255, 255, 255, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            borderRadius: '8px'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '40px',
                height: '40px',
                border: '4px solid #f3f4f6',
                borderTop: '4px solid #2563eb',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 12px'
              }}></div>
              <div style={{ color: '#374151', fontSize: '14px' }}>Loading data...</div>
            </div>
          </div>
        )}
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
            Recent Connection Status
          </h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['5m', '15m', '1h', '6h', '24h', 'all'] as TimePeriod[]).map(period => (
              <button
                key={period}
                onClick={() => handleTimePeriodChange(period)}
                disabled={isPending}
                style={{
                  padding: '6px 12px',
                  background: timePeriod === period ? '#2563eb' : '#f3f4f6',
                  color: timePeriod === period ? 'white' : '#374151',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: timePeriod === period ? '600' : '400',
                  transition: 'all 0.2s',
                  opacity: isPending ? 0.6 : 1
                }}
              >
                {timePeriodLabels[period]}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', fontSize: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '16px', height: '16px', background: '#16a34a', borderRadius: '2px' }}></div>
            <span>Connected</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '16px', height: '16px', background: '#dc2626', borderRadius: '2px' }}></div>
            <span>Disconnected</span>
          </div>
          <div style={{ color: '#6b7280', fontSize: '14px', marginLeft: 'auto' }}>
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
          <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>
            No data available for this time period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300} key={`${timePeriod}-${filteredChecks.length}`}>
            <BarChart
              data={chartData}
              barSize={dynamicBarSize}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="timestamp"
                tickFormatter={formatXAxisTime}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis
                domain={[0, 1]}
                ticks={[0, 1]}
                tickFormatter={(value) => value ? 'Online' : 'Offline'}
              />
              <Tooltip
                labelFormatter={(time) => new Date(time).toLocaleString()}
                formatter={(value: any, name: any, props: any) => {
                  const isConnected = props.payload.isConnected;
                  return [isConnected ? 'Connected' : 'Disconnected', 'Status'];
                }}
              />
              <Bar dataKey="status" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.isConnected ? '#16a34a' : '#dc2626'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Outage History Table */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
            Outage History
          </h2>
          <div style={{ color: '#6b7280', fontSize: '14px' }}>
            {stats.outageHistory.length} total outages
          </div>
        </div>

        {stats.outageHistory.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
            No outages recorded
          </div>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                  <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: '600', color: '#374151' }}>Start Time</th>
                  <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: '600', color: '#374151' }}>End Time</th>
                  <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: '600', color: '#374151' }}>Duration</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const totalPages = Math.ceil(stats.outageHistory.length / itemsPerPage);
                  const startIndex = (currentPage - 1) * itemsPerPage;
                  const endIndex = startIndex + itemsPerPage;
                  const paginatedOutages = stats.outageHistory.slice(startIndex, endIndex);

                  return paginatedOutages.map((outage, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '12px 8px' }}>
                        {new Date(outage.startTime).toLocaleString()}
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        {new Date(outage.endTime).toLocaleString()}
                      </td>
                      <td style={{ padding: '12px 8px' }}>{formatDuration(outage.durationSec)}</td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>

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
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '16px',
                  paddingTop: '16px',
                  borderTop: '1px solid #e5e7eb'
                }}>
                  <div style={{ color: '#6b7280', fontSize: '14px' }}>
                    Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, stats.outageHistory.length)} of {stats.outageHistory.length}
                  </div>

                  <div style={{ display: 'flex', gap: '4px' }}>
                    {/* Previous Button */}
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      style={{
                        padding: '6px 12px',
                        background: currentPage === 1 ? '#f3f4f6' : 'white',
                        color: currentPage === 1 ? '#9ca3af' : '#374151',
                        border: '1px solid #e5e7eb',
                        borderRadius: '4px',
                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        fontWeight: '500'
                      }}
                    >
                      Previous
                    </button>

                    {/* First page */}
                    {startPage > 1 && (
                      <>
                        <button
                          onClick={() => setCurrentPage(1)}
                          style={{
                            padding: '6px 12px',
                            background: 'white',
                            color: '#374151',
                            border: '1px solid #e5e7eb',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            minWidth: '40px'
                          }}
                        >
                          1
                        </button>
                        {startPage > 2 && (
                          <span style={{ padding: '6px 4px', color: '#9ca3af' }}>...</span>
                        )}
                      </>
                    )}

                    {/* Page Numbers */}
                    {pageNumbers.map(page => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        style={{
                          padding: '6px 12px',
                          background: currentPage === page ? '#2563eb' : 'white',
                          color: currentPage === page ? 'white' : '#374151',
                          border: '1px solid #e5e7eb',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: currentPage === page ? '600' : '400',
                          minWidth: '40px'
                        }}
                      >
                        {page}
                      </button>
                    ))}

                    {/* Last page */}
                    {endPage < totalPages && (
                      <>
                        {endPage < totalPages - 1 && (
                          <span style={{ padding: '6px 4px', color: '#9ca3af' }}>...</span>
                        )}
                        <button
                          onClick={() => setCurrentPage(totalPages)}
                          style={{
                            padding: '6px 12px',
                            background: 'white',
                            color: '#374151',
                            border: '1px solid #e5e7eb',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            minWidth: '40px'
                          }}
                        >
                          {totalPages}
                        </button>
                      </>
                    )}

                    {/* Next Button */}
                    <button
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      style={{
                        padding: '6px 12px',
                        background: currentPage === totalPages ? '#f3f4f6' : 'white',
                        color: currentPage === totalPages ? '#9ca3af' : '#374151',
                        border: '1px solid #e5e7eb',
                        borderRadius: '4px',
                        cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        fontWeight: '500'
                      }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
