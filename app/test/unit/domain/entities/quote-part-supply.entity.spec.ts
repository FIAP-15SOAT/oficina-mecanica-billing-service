import { QuotePartSupply } from '@domain/entities/quote-part-supply.entity';
import { LineItemPrice } from '@domain/value-objects/line-item-price.vo';
import { DomainValidationException } from '@domain/exceptions/domain-validation.exception';

describe('QuotePartSupply Entity', () => {
  const validProps = {
    quoteId: '123e4567-e89b-12d3-a456-426614174000',
    partSupplyId: '223e4567-e89b-12d3-a456-426614174001',
    quantity: 2,
    unitPrice: 50,
  };

  describe('create()', () => {
    it('should create a valid QuotePartSupply', () => {
      const entity = QuotePartSupply.create(validProps);

      expect(entity).toBeInstanceOf(QuotePartSupply);
      expect(entity.quantity).toBe(2);
      expect(entity.unitPrice).toBe(50);
      expect(entity.totalPrice).toBe(100);
    });

    it('should expose the lineItem as a LineItemPrice VO', () => {
      const entity = QuotePartSupply.create(validProps);

      expect(entity.lineItem).toBeInstanceOf(LineItemPrice);
      expect(entity.lineItem.quantity).toBe(2);
      expect(entity.lineItem.unitPrice).toBe(50);
      expect(entity.lineItem.totalPrice).toBe(100);
    });

    it('should throw when quantity is zero (validateQuantity)', () => {
      expect(() => QuotePartSupply.create({ ...validProps, quantity: 0 })).toThrow(
        DomainValidationException,
      );
    });

    it('should throw when quantity is negative (validateQuantity)', () => {
      expect(() => QuotePartSupply.create({ ...validProps, quantity: -1 })).toThrow(
        DomainValidationException,
      );
    });

    it('should throw when quantity is not an integer (validateQuantity)', () => {
      expect(() => QuotePartSupply.create({ ...validProps, quantity: 1.5 })).toThrow(
        DomainValidationException,
      );
    });

    it('should throw when unitPrice is negative', () => {
      expect(() => QuotePartSupply.create({ ...validProps, unitPrice: -10 })).toThrow(
        DomainValidationException,
      );
    });

    it('should throw when unitPrice is NaN', () => {
      expect(() => QuotePartSupply.create({ ...validProps, unitPrice: NaN })).toThrow(
        DomainValidationException,
      );
    });

    it('should throw when quoteId is invalid', () => {
      expect(() => QuotePartSupply.create({ ...validProps, quoteId: 'invalid-id' })).toThrow(
        DomainValidationException,
      );
    });

    it('should throw when quoteId is empty', () => {
      expect(() => QuotePartSupply.create({ ...validProps, quoteId: '' })).toThrow(
        DomainValidationException,
      );
    });

    it('should throw when partSupplyId is invalid', () => {
      expect(() => QuotePartSupply.create({ ...validProps, partSupplyId: 'invalid-id' })).toThrow(
        DomainValidationException,
      );
    });

    it('should throw when partSupplyId is empty', () => {
      expect(() => QuotePartSupply.create({ ...validProps, partSupplyId: '' })).toThrow(
        DomainValidationException,
      );
    });
  });

  describe('updateQuantity()', () => {
    it('should update quantity and recalculate totalPrice via the lineItem VO', () => {
      const entity = QuotePartSupply.create(validProps);
      entity.updateQuantity(5);

      expect(entity.quantity).toBe(5);
      expect(entity.totalPrice).toBe(250); // 5 * 50
      expect(entity.lineItem).toBeInstanceOf(LineItemPrice);
    });

    it('should throw when updating to invalid quantity', () => {
      const entity = QuotePartSupply.create(validProps);

      expect(() => entity.updateQuantity(0)).toThrow(DomainValidationException);
    });
  });
});
