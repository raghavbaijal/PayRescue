import type { TransactionStatus, PaymentMethod } from '../types';

export function formatPaiseToRupees(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(rupees);
}

export function formatDate(isoString: string): string {
  if (!isoString) return '-';
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

export function getStatusBadgeStyle(status: TransactionStatus): { bg: string; text: string; border: string; label: string } {
  switch (status) {
    case 'recovered':
      return {
        bg: 'bg-emerald-950/50',
        text: 'text-emerald-400',
        border: 'border-emerald-800/60',
        label: 'RECOVERED'
      };
    case 'retry_scheduled':
      return {
        bg: 'bg-amber-950/50',
        text: 'text-amber-400',
        border: 'border-amber-800/60',
        label: 'RETRY SCHEDULED'
      };
    case 'promise_to_pay':
      return {
        bg: 'bg-amber-950/50',
        text: 'text-amber-300',
        border: 'border-amber-700/60',
        label: 'PROMISE TO PAY'
      };
    case 'processing':
      return {
        bg: 'bg-blue-950/50',
        text: 'text-blue-400',
        border: 'border-blue-800/60',
        label: 'PROCESSING'
      };
    case 'escalated':
      return {
        bg: 'bg-rose-950/50',
        text: 'text-rose-400',
        border: 'border-rose-800/60',
        label: 'ESCALATED'
      };
    case 'stopped':
      return {
        bg: 'bg-rose-950/60',
        text: 'text-rose-400',
        border: 'border-rose-900/60',
        label: 'STOPPED'
      };
    case 'pending':
    default:
      return {
        bg: 'bg-slate-900/80',
        text: 'text-slate-300',
        border: 'border-slate-700/60',
        label: 'PENDING'
      };
  }
}

export function getMethodBadge(method: PaymentMethod): string {
  switch (method) {
    case 'upi':
      return 'UPI';
    case 'card':
      return 'CARD';
    case 'netbanking':
      return 'NETBANKING';
    case 'wallet':
      return 'WALLET';
    default:
      return String(method).toUpperCase();
  }
}
