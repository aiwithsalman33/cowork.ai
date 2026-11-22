import Link from 'next/link';
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Flag,
  IndianRupee,
  Languages,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  ShieldCheck,
  Sheet,
  Sparkles,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { BRAND, PLANS, formatLimit, whatsappLink } from '@cowork/shared';
import { Logo } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { LandingNav } from '@/components/landing/nav';
import { ContactForm } from '@/components/landing/contact-form';

const stats = [
  ['40+', 'AI skills'],
  ['7', 'AI providers'],
  ['15 min', 'setup time'],
  ['24/7', 'availability'],
];

const without = [
  'Phone keeps buzzing at 10 PM with “are you open tomorrow?”',
  'Hours every day typing the same price and timing answers',
  'Customer asks on Sunday, you reply Monday — they already bought elsewhere',
  'Leads scattered across chats, nobody follows up',
  'Auto-replies that sound like a robot and answer nothing',
];
const withUs = [
  'Replies in seconds, any hour, in the customer’s language',
  'Answers prices, timings and stock straight from your Google Sheet',
  'Books appointments into Google Calendar automatically',
  'Every lead saved to your sheet with name, phone and need',
  'You take over the chat anytime with one tap',
];

const pillars: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Zap,
    title: 'Live in minutes',
    text: 'Pick your skills, add your business details, connect WhatsApp or Telegram — done.',
  },
  {
    icon: MessageCircle,
    title: 'One brain, every chat',
    text: 'WhatsApp Business API, WhatsApp QR and Telegram, all from one dashboard.',
  },
  {
    icon: BrainCircuit,
    title: 'Remembers customers',
    text: 'Names, preferences and past orders — returning customers never repeat themselves.',
  },
  {
    icon: Sheet,
    title: 'Reads your Google Sheets',
    text: 'Live price lists and stock, and every lead logged as a new row.',
  },
];

const providers = [
  { name: 'OpenAI', models: 'GPT-4.1, GPT-5', color: 'bg-neutral-900' },
  { name: 'Anthropic', models: 'Claude Haiku, Sonnet', color: 'bg-[#c96442]' },
  { name: 'Google', models: 'Gemini Flash, Pro', color: 'bg-[#4285f4]' },
  { name: 'Groq', models: 'Llama 3.3 (fast)', color: 'bg-[#f55036]' },
  { name: 'OpenRouter', models: '200+ models', color: 'bg-[#6467f2]' },
  { name: 'DeepSeek', models: 'DeepSeek Chat', color: 'bg-[#4d6bfe]' },
  { name: 'Mistral', models: 'Small, Large', color: 'bg-[#fa520f]' },
];

