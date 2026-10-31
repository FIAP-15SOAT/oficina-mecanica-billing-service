import { QuoteStatus } from '@domain/enums/quote-status.enum';
import { PaginationMeta } from '@domain/interfaces/common/pagination.interface';
import { WorkOrderStatus } from '@application/ports/output/gateways/work-order/work-order-gateway.response';

export interface QuoteWorkOrderCustomerResponse {
  id: string;
  name: string;
  type: string;
  document: string;
  email: string;
  phone: string;
}

export interface QuoteWorkOrderVehicleResponse {
  id: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  color: string | null;
  mileage: number | null;
}

export interface QuoteWorkOrderAssignedUserResponse {
  id: string;
  name: string;
  email: string;
  role: string | null;
}

export interface QuoteWorkOrderResponse {
  id: string;
  number: string;
  customer: QuoteWorkOrderCustomerResponse;
  vehicle: QuoteWorkOrderVehicleResponse;
  assignedUser: QuoteWorkOrderAssignedUserResponse | null;
  status: WorkOrderStatus;
  problemDescription: string | null;
  internalNotes: string | null;
  mileageAtService: number | null;
  totalAmount: number;
  approvedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteServiceItemResponse {
  id: string;
  name: string | null;
  description: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuotePartSupplyItemResponse {
  id: string;
  name: string | null;
  description: string | null;
  sku: string | null;
  partNumber: string | null;
  category: string | null;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuoteResponse {
  id: string;
  workOrder: QuoteWorkOrderResponse;
  status: QuoteStatus;
  notes: string | null;
  sentAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  servicesAmount: number;
  partsAmount: number;
  totalAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuoteWithItemsResponse extends QuoteResponse {
  services: QuoteServiceItemResponse[];
  partsSupplies: QuotePartSupplyItemResponse[];
}

export interface QuoteDataResponse {
  data: QuoteResponse;
}

export interface QuoteWithItemsDataResponse {
  data: QuoteWithItemsResponse;
}

export interface QuoteListResponse {
  data: QuoteResponse[];
}

export interface QuotePaginatedResponse {
  data: QuoteResponse[];
  pagination: PaginationMeta;
}
