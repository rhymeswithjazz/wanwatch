import { Radio } from 'lucide-react';

// Alternative icons you can use:
// import { Radar, Activity, Eye, MonitorDot, Wifi, Antenna } from 'lucide-react';

export function Logo({ className = "w-8 h-8" }: { className?: string }) {
  return <Radio className={className} />;
}
