import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReportsService } from './reports.service';
import { AgentPerformanceQueryDto } from './dto/agent-performance.query.dto';
import { AuditQueryDto } from './dto/audit.query.dto';

@ApiTags('reports')
@ApiBearerAuth('supabase-jwt')
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.' })
@ApiForbiddenResponse({ description: 'Requires the OPERATOR role.' })
@Controller('operator')
@Roles('OPERATOR')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard')
  @ApiOperation({
    summary: 'Platform dashboard summary',
    description: 'Role: OPERATOR. Aggregate platform metrics.',
  })
  @ApiOkResponse({ description: 'Dashboard summary.' })
  dashboard() {
    return this.reports.platformSummary();
  }

  @Get('agents/performance')
  @ApiOperation({
    summary: 'Agent performance report',
    description: 'Role: OPERATOR. Per-agent metrics over a period.',
  })
  @ApiOkResponse({ description: 'Agent performance rows.' })
  agentPerformance(@Query() query: AgentPerformanceQueryDto) {
    return this.reports.agentPerformance(query);
  }

  @Get('audit')
  @ApiOperation({
    summary: 'Ledger audit log',
    description: 'Role: OPERATOR. Cursor-paginated ledger entries.',
  })
  @ApiOkResponse({ description: 'Paginated audit entries.' })
  audit(@Query() query: AuditQueryDto) {
    return this.reports.auditLog(query);
  }
}
