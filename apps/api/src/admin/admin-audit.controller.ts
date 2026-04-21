import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { AuditLogRow } from 'shared';
import { AdminGuard } from '../common/guards/admin.guard';
import { AuditService } from './audit.service';

interface ApiSuccess<T> {
  success: true;
  data: T;
}

/**
 * AdminAuditController
 * ---------------------------------------------------------------
 * GET /api/admin/audit-logs?limit=50
 *
 * limit 預設 50，上限 200（於 AuditService 內夾取）。
 */
@Controller('admin/audit-logs')
@UseGuards(AdminGuard)
export class AdminAuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  async list(
    @Query('limit') rawLimit?: string,
  ): Promise<ApiSuccess<AuditLogRow[]>> {
    const parsed = rawLimit != null ? Number(rawLimit) : undefined;
    const data = await this.audit.listRecent(Number.isFinite(parsed) ? parsed : undefined);
    return { success: true, data };
  }
}
