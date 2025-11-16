'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Gauge, FileText, Settings, LogOut } from 'lucide-react';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { NavMenu } from '@/components/nav-menu';
import { cn } from '@/lib/utils';

interface HeaderProps {
  onSignOut: () => void;
}

export function Header({ onSignOut }: HeaderProps) {
  const pathname = usePathname();

  const navLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/speedtest', label: 'Speed Tests', icon: Gauge },
    { href: '/logs', label: 'System Logs', icon: FileText },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <header className="w-full">
      <div className="flex justify-between items-center">
        {/* Logo and Brand */}
        <Link href="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <Logo className="w-10 h-10 text-primary" />
          <h1 className="text-3xl font-bold">
            WanWatch
          </h1>
        </Link>

        {/* Desktop Navigation (lg and up) */}
        <nav className="hidden lg:flex items-center gap-1">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
          <div className="ml-2 flex items-center gap-2">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              onClick={onSignOut}
              className="text-muted-foreground hover:text-destructive"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </nav>

        {/* Mobile Navigation (below lg) */}
        <div className="lg:hidden flex items-center gap-2">
          <ThemeToggle />
          <NavMenu onSignOut={onSignOut} />
        </div>
      </div>
    </header>
  );
}
