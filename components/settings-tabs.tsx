"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ThemeSelector } from '@/components/theme-selector';
import TargetsManager from '@/components/targets-manager';
import { SpeedTestSettings } from '@/components/speed-test-settings';
import { MonitoringIntervals } from '@/components/monitoring-intervals';
import { Palette, Target, Gauge } from 'lucide-react';

export function SettingsTabs() {
  return (
    <Tabs defaultValue="appearance" className="w-full">
      <TabsList className="grid w-full grid-cols-3 lg:w-[600px]">
        <TabsTrigger value="appearance" className="flex items-center gap-2">
          <Palette className="h-4 w-4" />
          <span>Appearance</span>
        </TabsTrigger>
        <TabsTrigger value="monitoring" className="flex items-center gap-2">
          <Target className="h-4 w-4" />
          <span>Monitoring</span>
        </TabsTrigger>
        <TabsTrigger value="speedtest" className="flex items-center gap-2">
          <Gauge className="h-4 w-4" />
          <span>Speed Test</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="appearance" className="mt-6">
        <ThemeSelector />
      </TabsContent>

      <TabsContent value="monitoring" className="mt-6 space-y-6">
        <MonitoringIntervals />
        <TargetsManager />
      </TabsContent>

      <TabsContent value="speedtest" className="mt-6">
        <SpeedTestSettings />
      </TabsContent>
    </Tabs>
  );
}
