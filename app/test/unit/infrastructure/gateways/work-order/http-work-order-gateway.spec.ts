import { ConfigService } from '@nestjs/config';

import { ServiceRequestRejectedException } from '@application/exceptions/service-request-rejected.exception';
import { InternalHttpClient } from '@infrastructure/clients/internal-http-client';
import { ServiceIntegrationException } from '@infrastructure/exceptions/service-integration.exception';
import { HttpWorkOrderGateway } from '@infrastructure/gateways/work-order/http-work-order-gateway';

import { readInternalWorkOrderFixture } from '../../../../helpers/work-order-gateway-mock.factory';

describe('HttpWorkOrderGateway', () => {
  const baseUrl = 'http://work-order-service.work-order.svc.cluster.local:3000';
  const fixture = readInternalWorkOrderFixture();
  const workOrderId = fixture.data.id;

  let internalHttpClient: jest.Mocked<Pick<InternalHttpClient, 'request'>>;
  let gateway: HttpWorkOrderGateway;

  beforeEach(() => {
    internalHttpClient = { request: jest.fn().mockResolvedValue(fixture) };
    gateway = new HttpWorkOrderGateway(
      internalHttpClient as unknown as InternalHttpClient,
      new ConfigService({ WORK_ORDER_SERVICE_URL: baseUrl }),
    );
  });

  it('reads the work order from the internal route', async () => {
    await gateway.findById(workOrderId);

    expect(internalHttpClient.request).toHaveBeenCalledWith({
      method: 'GET',
      url: `${baseUrl}/internal/work-orders/${workOrderId}`,
    });
  });

  it('returns the work order as the owner sends it', async () => {
    await expect(gateway.findById(workOrderId)).resolves.toEqual(fixture.data);
  });

  it('lets owner rejections and unavailability through', async () => {
    const notFound = new ServiceRequestRejectedException(404, 'Ordem de Serviço não encontrado(a)');
    const unavailable = new ServiceIntegrationException('Serviço de destino indisponível.');

    internalHttpClient.request.mockRejectedValueOnce(notFound).mockRejectedValueOnce(unavailable);

    await expect(gateway.findById(workOrderId)).rejects.toBe(notFound);
    await expect(gateway.findById(workOrderId)).rejects.toBe(unavailable);
  });

  it('refuses to start without WORK_ORDER_SERVICE_URL', () => {
    expect(
      () =>
        new HttpWorkOrderGateway(
          internalHttpClient as unknown as InternalHttpClient,
          new ConfigService({}),
        ),
    ).toThrow();
  });
});
