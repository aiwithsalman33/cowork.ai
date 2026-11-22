/** Single place for product name and public contact details. */
export const BRAND = {
  name: 'CoWork AI',
  tagline: 'Your AI co-worker for WhatsApp & Telegram',
  url: 'https://coworkai.zenautomations.in',
  email: 'aiwithsalman33@gmail.com',
  phone: '8148035472',
  phoneDisplay: '+91 81480 35472',
  /** wa.me format: country code + number, digits only */
  whatsapp: '918148035472',
} as const;

export function whatsappLink(text: string): string {
  return `https://wa.me/${BRAND.whatsapp}?text=${encodeURIComponent(text)}`;
}
