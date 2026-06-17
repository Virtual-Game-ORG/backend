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
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth.types';
import { ChatService } from './chat.service';
import { ListMessagesQueryDto } from './dto/list-messages.query.dto';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('messaging')
@ApiBearerAuth('supabase-jwt')
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.' })
@ApiForbiddenResponse({ description: 'Requires the PLAYER or AGENT role.' })
@ApiParam({ name: 'id', format: 'uuid', description: 'Transaction id' })
@Controller('transactions/:id/messages')
@Roles('PLAYER', 'AGENT')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  @ApiOperation({
    summary: 'List messages on a transaction',
    description: 'Role: PLAYER or AGENT. Cursor-paginated.',
  })
  @ApiOkResponse({ description: 'Paginated messages.' })
  list(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.chat.listMessages(user, id, query);
  }

  @Post()
  @ApiOperation({
    summary: 'Send a message on a transaction',
    description: 'Role: PLAYER or AGENT',
  })
  @ApiCreatedResponse({ description: 'Message sent.' })
  send(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chat.sendMessage(user, id, dto.body);
  }
}
