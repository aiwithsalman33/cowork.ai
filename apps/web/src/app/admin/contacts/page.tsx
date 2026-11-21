'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mail, MessageCircle, Phone } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { get } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

type Msg = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  business: string | null;
  message: string;
  createdAt: string;
};

export default function AdminContacts() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-contacts', page],
    queryFn: () =>
      get<{ items: Msg[]; total: number; pageSize: number }>(
        `/admin/contact-messages?page=${page}&pageSize=30`,
      ),
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <PageHeader
        title="Contact messages"
        description="Enquiries from the landing page contact form (also sent to WhatsApp)."
      />
      {isLoading ? (
        <Skeleton className="h-60 rounded-xl" />
      ) : !data?.items.length ? (
        <EmptyState icon={MessageCircle} title="No enquiries yet" />
      ) : (
        <Card className="divide-y">
          {data.items.map((m) => {
            const digits = m.phone.replace(/\D/g, '');
            const wa = digits.length === 10 ? `91${digits}` : digits;
            return (
              <div key={m.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {m.name}
                    {m.business && <span className="font-normal text-muted-foreground"> · {m.business}</span>}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{m.message}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {m.phone}
                    </span>
                    {m.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {m.email}
                      </span>
                    )}
                    <span>{formatDateTime(m.createdAt)}</span>
                  </div>
                </div>
                <Button size="sm" variant="outline" asChild>
                  <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">
                    <MessageCircle /> Reply on WhatsApp
                  </a>
                </Button>
              </div>
            );
          })}
        </Card>
      )}
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Newer
          </Button>
          {page} / {pages}
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Older
          </Button>
        </div>
      )}
    </div>
  );
}
