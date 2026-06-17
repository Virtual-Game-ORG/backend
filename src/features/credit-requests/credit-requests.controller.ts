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
import { CreditRequestsService } from './credit-requests.service';
import { CreateCreditRequestDto } from './dto/create-credit-request.dto';
import { ListCreditRequestsQueryDto } from './dto/list-credit-requests.query.dto';
import { OperatorQueueQueryDto } from './dto/operator-queue.query.dto';

@ApiTags('credit-requests')
@ApiBearerAuth('supabase-jwt')
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.' })
@ApiForbiddenResponse({ description: 'Caller role is not permitted.' })
@Controller('credit-requests')
export class CreditRequestsController {
  constructor(private readonly creditRequests: CreditRequestsService) {}

  @Post()
  @Roles('AGENT')
  @ApiOperation({
    summary: 'Create a credit top-up request',
    description: 'Role: AGENT',
  })
  @ApiCreatedResponse({ description: 'Credit request created.' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCreditRequestDto) {
    return this.creditRequests.createRequest(user.id, dto);
  }

  @Get('me')
  @Roles('AGENT')
  @ApiOperation({
    summary: "List the agent's credit requests",
    description: 'Role: AGENT. Cursor-paginated.',
  })
  @ApiOkResponse({ description: 'Paginated credit requests.' })
  listForAgent(
    @CurrentUser() user: AuthUser,
    @Query() query: ListCreditRequestsQueryDto,
  ) {
    return this.creditRequests.listForAgent(user.id, query);
  }

  @Get('queue')
  @Roles('OPERATOR')
  @ApiOperation({
    summary: 'List the operator credit-request queue',
    description: 'Role: OPERATOR. Cursor-paginated, filterable by state.',
  })
  @ApiOkResponse({ description: 'Paginated queue.' })
  listQueue(
    @CurrentUser() user: AuthUser,
    @Query() query: OperatorQueueQueryDto,
  ) {
    return this.creditRequests.listOperatorQueue(user.id, query);
  }

  @Post(':id/claim')
  @Roles('OPERATOR')
  @ApiOperation({
    summary: 'Claim a credit request',
    description: 'Role: OPERATOR',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Credit request id' })
  @ApiOkResponse({ description: 'Credit request claimed.' })
  @ApiNotFoundResponse({ description: 'Credit request not found.' })
  claim(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.creditRequests.claim(user.id, id);
  }

  @Post(':id/complete')
  @Roles('OPERATOR')
  @ApiOperation({
    summary: 'Complete a credit request and credit the agent',
    description: 'Role: OPERATOR',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Credit request id' })
  @ApiOkResponse({ description: 'Credit request completed.' })
  @ApiNotFoundResponse({ description: 'Credit request not found.' })
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.creditRequests.completeAndCredit(user.id, id);
  }

  @Post(':id/cancel')
  @Roles('AGENT', 'OPERATOR')
  @ApiOperation({
    summary: 'Cancel a credit request',
    description: 'Role: AGENT or OPERATOR',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Credit request id' })
  @ApiOkResponse({ description: 'Credit request cancelled.' })
  @ApiNotFoundResponse({ description: 'Credit request not found.' })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.creditRequests.cancel(user, id);
  }
}
