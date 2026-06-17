import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { AgentStatus } from '@prisma/client';
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
import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';

@ApiTags('agents')
@ApiBearerAuth('supabase-jwt')
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.' })
@ApiForbiddenResponse({ description: 'Requires the OPERATOR role.' })
@Controller('agents')
@Roles('OPERATOR')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an agent', description: 'Role: OPERATOR' })
  @ApiCreatedResponse({ description: 'Agent created.' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAgentDto) {
    return this.agents.createAgent(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List agents',
    description: 'Role: OPERATOR. Returns agents owned by the operator.',
  })
  @ApiOkResponse({ description: 'List of agents.' })
  list(@CurrentUser() user: AuthUser) {
    return this.agents.listAgents(user.id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get an agent by id',
    description: 'Role: OPERATOR',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Agent id' })
  @ApiOkResponse({ description: 'The agent.' })
  @ApiNotFoundResponse({ description: 'Agent not found.' })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.agents.getAgent(user.id, id);
  }

  @Post(':id/suspend')
  @ApiOperation({ summary: 'Suspend an agent', description: 'Role: OPERATOR' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Agent id' })
  @ApiOkResponse({ description: 'Agent suspended.' })
  @ApiNotFoundResponse({ description: 'Agent not found.' })
  suspend(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.agents.setStatus(user.id, id, AgentStatus.SUSPENDED);
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Activate an agent', description: 'Role: OPERATOR' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Agent id' })
  @ApiOkResponse({ description: 'Agent activated.' })
  @ApiNotFoundResponse({ description: 'Agent not found.' })
  activate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.agents.setStatus(user.id, id, AgentStatus.ACTIVE);
  }
}
