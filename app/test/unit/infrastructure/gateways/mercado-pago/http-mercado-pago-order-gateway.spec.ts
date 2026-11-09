import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosHeaders, AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';

import { ServiceRequestRejectedException } from '@application/exceptions/service-request-rejected.exception';
import { CheckoutStatus } from '@application/ports/output/gateways/payment-provider/payment-provider-gateway.response';
import { ServiceIntegrationException } from '@infrastructure/exceptions/service-integration.exception';
import { HttpMercadoPagoOrderGateway } from '@infrastructure/gateways/mercado-pago/http-mercado-pago-order-gateway';

const API_URL = 'http://mercadopago-stub:3000';
const ACCESS_TOKEN = 'APP_USR-test-access-token';
const PAYMENT_ID = '3f1c2b4a-6d5e-4f70-8a9b-0c1d2e3f4a5b';
const ORDER_ID = 'ORDTST01KS5AJ6HTK2HRQ3XJ3C2JCKP9';
const CHECKOUT_URL = `https://www.mercadopago.com.br/checkout/v1/redirect?order_id=${ORDER_ID}`;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const CREATE_MESSAGE =
  'Não foi possível criar a cobrança no Mercado Pago. Nada foi gravado; tente novamente';
const FIND_MESSAGE = 'Não foi possível consultar a order no Mercado Pago. Tente novamente';
const CANCEL_MESSAGE =
  'Não foi possível cancelar a order no Mercado Pago. Nada mudou; tente novamente';

const CREATION_REQUEST = {
  paymentId: PAYMENT_ID,
  amount: '100.00',
  title: 'Ordem de serviço OS-2026-000123',
  expirationTime: 'P1D',
};

function failWith(status?: number): ReturnType<HttpService['request']> {
  const config = { headers: new AxiosHeaders({ Authorization: `Bearer ${ACCESS_TOKEN}` }) };

  const response =
    status === undefined
      ? undefined
      : { status, statusText: '', headers: {}, config, data: { message: 'order error' } };

  return throwError(
    () => new AxiosError('Request failed', AxiosError.ERR_BAD_RESPONSE, config, {}, response),
  );
}

