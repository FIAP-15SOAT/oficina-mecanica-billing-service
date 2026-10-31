import { IOutboxRepository } from './outbox.repository.interface';
import { IQuoteRepository } from './quote.repository.interface';

export interface IRepositories {
  outbox: IOutboxRepository;
  quote: IQuoteRepository;
}

export interface IUnitOfWork {
  executeTransaction<T>(work: (repositories: IRepositories) => Promise<T>): Promise<T>;
}
