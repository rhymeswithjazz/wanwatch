'use client';

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    const fetchStats = async () => {
      const res = await fetch('/api/stats');
      const data = await res.json();
      setStats(data);
      setLoading(false);
    };

    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div style={{ padding: '20px' }}>Loading...</div>;
  if (!stats) return <div style={{ padding: '20px' }}>No data available</div>;

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
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

  const filteredChecks = filterDataByPeriod(stats.recentChecks, timePeriod);

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
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
            Recent Connection Status
          </h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['5m', '15m', '1h', '6h', '24h', 'all'] as TimePeriod[]).map(period => (
              <button
                key={period}
                onClick={() => setTimePeriod(period)}
                style={{
                  padding: '6px 12px',
                  background: timePeriod === period ? '#2563eb' : '#f3f4f6',
                  color: timePeriod === period ? 'white' : '#374151',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: timePeriod === period ? '600' : '400',
                  transition: 'all 0.2s'
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
            Showing {filteredChecks.length} checks
          </div>
        </div>
        {filteredChecks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>
            No data available for this time period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300} key={`${timePeriod}-${filteredChecks.length}`}>
            <BarChart
              data={[...filteredChecks].reverse().map(check => ({
                ...check,
                status: 1
              }))}
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
                {[...filteredChecks].reverse().map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.isConnected ? '#16a34a' : '#dc2626'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Outage History Table */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px' }}>
          Outage History
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ textAlign: 'left', padding: '8px' }}>Start Time</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>End Time</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Duration</th>
            </tr>
          </thead>
          <tbody>
            {stats.outageHistory.map((outage, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '8px' }}>
                  {new Date(outage.startTime).toLocaleString()}
                </td>
                <td style={{ padding: '8px' }}>
                  {new Date(outage.endTime).toLocaleString()}
                </td>
                <td style={{ padding: '8px' }}>{formatDuration(outage.durationSec)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
