import type { ChannelStatus, ChannelType } from '@partner/shared';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';

export function ChannelIcon({ type, className }: { type: ChannelType; className?: string }) {
  if (type === 'TELEGRAM') {
    return (
      <svg viewBox="0 0 24 24" className={cn('h-4 w-4', className)} fill="currentColor" aria-label="Telegram">
        <path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.5 13.2l-4.7-1.5c-1-.3-1-1 .2-1.5L20.6 3c.9-.3 1.6.2 1.3 1.3Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={cn('h-4 w-4', className)} fill="currentColor" aria-label="WhatsApp">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2l-.5-.4Z" />
    </svg>
  );
}

export const CHANNEL_LABEL: Record<ChannelType, string> = {
  TELEGRAM: 'Telegram',
  WHATSAPP_QR: 'WhatsApp (QR)',
  WHATSAPP_CLOUD: 'WhatsApp Business API',
};

export function ChannelStatusBadge({ status }: { status: ChannelStatus }) {
  const map: Record<ChannelStatus, { label: string; variant: 'success' | 'warning' | 'secondary' | 'destructive' }> = {
    CONNECTED: { label: 'Connected', variant: 'success' },
    CONNECTING: { label: 'Connecting…', variant: 'warning' },
    QR: { label: 'Waiting for scan', variant: 'warning' },
    DISCONNECTED: { label: 'Disconnected', variant: 'secondary' },
    ERROR: { label: 'Error', variant: 'destructive' },
  };
  const m = map[status];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}
