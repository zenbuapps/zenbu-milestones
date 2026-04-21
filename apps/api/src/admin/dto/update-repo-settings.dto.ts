import { IsBoolean, IsOptional } from 'class-validator';
import type { UpdateRepoSettingsInput } from 'shared';

/**
 * UpdateRepoSettingsDto
 * ---------------------------------------------------------------
 * PATCH /api/admin/repos/:owner/:name 的請求 body。
 *
 * 兩個欄位都是 optional，允許部分更新（只改 canSubmitIssue 或只改 visibleOnUI）。
 * Service 層會視不存在的紀錄為「尚未 upsert」並於此請求中 insert 預設值 + diff。
 */
export class UpdateRepoSettingsDto implements UpdateRepoSettingsInput {
  @IsOptional()
  @IsBoolean()
  canSubmitIssue?: boolean;

  @IsOptional()
  @IsBoolean()
  visibleOnUI?: boolean;
}
