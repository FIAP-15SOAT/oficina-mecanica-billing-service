import { IOutboxRepository } from './outbox.repository.interface';
import { IPaymentRepository } from './payment.repository.interface';
import { IQuoteRepository } from './quote.repository.interface';

export interface IRepositories {
  outbox: IOutboxRepository;
  quote: IQuoteRepository;
  payment: IPaymentRepository;
}

export interface IUnitOfWork {
  executeTransaction<T>(work: (repositories: IRepositories) => Promise<T>): Promise<T>;
}
