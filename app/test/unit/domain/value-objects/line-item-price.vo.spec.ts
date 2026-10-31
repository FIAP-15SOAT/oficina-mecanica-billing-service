import { LineItemPrice } from '@domain/value-objects/line-item-price.vo';
import { DomainValidationException } from '@domain/exceptions/domain-validation.exception';

describe('LineItemPrice VO', () => {
  describe('create', () => {
    it('should compute totalPrice as quantity × unitPrice', () => {
      const vo = LineItemPrice.create(3, 100);

      expect(vo.quantity).toBe(3);
      expect(vo.unitPrice).toBe(100);
      expect(vo.totalPrice).toBe(300);
    });

    it('should throw when unitPrice is zero', () => {
      expect(() => LineItemPrice.create(2, 0)).toThrow(DomainValidationException);
    });

    it('should throw when quantity is zero', () => {
      expect(() => LineItemPrice.create(0, 100)).toThrow(DomainValidationException);
    });

    it('should throw when quantity is negative', () => {
      expect(() => LineItemPrice.create(-1, 100)).toThrow(DomainValidationException);
    });

    it('should throw when quantity is non-integer', () => {
      expect(() => LineItemPrice.create(1.5, 100)).toThrow(DomainValidationException);
    });

    it('should throw when unitPrice is negative', () => {
      expect(() => LineItemPrice.create(1, -10)).toThrow(DomainValidationException);
    });

    it('should throw when unitPrice is Infinity', () => {
      expect(() => LineItemPrice.create(1, Infinity)).toThrow(DomainValidationException);
    });

    it('should throw when unitPrice is NaN', () => {
      expect(() => LineItemPrice.create(1, NaN)).toThrow(DomainValidationException);
    });
  });

  describe('withQuantity', () => {
    it('should return a new instance with updated quantity and totalPrice', () => {
      const original = LineItemPrice.create(2, 50);
      const updated = original.withQuantity(5);

      expect(updated.quantity).toBe(5);
      expect(updated.unitPrice).toBe(50);
      expect(updated.totalPrice).toBe(250);
    });

    it('should throw when new quantity is invalid', () => {
      const vo = LineItemPrice.create(1, 10);
      expect(() => vo.withQuantity(0)).toThrow(DomainValidationException);
    });
  });

  describe('equals', () => {
    it('should return true for identical instances', () => {
      const a = LineItemPrice.create(2, 50);
      const b = LineItemPrice.create(2, 50);
      expect(a.equals(b)).toBe(true);
    });

    it('should return false when quantity differs', () => {
      const a = LineItemPrice.create(2, 50);
      const b = LineItemPrice.create(3, 50);
      expect(a.equals(b)).toBe(false);
    });

    it('should return false when unitPrice differs', () => {
      const a = LineItemPrice.create(2, 50);
      const b = LineItemPrice.create(2, 60);
      expect(a.equals(b)).toBe(false);
    });
  });
});
