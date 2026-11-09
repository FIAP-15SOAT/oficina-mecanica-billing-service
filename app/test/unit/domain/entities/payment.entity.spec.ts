import { randomUUID } from 'node:crypto';
import { CreatePaymentProps, Payment } from '@domain/entities/payment.entity';
import { FinalPaymentStatus, PaymentStatus } from '@domain/enums/payment-status.enum';
import { BusinessRuleViolationException } from '@domain/exceptions/business-rule-violation.exception';
import { DomainValidationException } from '@domain/exceptions/domain-validation.exception';
import { createMockPayment } from '../../../helpers/payment-mock.factory';

describe('Payment Entity', () => {
  describe('create()', () => {
    let props: CreatePaymentProps;

    beforeEach(() => {
      props = {
        id: randomUUID(),
        workOrderId: randomUUID(),
        amount: 100,
        checkoutId: 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3',
        checkoutUrl: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=1',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
    });

    it('should create a PENDING payment with version 1', () => {
      const payment = Payment.create(props);

      expect(payment).toMatchObject(props);
      expect(payment.status).toBe(PaymentStatus.PENDING);
      expect(payment.version).toBe(1);
      expect(payment.createdAt).toEqual(payment.updatedAt);
    });

    it.each([0, -10, Number.NaN])(
      'should reject a non-positive amount on create (%p)',
      (amount) => {
        const create = (): Payment => Payment.create({ ...props, amount });

        expect(create).toThrow(DomainValidationException);
        expect(create).toThrow('O valor da cobrança deve ser maior que zero');
      },
    );

    it.each<{ field: string; override: Partial<CreatePaymentProps>; message: string }>([
      { field: 'a blank id', override: { id: ' ' }, message: 'ID da cobrança é obrigatório' },
      {
        field: 'an id that is not a UUID',
        override: { id: 'payment-1' },
        message: 'ID da cobrança deve ser um UUID válido',
      },
      {
        field: 'a blank work order id',
        override: { workOrderId: '' },
        message: 'ID da ordem de serviço é obrigatório',
      },
      {
        field: 'a work order id that is not a UUID',
        override: { workOrderId: 'work-order-1' },
        message: 'ID da ordem de serviço deve ser um UUID válido',
      },
      {
        field: 'a missing amount',
        override: { amount: undefined },
        message: 'O valor da cobrança é obrigatório',
      },
      {
        field: 'a null amount',
        override: { amount: null as unknown as number },
        message: 'O valor da cobrança é obrigatório',
      },
      {
        field: 'a blank checkout id',
        override: { checkoutId: ' ' },
        message: 'ID do checkout é obrigatório',
      },
      {
        field: 'a checkout id longer than 64 characters',
        override: { checkoutId: 'O'.repeat(65) },
        message: 'ID do checkout deve ter no máximo 64 caracteres',
      },
      {
        field: 'a blank checkout url',
        override: { checkoutUrl: '' },
        message: 'URL do checkout é obrigatória',
      },
      {
        field: 'a checkout url that does not parse',
        override: { checkoutUrl: 'not a url' },
        message: 'URL do checkout deve ser uma URL https válida',
      },
      {
        field: 'a checkout url over http',
        override: { checkoutUrl: 'http://www.mercadopago.com.br/checkout/v1/redirect' },
        message: 'URL do checkout deve ser uma URL https válida',
      },
      {
        field: 'a missing expiration date',
        override: { expiresAt: undefined },
        message: 'Data de expiração da cobrança é obrigatória',
      },
      {
        field: 'an expiration that is not a date',
        override: { expiresAt: '2026-12-01T00:00:00.000Z' as unknown as Date },
        message: 'Data de expiração da cobrança inválida',
      },
      {
        field: 'an invalid expiration date',
        override: { expiresAt: new Date('invalid') },
        message: 'Data de expiração da cobrança inválida',
      },
      {
        field: 'an expiration date in the past',
        override: { expiresAt: new Date(Date.now() - 1000) },
        message: 'Data de expiração da cobrança deve ser futura',
      },
    ])('should reject $field on create', ({ override, message }) => {
      const create = (): Payment => Payment.create({ ...props, ...override });

      expect(create).toThrow(DomainValidationException);
      expect(create).toThrow(message);
    });

    it('should accept a checkout id with exactly 64 characters', () => {
      const payment = Payment.create({ ...props, checkoutId: 'O'.repeat(64) });

      expect(payment.checkoutId).toHaveLength(64);
    });
  });

  describe('resolve()', () => {
    it.each<FinalPaymentStatus>([
      PaymentStatus.APPROVED,
      PaymentStatus.EXPIRED,
      PaymentStatus.CANCELLED,
      PaymentStatus.REJECTED,
    ])('should resolve a PENDING payment to each final status (%s)', (status) => {
      const updatedAt = new Date('2026-01-01T10:00:00.000Z');
      const payment = createMockPayment({ status: PaymentStatus.PENDING, updatedAt });

      payment.resolve(status);

      expect(payment.status).toBe(status);
      expect(payment.updatedAt.getTime()).toBeGreaterThan(updatedAt.getTime());
    });

    it('should refuse to resolve a payment outside PENDING', () => {
      const payment = createMockPayment({ status: PaymentStatus.APPROVED });

      const resolve = (): void => payment.resolve(PaymentStatus.CANCELLED);

      expect(resolve).toThrow(BusinessRuleViolationException);
      expect(resolve).toThrow(
        'Cobrança só pode ser encerrada no status PENDING. Status atual: "APPROVED"',
      );
      expect(payment.status).toBe(PaymentStatus.APPROVED);
    });
  });

  describe('ensureChargeableAmount()', () => {
    it('should accept an amount equal to the balance', () => {
      expect(() => Payment.ensureChargeableAmount(400, 400)).not.toThrow();
    });

    it('should reject an amount above the balance with the current balance', () => {
      const ensure = (): void => Payment.ensureChargeableAmount(400.01, 400);

      expect(ensure).toThrow(DomainValidationException);
      expect(ensure).toThrow(
        'O valor da cobrança não pode ser maior que o saldo da ordem de serviço. Saldo atual: 400.00',
      );
    });

    // A balance below the amount makes both rules fail, so the message proves which one runs first.
    it.each([0, -1, Number.NaN])(
      'should reject a non-positive amount before comparing with the balance (%p)',
      (amount) => {
        const ensure = (): void => Payment.ensureChargeableAmount(amount, -5);

        expect(ensure).toThrow(DomainValidationException);
        expect(ensure).toThrow('O valor da cobrança deve ser maior que zero');
      },
    );
  });
});
