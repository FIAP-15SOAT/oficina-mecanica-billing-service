import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';

import { HttpInventoryCatalogGateway } from './inventory/http-inventory-catalog-gateway';
import { HttpMercadoPagoOrderGateway } from './mercado-pago/http-mercado-pago-order-gateway';
import { HttpWorkOrderGateway } from './work-order/http-work-order-gateway';

const GATEWAY_PROVIDERS = [
  { provide: 'IWorkOrderGateway', useClass: HttpWorkOrderGateway },
  { provide: 'IInventoryCatalogGateway', useClass: HttpInventoryCatalogGateway },
  { provide: 'IPaymentProviderGateway', useClass: HttpMercadoPagoOrderGateway },
];

@Global()
@Module({
  imports: [HttpModule],
  providers: GATEWAY_PROVIDERS,
  exports: GATEWAY_PROVIDERS,
})
export class GatewaysModule {}
