import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import type { ProvisionIdentity } from './auth.types';
import { ProvisionDto } from './dto/provision.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('provision')
  @Public()
  @UseGuards(AuthGuard('supabase-provision'))
  @ApiOperation({
    summary: 'Provision platform identity',
    description:
      'Authenticated with a raw Supabase JWT (not yet provisioned). Links the ' +
      'Supabase user to a platform account under the given agent and returns ' +
      'the identity claims injected into subsequent tokens.',
  })
  @ApiCreatedResponse({ description: 'Identity provisioned.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Supabase JWT.' })
  provision(@CurrentUser() user: ProvisionIdentity, @Body() dto: ProvisionDto) {
    return this.authService.provision(user.supabaseId, dto);
  }
}
