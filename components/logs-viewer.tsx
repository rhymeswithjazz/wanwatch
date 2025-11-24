'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fetcher } from '@/lib/fetcher';

interface LogEntry {
  id: number;
  timestamp: Date | string;
  level: string;
  message: string;
  metadata: string | null;
}

interface LogsResponse {
  logs: LogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const LOG_LEVELS = [
  { value: 'all', label: 'All Levels', color: 'text-foreground' },
  { value: 'DEBUG', label: 'Debug', color: 'text-muted-foreground' },
  { value: 'INFO', label: 'Info', color: 'text-blue-600 dark:text-blue-400' },
  { value: 'WARN', label: 'Warning', color: 'text-yellow-600 dark:text-yellow-400' },
  { value: 'ERROR', label: 'Error', color: 'text-red-600 dark:text-red-400' },
  { value: 'CRITICAL', label: 'Critical', color: 'text-red-700 dark:text-red-300 font-bold' },
];

export default function LogsViewer() {
  const [page, setPage] = useState(1);
  const [level, setLevel] = useState('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const pageSize = 50;

  // Build query params
  const queryParams = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
  });

  if (level !== 'all') {
    queryParams.append('level', level);
  }

  if (search) {
    queryParams.append('search', search);
  }

  const { data, error, isLoading } = useSWR<LogsResponse>(
    `/api/logs?${queryParams.toString()}`,
    fetcher,
    {
      refreshInterval: 30000, // Refresh every 30 seconds (logs don't change that often)
      revalidateOnFocus: true,
      dedupingInterval: 10000, // Prevent duplicate requests within 10 seconds
    }
  );

  const handleSearch = useCallback(() => {
    setSearch(searchInput);
    setPage(1); // Reset to first page on new search
  }, [searchInput]);

  const handleClearSearch = useCallback(() => {
    setSearchInput('');
    setSearch('');
    setPage(1);
  }, []);

  const toggleRowExpansion = useCallback((logId: number) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
  }, []);

  const getLevelColor = (level: string): string => {
    return LOG_LEVELS.find(l => l.value === level)?.color || 'text-foreground';
  };

  const formatTimestamp = (timestamp: Date | string): string => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const parseMetadata = (metadata: string | null): Record<string, unknown> | null => {
    if (!metadata) return null;
    try {
      return JSON.parse(metadata);
    } catch {
      return null;
    }
  };

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-destructive">
            Failed to load logs. Please try refreshing the page.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter and search system logs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Log Level Filter */}
            <div className="space-y-2">
              <Label htmlFor="level">Log Level</Label>
              <Select
                value={level}
                onValueChange={(value) => {
                  setLevel(value);
                  setPage(1);
                }}
              >
                <SelectTrigger id="level">
                  <SelectValue placeholder="Select log level" />
                </SelectTrigger>
                <SelectContent>
                  {LOG_LEVELS.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Search */}
            <div className="space-y-2">
              <Label htmlFor="search">Search Messages</Label>
              <div className="flex gap-2">
                <Input
                  id="search"
                  type="text"
                  placeholder="Search in messages..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button onClick={handleSearch} variant="default">
                  Search
                </Button>
                {search && (
                  <Button onClick={handleClearSearch} variant="outline">
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Results Summary */}
          {data && (
            <div className="mt-4 text-sm text-muted-foreground">
              Showing {data.logs.length} of {data.total} total logs
              {search && ` matching "${search}"`}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>System Logs</CardTitle>
          <CardDescription>Recent system activity and events</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="text-center py-8">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
              <p className="mt-2 text-sm text-muted-foreground">Loading logs...</p>
            </div>
          )}

          {!isLoading && data && data.logs.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No logs found{search ? ` matching "${search}"` : ''}.
            </div>
          )}

          {!isLoading && data && data.logs.length > 0 && (
            <div className="space-y-2">
              {data.logs.map((log) => {
                const metadata = parseMetadata(log.metadata);
                const isExpanded = expandedRows.has(log.id);

                return (
                  <div
                    key={log.id}
                    className="border rounded-md p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div
                      className="flex items-start gap-3 cursor-pointer"
                      onClick={() => metadata && toggleRowExpansion(log.id)}
                    >
                      {/* Timestamp */}
                      <div className="text-xs text-muted-foreground whitespace-nowrap font-mono">
                        {formatTimestamp(log.timestamp)}
                      </div>

                      {/* Level Badge */}
                      <div className={`text-xs font-semibold px-2 py-0.5 rounded ${getLevelColor(log.level)} bg-muted min-w-[70px] text-center`}>
                        {log.level}
                      </div>

                      {/* Message */}
                      <div className="flex-1 text-sm break-words">
                        {log.message}
                      </div>

                      {/* Expand indicator */}
                      {metadata && (
                        <div className="text-muted-foreground">
                          {isExpanded ? '▼' : '▶'}
                        </div>
                      )}
                    </div>

                    {/* Expanded Metadata */}
                    {isExpanded && metadata && (
                      <div className="mt-3 ml-10 p-3 bg-muted/50 rounded text-xs font-mono overflow-x-auto">
                        <pre className="whitespace-pre-wrap break-words">
                          {JSON.stringify(metadata, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Page {data.page} of {data.totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={data.page === 1}
                  variant="outline"
                  size="sm"
                >
                  Previous
                </Button>
                <Button
                  onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                  disabled={data.page === data.totalPages}
                  variant="outline"
                  size="sm"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
