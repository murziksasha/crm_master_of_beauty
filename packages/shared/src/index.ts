/** Shared domain types for Master of Beauty CRM (API + Web). */

export type AppRole = 'OWNER' | 'ADMIN' | 'RECEPTION' | 'MASTER' | 'ACCOUNTANT';

export type AppointmentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export type PaymentMethod = 'CASH' | 'CARD' | 'MIXED' | 'TRANSFER' | 'LIQPAY';

export type SaleStatus = 'PAID' | 'REFUNDED';

export type CashShiftStatus = 'OPEN' | 'CLOSED';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: AppRole | string;
  staffProfileId?: string | null;
}

export interface BranchSummary {
  id: string;
  name: string;
  slug: string;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface AppointmentSummary {
  id: string;
  clientId: string;
  staffId: string;
  branchId?: string | null;
  startAt: string;
  endAt: string;
  status: AppointmentStatus | string;
  notes?: string | null;
}

export interface SaleSummary {
  id: string;
  number: string;
  total: number | string;
  method: PaymentMethod | string;
  status: SaleStatus | string;
  paidAt: string;
}

export interface CommissionRow {
  staffId: string;
  name: string;
  commissionPct: number;
  revenue: number;
  serviceRevenue: number;
  productRevenue: number;
  commission: number;
  salesCount: number;
}

export interface SuggestStaffOption {
  staffId: string;
  displayName: string;
  color?: string;
  preferred: boolean;
  slotsCount: number;
  nextSlots: string[];
  durationMin: number;
}

export const statusLabelsUk: Record<string, string> = {
  PENDING: 'Очікує',
  CONFIRMED: 'Підтверджено',
  IN_PROGRESS: 'В процесі',
  COMPLETED: 'Завершено',
  CANCELLED: 'Скасовано',
  NO_SHOW: 'Неявка',
};

export const paymentLabelsUk: Record<string, string> = {
  CASH: 'Готівка',
  CARD: 'Картка',
  MIXED: 'Змішана',
  TRANSFER: 'Переказ',
  LIQPAY: 'LiqPay',
};
