import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Bot,
  BrainCircuit,
  CalendarCheck,
  Check,
  ChevronDown,
  Clock,
  KeyRound,
  Languages,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sheet,
  Sparkles,
  UserPlus,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { BRAND, PLANS, formatLimit, whatsappLink } from '@partner/shared';
import { Logo } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { ChannelIcon } from '@/components/channel-badge';
import { LandingNav } from '@/components/landing/nav';
import { ContactForm } from '@/components/landing/contact-form';

const features: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: MessageCircle,
    title: 'WhatsApp & Telegram',
    text: 'Official WhatsApp Business API or quick QR connect, plus Telegram bots — one agent, every chat.',
  },
  {
    icon: BookOpen,
    title: 'Knows your business',
    text: 'Paste your details, products and FAQs. Edits apply to the very next message.',
  },
  {
    icon: Sheet,
    title: 'Live Google Sheets',
    text: 'Reads your price list or stock sheet in real time, and logs every lead as a new row.',
  },
  {
    icon: CalendarCheck,
    title: 'Books appointments',
    text: 'Confirms date, time and phone, then drops the booking into your Google Calendar.',
  },
  {
    icon: Sparkles,
    title: '40+ ready skills',
    text: 'FAQ bot, lead capture, orders, complaints, refunds — or describe a new skill and AI builds it.',
  },
  {
    icon: BrainCircuit,
    title: 'Remembers customers',
    text: 'Names, preferences and past chats, so returning customers never repeat themselves.',
  },
  {
    icon: Languages,
    title: 'Speaks their language',
    text: 'English, Hindi, Hinglish, Tamil, Telugu, Kannada and more — it replies the way they write.',
  },
  {
    icon: Zap,
    title: 'Boss Mode',
    text: 'Text your agent from your phone: “closed Monday for Diwali” — and it updates itself.',
  },
  {
    icon: KeyRound,
    title: 'Your AI, your key',
    text: 'OpenAI, Claude, Gemini, Groq, DeepSeek, Mistral or OpenRouter. Pay the provider directly.',
  },
];

const industries = [
  'Clinics',
  'Salons & spas',
  'Restaurants',
  'Real estate',
  'Coaching & tuition',
  'Gyms',
  'Sweet shops',
  'Travel agents',
  'E-commerce',
  'Retail stores',
];

const steps = [
  {
    n: '01',
    title: 'Teach it your business',
    text: 'Add your hours, services, prices and FAQs — or connect a Google Sheet.',
  },
  {
    n: '02',
    title: 'Connect WhatsApp or Telegram',
    text: 'Use the official WhatsApp Business API, scan a QR, or paste a Telegram bot token.',
  },
  {
    n: '03',
    title: 'Watch it work 24×7',
    text: 'It answers, books, captures leads and hands over to you when needed.',
  },
];

const faqs = [
  {
    q: 'Do I need technical skills?',
    a: 'No. If you can fill a form, you can set up CoworkAI. Most businesses are live in under 15 minutes.',
  },
  {
    q: 'Which WhatsApp option should I choose?',
    a: 'We recommend the official WhatsApp Business API — no ban risk and best for business. The QR option is quicker but unofficial, and numbers can be banned, so use a spare number for it.',
  },
  {
    q: 'What does the AI cost?',
    a: 'You bring your own AI key (OpenAI, Gemini, Claude, Groq…) and pay the provider directly. Cheap models cost a few paise per conversation.',
  },
  {
    q: 'How does Google Sheets work?',
    a: 'You connect Google with your own Google Cloud credentials, then pick sheets: one the agent reads (price list, stock, menu) and one where it logs leads.',
  },
  {
    q: 'Is my data safe?',
    a: 'API keys and tokens are encrypted (AES-256). Your Google connection uses your own OAuth app, and you can disconnect any time.',
  },
  {
    q: 'What happens after the free trial?',
    a: 'Your agent pauses after 24 hours. Choose a plan to keep it replying — contact us on WhatsApp and we’ll upgrade you right away.',
  },
];

