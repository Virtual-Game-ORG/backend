import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Health/root check',
    description: 'Public. Returns a static greeting to confirm the API is up.',
  })
  @ApiOkResponse({ description: 'Service is reachable.' })
  getHello(): string {
    return this.appService.getHello();
  }
}
