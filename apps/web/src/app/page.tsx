import Link from 'next/link';
import { ArrowRight, BookOpen, Bot, CalendarCheck, Check, KeyRound, MessageCircle, Send, Sparkles, Zap } from 'lucide-react';
import { PLANS, formatLimit } from '@partner/shared';
import { Logo } from '@/components/brand';
import { Button } from '@/components/ui/button';

const features = [
  { icon: MessageCircle, title: 'WhatsApp & Telegram', text: 'Official WhatsApp Business API or quick QR connect, plus Telegram bots.' },
  { icon: BookOpen, title: 'Knows your business', text: 'Paste your details, products and FAQs. Changes apply instantly.' },
  { icon: Sparkles, title: '40+ skills', text: 'FAQ bot, lead capture, appointments, complaints, orders, refunds and more.' },
  { icon: CalendarCheck, title: 'Google integrations', text: 'Calendar bookings, Sheets lead logs, Gmail follow-ups, Drive & Docs lookup.' },
  { icon: KeyRound, title: 'Bring your own key', text: 'OpenAI, Anthropic, Gemini, Groq, OpenRouter, DeepSeek or Mistral.' },
  { icon: Zap, title: 'Boss Mode', text: 'Text your agent from your own phone to update info or get today’s stats.' },
];

export default function Home() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/signup">Start free</Link>
          </Button>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 text-center sm:px-6 sm:pt-20">
        <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <Bot className="h-3.5 w-3.5 text-primary" /> AI employees for Indian businesses
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl font-display text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
          An AI partner that answers your customers <span className="text-primary">while you sleep</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
          Create your agent, teach it your business, connect WhatsApp or Telegram. Live in 10 minutes.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button size="lg" asChild>
            <Link href="/signup">
              Start 24-hour free trial <ArrowRight />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="#pricing">See pricing</a>
          </Button>
        </div>

        <div className="mx-auto mt-14 max-w-md rounded-2xl border bg-card p-4 text-left shadow-xl shadow-primary/5">
          <div className="mb-3 flex items-center gap-2 border-b pb-3 text-sm font-medium">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Bot className="h-4 w-4" />
            </span>
            Sharma Dental · AI Assistant
          </div>
          <div className="space-y-2 text-sm">
            <p className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground">
              Hi, can I book a cleaning tomorrow evening?
            </p>
            <p className="w-fit max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2">
              Of course! We have 5:30 PM or 6:15 PM free tomorrow. Which works for you? 😊
            </p>
            <p className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground">6:15 please</p>
            <p className="w-fit max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2">
              Booked ✅ Teeth cleaning, tomorrow 6:15 PM. See you then!
            </p>
          </div>
        </div>
      </section>

      <section className="border-y bg-card/60">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-16 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-xl p-2">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
        <h2 className="text-center font-display text-3xl font-semibold sm:text-4xl">Simple pricing in ₹</h2>
        <p className="mt-2 text-center text-muted-foreground">Start free for 24 hours. Upgrade when you are ready.</p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {Object.values(PLANS).map((p) => (
            <div
              key={p.id}
              className={`rounded-2xl border bg-card p-6 ${p.id === 'STARTER' ? 'border-primary ring-2 ring-primary/20' : ''}`}
            >
              <h3 className="font-semibold">{p.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>
              <p className="mt-4 font-display text-4xl font-semibold">
                {p.priceInr === 0 ? 'Free' : `₹${p.priceInr.toLocaleString('en-IN')}`}
                {p.priceInr > 0 && <span className="text-base font-normal text-muted-foreground">/mo</span>}
              </p>
              <ul className="mt-5 space-y-2 text-sm">
                <li className="flex gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  {formatLimit(p.limits.messagesPerMonth)} AI replies
                </li>
                {p.features.slice(0, 4).map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button className="mt-6 w-full" variant={p.id === 'STARTER' ? 'default' : 'outline'} asChild>
                <Link href="/signup">{p.id === 'TRIAL' ? 'Start trial' : `Choose ${p.name}`}</Link>
              </Button>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <Logo />
          <p className="flex items-center gap-1.5">
            <Send className="h-3.5 w-3.5" /> Made for businesses that never want to miss a message.
          </p>
        </div>
      </footer>
    </div>
  );
}
