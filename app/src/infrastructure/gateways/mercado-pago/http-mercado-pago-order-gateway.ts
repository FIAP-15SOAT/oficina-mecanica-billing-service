import { randomUUID } from 'node:crypto';

import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import { MAX_CHECKOUT_ID_LENGTH } from '@domain/constants/validation/payment.constants';

import { ServiceRequestRejectedException } from '@application/exceptions/service-request-rejected.exception';
import {
  CheckoutCreationRequest,
  IPaymentProviderGateway,
} from '@application/ports/output/gateways/payment-provider/payment-provider-gateway.interface';
import {
  CheckoutGatewayResponse,
  CheckoutStatus,
  CreatedCheckoutGatewayResponse,
} from '@application/ports/output/gateways/payment-provider/payment-provider-gateway.response';
import { ServiceIntegrationException } from '@infrastructure/exceptions/service-integration.exception';

const CREATE_UNAVAILABLE_MESSAGE =
  'Não foi possível criar a cobrança no Mercado Pago. Nada foi gravado; tente novamente';

const CHECKOUT_STATUS_BY_ORDER_STATUS = new Map<string, CheckoutStatus>([
  ['created', CheckoutStatus.OPEN],
  ['action_required', CheckoutStatus.IN_PROGRESS],
  ['processing', CheckoutStatus.IN_PROGRESS],
  ['processed', CheckoutStatus.PAID],
  ['expired', CheckoutStatus.EXPIRED],
  ['canceled', CheckoutStatus.CANCELLED],
  ['failed', CheckoutStatus.FAILED],
  ['refunded', CheckoutStatus.REFUNDED],
  ['charged_back', CheckoutStatus.CHARGED_BACK],
]);

interface OrderBody {
  id?: string;
  status: string;
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
export class HttpMercadoPagoOrderGateway implements IPaymentProviderGateway {
  private readonly apiUrl: string;
  private readonly accessToken: string;

  constructor(
    private readonly httpService: HttpService,
    configService: ConfigService,
  ) {
    this.apiUrl = configService.getOrThrow<string>('MERCADOPAGO_API_URL');
    this.accessToken = configService.getOrThrow<string>('MERCADOPAGO_ACCESS_TOKEN');
  }

  async createCheckout(request: CheckoutCreationRequest): Promise<CreatedCheckoutGatewayResponse> {
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

    // A checkout the payment cannot store is a provider failure, not a staff input error.
    if (
      !order.id ||
      order.id.length > MAX_CHECKOUT_ID_LENGTH ||
      !order.checkout_url ||
      URL.parse(order.checkout_url)?.protocol !== 'https:'
    ) {
      throw new ServiceIntegrationException(CREATE_UNAVAILABLE_MESSAGE);
    }

    return {
      id: order.id,
      status: this.toCheckoutStatus(order.status),
      checkoutUrl: order.checkout_url,
    };
  }

  async findCheckoutById(checkoutId: string): Promise<CheckoutGatewayResponse> {
    const { id, status } = await this.requestOrdersApi({
      method: 'GET',
      path: `/v1/orders/${checkoutId}`,
      unavailableMessage: 'Não foi possível consultar a order no Mercado Pago. Tente novamente',
    });

    return { id: id as string, status: this.toCheckoutStatus(status) };
  }

  async cancelCheckout(checkoutId: string): Promise<CheckoutGatewayResponse> {
    // Cancelling an already cancelled order is harmless, so every call gets its own key.
    const { id, status } = await this.requestOrdersApi({
      method: 'POST',
      path: `/v1/orders/${checkoutId}/cancel`,
      idempotencyKey: randomUUID(),
      unavailableMessage:
        'Não foi possível cancelar a order no Mercado Pago. Nada mudou; tente novamente',
      rejectedStatuses: new Set([400, 409, 422]),
    });

    return { id: id as string, status: this.toCheckoutStatus(status) };
  }

  private async requestOrdersApi(request: OrdersApiRequest): Promise<OrderBody> {
    const order = await this.sendOrdersApiRequest(request);

    // A 2xx without the order status says nothing about the checkout.
    if (!order?.status) {
      throw new ServiceIntegrationException(request.unavailableMessage);
    }

    return order;
  }

  private async sendOrdersApiRequest(request: OrdersApiRequest): Promise<OrderBody | null> {
    const { method, path, body, idempotencyKey } = request;

    try {
      const response = await firstValueFrom(
        this.httpService.request<OrderBody | null>({
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

  // A status Mercado Pago adds later keeps the payment open, like a payment still being made.
  private toCheckoutStatus(orderStatus: string): CheckoutStatus {
    return CHECKOUT_STATUS_BY_ORDER_STATUS.get(orderStatus) ?? CheckoutStatus.IN_PROGRESS;
  }
}
