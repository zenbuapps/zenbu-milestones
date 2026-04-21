import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import type { RejectIssueInput } from 'shared';

/**
 * RejectIssueDto
 * ---------------------------------------------------------------
 * POST /api/admin/issues/:id/reject 的請求 body。
 *
 * 欄位：
 *   - reason：必填；1..1000 字元。將寫入 issue.rejectReason 讓提交者看到。
 *
 * 刻意實作 RejectIssueInput 介面確保與 shared 契約同步。
 */
export class RejectIssueDto implements RejectIssueInput {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(1000)
  reason!: string;
}
