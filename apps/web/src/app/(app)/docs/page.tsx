import Link from 'next/link';
import { BookOpen, Bot, KeyRound, MessageCircle, Phone, Plug, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/misc';

const sections = [
  {
    icon: Bot,
    title: '1. Set up your agent',
    body: [
      'Go to Agent Config → Personality. Give your agent a name, choose a tone and language, and add any rules it must always follow.',
      'Use “Preview prompt” to see exactly what the AI is told.',
    ],
    link: { href: '/agent?tab=personality', label: 'Open Personality' },
  },
  {
    icon: BookOpen,
    title: '2. Teach it your business',
    body: [
      'Fill in Knowledge Base → Business details, Products & services and Common questions. Write it the way you would brief a new employee.',
      'Changes save automatically and apply to the very next message.',
    ],
    link: { href: '/knowledge', label: 'Open Knowledge Base' },
  },
  {
    icon: KeyRound,
    title: '3. Add your AI key',
    body: [
      'Agent Config → API Keys. Pick a provider (OpenAI, Anthropic, Google, Groq, OpenRouter, DeepSeek or Mistral), choose a model and paste your key.',
      'You pay the provider directly. Keys are encrypted and never shown again. Use “Test” to check it works.',
      'Cheaper models (marked $) are fine for most support conversations.',
    ],
    link: { href: '/agent?tab=keys', label: 'Open API Keys' },
  },
  {
    icon: MessageCircle,
    title: '4. Connect a channel',
    body: [
      'Telegram: create a bot with @BotFather and paste the token.',
      'WhatsApp Business API (recommended): add your Phone number ID, access token and app secret from Meta, then paste the Callback URL and Verify token into Meta’s webhook settings and subscribe to “messages”.',
      'WhatsApp QR: scan with your phone. This is unofficial and your number can be banned — use a spare number.',
    ],
    link: { href: '/agent?tab=channels', label: 'Open Channels' },
  },
  {
    icon: Sparkles,
    title: '5. Pick skills',
    body: [
      'Skills are ready-made behaviours, like FAQ Bot, Appointment Scheduler, Lead Capture, Complaint Handler, Order Tracker and Returns & Refunds.',
      'Need something custom? Describe it in Skill Store → AI Skill Creator.',
    ],
    link: { href: '/agent?tab=skills', label: 'Open Skills' },
  },
  {
    icon: Plug,
    title: '6. Connect Google apps (optional)',
    body: [
      'Google Calendar: appointments booked by the agent are added to your calendar.',
      'Google Sheets: captured leads are appended as rows. Choose the sheet after connecting.',
      'Gmail sends confirmation emails. Drive & Docs let the agent look up your documents.',
    ],
    link: { href: '/integrations', label: 'Open Integrations' },
  },
  {
    icon: Phone,
    title: 'Boss Mode',
    body: [
      'Add your own number in Agent Config → Personality → Boss Mode. Then message your agent from that number:',
      '“stats”: today’s numbers · “info: Closed Monday for Diwali” · “product: Mango shake ₹120” · “faq: Do you deliver? | Yes, within 5 km” · “pause” / “resume” · “help”.',
      'On Telegram, tap “Share contact” in the bot once so it knows your number.',
    ],
  },
];

export default function DocsPage() {
  return (
    <div className="max-w-4xl">
      <PageHeader title="Documentation" description="Everything you need to get your AI partner live." />
      <div className="space-y-4">
        {sections.map(({ icon: Icon, title, body, link }) => (
          <Card key={title}>
            <CardHeader className="flex-row items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Icon className="h-4.5 w-4.5" />
              </span>
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm leading-relaxed text-muted-foreground">
              {body.map((p) => (
                <p key={p}>{p}</p>
              ))}
              {link && (
                <Link href={link.href} className="inline-block pt-1 font-medium text-primary hover:underline">
                  {link.label} →
                </Link>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
