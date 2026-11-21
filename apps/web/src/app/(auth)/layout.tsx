import { Bot, CalendarCheck, MessageCircle, Sparkles } from 'lucide-react';
import { BRAND } from '@partner/shared';
import { Logo } from '@/components/brand';

const points = [
  { icon: MessageCircle, text: 'Answers customers on WhatsApp & Telegram, 24×7' },
  { icon: CalendarCheck, text: 'Books appointments straight into Google Calendar' },
  { icon: Sparkles, text: '40+ ready-made skills — FAQ, leads, orders, refunds' },
  { icon: Bot, text: 'Bring your own AI key. Your data, your model.' },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="hero-gradient relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="[&_a]:text-white [&_span.text-primary]:text-white/70 [&_span.bg-primary]:bg-white/15">
          <Logo />
        </div>
        <div className="relative z-10 max-w-md">
          <h2 className="font-display text-4xl font-semibold leading-tight">
            Your business, answering every message.
          </h2>
          <p className="mt-3 text-white/75">
            Set up an AI agent in minutes. It learns your business and never sleeps.
          </p>
          <ul className="mt-8 space-y-4">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-white/90">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/50">
          © {new Date().getFullYear()} CoworkAI · {BRAND.email}
        </p>
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/5 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-32 right-10 h-80 w-80 rounded-full bg-white/5 blur-2xl" />
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
