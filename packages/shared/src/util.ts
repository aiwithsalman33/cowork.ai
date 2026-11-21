/** Strip everything except digits — used to compare phone numbers across channels. */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, '');
}

export const TOOLKIT_META: Record<string, { name: string; description: string }> = {
  gmail: { name: 'Gmail', description: 'Send emails and confirmations from your inbox' },
  googlecalendar: { name: 'Google Calendar', description: 'Put AI-booked appointments on your calendar' },
  googlesheets: { name: 'Google Sheets', description: 'Log captured leads into a spreadsheet' },
  googledrive: { name: 'Google Drive', description: 'Let the agent search your files' },
  googledocs: { name: 'Google Docs', description: 'Let the agent read your documents' },
};
