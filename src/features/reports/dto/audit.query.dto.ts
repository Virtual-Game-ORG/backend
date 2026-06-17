import { LedgerAccountKind, LedgerRefType } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class AuditQueryDto {
  @ApiPropertyOptional({ enum: LedgerAccountKind })
  @IsOptional()
  @IsEnum(LedgerAccountKind)
  accountKind?: LedgerAccountKind;

  @ApiPropertyOptional({ enum: LedgerRefType })
  @IsOptional()
  @IsEnum(LedgerRefType)
  refType?: LedgerRefType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Id of the last item from the previous page.',
  })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number = 50;
}
