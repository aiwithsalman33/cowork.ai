import Link from 'next/link';
import { BRAND } from '@partner/shared';
import { cn } from '@/lib/utils';

/**
 * Brand logo from /public (generated from the original "logo .png"):
 * logo.png / logo-light.png = robot + "CoWork" wordmark, logo-mark*.png = robot only.
 * The *-light files are used in dark mode or on dark backgrounds.
 */
export function Logo({
  className,
  collapsed,
  variant = 'auto',
}: {
  className?: string;
  collapsed?: boolean;
  /** "light" forces the light logo (for dark/coloured backgrounds) */
  variant?: 'auto' | 'light';
}) {
  const file = collapsed ? 'logo-mark' : 'logo';
  const h = collapsed ? 'h-9' : 'h-8';
  return (
    <Link href="/" aria-label={`${BRAND.name} home`} className={cn('flex shrink-0 items-center', className)}>
      {variant === 'light' ? (
        <img src={`/${file}-light.png`} alt={BRAND.name} className={cn(h, 'w-auto')} />
      ) : (
        <>
          <img src={`/${file}.png`} alt={BRAND.name} className={cn(h, 'w-auto dark:hidden')} />
          <img src={`/${file}-light.png`} alt="" aria-hidden className={cn(h, 'hidden w-auto dark:block')} />
        </>
      )}
    </Link>
  );
}
