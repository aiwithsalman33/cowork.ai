'use client';
import * as React from 'react';
import * as TP from '@radix-ui/react-tooltip';

export const TooltipProvider = TP.Provider;

export function Tooltip({
  content,
  children,
  side = 'right',
  disabled,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  disabled?: boolean;
}) {
  if (disabled) return <>{children}</>;
  return (
    <TP.Root delayDuration={150}>
      <TP.Trigger asChild>{children}</TP.Trigger>
      <TP.Portal>
        <TP.Content
          side={side}
          sideOffset={8}
          className="z-50 rounded-md bg-foreground px-2.5 py-1 text-xs text-background shadow-md"
        >
          {content}
        </TP.Content>
      </TP.Portal>
    </TP.Root>
  );
}
