export interface CreateQuoteItemServiceDto {
  serviceId: string;
  quantity: number;
}

export interface CreateQuoteItemPartSupplyDto {
  partSupplyId: string;
  quantity: number;
}

export interface CreateQuoteDto {
  workOrderId: string;
  notes?: string | null;
  services?: CreateQuoteItemServiceDto[];
  partsSupplies?: CreateQuoteItemPartSupplyDto[];
}
