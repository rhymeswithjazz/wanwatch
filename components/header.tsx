'use client';

import Link from 'next/link';
import { Logo } from '@/components/logo';

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  return (
    <Link href="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
      <Logo className="w-10 h-10 text-primary" />
      <h1 className="text-3xl font-bold">
        WanWatch
      </h1>
    </Link>
  );
}
