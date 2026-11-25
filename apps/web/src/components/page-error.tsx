'use client';
import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Shown instead of a blank page. After a new deploy, old page files are gone: reload once by itself. */
export function PageError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    if (
      !/ChunkLoadError|Loading (CSS )?chunk|dynamically imported module|Failed to load chunk/i.test(
        `${error.name} ${error.message}`,
      )
    )
      return;
    try {
      const last = Number(sessionStorage.getItem('chunk_reload') ?? 0);
      if (Date.now() - last < 30_000) return;
      sessionStorage.setItem('chunk_reload', String(Date.now()));
      window.location.reload();
    } catch {
      /* storage unavailable: the buttons below still work */
    }
  }, [error]);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <h1 className="text-lg font-semibold">This page could not be shown</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Your data is safe. Try again, or reload the page.
      </p>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    </div>
  );
}
