'use client';
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';

export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
        <code className="min-w-0 flex-1 truncate text-xs">{value}</code>
        <button
          className="cursor-pointer text-muted-foreground hover:text-foreground"
          aria-label={`Copy ${label}`}
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            toast.success('Copied');
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
