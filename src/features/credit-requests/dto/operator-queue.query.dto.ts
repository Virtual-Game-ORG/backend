import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import type { QueueFilter } from '../../transactions/transactions.types';

export class OperatorQueueQueryDto {
  @ApiPropertyOptional({
    enum: ['NEW', 'IN_PROGRESS', 'COMPLETED', 'ALL'],
    default: 'NEW',
  })
  @IsOptional()
  @IsIn(['NEW', 'IN_PROGRESS', 'COMPLETED', 'ALL'])
  filter?: QueueFilter = 'NEW';

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Id of the last item from the previous page.',
  })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number = 20;
}
