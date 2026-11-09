export enum PaymentStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}

export type FinalPaymentStatus = Exclude<PaymentStatus, PaymentStatus.PENDING>;
