import { QuoteService } from '@domain/entities/quote-service.entity';
import { LineItemPrice } from '@domain/value-objects/line-item-price.vo';
import { DomainValidationException } from '@domain/exceptions/domain-validation.exception';

describe('QuoteService Entity', () => {
  const validProps = {
    quoteId: '123e4567-e89b-12d3-a456-426614174000',
    serviceId: '223e4567-e89b-12d3-a456-426614174001',
    quantity: 1,
    unitPrice: 200,
  };

  describe('create()', () => {
    it('should create a valid QuoteService', () => {
      const entity = QuoteService.create(validProps);

      expect(entity).toBeInstanceOf(QuoteService);
      expect(entity.quantity).toBe(1);
      expect(entity.unitPrice).toBe(200);
      expect(entity.totalPrice).toBe(200);
    });

    it('should expose the lineItem as a LineItemPrice VO', () => {
      const entity = QuoteService.create(validProps);

      expect(entity.lineItem).toBeInstanceOf(LineItemPrice);
      expect(entity.lineItem.quantity).toBe(1);
      expect(entity.lineItem.unitPrice).toBe(200);
      expect(entity.lineItem.totalPrice).toBe(200);
    });

    it('should throw when quantity is zero (validateQuantity)', () => {
      expect(() => QuoteService.create({ ...validProps, quantity: 0 })).toThrow(
        DomainValidationException,
      );
    });

    it('should throw when quantity is negative (validateQuantity)', () => {
      expect(() => QuoteService.create({ ...validProps, quantity: -1 })).toThrow(
        DomainValidationException,
      );
    });

    it('should throw when quantity is not an integer (validateQuantity)', () => {
      expect(() => QuoteService.create({ ...validProps, quantity: 2.5 })).toThrow(
        DomainValidationException,
      );
    });

    it('should throw when unitPrice is negative', () => {
      expect(() => QuoteService.create({ ...validProps, unitPrice: -50 })).toThrow(
        DomainValidationException,
      );
    });

    it('should throw when unitPrice is NaN', () => {
      expect(() => QuoteService.create({ ...validProps, unitPrice: NaN })).toThrow(
        DomainValidationException,
      );
    });

    it('should throw when quoteId is invalid', () => {
      expect(() => QuoteService.create({ ...validProps, quoteId: 'invalid-id' })).toThrow(
        DomainValidationException,
      );
    });

    it('should throw when quoteId is empty', () => {
      expect(() => QuoteService.create({ ...validProps, quoteId: '' })).toThrow(
        DomainValidationException,
      );
    });

    it('should throw when serviceId is invalid', () => {
      expect(() => QuoteService.create({ ...validProps, serviceId: 'invalid-id' })).toThrow(
        DomainValidationException,
      );
    });

    it('should throw when serviceId is empty', () => {
      expect(() => QuoteService.create({ ...validProps, serviceId: '' })).toThrow(
        DomainValidationException,
      );
    });
  });

  describe('updateQuantity()', () => {
    it('should update quantity and recalculate totalPrice via the lineItem VO', () => {
      const entity = QuoteService.create(validProps);
      entity.updateQuantity(3);

      expect(entity.quantity).toBe(3);
      expect(entity.totalPrice).toBe(600); // 3 * 200
      expect(entity.lineItem).toBeInstanceOf(LineItemPrice);
    });

    it('should throw when updating to invalid quantity', () => {
      const entity = QuoteService.create(validProps);

      expect(() => entity.updateQuantity(0)).toThrow(DomainValidationException);
    });
  });
});
