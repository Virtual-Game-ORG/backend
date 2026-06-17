import { BetStatus } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ListBetsQueryDto {
  @ApiPropertyOptional({ enum: BetStatus })
  @IsOptional()
  @IsEnum(BetStatus)
  status?: BetStatus;

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
