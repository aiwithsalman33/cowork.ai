'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import {
  BarChart3,
  BookOpen,
  Bot,
  Brain,
  CalendarCheck,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  Monitor,
  Moon,
  Plug,
  ScrollText,
  Shield,
  Sun,
  UserX,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { MeDTO } from '@cowork/shared';
import { Logo } from './brand';
import { ThemeToggle } from './theme-toggle';
import { Button } from './ui/button';
import { Avatar } from './ui/misc';
import { Tooltip } from './ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { post } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const TENANT_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/conversations', label: 'Conversations', icon: MessagesSquare },
  { href: '/appointments', label: 'Appointments', icon: CalendarCheck },
  { href: '/knowledge', label: 'Knowledge Base', icon: BookOpen },
  { href: '/learning', label: 'Learning', icon: Brain },
  { href: '/integrations', label: 'Integrations', icon: Plug },
  { href: '/agent', label: 'Agent Config', icon: Bot },
  { href: '/schedules', label: 'Schedules', icon: Clock },
  { href: '/logs', label: 'Logs', icon: ScrollText },
  { href: '/docs', label: 'Documentation', icon: FileText },
  { href: '/billing', label: 'Billing', icon: CreditCard },
];

export const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'Overview', icon: BarChart3 },
  { href: '/admin/users', label: 'Users', icon: LayoutDashboard },
  { href: '/admin/skills', label: 'Skill Library', icon: Bot },
  { href: '/admin/flags', label: 'Feature Flags', icon: Shield },
  { href: '/admin/contacts', label: 'Contact Messages', icon: MessagesSquare },
  { href: '/admin/requests', label: 'Integration Requests', icon: Plug },
  { href: '/admin/audit', label: 'Audit Log', icon: ScrollText },
];

function useCountdown(iso: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return 'expired';
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
}

function TrialBanner({ me }: { me: MeDTO }) {
  const left = useCountdown(me.trialEndsAt);
  if (me.role === 'ADMIN' && !me.impersonatedBy) return null;
  if (me.plan !== 'TRIAL' && me.planActive) return null;
  const expired = !me.planActive;
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-sm',
        expired ? 'bg-destructive text-white' : 'bg-primary text-primary-foreground',
      )}
    >
      <span>
        {expired
          ? me.plan === 'TRIAL'
            ? 'Your 7-day free trial has ended — contact the admin to activate Starter (₹499) or Growth (₹999).'
            : 'Your plan is inactive — contact the admin to activate it again.'
          : `Free trial (Telegram only) · ${left} left.`}
      </span>
      <Link
        href="/billing"
        className="rounded-md bg-white px-3 py-1 text-xs font-semibold text-primary shadow-sm transition hover:bg-white/90"
      >
        {expired ? 'Contact admin' : 'See plans'}
      </Link>
    </div>
  );
}

function ImpersonationBanner({ me }: { me: MeDTO }) {
  const qc = useQueryClient();
  const router = useRouter();
  if (!me.impersonatedBy) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-black">
      <UserX className="h-4 w-4" />
      Viewing as {me.email} (admin: {me.impersonatedBy.email})
      <button
        className="rounded-md bg-black/80 px-3 py-1 text-xs text-white hover:bg-black"
        onClick={async () => {
          await post('/auth/impersonation/exit');
          qc.clear();
          router.replace('/admin/users');
        }}
      >
        Exit
      </button>
    </div>
  );
}

function ThemeMenuItems() {
  const { setTheme } = useTheme();
  return (
    <>
      <DropdownMenuLabel>Theme</DropdownMenuLabel>
      <DropdownMenuItem onClick={() => setTheme('light')}>
        <Sun /> Light
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setTheme('dark')}>
        <Moon /> Dark
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setTheme('system')}>
        <Monitor /> System
      </DropdownMenuItem>
    </>
  );
}

function NavLinks({
  items,
  collapsed,
  onNavigate,
}: {
  items: NavItem[];
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map(({ href, label, icon: Icon }) => {
        const active =
          href === '/admin' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Tooltip key={href} content={label} disabled={!collapsed}>
            <Link
              href={href}
              onClick={onNavigate}
              className={cn(
                'group flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                collapsed && 'justify-center px-0',
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          </Tooltip>
        );
      })}
    </nav>
  );
}

export function AppShell({ me, nav, children }: { me: MeDTO; nav: NavItem[]; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const qc = useQueryClient();
  const isAdminArea = nav === ADMIN_NAV;

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('pa_sidebar') === '1');
    } catch {
      /* storage unavailable (private mode) */
    }
  }, []);
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem('pa_sidebar', c ? '0' : '1');
      } catch {
        /* storage unavailable (private mode) */
      }
      return !c;
    });
  };

  async function logout() {
    await post('/auth/logout').catch(() => null);
    qc.clear();
    router.replace('/login');
  }

  const userMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex cursor-pointer items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar name={me.name} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-foreground">
          <div className="truncate font-semibold">{me.name}</div>
          <div className="truncate text-xs font-normal text-muted-foreground">{me.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {me.role === 'ADMIN' && !me.impersonatedBy && (
          <DropdownMenuItem onClick={() => router.push(isAdminArea ? '/dashboard' : '/admin')}>
            <Shield /> {isAdminArea ? 'My dashboard' : 'Admin panel'}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => router.push('/billing')}>
          <CreditCard /> Billing
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <ThemeMenuItems />
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
          <LogOut /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <ImpersonationBanner me={me} />
      {!isAdminArea && <TrialBanner me={me} />}
      <div className="flex flex-1">
        {/* desktop sidebar */}
        <aside
          className={cn(
            'sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 lg:flex',
            collapsed ? 'w-[68px]' : 'w-60',
          )}
        >
          <div className={cn('flex h-16 items-center px-4', collapsed && 'justify-center px-0')}>
            <Logo collapsed={collapsed} />
          </div>
          {isAdminArea && !collapsed && (
            <div className="mx-4 mb-2 rounded-md bg-primary-soft px-2 py-1 text-center text-xs font-semibold uppercase tracking-wider text-primary">
              Admin
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-3 py-2 scrollbar-thin">
            <NavLinks items={nav} collapsed={collapsed} />
          </div>
          <div className="border-t p-3">
            <button
              onClick={toggle}
              className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? (
                <ChevronsRight className="h-4 w-4" />
              ) : (
                <>
                  <ChevronsLeft className="h-4 w-4" /> Collapse
                </>
              )}
            </button>
          </div>
        </aside>

        {/* mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
            <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-sidebar shadow-xl">
              <div className="flex h-16 items-center justify-between px-4">
                <Logo />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close menu"
                >
                  <X />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-2">
                <NavLinks items={nav} collapsed={false} onNavigate={() => setMobileOpen(false)} />
              </div>
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur sm:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu />
            </Button>
            <div className="lg:hidden">
              <Logo collapsed />
            </div>
            <div className="flex-1" />
            {!isAdminArea && me.plan === 'TRIAL' && (
              <Button size="sm" asChild className="hidden sm:inline-flex">
                <Link href="/billing">Upgrade</Link>
              </Button>
            )}
            <ThemeToggle />
            {userMenu}
          </header>
          <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}

export function ShellLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Logo collapsed />
        <div className="h-1 w-24 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-[pulse_1s_ease-in-out_infinite] rounded-full bg-primary" />
        </div>
      </div>
    </div>
  );
}
