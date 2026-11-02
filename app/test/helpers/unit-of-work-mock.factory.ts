import { IUnitOfWork, IRepositories } from '@domain/interfaces/repositories/unit-of-work.interface';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';
import { createMockOutboxRepository } from './outbox-mock.factory';

export function createMockQuoteRepository(): jest.Mocked<IQuoteRepository> {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    findByIdWithDetails: jest.fn(),
    findByWorkOrderId: jest.fn(),
    findAllPaginated: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    addServiceItem: jest.fn(),
    removeServiceItem: jest.fn(),
    updateServiceItemQuantity: jest.fn(),
    addPartSupplyItem: jest.fn(),
    removePartSupplyItem: jest.fn(),
    updatePartSupplyItemQuantity: jest.fn(),
    isServiceInUse: jest.fn(),
    isPartSupplyInUse: jest.fn(),
  };
}

export function createMockRepositories(): jest.Mocked<IRepositories> {
  return {
    outbox: createMockOutboxRepository(),
    quote: createMockQuoteRepository(),
  };
}

export function createMockUnitOfWork(): jest.Mocked<IUnitOfWork> {
  const repos = createMockRepositories();
  return {
    executeTransaction: jest
      .fn()
      .mockImplementation((work: (repos: IRepositories) => Promise<unknown>) => work(repos)),
  };
}

export function createMockUnitOfWorkWithRepos(): {
  unitOfWork: jest.Mocked<IUnitOfWork>;
  repos: jest.Mocked<IRepositories>;
} {
  const repos = createMockRepositories();
  const unitOfWork: jest.Mocked<IUnitOfWork> = {
    executeTransaction: jest
      .fn()
      .mockImplementation((work: (repos: IRepositories) => Promise<unknown>) => work(repos)),
  };
  return { unitOfWork, repos };
}
