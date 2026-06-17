import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth.types';
import { BettingService } from './betting.service';
import { PlaceBetDto } from './dto/place-bet.dto';
import { SettleBetDto } from './dto/settle-bet.dto';
import { ListBetsQueryDto } from './dto/list-bets.query.dto';

@ApiTags('betting')
@ApiBearerAuth('supabase-jwt')
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.' })
@ApiForbiddenResponse({ description: 'Caller role is not permitted.' })
@Controller('bets')
export class BettingController {
  constructor(private readonly betting: BettingService) {}

  @Post()
  @Roles('PLAYER')
  @ApiOperation({ summary: 'Place a bet', description: 'Role: PLAYER' })
  @ApiCreatedResponse({ description: 'Bet placed.' })
  place(@CurrentUser() user: AuthUser, @Body() dto: PlaceBetDto) {
    return this.betting.placeBet(user.id, dto);
  }

  @Get('me')
  @Roles('PLAYER')
  @ApiOperation({
    summary: "List the player's bets",
    description: 'Role: PLAYER. Cursor-paginated.',
  })
  @ApiOkResponse({ description: 'Paginated bets.' })
  listForPlayer(
    @CurrentUser() user: AuthUser,
    @Query() query: ListBetsQueryDto,
  ) {
    return this.betting.listForPlayer(user.id, query);
  }

  @Get(':id')
  @Roles('PLAYER')
  @ApiOperation({ summary: 'Get a bet by id', description: 'Role: PLAYER' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Bet id' })
  @ApiOkResponse({ description: 'The bet.' })
  @ApiNotFoundResponse({ description: 'Bet not found.' })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.betting.getBet(user.id, id);
  }

  @Post(':id/settle')
  @Roles('OPERATOR')
  @ApiOperation({
    summary: 'Settle a bet',
    description: 'Role: OPERATOR. Marks the bet WON/LOST/VOID and pays out.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Bet id' })
  @ApiOkResponse({ description: 'Bet settled.' })
  @ApiNotFoundResponse({ description: 'Bet not found.' })
  settle(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SettleBetDto,
  ) {
    return this.betting.settle(user.id, id, dto);
  }
}
