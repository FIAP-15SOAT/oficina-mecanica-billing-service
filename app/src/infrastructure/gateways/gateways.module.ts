import { Global, Module } from '@nestjs/common';

import { HttpWorkOrderGateway } from './work-order/http-work-order-gateway';

const GATEWAY_PROVIDERS = [{ provide: 'IWorkOrderGateway', useClass: HttpWorkOrderGateway }];

@Global()
@Module({
  providers: GATEWAY_PROVIDERS,
  exports: GATEWAY_PROVIDERS,
})
export class GatewaysModule {}
