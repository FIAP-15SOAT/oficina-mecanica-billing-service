export interface ISyncPaymentStatusUseCase {
  execute(checkoutId: string): Promise<void>;
}
