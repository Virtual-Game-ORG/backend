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
import { CreateDepositDto } from './dto/create-deposit.dto';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions.query.dto';
import { AgentQueueQueryDto } from './dto/agent-queue.query.dto';
import { TransactionsService } from './transactions.service';

@ApiTags('transactions')
@ApiBearerAuth('supabase-jwt')
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.' })
@ApiForbiddenResponse({ description: 'Caller role is not permitted.' })
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Post('deposit')
  @Roles('PLAYER')
  @ApiOperation({
    summary: 'Create a deposit request',
    description: 'Role: PLAYER',
  })
  @ApiCreatedResponse({ description: 'Deposit request created.' })
  createDeposit(@CurrentUser() user: AuthUser, @Body() dto: CreateDepositDto) {
    return this.transactions.createDeposit(user.id, dto);
  }

  @Post('withdrawal')
  @Roles('PLAYER')
  @ApiOperation({
    summary: 'Create a withdrawal request',
    description: 'Role: PLAYER',
  })
  @ApiCreatedResponse({ description: 'Withdrawal request created.' })
  createWithdrawal(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateWithdrawalDto,
  ) {
    return this.transactions.createWithdrawal(user.id, dto);
  }

  @Get('me')
  @Roles('PLAYER')
  @ApiOperation({
    summary: "List the player's transactions",
    description: 'Role: PLAYER. Cursor-paginated.',
  })
  @ApiOkResponse({ description: 'Paginated transactions.' })
  listForPlayer(
    @CurrentUser() user: AuthUser,
    @Query() query: ListTransactionsQueryDto,
  ) {
    return this.transactions.listForPlayer(user.id, query);
  }

  @Get('queue')
  @Roles('AGENT')
  @ApiOperation({
    summary: 'List the agent work queue',
    description: 'Role: AGENT. Cursor-paginated, filterable by state.',
  })
  @ApiOkResponse({ description: 'Paginated queue.' })
  listAgentQueue(
    @CurrentUser() user: AuthUser,
    @Query() query: AgentQueueQueryDto,
  ) {
    return this.transactions.listAgentQueue(user.id, query);
  }

  @Post(':id/claim')
  @Roles('AGENT')
  @ApiOperation({
    summary: 'Claim a queued transaction',
    description: 'Role: AGENT',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Transaction id' })
  @ApiOkResponse({ description: 'Transaction claimed.' })
  @ApiNotFoundResponse({ description: 'Transaction not found.' })
  claim(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.transactions.claim(user.id, id);
  }

  @Post(':id/complete')
  @Roles('AGENT')
  @ApiOperation({
    summary: 'Complete a transaction and credit the wallet',
    description: 'Role: AGENT',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Transaction id' })
  @ApiOkResponse({ description: 'Transaction completed.' })
  @ApiNotFoundResponse({ description: 'Transaction not found.' })
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.transactions.completeAndCredit(user.id, id);
  }

  @Post(':id/cancel')
  @Roles('PLAYER', 'AGENT')
  @ApiOperation({
    summary: 'Cancel a transaction',
    description: 'Role: PLAYER or AGENT',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Transaction id' })
  @ApiOkResponse({ description: 'Transaction cancelled.' })
  @ApiNotFoundResponse({ description: 'Transaction not found.' })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.transactions.cancel(user, id);
  }
}
