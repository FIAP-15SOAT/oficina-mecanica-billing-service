import { randomUUID } from 'node:crypto';

import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import { ServiceRequestRejectedException } from '@application/exceptions/service-request-rejected.exception';
import {
  IMercadoPagoOrderGateway,
  MercadoPagoOrderCreationRequest,
} from '@application/ports/output/gateways/mercado-pago/mercado-pago-order-gateway.interface';
import {
  MercadoPagoCheckoutOrderGatewayResponse,
  MercadoPagoOrderGatewayResponse,
  MercadoPagoOrderStatus,
} from '@application/ports/output/gateways/mercado-pago/mercado-pago-order-gateway.response';
import { ServiceIntegrationException } from '@infrastructure/exceptions/service-integration.exception';

const CREATE_UNAVAILABLE_MESSAGE =
  'Não foi possível criar a cobrança no Mercado Pago. Nada foi gravado; tente novamente';

interface OrderBody {
  id?: string;
  status: MercadoPagoOrderStatus;
  checkout_url?: string;
}

interface OrdersApiRequest {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  idempotencyKey?: string;
  unavailableMessage: string;
  rejectedStatuses?: ReadonlySet<number>;
}

@Injectable()
export class HttpMercadoPagoOrderGateway implements IMercadoPagoOrderGateway {
  private readonly apiUrl: string;
  private readonly accessToken: string;

  constructor(
    private readonly httpService: HttpService,
    configService: ConfigService,
  ) {
    this.apiUrl = configService.getOrThrow<string>('MERCADOPAGO_API_URL');
    this.accessToken = configService.getOrThrow<string>('MERCADOPAGO_ACCESS_TOKEN');
  }

  async createOrder(
    request: MercadoPagoOrderCreationRequest,
  ): Promise<MercadoPagoCheckoutOrderGatewayResponse> {
    const order = await this.requestOrdersApi({
      method: 'POST',
      path: '/v1/orders',
      body: {
        type: 'online',
        processing_mode: 'manual',
        // automatic turns on binary mode, which refuses pending Pix and boleto payments.
        capture_mode: 'automatic_async',
        total_amount: request.amount,
        external_reference: request.paymentId,
        expiration_time: request.expirationTime,
        items: [{ title: request.title, unit_price: request.amount, quantity: 1 }],
      },
      idempotencyKey: request.paymentId,
      unavailableMessage: CREATE_UNAVAILABLE_MESSAGE,
    });

    if (!order?.id || !order.checkout_url) {
      throw new ServiceIntegrationException(CREATE_UNAVAILABLE_MESSAGE);
    }

    return { id: order.id, status: order.status, checkoutUrl: order.checkout_url };
  }

  async findOrderById(orderId: string): Promise<MercadoPagoOrderGatewayResponse> {
    const { id, status } = await this.requestOrdersApi({
      method: 'GET',
      path: `/v1/orders/${orderId}`,
      unavailableMessage: 'Não foi possível consultar a order no Mercado Pago. Tente novamente',
    });

    return { id: id as string, status };
  }

  async cancelOrder(orderId: string): Promise<MercadoPagoOrderGatewayResponse> {
    // Cancelling an already cancelled order is harmless, so every call gets its own key.
    const { id, status } = await this.requestOrdersApi({
      method: 'POST',
      path: `/v1/orders/${orderId}/cancel`,
      idempotencyKey: randomUUID(),
      unavailableMessage:
        'Não foi possível cancelar a order no Mercado Pago. Nada mudou; tente novamente',
      rejectedStatuses: new Set([400, 409, 422]),
    });

    return { id: id as string, status };
  }

  private async requestOrdersApi(request: OrdersApiRequest): Promise<OrderBody> {
    const { method, path, body, idempotencyKey } = request;

    try {
      const response = await firstValueFrom(
        this.httpService.request<OrderBody>({
          method,
          url: `${this.apiUrl}${path}`,
          data: body,
          timeout: 5_000,
          maxRedirects: 0,
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            ...(idempotencyKey === undefined ? {} : { 'X-Idempotency-Key': idempotencyKey }),
          },
        }),
      );

      return response.data;
    } catch (error) {
      throw this.toApplicationError(error as AxiosError, request);
    }
  }

  // The axios error carries the request headers, so it never travels as the cause.
  private toApplicationError(
    error: AxiosError,
    { unavailableMessage, rejectedStatuses }: OrdersApiRequest,
  ): Error {
    const status = error.response?.status;

    if (status !== undefined && rejectedStatuses?.has(status)) {
      return new ServiceRequestRejectedException(
        status,
        'O Mercado Pago recusou o cancelamento da order',
      );
    }

    return new ServiceIntegrationException(unavailableMessage);
  }
}