const industries = [
  {
    emoji: '🍛',
    name: 'Restaurant & Cloud Kitchen',
    tint: 'from-orange-50 to-white border-orange-200 dark:from-orange-950/40 dark:to-card dark:border-orange-900/50',
    pains: ['Orders missed during rush hour', 'Same menu questions all day'],
    gains: ['Takes orders on WhatsApp 24/7', 'Menu & prices from your sheet'],
    chat: [
      ['me', 'Paneer butter masala available tonight?'],
      ['ai', 'Yes! Paneer Butter Masala is ₹260, ready in 25 mins. Want garlic naan with it?'],
      ['me', '2 naan, deliver to Anna Nagar'],
      ['ai', 'Done ✅ ₹340 total, arriving by 8:15 PM. Your name please?'],
    ],
  },
  {
    emoji: '💇',
    name: 'Salon & Spa',
    tint: 'from-pink-50 to-white border-pink-200 dark:from-pink-950/40 dark:to-card dark:border-pink-900/50',
    pains: ['Calls while you’re with a client', 'Double bookings'],
    gains: ['Books slots in Google Calendar', 'Reminds clients automatically'],
    chat: [
      ['me', 'Hair spa this Saturday evening?'],
      ['ai', 'Saturday we have 5:00 PM or 6:30 PM. Which suits you?'],
      ['me', '6:30 please'],
      ['ai', 'Booked ✨ Hair spa, Sat 6:30 PM (₹1,200). See you!'],
    ],
  },
  {
    emoji: '🩺',
    name: 'Clinic & Diagnostics',
    tint: 'from-sky-50 to-white border-sky-200 dark:from-sky-950/40 dark:to-card dark:border-sky-900/50',
    pains: ['Reception lines always busy', 'Repeated timing & fee questions'],
    gains: ['Books consultations 24/7', 'Shares doctor timings & fees'],
    chat: [
      ['me', 'Is Dr. Meena available tomorrow?'],
      ['ai', 'Dr. Meena has 11:00 AM and 4:30 PM free. Consultation is ₹500. Book one?'],
      ['me', '4:30 for my father'],
      ['ai', 'Confirmed for 4:30 PM ✅ Please share the patient’s name and age.'],
    ],
  },
  {
    emoji: '🏠',
    name: 'Real Estate',
    tint: 'from-amber-50 to-white border-amber-200 dark:from-amber-950/40 dark:to-card dark:border-amber-900/50',
    pains: ['Leads enquire and vanish', 'Site visits planned on paper'],
    gains: ['Qualifies budget & location', 'Books site visits, logs leads'],
    chat: [
      ['me', 'Looking for 2BHK near OMR under 70L'],
      ['ai', 'We have 3 options on OMR from ₹58L to ₹68L. Want a site visit this weekend?'],
      ['me', 'Sunday morning'],
      ['ai', 'Site visit fixed for Sunday 11 AM 🏡 I’ve shared your details with our agent.'],
    ],
  },
  {
    emoji: '🎓',
    name: 'Coaching & Tuition',
    tint: 'from-violet-50 to-white border-violet-200 dark:from-violet-950/40 dark:to-card dark:border-violet-900/50',
    pains: ['Parents asking fees again and again', 'Demo classes not followed up'],
    gains: ['Shares batches & fees instantly', 'Books free demo classes'],
    chat: [
      ['me', 'Class 10 maths batch timings?'],
      ['ai', 'Weekday batch 6–7:30 PM, weekend 10 AM–12 PM. Fee ₹2,500/month. Free demo?'],
      ['me', 'Yes, Saturday'],
      ['ai', 'Demo booked for Saturday 10 AM 📚 We’ll remind you a day before.'],
    ],
  },
  {
    emoji: '🛍️',
    name: 'Retail & E-commerce',
    tint: 'from-emerald-50 to-white border-emerald-200 dark:from-emerald-950/40 dark:to-card dark:border-emerald-900/50',
    pains: ['“Is this in stock?” all day', 'COD and delivery questions'],
    gains: ['Live stock from Google Sheets', 'Captures orders as leads'],
    chat: [
      ['me', 'Blue kurti size M in stock?'],
      ['ai', 'Yes! 4 left in M, ₹899 with free delivery above ₹999. COD available.'],
      ['me', 'Book 1, Coimbatore'],
      ['ai', 'Order noted 🛍️ We’ll confirm on this number within an hour.'],
    ],
  },
];

const faqs = [
  [
    'Will my customers know it’s an AI?',
    'Only if you want them to. You choose its name, tone and language — most customers simply get fast, helpful answers.',
  ],
  [
    'Can it reply in Tamil, Hindi or Hinglish?',
    'Yes. It replies in the language and script the customer uses — English, Hindi, Hinglish, Tamil, Telugu, Kannada, Malayalam and more.',
  ],
  [
    'What if the AI doesn’t know an answer?',
    'It only uses what you give it (knowledge base and sheets). If it doesn’t know, it says the team will get back and saves the request for you.',
  ],
  [
    'Will WhatsApp ban my number?',
    'Not with the official WhatsApp Business API, which we recommend. The QR option is unofficial and can get numbers banned — use a spare number for it.',
  ],
  [
    'How does Google Sheets work?',
    'You connect Google with your own Google Cloud credentials, then pick a sheet the agent reads (prices, stock) and a sheet where it saves leads.',
  ],
  [
    'What does the AI cost me?',
    'You bring your own AI key and pay the provider directly — budget models cost a few paise per chat. We never add a markup.',
  ],
  [
    'How do I get access?',
    'Sign up and verify your email. Our team approves new accounts personally (usually within hours) and your free trial starts then.',
  ],
];

function Bubble({ me, children }: { me?: boolean; children: React.ReactNode }) {
  return (
    <div className={me ? 'flex justify-end' : 'flex'}>
      <p
        className={
          me
            ? 'max-w-[85%] rounded-xl rounded-br-sm bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground'
            : 'max-w-[90%] rounded-xl rounded-bl-sm border bg-card px-3 py-2 text-[13px] shadow-sm'
        }
      >
        {children}
      </p>
    </div>
  );
}

