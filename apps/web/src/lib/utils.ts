import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO } from 'date-fns';
import { uk } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(value: number | string | null | undefined) {
  const n = Number(value || 0);
  return new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency: 'UAH',
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatDateTime(value: string | Date) {
  const d = typeof value === 'string' ? parseISO(value) : value;
  return format(d, 'd MMM yyyy, HH:mm', { locale: uk });
}

export function formatDate(value: string | Date) {
  const d = typeof value === 'string' ? parseISO(value) : value;
  return format(d, 'd MMMM yyyy', { locale: uk });
}

export function formatTime(value: string | Date) {
  const d = typeof value === 'string' ? parseISO(value) : value;
  return format(d, 'HH:mm', { locale: uk });
}

export const statusLabels: Record<string, string> = {
  PENDING: 'Очікує',
  CONFIRMED: 'Підтверджено',
  IN_PROGRESS: 'В процесі',
  COMPLETED: 'Завершено',
  CANCELLED: 'Скасовано',
  NO_SHOW: 'Не зʼявився',
};

export const statusColors: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  CONFIRMED: 'bg-emerald-100 text-emerald-800',
  IN_PROGRESS: 'bg-sky-100 text-sky-800',
  COMPLETED: 'bg-slate-100 text-slate-700',
  CANCELLED: 'bg-rose-100 text-rose-800',
  NO_SHOW: 'bg-orange-100 text-orange-800',
};

export const roleLabels: Record<string, string> = {
  OWNER: 'Власник',
  ADMIN: 'Адмін',
  RECEPTION: 'Рецепція',
  MASTER: 'Майстер',
  ACCOUNTANT: 'Бухгалтер',
};

export const paymentLabels: Record<string, string> = {
  CASH: 'Готівка',
  CARD: 'Картка',
  MIXED: 'Змішана',
  TRANSFER: 'Переказ',
  LIQPAY: 'LiqPay',
};

/** Google Calendar “Add event” deep link */
export function googleCalendarUrl(params: {
  title: string;
  startAt: string | Date;
  endAt: string | Date;
  details?: string;
  location?: string;
}) {
  const start = typeof params.startAt === 'string' ? parseISO(params.startAt) : params.startAt;
  const end = typeof params.endAt === 'string' ? parseISO(params.endAt) : params.endAt;
  const fmt = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: params.title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: params.details || '',
    location: params.location || '',
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** ICS data URL for download */
export function appointmentIcsBlob(params: {
  title: string;
  startAt: string | Date;
  endAt: string | Date;
  description?: string;
  location?: string;
  uid?: string;
}) {
  const start = typeof params.startAt === 'string' ? parseISO(params.startAt) : params.startAt;
  const end = typeof params.endAt === 'string' ? parseISO(params.endAt) : params.endAt;
  const stamp = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  const uid = params.uid || `${Date.now()}@masterofbeauty`;
  const esc = (s: string) => s.replace(/\n/g, '\\n').replace(/,/g, '\\,');
  const body = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Master of Beauty//CRM//UK',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(params.title)}`,
    params.description ? `DESCRIPTION:${esc(params.description)}` : '',
    params.location ? `LOCATION:${esc(params.location)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
  return new Blob([body], { type: 'text/calendar;charset=utf-8' });
}
