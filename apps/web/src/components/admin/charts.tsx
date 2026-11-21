'use client';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatNumber } from '@/lib/utils';

type Point = { day: string; inbound: number; outbound: number; tokens: number; signups: number };

const axis = { stroke: 'var(--muted-foreground)', fontSize: 11, tickLine: false, axisLine: false } as const;
const fmtDay = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

function TooltipBox({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-foreground">{label ? fmtDay(label) : ''}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}:{' '}
          <span className="font-medium text-foreground tabular-nums">{p.value.toLocaleString('en-IN')}</span>
        </div>
      ))}
    </div>
  );
}

/** Two series on ONE axis (same unit: messages). Legend + crosshair tooltip. */
export function MessagesChart({ data }: { data: Point[] }) {
  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-muted-foreground" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: 'var(--chart-1)' }} /> Customer messages
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: 'var(--chart-2)' }} /> AI replies
        </span>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="day" tickFormatter={fmtDay} minTickGap={24} {...axis} />
          <YAxis allowDecimals={false} tickFormatter={formatNumber} {...axis} />
          <Tooltip
            content={<TooltipBox />}
            cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }}
          />
          <Line
            type="monotone"
            dataKey="inbound"
            name="Customer messages"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="outbound"
            name="AI replies"
            stroke="var(--chart-2)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SignupsChart({ data }: { data: Point[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }} barCategoryGap={2}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="day" tickFormatter={fmtDay} minTickGap={24} {...axis} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip content={<TooltipBox />} cursor={{ fill: 'var(--muted)' }} />
        <Bar dataKey="signups" name="Signups" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TokensChart({ data }: { data: Point[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="day" tickFormatter={fmtDay} minTickGap={24} {...axis} />
        <YAxis tickFormatter={formatNumber} {...axis} />
        <Tooltip
          content={<TooltipBox />}
          cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }}
        />
        <Area
          type="monotone"
          dataKey="tokens"
          name="Tokens"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="var(--chart-1)"
          fillOpacity={0.12}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
