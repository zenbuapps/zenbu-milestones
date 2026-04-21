import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ISSUE_BODY_MAX, ISSUE_TITLE_MAX } from 'shared';

/**
 * CreateIssueDto
 * ---------------------------------------------------------------
 * POST /api/issues 的請求 body 型別。
 *
 * 欄位驗證（透過全域 ValidationPipe 自動套用）：
 *   - repoOwner / repoName：GitHub 合法字元（字母、數字、底線、點、連字號）
 *   - title：1..ISSUE_TITLE_MAX 字元
 *   - body：1..ISSUE_BODY_MAX 字元（對應 DB 的 Text 欄位實際容量由 shared 約束）
 *
 * shared 匯出的常數確保前後端對「上限」認知一致。
 */
export class CreateIssueDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message: 'repoOwner 僅允許英數字、底線、點、連字號',
  })
  repoOwner!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message: 'repoName 僅允許英數字、底線、點、連字號',
  })
  repoName!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(ISSUE_TITLE_MAX)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(ISSUE_BODY_MAX)
  body!: string;
}
