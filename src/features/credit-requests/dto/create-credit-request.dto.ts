import { PaymentMethod } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { IsMoneyInRange } from '../../../common/money';
import { MAX_TOPUP, MIN_TOPUP } from '../credit-requests.constants';

export class CreateCreditRequestDto {
  @ApiProperty({
    type: String,
    example: '500.00',
    description: `Top-up amount in ETB. Decimal string, max 2 dp, within [${MIN_TOPUP}, ${MAX_TOPUP}].`,
  })
  @IsMoneyInRange(MIN_TOPUP, MAX_TOPUP)
  amount: string;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;
}
