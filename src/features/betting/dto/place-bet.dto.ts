import { BetType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class BetSelectionDto {
  @ApiProperty({ example: 'Match Winner', maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  marketName: string;

  @ApiProperty({ example: 'Home', maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  selectionName: string;

  @ApiProperty({
    type: String,
    example: '2.0',
    description: 'Decimal odds (>= 1); enforced in the service.',
  })
  @IsNumberString()
  odds: string;
}

export class PlaceBetDto {
  @ApiProperty({ example: 'game_123' })
  @IsString()
  gameId: string;

  @ApiProperty({ enum: BetType })
  @IsEnum(BetType)
  type: BetType;

  @ApiProperty({
    type: String,
    example: '50.00',
    description:
      'Stake in ETB. Range validated against the game min/max in the service.',
  })
  @IsNumberString()
  stake: string;

  @ApiPropertyOptional({
    description: 'Accept odds that drift in the player favour before placing.',
  })
  @IsOptional()
  @IsBoolean()
  acceptBetterOdds?: boolean;

  @ApiProperty({ type: [BetSelectionDto], minItems: 1, maxItems: 20 })
  @ValidateNested({ each: true })
  @Type(() => BetSelectionDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  selections: BetSelectionDto[];
}
