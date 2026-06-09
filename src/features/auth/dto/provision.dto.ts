import { IsUUID } from 'class-validator';

export class ProvisionDto {
  @IsUUID()
  agentId: string;
}
