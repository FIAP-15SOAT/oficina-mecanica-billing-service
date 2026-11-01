import { QuoteStatus } from '@domain/enums/quote-status.enum';

import { QuotePartSupplyItemResponse, QuoteServiceItemResponse } from './quote.response';

export interface InternalQuoteResponse {
  id: string;
  workOrderId: string;
  status: QuoteStatus;
  notes: string | null;
  decidedBy: string | null;
  rejectionReason: string | null;
  sentAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  servicesAmount: number;
  partsAmount: number;
  totalAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InternalQuoteWithItemsResponse extends InternalQuoteResponse {
  services: QuoteServiceItemResponse[];
  partsSupplies: QuotePartSupplyItemResponse[];
}

export interface InternalQuoteDataResponse {
  data: InternalQuoteResponse;
}

export interface InternalQuoteWithItemsDataResponse {
  data: InternalQuoteWithItemsResponse;
}

export interface InternalQuoteListResponse {
  data: InternalQuoteResponse[];
}
