'use client';
import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn('text-sm font-medium leading-none', className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  // Associate the label with a single input child automatically (accessibility + getByLabel).
  const autoId = React.useId();
  const child = React.Children.only(children);
  const isInput =
    React.isValidElement<{ id?: string }>(child) &&
    typeof child.type !== 'string' &&
    ['Input', 'Textarea'].includes((child.type as { displayName?: string }).displayName ?? '');
  const id =
    htmlFor ?? (isInput ? ((child as React.ReactElement<{ id?: string }>).props.id ?? autoId) : undefined);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {isInput && !htmlFor
        ? React.cloneElement(child as React.ReactElement<{ id?: string }>, { id })
        : children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
