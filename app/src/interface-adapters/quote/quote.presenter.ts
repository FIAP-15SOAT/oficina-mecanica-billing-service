import { Quote } from '@domain/entities/quote.entity';
import { QuoteService } from '@domain/entities/quote-service.entity';
import { QuotePartSupply } from '@domain/entities/quote-part-supply.entity';
import { PaginatedResult } from '@domain/interfaces/common/pagination.interface';
import { QuoteItemsCatalog } from '@application/ports/input/quote/dto/find-quote-items-catalog.dto';
import {
  InventoryPartSupplyGatewayResponse,
  InventoryServiceGatewayResponse,
} from '@application/ports/output/gateways/inventory/inventory-catalog-gateway.response';
import { WorkOrderGatewayResponse } from '@application/ports/output/gateways/work-order/work-order-gateway.response';

import {
  QuoteResponse,
  QuoteListResponse,
  QuotePaginatedResponse,
  QuoteDataResponse,
  QuoteWithItemsDataResponse,
  QuoteWithItemsResponse,
  QuoteServiceItemResponse,
  QuotePartSupplyItemResponse,
  QuoteWorkOrderResponse,
} from './responses/quote.response';
import {
  InternalQuoteDataResponse,
  InternalQuoteListResponse,
  InternalQuoteResponse,
  InternalQuoteUsageDataResponse,
  InternalQuoteWithItemsDataResponse,
} from './responses/internal-quote.response';

export class QuotePresenter {
  static toResponse(quote: Quote, workOrder: WorkOrderGatewayResponse): QuoteResponse {
    return {
      id: quote.id,
      workOrder: QuotePresenter.toWorkOrder(workOrder),
      status: quote.status,
      notes: quote.notes,
      sentAt: quote.sentAt,
      approvedAt: quote.approvedAt,
      rejectedAt: quote.rejectedAt,
      servicesAmount: quote.servicesAmount,
      partsAmount: quote.partsAmount,
      totalAmount: quote.totalAmount,
      createdAt: quote.createdAt,
      updatedAt: quote.updatedAt,
    };
  }

  static toDataResponse(quote: Quote, workOrder: WorkOrderGatewayResponse): QuoteDataResponse {
    return { data: QuotePresenter.toResponse(quote, workOrder) };
  }

  static toWithItemsResponse(
    quote: Quote,
    workOrder: WorkOrderGatewayResponse,
    catalog: QuoteItemsCatalog,
  ): QuoteWithItemsDataResponse {
    return {
      data: {
        ...QuotePresenter.toResponse(quote, workOrder),
        ...QuotePresenter.toItems(quote, catalog),
      },
    };
  }

  static toInternalResponse(quote: Quote): InternalQuoteResponse {
    return {
      id: quote.id,
      workOrderId: quote.workOrderId,
      status: quote.status,
      notes: quote.notes,
      decidedBy: quote.decidedBy,
      rejectionReason: quote.rejectionReason,
      sentAt: quote.sentAt,
      approvedAt: quote.approvedAt,
      rejectedAt: quote.rejectedAt,
      servicesAmount: quote.servicesAmount,
      partsAmount: quote.partsAmount,
      totalAmount: quote.totalAmount,
      createdAt: quote.createdAt,
      updatedAt: quote.updatedAt,
    };
  }

  static toInternalDataResponse(quote: Quote): InternalQuoteDataResponse {
    return { data: QuotePresenter.toInternalResponse(quote) };
  }

  static toInternalWithItemsResponse(
    quote: Quote,
    catalog: QuoteItemsCatalog,
  ): InternalQuoteWithItemsDataResponse {
    return {
      data: {
        ...QuotePresenter.toInternalResponse(quote),
        ...QuotePresenter.toItems(quote, catalog),
      },
    };
  }

  static toInternalListResponse(quotes: Quote[]): InternalQuoteListResponse {
    return { data: quotes.map((quote) => QuotePresenter.toInternalResponse(quote)) };
  }

  static toInternalUsageDataResponse(inUse: boolean): InternalQuoteUsageDataResponse {
    return { data: { inUse } };
  }

  static toListResponse(
    quotes: Quote[],
    workOrders: WorkOrderGatewayResponse[],
  ): QuoteListResponse {
    return { data: QuotePresenter.toResponses(quotes, workOrders) };
  }

  static toPaginatedResponse(
    paginatedResult: PaginatedResult<Quote>,
    workOrders: WorkOrderGatewayResponse[],
  ): QuotePaginatedResponse {
    const { items, pagination } = paginatedResult;

    return { data: QuotePresenter.toResponses(items, workOrders), pagination };
  }

  private static toResponses(
    quotes: Quote[],
    workOrders: WorkOrderGatewayResponse[],
  ): QuoteResponse[] {
    return quotes.map((quote) =>
      QuotePresenter.toResponse(
        quote,
        workOrders.find((workOrder) => workOrder.id === quote.workOrderId)!,
      ),
    );
  }

  // The owner sends the whole work order; the public contract only carries the summary.
  private static toWorkOrder(workOrder: WorkOrderGatewayResponse): QuoteWorkOrderResponse {
    const { customer, vehicle, assignedUser } = workOrder;

    return {
      id: workOrder.id,
      number: workOrder.number,
      customer: {
        id: customer.id,
        name: customer.name,
        type: customer.type,
        document: customer.document,
        email: customer.email,
        phone: customer.phone,
      },
      vehicle: {
        id: vehicle.id,
        plate: vehicle.plate,
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year,
        color: vehicle.color,
        mileage: vehicle.mileage,
      },
      assignedUser: assignedUser && {
        id: assignedUser.id,
        name: assignedUser.name,
        email: assignedUser.email,
        role: assignedUser.role,
      },
      status: workOrder.status,
      problemDescription: workOrder.problemDescription,
      internalNotes: workOrder.internalNotes,
      mileageAtService: workOrder.mileageAtService,
      totalAmount: workOrder.totalAmount,
      approvedAt: workOrder.approvedAt,
      startedAt: workOrder.startedAt,
      finishedAt: workOrder.finishedAt,
      deliveredAt: workOrder.deliveredAt,
      createdAt: workOrder.createdAt,
      updatedAt: workOrder.updatedAt,
    };
  }

  private static toItems(
    quote: Quote,
    catalog: QuoteItemsCatalog,
  ): Pick<QuoteWithItemsResponse, 'services' | 'partsSupplies'> {
    return {
      services: quote.services.map((item) =>
        QuotePresenter.toServiceItem(
          item,
          catalog.services.find((service) => service.id === item.serviceId),
        ),
      ),
      partsSupplies: quote.partsSupplies.map((item) =>
        QuotePresenter.toPartSupplyItem(
          item,
          catalog.partsSupplies.find((partSupply) => partSupply.id === item.partSupplyId),
        ),
      ),
    };
  }

  private static toServiceItem(
    item: QuoteService,
    service: InventoryServiceGatewayResponse | undefined,
  ): QuoteServiceItemResponse {
    return {
      id: item.serviceId,
      name: service?.name ?? null,
      description: service?.description ?? null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private static toPartSupplyItem(
    item: QuotePartSupply,
    partSupply: InventoryPartSupplyGatewayResponse | undefined,
  ): QuotePartSupplyItemResponse {
    return {
      id: item.partSupplyId,
      name: partSupply?.name ?? null,
      description: partSupply?.description ?? null,
      sku: partSupply?.sku ?? null,
      partNumber: partSupply?.partNumber ?? null,
      category: partSupply?.category ?? null,
      unit: partSupply?.unit ?? null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
