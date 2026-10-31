export enum WorkOrderStatus {
  RECEIVED = 'RECEIVED',
  IN_DIAGNOSIS = 'IN_DIAGNOSIS',
  AWAITING_APPROVAL = 'AWAITING_APPROVAL',
  APPROVED = 'APPROVED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}

export interface WorkOrderCustomerGatewayResponse {
  id: string;
  name: string;
  type: string;
  document: string;
  email: string;
  phone: string;
}

export interface WorkOrderVehicleGatewayResponse {
  id: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  color: string | null;
  mileage: number | null;
}

export interface WorkOrderAssignedUserGatewayResponse {
  id: string;
  name: string;
  email: string;
  role: string | null;
}

export interface WorkOrderGatewayResponse {
  id: string;
  number: string;
  customer: WorkOrderCustomerGatewayResponse;
  vehicle: WorkOrderVehicleGatewayResponse;
  assignedUser: WorkOrderAssignedUserGatewayResponse | null;
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
