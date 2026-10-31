import { Global, Module } from '@nestjs/common';

import { HttpInventoryCatalogGateway } from './inventory/http-inventory-catalog-gateway';
import { HttpWorkOrderGateway } from './work-order/http-work-order-gateway';

const GATEWAY_PROVIDERS = [
  { provide: 'IWorkOrderGateway', useClass: HttpWorkOrderGateway },
  { provide: 'IInventoryCatalogGateway', useClass: HttpInventoryCatalogGateway },
];

@Global()
@Module({
  providers: GATEWAY_PROVIDERS,
  exports: GATEWAY_PROVIDERS,
})
export class GatewaysModule {}