function SectionTitle({ title, sub, pill }: { title: string; sub?: string; pill?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {pill}
      <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {sub && <p className="mt-3 text-base text-muted-foreground sm:text-lg">{sub}</p>}
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <LandingNav />

      {/* ───────── Hero ───────── */}
      <section className="mx-auto max-w-6xl px-4 pb-10 pt-12 text-center sm:px-6 sm:pt-20">
        <span className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#e8711c] to-[#c2410c] px-4 py-1.5 text-xs font-semibold text-white shadow-lg shadow-orange-500/25 sm:text-sm">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          Early access open · 24-hour free trial · Made in India
        </span>
        <h1 className="mx-auto mt-8 max-w-4xl font-display text-5xl font-bold leading-[1.02] tracking-tight sm:text-7xl">
          Your Next Co-Worker
          <span className="block text-primary">Runs on AI.</span>
        </h1>
        <p className="mt-6 font-display text-2xl font-semibold text-muted-foreground sm:text-4xl">
          Replies in seconds. Never takes a day off.
        </p>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Small businesses lose customers to slow WhatsApp replies. {BRAND.name} answers every enquiry, quotes
          from your Google Sheet, books appointments and saves leads — in Tamil, Hindi or English, day and
          night.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm font-medium text-primary">
          {['15-minute setup', 'No credit card', 'Your own AI key'].map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> {t}
            </span>
          ))}
        </div>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" className="h-13 rounded-xl px-7 text-base shadow-lg shadow-primary/25" asChild>
            <Link href="/signup">
              Create Your AI Co-Worker <ArrowRight />
            </Link>
          </Button>
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" /> Takes less time than a chai break
          </span>
        </div>

        <div className="mt-16 border-t pt-10">
          <div className="flex flex-wrap items-end justify-center gap-x-12 gap-y-6">
            {stats.map(([v, l]) => (
              <div key={l} className="flex items-baseline gap-2">
                <span className="font-display text-4xl font-bold">{v}</span>
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {l}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Sound familiar ───────── */}
      <section className="border-y bg-card py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <SectionTitle
            title="Sound familiar?"
            sub="Every busy business owner knows these. Here’s what changes."
          />
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-red-200 bg-red-50/70 p-7 dark:border-red-900/50 dark:bg-red-950/20">
              <p className="text-xs font-bold uppercase tracking-wider text-red-600">Without {BRAND.name}</p>
              <ul className="mt-5 space-y-4">
                {without.map((t) => (
                  <li key={t} className="flex gap-3 text-[15px]">
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-red-500" /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-7 dark:border-emerald-900/50 dark:bg-emerald-950/20">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                With {BRAND.name}
              </p>
              <ul className="mt-5 space-y-4">
                {withUs.map((t) => (
                  <li key={t} className="flex gap-3 text-[15px]">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-10 text-center">
            <Button size="lg" className="rounded-xl" asChild>
              <Link href="/signup">
                Stop losing customers tonight <ArrowRight />
              </Link>
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              Free 24-hour trial · No credit card · Cancel anytime
            </p>
          </div>
        </div>
      </section>

      {/* ───────── Pillars ───────── */}
      <section id="features" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionTitle
            title="Your AI co-worker comes ready to work"
            sub="No prompts to write. Toggle the skills you need and go live."
          />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {pillars.map(({ icon: Icon, title, text }) => (
              <div
                key={title}
                className="rounded-2xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 font-display text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Providers ───────── */}
      <section className="border-y bg-card py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionTitle
            title="Bring your own AI. We support them all."
            sub="Use your own API key from any major provider. You control the model, the cost and the data."
          />
          <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {providers.map((p) => (
              <div
                key={p.name}
                className="flex flex-col items-center rounded-2xl border bg-background p-5 text-center"
              >
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-xl font-display text-lg font-bold text-white ${p.color}`}
                >
                  {p.name[0]}
                </span>
                <div className="mt-3 text-sm font-semibold">{p.name}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{p.models}</div>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-muted-foreground">
            No API key yet?{' '}
            <span className="font-medium text-primary">Groq and Google Gemini offer free tiers</span> —
            perfect to start.
          </p>
        </div>
      </section>

      {/* ───────── Use cases ───────── */}
      <section id="use-cases" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionTitle
            title="See it working for YOUR business"
            sub="Real problems, real conversations. Find your industry."
          />
          <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {industries.map((ind) => (
              <div
                key={ind.name}
                className={`overflow-hidden rounded-2xl border bg-gradient-to-b ${ind.tint}`}
              >
                <div className="p-6">
                  <h3 className="flex items-center gap-2.5 font-display text-lg font-semibold">
                    <span className="text-2xl">{ind.emoji}</span> {ind.name}
                  </h3>
                  <ul className="mt-4 space-y-1.5 text-sm">
                    {ind.pains.map((p) => (
                      <li
                        key={p}
                        className="flex items-center gap-2 text-muted-foreground line-through decoration-red-400/70"
                      >
                        <X className="h-3.5 w-3.5 shrink-0 text-red-500" /> {p}
                      </li>
                    ))}
                    {ind.gains.map((g) => (
                      <li key={g} className="flex items-center gap-2 font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> {g}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-2 border-t bg-background/70 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Live demo
                  </p>
                  {ind.chat.map(([who, text], i) => (
                    <Bubble key={i} me={who === 'me'}>
                      {text}
                    </Bubble>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Made in India ───────── */}
      <section className="border-y border-amber-200/70 bg-amber-50/60 py-20 dark:border-amber-900/40 dark:bg-amber-950/10">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <SectionTitle
            pill={
              <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-300 bg-card px-4 py-1 text-sm font-semibold text-amber-800 dark:border-amber-800 dark:text-amber-300">
                <Flag className="h-3.5 w-3.5" /> Built in India · for Indian businesses
              </span>
            }
            title="Indian SaaS, Indian pricing"
          />
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              {
                icon: IndianRupee,
                title: 'No AI markup. Ever.',
                text: 'Bring your own OpenAI, Claude or Gemini key and pay the provider directly. We don’t take a cut.',
              },
              {
                icon: Languages,
                title: 'Speaks your customers’ language',
                text: 'Tamil, Hindi, Telugu, Kannada, English — even Tanglish and Hinglish. It replies the way they type.',
              },
              {
                icon: ShieldCheck,
                title: 'Your data stays yours',
                text: 'Keys encrypted with AES-256. Google connected through your own OAuth app. Disconnect anytime.',
              },
            ].map(({ icon: Icon, title, text }) => (
              <div
                key={title}
                className="rounded-2xl border border-amber-200 bg-card p-6 text-center dark:border-amber-900/50"
              >
                <Icon className="mx-auto h-7 w-7 text-primary" />
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Pricing ───────── */}
      <section id="pricing" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionTitle
            pill={
              <span className="mb-5 inline-flex items-center gap-2 rounded-full bg-primary-soft px-4 py-1 text-sm font-semibold text-primary">
                <Sparkles className="h-3.5 w-3.5" /> Early access pricing
              </span>
            }
            title="Create your 24/7 AI co-worker"
            sub="Costs less than what you spend on chai every month."
          />
          <div className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-3">
            {Object.values(PLANS).map((p) => {
              const popular = p.id === 'STARTER';
              return (
                <div
                  key={p.id}
                  className={`relative flex flex-col rounded-2xl border bg-card p-7 ${popular ? 'border-2 border-primary shadow-xl shadow-primary/10' : ''}`}
                >
                  {(p.id === 'TRIAL' || popular) && (
                    <span
                      className={`absolute -top-px right-6 rounded-b-lg px-3 py-1 text-[11px] font-bold uppercase text-white ${popular ? 'bg-primary' : 'bg-emerald-600'}`}
                    >
                      {popular ? 'Most popular' : 'Start free'}
                    </span>
                  )}
                  <h3 className="font-display text-xl font-bold">{p.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>
                  <p className="mt-6 flex items-baseline gap-1.5">
                    <span className="font-display text-5xl font-bold">
                      {p.priceInr === 0 ? 'Free' : `₹${p.priceInr.toLocaleString('en-IN')}`}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {p.priceInr === 0 ? 'for 24 hours' : '/month'}
                    </span>
                  </p>
                  <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                    <li className="flex gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />{' '}
                      {formatLimit(p.limits.messagesPerMonth)} AI replies
                    </li>
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="mt-7 w-full rounded-xl"
                    size="lg"
                    variant={popular ? 'default' : 'outline'}
                    asChild
                  >
                    {p.id === 'TRIAL' ? (
                      <Link href="/signup">Start free trial</Link>
                    ) : (
                      <a
                        href={whatsappLink(`Hi! I'm interested in the ${BRAND.name} ${p.name} plan.`)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Get {p.name}
                      </a>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            New accounts are approved by our team — usually within a few hours.
          </p>
        </div>
      </section>

      {/* ───────── FAQ ───────── */}
      <section id="faq" className="scroll-mt-20 border-y bg-card py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <SectionTitle
            title="The questions every business owner asks us"
            sub="Straight answers. No fluff."
          />
          <div className="mt-10 space-y-3">
            {faqs.map(([q, a]) => (
              <details key={q} className="group rounded-2xl border bg-background px-5 py-4 open:shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {q}
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-muted-foreground transition-transform group-open:rotate-45">
                    <Plus className="h-3.5 w-3.5" />
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Still have questions? Email{' '}
            <a
              href={`mailto:${BRAND.email}`}
              className="font-medium text-primary underline underline-offset-2"
            >
              {BRAND.email}
            </a>{' '}
            or WhatsApp {BRAND.phoneDisplay}.
          </p>
        </div>
      </section>

      {/* ───────── Contact ───────── */}
      <section id="contact" className="scroll-mt-20 py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Let’s talk</h2>
            <p className="mt-3 text-muted-foreground">
              Want a demo, setup help or a custom plan? Send a message — it lands straight in our WhatsApp.
            </p>
            <div className="mt-8 space-y-3">
              {[
                {
                  icon: MessageCircle,
                  label: 'WhatsApp',
                  value: BRAND.phoneDisplay,
                  href: whatsappLink(`Hi ${BRAND.name} team!`),
                },
                { icon: Phone, label: 'Call us', value: BRAND.phoneDisplay, href: `tel:+91${BRAND.phone}` },
                { icon: Mail, label: 'Email', value: BRAND.email, href: `mailto:${BRAND.email}` },
              ].map(({ icon: Icon, label, value, href }) => (
                <a
                  key={label}
                  href={href}
                  target={href.startsWith('http') ? '_blank' : undefined}
                  rel="noreferrer"
                  className="flex items-center gap-4 rounded-2xl border bg-card p-4 transition-colors hover:border-primary/40"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="font-medium">{value}</div>
                  </div>
                </a>
              ))}
            </div>
          </div>
          <ContactForm />
        </div>
      </section>

      {/* ───────── CTA band ───────── */}
      <section className="bg-primary px-4 py-20 text-center text-primary-foreground dark:bg-[#4a1d0b] dark:text-white">
        <h2 className="mx-auto max-w-3xl font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Your competitors already reply in seconds.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg opacity-80">
          While you read this, their customers are getting answers. Yours can too — tonight.
        </p>
        <Button
          size="lg"
          className="mt-9 h-13 rounded-xl bg-white px-8 text-base text-primary hover:bg-white/90 dark:text-[#4a1d0b]"
          asChild
        >
          <Link href="/signup">
            Get your AI co-worker <ArrowRight />
          </Link>
        </Button>
        <p className="mt-4 text-sm opacity-70">24-hour free trial · No credit card · Approved within hours</p>
      </section>

      {/* ───────── Footer ───────── */}
      <footer className="bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
          <div>
            <Logo className="[&_img]:h-9" />
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">{BRAND.tagline}.</p>
          </div>
          <div className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm">
            <a href="#features" className="text-muted-foreground hover:text-foreground">
              Features
            </a>
            <a
              href={`mailto:${BRAND.email}`}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <Mail className="h-4 w-4" /> {BRAND.email}
            </a>
            <a href="#pricing" className="text-muted-foreground hover:text-foreground">
              Pricing
            </a>
            <a
              href={`tel:+91${BRAND.phone}`}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <Phone className="h-4 w-4" /> {BRAND.phoneDisplay}
            </a>
            <a href="#faq" className="text-muted-foreground hover:text-foreground">
              FAQ
            </a>
            <a
              href={whatsappLink(`Hi ${BRAND.name} team!`)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp us
            </a>
            <Link href="/login" className="text-muted-foreground hover:text-foreground">
              Sign in
            </Link>
          </div>
        </div>
        <div className="border-t">
          <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted-foreground sm:px-6">
            © {new Date().getFullYear()} {BRAND.name} — AI co-workers for WhatsApp &amp; Telegram ·{' '}
            {BRAND.url.replace('https://', '')}
          </p>
        </div>
      </footer>
    </div>
  );
}
