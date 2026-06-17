import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth.types';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@ApiBearerAuth('supabase-jwt')
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.' })
@ApiForbiddenResponse({ description: 'Requires the PLAYER role.' })
@Controller('wallet')
@Roles('PLAYER')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  @ApiOperation({
    summary: "Get the player's wallet",
    description: 'Role: PLAYER. Returns the current balance.',
  })
  @ApiOkResponse({ description: 'The wallet balance.' })
  getMine(@CurrentUser() user: AuthUser) {
    return this.wallet.getPlayerWallet(user.id);
  }
}
