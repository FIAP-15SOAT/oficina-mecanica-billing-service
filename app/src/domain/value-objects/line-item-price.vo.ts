import { DomainValidationException } from '../exceptions/domain-validation.exception';

export class LineItemPrice {
  readonly quantity: number;
  readonly unitPrice: number;
  readonly totalPrice: number;

  private constructor(quantity: number, unitPrice: number, totalPrice: number) {
    this.quantity = quantity;
    this.unitPrice = unitPrice;
    this.totalPrice = totalPrice;
  }

  static create(quantity: number, unitPrice: number): LineItemPrice {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new DomainValidationException('Quantidade deve ser um inteiro positivo');
    }

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw new DomainValidationException('Preço unitário deve ser maior que zero');
    }

    return new LineItemPrice(quantity, unitPrice, quantity * unitPrice);
  }

  /**
   * Rebuilds a LineItemPrice from persisted data without re-validating or recalculating.
   * Used exclusively by entity reconstitute() methods when rehydrating from the database.
   */
  static reconstitute(quantity: number, unitPrice: number, totalPrice: number): LineItemPrice {
    return new LineItemPrice(quantity, unitPrice, totalPrice);
  }

  withQuantity(newQuantity: number): LineItemPrice {
    return LineItemPrice.create(newQuantity, this.unitPrice);
  }

  equals(other: LineItemPrice): boolean {
    return (
      this.quantity === other.quantity &&
      this.unitPrice === other.unitPrice &&
      this.totalPrice === other.totalPrice
    );
  }
}
