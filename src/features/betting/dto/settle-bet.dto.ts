import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumberString, IsOptional } from 'class-validator';

export class SettleBetDto {
  @ApiProperty({ enum: ['WON', 'LOST', 'VOID'] })
  @IsIn(['WON', 'LOST', 'VOID'])
  result: 'WON' | 'LOST' | 'VOID';

  @ApiPropertyOptional({
    type: String,
    example: '100.00',
    description:
      "Payout override for WON; defaults to the bet's potentialReturn.",
  })
  @IsOptional()
  @IsNumberString()
  payout?: string;
}
