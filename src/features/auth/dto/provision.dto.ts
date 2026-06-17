import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ProvisionDto {
  @ApiProperty({
    format: 'uuid',
    description: 'The agent the new player account is assigned to.',
  })
  @IsUUID()
  agentId: string;
}
