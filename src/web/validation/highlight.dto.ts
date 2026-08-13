import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class HighlightDto {
  @IsIn(['explain', 'simplify', 'define'])
  action!: 'explain' | 'simplify' | 'define';

  @Transform(trim)
  @IsString()
  @Length(2, 1000, { message: 'Select between 2 and 1000 characters' })
  selection!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageNumber!: number;
}

export class VisualizeDto {
  @Transform(trim)
  @IsString()
  @Length(2, 1000, { message: 'Select between 2 and 1000 characters' })
  selection!: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  pageNumber?: number;
}