describe('HttpMercadoPagoOrderGateway', () => {
  let httpService: jest.Mocked<HttpService>;
  let gateway: HttpMercadoPagoOrderGateway;

  beforeEach(() => {
    httpService = { request: jest.fn() } as unknown as jest.Mocked<HttpService>;

    gateway = new HttpMercadoPagoOrderGateway(
      httpService,
      new ConfigService({
        MERCADOPAGO_API_URL: API_URL,
        MERCADOPAGO_ACCESS_TOKEN: ACCESS_TOKEN,
      }),
    );
  });

  describe('createCheckout', () => {
    it('should create the order with the checkout pro body and the payment id as idempotency key and external reference', async () => {
      httpService.request.mockReturnValue(
        of({
          data: { id: ORDER_ID, status: 'created', checkout_url: CHECKOUT_URL },
        } as AxiosResponse),
      );

      await gateway.createCheckout(CREATION_REQUEST);

      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: `${API_URL}/v1/orders`,
          data: {
            type: 'online',
            processing_mode: 'manual',
            capture_mode: 'automatic_async',
            total_amount: '100.00',
            external_reference: PAYMENT_ID,
            expiration_time: 'P1D',
            items: [
              { title: 'Ordem de serviço OS-2026-000123', unit_price: '100.00', quantity: 1 },
            ],
          },
          headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'X-Idempotency-Key': PAYMENT_ID },
        }),
      );
    });

    it('should send the access token as bearer with a 5 s timeout and no redirects', async () => {
      httpService.request.mockReturnValue(
        of({
          data: { id: ORDER_ID, status: 'created', checkout_url: CHECKOUT_URL },
        } as AxiosResponse),
      );

      await gateway.createCheckout(CREATION_REQUEST);

      expect(httpService.request).toHaveBeenCalledTimes(1);
      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 5_000,
          maxRedirects: 0,
          headers: expect.objectContaining({ Authorization: `Bearer ${ACCESS_TOKEN}` }),
        }),
      );
    });

    it('should map the created order to id, status and checkout url', async () => {
      httpService.request.mockReturnValue(
        of({
          data: {
            id: ORDER_ID,
            status: 'created',
            checkout_url: CHECKOUT_URL,
            total_amount: '100.00',
            client_token: 'client-token',
          },
        } as AxiosResponse),
      );

      const order = await gateway.createCheckout(CREATION_REQUEST);

      expect(order).toEqual({
        id: ORDER_ID,
        status: CheckoutStatus.OPEN,
        checkoutUrl: CHECKOUT_URL,
      });
    });

    it.each([
      ['without id', { status: 'created', checkout_url: CHECKOUT_URL }],
      ['without checkout url', { id: ORDER_ID, status: 'created' }],
      [
        'with a checkout url that is not https',
        { id: ORDER_ID, status: 'created', checkout_url: `http://localhost/checkout/${ORDER_ID}` },
      ],
      [
        'with an id longer than 64 characters',
        { id: 'O'.repeat(65), status: 'created', checkout_url: CHECKOUT_URL },
      ],
      ['with an empty body', ''],
    ])('should treat a created order %s as unavailable', async (_case, body) => {
      httpService.request.mockReturnValue(of({ data: body } as AxiosResponse));

      const error = await gateway.createCheckout(CREATION_REQUEST).catch((e: unknown) => e);

      expect(error).toEqual(new ServiceIntegrationException(CREATE_MESSAGE));
    });
  });

  describe('findCheckoutById', () => {
    it('should find an order by id', async () => {
      httpService.request.mockReturnValue(
        of({
          data: { id: ORDER_ID, status: 'processed', checkout_url: CHECKOUT_URL },
        } as AxiosResponse),
      );

      const order = await gateway.findCheckoutById(ORDER_ID);

      expect(order).toEqual({ id: ORDER_ID, status: CheckoutStatus.PAID });

      expect(httpService.request).toHaveBeenCalledWith({
        method: 'GET',
        url: `${API_URL}/v1/orders/${ORDER_ID}`,
        timeout: 5_000,
        maxRedirects: 0,
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
      });
    });
    it.each([
      ['created', CheckoutStatus.OPEN],
      ['action_required', CheckoutStatus.IN_PROGRESS],
      ['processing', CheckoutStatus.IN_PROGRESS],
      ['processed', CheckoutStatus.PAID],
      ['expired', CheckoutStatus.EXPIRED],
      ['canceled', CheckoutStatus.CANCELLED],
      ['failed', CheckoutStatus.FAILED],
      ['refunded', CheckoutStatus.REFUNDED],
      ['charged_back', CheckoutStatus.CHARGED_BACK],
      ['a_status_added_later', CheckoutStatus.IN_PROGRESS],
    ])(
      'should translate the order status %s to the checkout status %s',
      async (orderStatus, status) => {
        httpService.request.mockReturnValue(
          of({ data: { id: ORDER_ID, status: orderStatus } } as AxiosResponse),
        );

        await expect(gateway.findCheckoutById(ORDER_ID)).resolves.toEqual({ id: ORDER_ID, status });
      },
    );
  });

  describe('cancelCheckout', () => {
    it('should cancel an order with a fresh idempotency key per call', async () => {
      httpService.request.mockReturnValue(
        of({ data: { id: ORDER_ID, status: 'canceled' } } as AxiosResponse),
      );

      const order = await gateway.cancelCheckout(ORDER_ID);
      await gateway.cancelCheckout(ORDER_ID);

      const [first, second] = httpService.request.mock.calls.map(
        ([config]) => (config.headers as Record<string, string>)['X-Idempotency-Key'],
      );

      expect(order).toEqual({ id: ORDER_ID, status: CheckoutStatus.CANCELLED });

      expect(httpService.request).toHaveBeenCalledWith({
        method: 'POST',
        url: `${API_URL}/v1/orders/${ORDER_ID}/cancel`,
        timeout: 5_000,
        maxRedirects: 0,
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'X-Idempotency-Key': first },
      });

      expect(first).toMatch(UUID_PATTERN);
      expect(second).toMatch(UUID_PATTERN);
      expect(first).not.toBe(second);
    });

    it.each([400, 409, 422])(
      'should reject the cancellation when Mercado Pago refuses it with %i',
      async (status) => {
        httpService.request.mockReturnValue(failWith(status));

        const error = await gateway.cancelCheckout(ORDER_ID).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ServiceRequestRejectedException);
        expect(error).toMatchObject({
          statusCode: status,
          message: 'O Mercado Pago recusou o cancelamento da order',
        });
      },
    );
  });

  it.each([
    ['no response on create', 'create', undefined, CREATE_MESSAGE],
    ['401 on create', 'create', 401, CREATE_MESSAGE],
    ['409 on create', 'create', 409, CREATE_MESSAGE],
    ['423 on create', 'create', 423, CREATE_MESSAGE],
    ['429 on create', 'create', 429, CREATE_MESSAGE],
    ['500 on create', 'create', 500, CREATE_MESSAGE],
    ['404 on find', 'find', 404, FIND_MESSAGE],
    ['500 on find', 'find', 500, FIND_MESSAGE],
    ['no response on cancel', 'cancel', undefined, CANCEL_MESSAGE],
    ['423 on cancel', 'cancel', 423, CANCEL_MESSAGE],
    ['429 on cancel', 'cancel', 429, CANCEL_MESSAGE],
    ['500 on cancel', 'cancel', 500, CANCEL_MESSAGE],
  ] as const)(
    'should treat every other failure as unavailable: %s',
    async (_case, operation, status, message) => {
      httpService.request.mockReturnValue(failWith(status));

      const calls = {
        create: () => gateway.createCheckout(CREATION_REQUEST),
        find: () => gateway.findCheckoutById(ORDER_ID),
        cancel: () => gateway.cancelCheckout(ORDER_ID),
      };

      const error = await calls[operation]().catch((e: unknown) => e);

      expect(error).toEqual(new ServiceIntegrationException(message));
      expect(error).not.toHaveProperty('cause');
      expect(httpService.request).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['find', 'without status', { id: ORDER_ID }, FIND_MESSAGE],
    ['find', 'with an empty body', '', FIND_MESSAGE],
    ['find', 'with a null body', null, FIND_MESSAGE],
    ['cancel', 'without status', { id: ORDER_ID }, CANCEL_MESSAGE],
  ] as const)(
    'should treat a %s answer %s as unavailable',
    async (operation, _case, body, message) => {
      httpService.request.mockReturnValue(of({ data: body } as AxiosResponse));

      const calls = {
        find: () => gateway.findCheckoutById(ORDER_ID),
        cancel: () => gateway.cancelCheckout(ORDER_ID),
      };

      const error = await calls[operation]().catch((e: unknown) => e);

      expect(error).toEqual(new ServiceIntegrationException(message));
    },
  );

  it.each([
    ['MERCADOPAGO_API_URL', { MERCADOPAGO_ACCESS_TOKEN: ACCESS_TOKEN }],
    ['MERCADOPAGO_ACCESS_TOKEN', { MERCADOPAGO_API_URL: API_URL }],
  ])(
    'should fail at construction without the API url or the access token: %s',
    (variable, config) => {
      expect(() => new HttpMercadoPagoOrderGateway(httpService, new ConfigService(config))).toThrow(
        variable,
      );
    },
  );
});
