'use client';

import * as React from 'react';
import { Menu, FileText, LogOut, Settings, LayoutDashboard, Gauge } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

interface NavMenuProps {
  onSignOut: () => void;
}

export function NavMenu({ onSignOut }: NavMenuProps) {
  const pathname = usePathname();
  const isOnDashboard = pathname === '/dashboard';
  const isOnLogs = pathname === '/logs';
  const isOnSpeedTest = pathname === '/speedtest';
  const isOnSettings = pathname === '/settings';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {!isOnDashboard && (
          <DropdownMenuItem asChild>
            <Link href="/dashboard" className="flex items-center cursor-pointer">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              Dashboard
            </Link>
          </DropdownMenuItem>
        )}
        {!isOnSpeedTest && (
          <DropdownMenuItem asChild>
            <Link href="/speedtest" className="flex items-center cursor-pointer">
              <Gauge className="mr-2 h-4 w-4" />
              Speed Tests
            </Link>
          </DropdownMenuItem>
        )}
        {!isOnLogs && (
          <DropdownMenuItem asChild>
            <Link href="/logs" className="flex items-center cursor-pointer">
              <FileText className="mr-2 h-4 w-4" />
              System Logs
            </Link>
          </DropdownMenuItem>
        )}
        {!isOnSettings && (
          <DropdownMenuItem asChild>
            <Link href="/settings" className="flex items-center cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onSignOut}
          className="text-destructive focus:text-destructive cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
