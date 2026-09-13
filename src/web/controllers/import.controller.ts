import { Body, Controller, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import type { ImportDiscoverResponse } from '../../contracts';
import { DiscoverImportHandler } from '../../business/handlers/import/discover.handler';
import { StartImportHandler } from '../../business/handlers/import/start.handler';
import { CurrentUser } from '../security/current-user.decorator';

class DiscoverDto {
  @IsString()
  @Length(4, 2000)
  url!: string;
}

class ImportPageDto {
  @IsString()
  @Length(4, 2000)
  url!: string;

  @IsString()
  @Length(0, 300)
  title!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  depth!: number;
}

class StartImportDto {
  @IsString()
  @Length(4, 2000)
  url!: string;

  @IsString()
  @Length(0, 300)
  title!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => ImportPageDto)
  pages!: ImportPageDto[];
}

/** Importing documentation from the web. */
@Controller('import')
export class ImportController {
  constructor(
    private readonly discover: DiscoverImportHandler,
    private readonly start: StartImportHandler,
  ) {}

  /** Reads a docs site's structure so the reader can pick a scope. */
  @Post('discover')
  async discoverDocs(
    @CurrentUser('id') userId: string,
    @Body() body: DiscoverDto,
  ): Promise<ImportDiscoverResponse> {
    const result = await this.discover.handle({ userId, url: body.url });
    return result.data;
  }

  /** Commissions the import; the document appears in the library processing. */
  @Post('start')
  async startImport(
    @CurrentUser('id') userId: string,
    @Body() body: StartImportDto,
  ): Promise<{ documentId: string }> {
    const result = await this.start.handle({
      userId,
      url: body.url,
      title: body.title,
      pages: body.pages,
    });
    return result.data;
  }
}
