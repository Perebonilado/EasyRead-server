import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { MAX_UPLOAD_BYTES } from '../../business/domain/values';

const LEVELS = ['standard', 'easiest'] as const;

export class UploadIntentDto {
  @IsString()
  @Length(1, 512)
  filename!: string;

  /** Membership of the accepted set is checked in the handler, which owns it. */
  @IsString()
  @Length(1, 128)
  mimeType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES)
  sizeBytes!: number;
}

export class DocumentListQueryDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  search?: string;

  @IsOptional()
  @IsIn(['uploading', 'processing', 'ready', 'failed'])
  status?: 'uploading' | 'processing' | 'ready' | 'failed';

  @IsOptional()
  @IsIn(['recent', 'title', 'progress'])
  sort?: 'recent' | 'title' | 'progress';
}

export class PageRangeDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  from?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  to?: number;
}

export class SimplifiedPagesQueryDto extends PageRangeDto {
  @IsOptional()
  @IsIn(LEVELS)
  level?: (typeof LEVELS)[number];
}

export class RenameDocumentDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 500)
  title!: string;
}

export class PrioritiseDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageNumber!: number;

  @IsIn(LEVELS)
  level!: (typeof LEVELS)[number];
}

export class RetryPageDto extends PrioritiseDto {}

export class SavePositionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  lastPage!: number;

  @IsIn(['original', 'standard', 'easiest'])
  level!: 'original' | 'standard' | 'easiest';
}

export class MarkTopicsDto {
  @IsArray()
  @ArrayMaxSize(200)
  // uuid v7 — version-specific validators would reject our ids.
  @IsUUID('all', { each: true })
  topicIds!: string[];

  @IsBoolean()
  read!: boolean;
}

export class ExportDto {
  @IsIn(LEVELS)
  level!: (typeof LEVELS)[number];
}
