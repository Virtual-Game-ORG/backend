import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export type PerformancePeriod = 'today' | 'week' | 'month' | 'all';

export class AgentPerformanceQueryDto {
  @ApiPropertyOptional({
    enum: ['today', 'week', 'month', 'all'],
    default: 'all',
  })
  @IsOptional()
  @IsIn(['today', 'week', 'month', 'all'])
  period?: PerformancePeriod = 'all';

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number = 20;
}
