import { PaymentMethod } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Matches } from 'class-validator';
import { IsMoneyInRange } from '../../../common/money';
import { MAX_AMOUNT, MIN_AMOUNT } from '../transactions.constants';

export class CreateDepositDto {
  @ApiProperty({
    type: String,
    example: '100.00',
    description: `Amount in ETB. Decimal string, max 2 dp, within [${MIN_AMOUNT}, ${MAX_AMOUNT}].`,
  })
  @IsMoneyInRange(MIN_AMOUNT, MAX_AMOUNT)
  amount: string;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiProperty({
    example: '0912345678',
    description: 'Ethiopian mobile number (e.g. 0912345678 / +251912345678).',
  })
  @IsString()
  @Matches(/^(\+?251|0)?9\d{8}$/, {
    message: 'playerPhone: invalid phone number',
  })
  playerPhone: string;

  @ApiProperty({
    example: '0912345678',
    description: 'zPlay payout number (same format as playerPhone).',
  })
  @IsString()
  @Matches(/^(\+?251|0)?9\d{8}$/, {
    message: 'zplayPhone: invalid phone number',
  })
  zplayPhone: string;
}
