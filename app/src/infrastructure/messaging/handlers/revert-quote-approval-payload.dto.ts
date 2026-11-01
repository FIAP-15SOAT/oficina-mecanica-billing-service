import { IsIn, IsUUID } from 'class-validator';

export class RevertQuoteApprovalPayloadDto {
  @IsUUID('4')
  quoteId!: string;

  @IsIn(['SENT', 'REJECTED'])
  revertTo!: 'SENT' | 'REJECTED';
}
