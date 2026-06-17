import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { IsRate } from '../../../common/money';

const PHONE = /^(\+?251|0)?9\d{8}$/;

const RATE = {
  type: String,
  example: '0.02',
  description: 'Commission rate as a fraction (0.02 = 2%); defaults to 0.',
} as const;

const CAP = {
  type: String,
  example: '5000',
  description: 'Absolute ETB cap (numeric string, not a fraction).',
} as const;

export class CreateAgentDto {
  @ApiProperty({ example: 'Abebe Bikila', minLength: 2 })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({
    example: '0912345678',
    description: 'Ethiopian mobile number (e.g. 0912345678 / +251912345678).',
  })
  @IsString()
  @Matches(PHONE, { message: 'phone: invalid phone number' })
  phone: string;

  @ApiProperty({ example: 'S3curePass', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ example: 'agent@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional(RATE)
  @IsOptional()
  @IsRate()
  claimCommissionRate?: string;

  @ApiPropertyOptional(RATE)
  @IsOptional()
  @IsRate()
  depositCommissionRate?: string;

  @ApiPropertyOptional(RATE)
  @IsOptional()
  @IsRate()
  withdrawalCommissionRate?: string;

  @ApiPropertyOptional(RATE)
  @IsOptional()
  @IsRate()
  playerLossBonusRate?: string;

  @ApiPropertyOptional(CAP)
  @IsOptional()
  @IsNumberString()
  dailyCapAmount?: string;

  @ApiPropertyOptional(CAP)
  @IsOptional()
  @IsNumberString()
  weeklyCapAmount?: string;

  @ApiPropertyOptional({
    type: String,
    example: '10000',
    description: 'Initial credit float to fund the agent with, in ETB.',
  })
  @IsOptional()
  @IsNumberString()
  initialCredit?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  claimEnabled?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  depositEnabled?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  withdrawalEnabled?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  playerLossEnabled?: boolean;
}
