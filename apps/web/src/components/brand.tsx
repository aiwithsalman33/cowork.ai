import Link from 'next/link';
import { cn } from '@/lib/utils';

export function Logo({ className, collapsed }: { className?: string; collapsed?: boolean }) {
  return (
    <Link href="/" className={cn('flex items-center gap-2 font-display text-lg font-semibold tracking-tight', className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M5 19V9a7 7 0 0 1 14 0v1a6 6 0 0 1-6 6H9" />
          <circle cx="12" cy="9.5" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      </span>
      {!collapsed && (
        <span>
          partner<span className="text-primary">.ai</span>
        </span>
      )}
    </Link>
  );
}
