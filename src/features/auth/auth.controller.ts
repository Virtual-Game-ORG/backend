import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import type { ProvisionIdentity } from './auth.types';
import { ProvisionDto } from './dto/provision.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('provision')
  @Public()
  @UseGuards(AuthGuard('supabase-provision'))
  provision(@CurrentUser() user: ProvisionIdentity, @Body() dto: ProvisionDto) {
    return this.authService.provision(user.supabaseId, dto);
  }
}
