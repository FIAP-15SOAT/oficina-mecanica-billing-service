export interface CreateQuoteItemServiceRequest {
  serviceId: string;
  quantity: number;
}

export interface CreateQuoteItemPartSupplyRequest {
  partSupplyId: string;
  quantity: number;
}

export interface CreateQuoteRequest {
  workOrderId: string;
  notes?: string | null;
  services?: CreateQuoteItemServiceRequest[];
  partsSupplies?: CreateQuoteItemPartSupplyRequest[];
}
