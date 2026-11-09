import { validate as isUuid } from 'uuid';
import { PaymentStatus } from '../enums/payment-status.enum';
import { BusinessRuleViolationException } from '../exceptions/business-rule-violation.exception';
import { DomainValidationException } from '../exceptions/domain-validation.exception';
import { MAX_CHECKOUT_ID_LENGTH } from '../constants/validation/payment.constants';

export type ResolvedPaymentStatus = Exclude<PaymentStatus, PaymentStatus.PENDING>;

export interface CreatePaymentProps {
  id: string;
  workOrderId: string;
  amount: number;
  checkoutId: string;
  checkoutUrl: string;
  expiresAt: Date;
}

export type PaymentProps = CreatePaymentProps & {
  status: PaymentStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export class Payment {
  readonly id: string;
  readonly workOrderId: string;
  readonly amount: number;
  readonly checkoutId: string;
  readonly checkoutUrl: string;
  readonly expiresAt: Date;
  private _status: PaymentStatus;
  version: number;
  readonly createdAt: Date;
  updatedAt: Date;

  private constructor(props: PaymentProps) {
    this.id = props.id;
    this.workOrderId = props.workOrderId;
    this.amount = props.amount;
    this.checkoutId = props.checkoutId;
    this.checkoutUrl = props.checkoutUrl;
    this.expiresAt = props.expiresAt;
    this._status = props.status;
    this.version = props.version;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static reconstitute(props: PaymentProps): Payment {
    return new Payment(props);
  }

  static create(props: CreatePaymentProps): Payment {
    Payment.validateId(props.id);
    Payment.validateWorkOrderId(props.workOrderId);
    Payment.validateAmount(props.amount);
    Payment.validateCheckoutId(props.checkoutId);
    Payment.validateCheckoutUrl(props.checkoutUrl);
    Payment.validateExpiresAt(props.expiresAt);

    const now = new Date();

    return new Payment({
      ...props,
      status: PaymentStatus.PENDING,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  resolve(status: ResolvedPaymentStatus): void {
    if (this._status !== PaymentStatus.PENDING) {
      throw new BusinessRuleViolationException(
        `Cobrança só pode ser encerrada no status PENDING. Status atual: "${this._status}"`,
      );
    }

    this._status = status;
    this.updatedAt = new Date();
  }

  static ensureChargeableAmount(amount: number, balance: number): void {
    Payment.validateAmount(amount);

    if (amount > balance) {
      throw new DomainValidationException(
        `O valor da cobrança não pode ser maior que o saldo da ordem de serviço. Saldo atual: ${balance.toFixed(2)}`,
      );
    }
  }

  private static validateId(id: string): void {
    if (!id?.trim()) {
      throw new DomainValidationException('ID da cobrança é obrigatório');
    }

    if (!isUuid(id)) {
      throw new DomainValidationException('ID da cobrança deve ser um UUID válido');
    }
  }

  private static validateWorkOrderId(workOrderId: string): void {
    if (!workOrderId?.trim()) {
      throw new DomainValidationException('ID da ordem de serviço é obrigatório');
    }

    if (!isUuid(workOrderId)) {
      throw new DomainValidationException('ID da ordem de serviço deve ser um UUID válido');
    }
  }

  private static validateAmount(amount: number): void {
    if (amount === undefined || amount === null) {
      throw new DomainValidationException('O valor da cobrança é obrigatório');
    }

    // Negated so NaN, which fails every comparison, is rejected too.
    if (!(amount > 0)) {
      throw new DomainValidationException('O valor da cobrança deve ser maior que zero');
    }
  }

  private static validateCheckoutId(checkoutId: string): void {
    if (!checkoutId?.trim()) {
      throw new DomainValidationException('ID do checkout é obrigatório');
    }

    if (checkoutId.length > MAX_CHECKOUT_ID_LENGTH) {
      throw new DomainValidationException(
        `ID do checkout deve ter no máximo ${MAX_CHECKOUT_ID_LENGTH} caracteres`,
      );
    }
  }

  private static validateCheckoutUrl(checkoutUrl: string): void {
    if (!checkoutUrl?.trim()) {
      throw new DomainValidationException('URL do checkout é obrigatória');
    }

    if (URL.parse(checkoutUrl)?.protocol !== 'https:') {
      throw new DomainValidationException('URL do checkout deve ser uma URL https válida');
    }
  }

  private static validateExpiresAt(expiresAt: Date): void {
    if (!expiresAt) {
      throw new DomainValidationException('Data de expiração da cobrança é obrigatória');
    }

    if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) {
      throw new DomainValidationException('Data de expiração da cobrança inválida');
    }

    if (expiresAt.getTime() <= Date.now()) {
      throw new DomainValidationException('Data de expiração da cobrança deve ser futura');
    }
  }

  get status(): PaymentStatus {
    return this._status;
  }
}
