import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { IWorkOrderGateway } from '@application/ports/output/gateways/work-order/work-order-gateway.interface';
import { WorkOrderGatewayResponse } from '@application/ports/output/gateways/work-order/work-order-gateway.response';
import { InternalHttpClient } from '@infrastructure/clients/internal-http-client';

@Injectable()
export class HttpWorkOrderGateway implements IWorkOrderGateway {
  private readonly baseUrl: string;

  constructor(
    private readonly internalHttpClient: InternalHttpClient,
    configService: ConfigService,
  ) {
    this.baseUrl = configService.getOrThrow<string>('WORK_ORDER_SERVICE_URL');
  }

  async findById(id: string): Promise<WorkOrderGatewayResponse> {
    const { data } = await this.internalHttpClient.request<{ data: WorkOrderGatewayResponse }>({
      method: 'GET',
      url: `${this.baseUrl}/internal/work-orders/${id}`,
    });

    return data;
  }
}
