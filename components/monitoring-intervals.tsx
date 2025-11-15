"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { RotateCcw, Save, AlertCircle, HelpCircle } from 'lucide-react';

interface MonitoringIntervals {
  checkIntervalSeconds: number;
  outageCheckIntervalSeconds: number;
}

interface IntervalsData {
  current: MonitoringIntervals;
  defaults: MonitoringIntervals;
  isUsingDefaults: boolean;
}

export function MonitoringIntervals() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<IntervalsData | null>(null);
  const [normalInterval, setNormalInterval] = useState(300);
  const [outageInterval, setOutageInterval] = useState(30);

  // Load current settings
  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/settings/monitoring');
      if (!response.ok) throw new Error('Failed to load settings');

      const result: IntervalsData = await response.json();
      setData(result);
      setNormalInterval(result.current.checkIntervalSeconds);
      setOutageInterval(result.current.outageCheckIntervalSeconds);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load monitoring intervals',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Validation
    if (normalInterval < 10 || normalInterval > 3600) {
      toast({
        title: 'Invalid Interval',
        description: 'Normal interval must be between 10 and 3600 seconds',
        variant: 'destructive'
      });
      return;
    }

    if (outageInterval < 5 || outageInterval > 600) {
      toast({
        title: 'Invalid Interval',
        description: 'Outage interval must be between 5 and 600 seconds',
        variant: 'destructive'
      });
      return;
    }

    if (outageInterval >= normalInterval) {
      toast({
        title: 'Invalid Configuration',
        description: 'Outage interval must be less than normal interval',
        variant: 'destructive'
      });
      return;
    }

    try {
      setSaving(true);
      const response = await fetch('/api/settings/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkIntervalSeconds: normalInterval,
          outageCheckIntervalSeconds: outageInterval
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save settings');
      }

      toast({
        title: 'Success',
        description: 'Monitoring intervals updated. Monitoring has been restarted with new settings.'
      });

      // Reload to get updated state
      await loadSettings();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save settings',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset to default intervals from environment variables?')) {
      return;
    }

    try {
      setSaving(true);
      const response = await fetch('/api/settings/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true })
      });

      if (!response.ok) throw new Error('Failed to reset settings');

      toast({
        title: 'Success',
        description: 'Intervals reset to defaults. Monitoring has been restarted.'
      });

      // Reload to get updated state
      await loadSettings();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to reset settings',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (remainingSeconds === 0) return `${minutes}m`;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const checksPerHour = (intervalSeconds: number) => {
    return Math.floor(3600 / intervalSeconds);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-4">
        {/* Info Alert */}
        <div className="bg-muted/50 border border-border rounded-lg p-4 flex gap-3">
          <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Adaptive Monitoring</p>
            <p>
              WanWatch automatically switches to rapid checking during outages for accurate duration tracking,
              then returns to normal intervals when connectivity is restored.
            </p>
          </div>
        </div>

        {/* Normal Interval */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="normalInterval">
              Normal Mode Interval <span className="text-muted-foreground font-normal">(when connected)</span>
            </Label>
            <div className="group relative">
              <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
              <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-48 p-2 bg-popover border border-border rounded-md shadow-lg text-xs z-10">
                Valid range: 10-3600 seconds (10s - 1 hour)
              </div>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <Input
              id="normalInterval"
              type="number"
              min={10}
              max={3600}
              value={normalInterval}
              onChange={(e) => setNormalInterval(parseInt(e.target.value) || 0)}
              disabled={saving}
              className="w-32"
            />
            <span className="text-sm text-muted-foreground">seconds</span>
            <div className="group relative">
              <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
              <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-48 p-2 bg-popover border border-border rounded-md shadow-lg text-xs z-10 whitespace-nowrap">
                {formatTime(normalInterval)} • {checksPerHour(normalInterval)} checks/hour
              </div>
            </div>
          </div>
        </div>

        {/* Outage Interval */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="outageInterval">
              Outage Mode Interval <span className="text-muted-foreground font-normal">(during outages)</span>
            </Label>
            <div className="group relative">
              <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
              <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-48 p-2 bg-popover border border-border rounded-md shadow-lg text-xs z-10">
                Valid range: 5-600 seconds (5s - 10 minutes)
              </div>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <Input
              id="outageInterval"
              type="number"
              min={5}
              max={600}
              value={outageInterval}
              onChange={(e) => setOutageInterval(parseInt(e.target.value) || 0)}
              disabled={saving}
              className="w-32"
            />
            <span className="text-sm text-muted-foreground">seconds</span>
            <div className="group relative">
              <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
              <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-48 p-2 bg-popover border border-border rounded-md shadow-lg text-xs z-10 whitespace-nowrap">
                {formatTime(outageInterval)} • {checksPerHour(outageInterval)} checks/hour
              </div>
            </div>
          </div>
        </div>

        {/* Current Defaults Info */}
        {data && (
          <div className="bg-muted/30 rounded-lg p-3 text-sm">
            <p className="font-medium mb-1">Environment Defaults:</p>
            <p className="text-muted-foreground">
              Normal: {formatTime(data.defaults.checkIntervalSeconds)} • Outage: {formatTime(data.defaults.outageCheckIntervalSeconds)}
              {data.isUsingDefaults && (
                <span className="text-primary ml-2">(currently active)</span>
              )}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={saving || data?.isUsingDefaults}
            className="flex items-center gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Reset to Defaults
          </Button>
        </div>

      {/* Warning Note */}
      <p className="text-xs text-muted-foreground">
        Note: Changing intervals will restart the monitoring system. This is normal and brief.
      </p>
    </div>
  );
}
