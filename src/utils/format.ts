export function formatDate(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : new Intl.DateTimeFormat('en-MY', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur'}).format(date);
}
export function formatTime(value: string | number | null | undefined): string {
  if (!value || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))) return 'Time not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time not recorded' : new Intl.DateTimeFormat('en-MY', {hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur'}).format(date);
}
export function formatDateTime(value: string | null | undefined): string {
  const date = formatDate(value);
  if (date === 'Not recorded' || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))) return date;
  return `${date} · ${formatTime(value)} MYT`;
}
