/** Works out which values a WhatsApp template needs, and builds the Graph API payload from them. */
export interface TemplateComponent {
  type: string;
  format?: string;
  text?: string;
  buttons?: { type: string; text?: string; url?: string }[];
  cards?: unknown[];
}

export interface TemplateField {
  part: 'header' | 'body' | 'button';
  kind: 'text' | 'image' | 'video' | 'document' | 'code';
  /** placeholder name as written in the template: "1" or "customer_name" */
  name: string;
  label: string;
  buttonIndex?: number;
  buttonType?: 'url' | 'copy_code';
}

interface TemplateSource {
  header: string | null;
  body: string;
  components: unknown;
}

const VAR = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
const type = (c: TemplateComponent) => c.type.toUpperCase();

/** Distinct placeholders; numbered ones in numeric order, named ones in order of appearance. */
export function placeholders(text: string): string[] {
  const names = [...new Set([...text.matchAll(VAR)].map((m) => m[1]!))];
  return names.every((n) => /^\d+$/.test(n)) ? names.sort((a, b) => Number(a) - Number(b)) : names;
}

function componentsOf(t: TemplateSource): TemplateComponent[] {
  if (Array.isArray(t.components) && t.components.length) return t.components as TemplateComponent[];
  return [
    ...(t.header ? [{ type: 'HEADER', format: 'TEXT', text: t.header }] : []),
    { type: 'BODY', text: t.body },
  ];
}

/** Reason this template cannot be sent from here, or null. */
export function unsupportedReason(t: TemplateSource): string | null {
  for (const c of componentsOf(t)) {
    if (type(c) === 'CAROUSEL') return 'Carousel templates can only be sent from Meta.';
    if (type(c) === 'LIMITED_TIME_OFFER') return 'Limited-time-offer templates can only be sent from Meta.';
    if (
      type(c) === 'HEADER' &&
      c.format &&
      !['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'].includes(c.format.toUpperCase())
    )
      return `Templates with a ${c.format.toLowerCase()} header are not supported.`;
    for (const b of c.buttons ?? [])
      if (['FLOW', 'CATALOG', 'MPM'].includes(b.type.toUpperCase()))
        return `Templates with a ${b.type.toLowerCase()} button are not supported.`;
  }
  return null;
}

export function templateFields(t: TemplateSource): TemplateField[] {
  const out: TemplateField[] = [];
  const all = componentsOf(t);
  for (const c of all.filter((x) => type(x) === 'HEADER')) {
    const format = (c.format ?? 'TEXT').toUpperCase();
    if (format === 'TEXT')
      for (const name of placeholders(c.text ?? ''))
        out.push({ part: 'header', kind: 'text', name, label: `Header {{${name}}}` });
    else if (format === 'IMAGE' || format === 'VIDEO' || format === 'DOCUMENT') {
      const kind = format.toLowerCase() as 'image' | 'video' | 'document';
      out.push({ part: 'header', kind, name: kind, label: `Header ${kind} link (https://…)` });
    }
  }
  for (const c of all.filter((x) => type(x) === 'BODY'))
    for (const name of placeholders(c.text ?? ''))
      out.push({ part: 'body', kind: 'text', name, label: `Value for {{${name}}}` });
  for (const c of all.filter((x) => type(x) === 'BUTTONS'))
    (c.buttons ?? []).forEach((b, buttonIndex) => {
      const bt = b.type.toUpperCase();
      if (bt === 'URL' && placeholders(b.url ?? '').length)
        out.push({
          part: 'button',
          kind: 'text',
          name: '1',
          label: `Link ending for button “${b.text ?? 'URL'}”`,
          buttonIndex,
          buttonType: 'url',
        });
      else if (bt === 'COPY_CODE')
        out.push({
          part: 'button',
          kind: 'code',
          name: 'code',
          label: 'Coupon code',
          buttonIndex,
          buttonType: 'copy_code',
        });
      else if (bt === 'OTP')
        out.push({
          part: 'button',
          kind: 'text',
          name: '1',
          label: 'One-time code',
          buttonIndex,
          buttonType: 'url',
        });
    });
  return out;
}

/** Error text when the values do not fit the fields, or null. */
export function checkValues(fields: TemplateField[], values: string[]): string | null {
  if (values.length !== fields.length) return `template needs ${fields.length} value(s)`;
  for (const [i, f] of fields.entries()) {
    const v = values[i]!.trim();
    if (!v) return `“${f.label}” is empty`;
    if (['image', 'video', 'document'].includes(f.kind) && !/^https:\/\/\S+$/.test(v))
      return `“${f.label}” must be a public https:// link`;
  }
  return null;
}

export function buildComponents(fields: TemplateField[], values: string[]): Record<string, unknown>[] {
  const parameter = (f: TemplateField, raw: string): Record<string, unknown> => {
    const v = raw.trim();
    if (f.kind === 'image' || f.kind === 'video' || f.kind === 'document')
      return { type: f.kind, [f.kind]: { link: v } };
    if (f.kind === 'code') return { type: 'coupon_code', coupon_code: v };
    return {
      type: 'text',
      // Meta rejects new lines, tabs and 5+ spaces inside values
      text: v.replace(/\s+/g, ' '),
      ...(f.part !== 'button' && !/^\d+$/.test(f.name) ? { parameter_name: f.name } : {}),
    };
  };
  const pairs = fields.map((f, i) => ({ f, p: parameter(f, values[i] ?? '') }));
  const out: Record<string, unknown>[] = [];
  for (const part of ['header', 'body'] as const) {
    const parameters = pairs.filter((x) => x.f.part === part).map((x) => x.p);
    if (parameters.length) out.push({ type: part, parameters });
  }
  for (const { f, p } of pairs.filter((x) => x.f.part === 'button'))
    out.push({ type: 'button', sub_type: f.buttonType, index: String(f.buttonIndex), parameters: [p] });
  return out;
}

/** Text shown in the conversation for a sent template. */
export function renderSent(
  t: TemplateSource & { footer: string | null },
  fields: TemplateField[],
  values: string[],
): string {
  const fill = (text: string, part: 'header' | 'body') =>
    text.replace(VAR, (m, name: string) => {
      const i = fields.findIndex((f) => f.part === part && f.name === name);
      return i >= 0 ? values[i]!.trim() : m;
    });
  const media = fields.findIndex((f) => ['image', 'video', 'document'].includes(f.kind));
  return [
    media >= 0 ? `[${fields[media]!.kind}] ${values[media]}` : null,
    t.header ? fill(t.header, 'header') : null,
    fill(t.body, 'body'),
    t.footer,
  ]
    .filter(Boolean)
    .join('\n');
}
