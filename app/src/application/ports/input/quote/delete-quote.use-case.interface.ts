export interface IDeleteQuoteUseCase {
  execute(id: string): Promise<void>;
}