function PhoneMockup() {
  const chat: { me?: boolean; text: string }[] = [
    { me: true, text: 'Hi! Kaju katli 500g ka price kya hai?' },
    { text: 'Namaste! 😊 Kaju Katli 500g is ₹450 — 12 boxes in stock today. Shall I keep one for you?' },
    { me: true, text: 'Haan, 2 boxes. Pickup at 6pm' },
    { text: 'Done ✅ 2 × Kaju Katli 500g (₹900), pickup today 6:00 PM. Your name please?' },
  ];
  return (
    <div className="relative mx-auto w-full max-w-[340px]">
      <div className="rounded-[2.5rem] border-[10px] border-neutral-900 bg-neutral-900 shadow-2xl shadow-primary/20">
        <div className="overflow-hidden rounded-[1.8rem] bg-[#efe7dd] dark:bg-[#0b141a]">
          <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
              <Bot className="h-5 w-5" />
            </span>
            <div>
              <div className="text-sm font-semibold">Kumar Sweets</div>
              <div className="text-[11px] text-white/75">AI assistant · online</div>
            </div>
          </div>
          <div className="space-y-2 px-3 py-4 text-[13px] leading-snug">
            {chat.map((m, i) => (
              <div key={i} className={m.me ? 'flex justify-end' : 'flex'}>
                <p
                  className={
                    m.me
                      ? 'max-w-[80%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-neutral-900 shadow-sm dark:bg-[#005c4b] dark:text-white'
                      : 'max-w-[85%] rounded-lg rounded-tl-none bg-white px-3 py-2 text-neutral-900 shadow-sm dark:bg-[#202c33] dark:text-white'
                  }
                >
                  {m.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="absolute -left-36 top-6 hidden rounded-xl border bg-card px-3 py-2 text-xs shadow-lg xl:flex xl:items-center xl:gap-2">
        <Sheet className="h-4 w-4 text-green-600" /> Read “Price list” sheet
      </div>
      <div className="absolute -right-32 -bottom-3 hidden rounded-xl border bg-card px-3 py-2 text-xs shadow-lg xl:flex xl:items-center xl:gap-2">
        <UserPlus className="h-4 w-4 text-primary" /> Order saved to “Leads”
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <LandingNav />

      {/* Hero */}
      <section className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[620px] bg-[radial-gradient(60%_60%_at_70%_20%,var(--primary-soft),transparent)]" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> AI co-workers for Indian businesses
            </span>
            <h1 className="mt-6 font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Never miss a customer on <span className="text-primary">WhatsApp</span> again
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              {BRAND.name} answers enquiries, quotes prices from your Google Sheet, books appointments and
              captures leads — 24×7, in your customer’s language.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link href="/signup">
                  Start 24-hour free trial <ArrowRight />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a
                  href={whatsappLink(`Hi! I'd like a demo of ${BRAND.name}.`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle /> Book a demo
                </a>
              </Button>
            </div>
            <ul className="mt-8 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              {['Live in 15 minutes', 'No coding needed', 'Works with your own AI key', 'Cancel anytime'].map(
                (t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" /> {t}
                  </li>
                ),
              )}
            </ul>
          </div>
          <PhoneMockup />
        </div>
      </section>

      {/* Stats */}
      <section className="border-y bg-card/70">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 text-center sm:px-6 md:grid-cols-4">
          {[
            ['24×7', 'always available'],
            ['< 5 sec', 'average reply time'],
            ['40+', 'ready-made skills'],
            ['10+', 'Indian languages'],
          ].map(([v, l]) => (
            <div key={l}>
              <div className="font-display text-3xl font-semibold text-primary sm:text-4xl">{v}</div>
              <div className="mt-1 text-sm text-muted-foreground">{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Industries */}
      <section className="mx-auto max-w-6xl px-4 py-14 text-center sm:px-6">
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Built for businesses like yours
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {industries.map((i) => (
            <span key={i} className="rounded-full border bg-card px-4 py-1.5 text-sm">
              {i}
            </span>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 bg-card/50 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-semibold sm:text-4xl">
              Everything a great front-desk does
            </h2>
            <p className="mt-3 text-muted-foreground">
              Without the salary, sick days or missed messages at 11 PM.
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, text }) => (
              <div
                key={title}
                className="rounded-2xl border bg-card p-6 transition-shadow hover:shadow-lg hover:shadow-primary/5"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-semibold sm:text-4xl">Live in three simple steps</h2>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="relative rounded-2xl border bg-card p-6">
              <div className="font-display text-4xl font-semibold text-primary/25">{s.n}</div>
              <h3 className="mt-2 font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Google Sheets + channels */}
      <section className="mx-auto grid max-w-6xl gap-6 px-4 pb-20 sm:px-6 lg:grid-cols-2">
        <div className="hero-gradient relative overflow-hidden rounded-3xl p-8 text-white">
          <Sheet className="h-8 w-8" />
          <h3 className="mt-4 font-display text-2xl font-semibold">Your Google Sheet becomes its brain</h3>
          <p className="mt-2 text-white/80">
            Update a price in your sheet and the agent quotes the new price instantly. Every lead it captures
            lands as a new row — no copy-paste.
          </p>
          <ul className="mt-5 space-y-2 text-sm text-white/90">
            {[
              'Price lists, menus, stock, timings',
              'Leads & orders logged automatically',
              'Connect with your own Google Cloud app',
            ].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check className="h-4 w-4" /> {t}
              </li>
            ))}
          </ul>
          <div className="pointer-events-none absolute -bottom-16 -right-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        </div>
        <div className="grid gap-4">
          {[
            {
              type: 'WHATSAPP_CLOUD' as const,
              title: 'WhatsApp Business API',
              text: 'Official, ban-safe, green-tick ready. Recommended.',
              color: 'bg-green-500/15 text-green-600',
            },
            {
              type: 'WHATSAPP_QR' as const,
              title: 'WhatsApp QR',
              text: 'Link your existing number in seconds (unofficial — use a spare number).',
              color: 'bg-green-500/15 text-green-600',
            },
            {
              type: 'TELEGRAM' as const,
              title: 'Telegram',
              text: 'Create a bot with @BotFather and paste the token.',
              color: 'bg-sky-500/15 text-sky-600',
            },
          ].map((c) => (
            <div key={c.title} className="flex items-start gap-4 rounded-2xl border bg-card p-5">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${c.color}`}>
                <ChannelIcon type={c.type} className="h-5 w-5" />
              </span>
              <div>
                <h4 className="font-semibold">{c.title}</h4>
                <p className="mt-0.5 text-sm text-muted-foreground">{c.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-20 border-y bg-card/50 py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="text-center font-display text-3xl font-semibold sm:text-4xl">Simple pricing in ₹</h2>
          <p className="mt-2 text-center text-muted-foreground">
            Start free for 24 hours. Upgrade when you’re ready.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {Object.values(PLANS).map((p) => {
              const popular = p.id === 'STARTER';
              return (
                <div
                  key={p.id}
                  className={`relative flex flex-col rounded-2xl border bg-card p-6 ${popular ? 'border-primary shadow-xl shadow-primary/10 ring-2 ring-primary/20' : ''}`}
                >
                  {popular && (
                    <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                      Most popular
                    </span>
                  )}
                  <h3 className="font-semibold">{p.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>
                  <p className="mt-5 font-display text-4xl font-semibold">
                    {p.priceInr === 0 ? 'Free' : `₹${p.priceInr.toLocaleString('en-IN')}`}
                    {p.priceInr > 0 && (
                      <span className="text-base font-normal text-muted-foreground">/month</span>
                    )}
                  </p>
                  <ul className="mt-5 flex-1 space-y-2 text-sm">
                    <li className="flex gap-2">
                      <Check className="h-4 w-4 shrink-0 text-primary" />{' '}
                      {formatLimit(p.limits.messagesPerMonth)} AI replies
                    </li>
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <Check className="h-4 w-4 shrink-0 text-primary" /> {f}
                      </li>
                    ))}
                  </ul>
                  {p.id === 'TRIAL' ? (
                    <Button className="mt-6 w-full" variant="outline" asChild>
                      <Link href="/signup">Start free trial</Link>
                    </Button>
                  ) : (
                    <Button className="mt-6 w-full" variant={popular ? 'default' : 'outline'} asChild>
                      <a
                        href={whatsappLink(`Hi! I'm interested in the ${BRAND.name} ${p.name} plan.`)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Get {p.name}
                      </a>
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20 sm:px-6">
        <h2 className="text-center font-display text-3xl font-semibold sm:text-4xl">Questions, answered</h2>
        <div className="mt-10 divide-y rounded-2xl border bg-card">
          {faqs.map((f) => (
            <details key={f.q} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {f.q}
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="scroll-mt-20 bg-card/50 py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <h2 className="font-display text-3xl font-semibold sm:text-4xl">Let’s talk</h2>
            <p className="mt-3 text-muted-foreground">
              Want a demo, help with setup, or a custom plan? Send us a message — it comes straight to our
              WhatsApp.
            </p>
            <div className="mt-8 space-y-4">
              <a
                href={whatsappLink(`Hi ${BRAND.name} team!`)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-500/15 text-green-600">
                  <MessageCircle className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-xs text-muted-foreground">WhatsApp</div>
                  <div className="font-medium">{BRAND.phoneDisplay}</div>
                </div>
              </a>
              <a
                href={`tel:+91${BRAND.phone}`}
                className="flex items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Phone className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-xs text-muted-foreground">Call us</div>
                  <div className="font-medium">{BRAND.phoneDisplay}</div>
                </div>
              </a>
              <a
                href={`mailto:${BRAND.email}`}
                className="flex items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Mail className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-xs text-muted-foreground">Email</div>
                  <div className="font-medium">{BRAND.email}</div>
                </div>
              </a>
            </div>
          </div>
          <ContactForm />
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="hero-gradient relative overflow-hidden rounded-3xl px-6 py-14 text-center text-white sm:px-12">
          <h2 className="mx-auto max-w-2xl font-display text-3xl font-semibold sm:text-4xl">
            Give your business an AI co-worker today
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-white/80">
            24 hours free. Set up in minutes. No credit card.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" className="bg-white text-primary hover:bg-white/90" asChild>
              <Link href="/signup">
                Start free trial <ArrowRight />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
              asChild
            >
              <a
                href={whatsappLink(`Hi! I'd like a demo of ${BRAND.name}.`)}
                target="_blank"
                rel="noreferrer"
              >
                Talk to us
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
          <div className="md:col-span-2">
            <Logo />
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">
              {BRAND.tagline}. Answers, books and sells for you — 24×7.
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" /> Encrypted keys · Your own Google OAuth · Made in India
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold">Product</h4>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="#features" className="hover:text-foreground">
                  Features
                </a>
              </li>
              <li>
                <a href="#pricing" className="hover:text-foreground">
                  Pricing
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-foreground">
                  FAQ
                </a>
              </li>
              <li>
                <Link href="/login" className="hover:text-foreground">
                  Sign in
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold">Contact</h4>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>
                <a href={`mailto:${BRAND.email}`} className="flex items-center gap-2 hover:text-foreground">
                  <Mail className="h-4 w-4" /> {BRAND.email}
                </a>
              </li>
              <li>
                <a href={`tel:+91${BRAND.phone}`} className="flex items-center gap-2 hover:text-foreground">
                  <Phone className="h-4 w-4" /> {BRAND.phoneDisplay}
                </a>
              </li>
              <li>
                <a
                  href={whatsappLink(`Hi ${BRAND.name} team!`)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 hover:text-foreground"
                >
                  <MessageCircle className="h-4 w-4" /> WhatsApp us
                </a>
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4" /> India
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:px-6">
            <span>
              © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> Support: Mon–Sat, 10 AM – 7 PM IST
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
