import { Inject, Injectable } from '@nestjs/common';
import type { PageAssetDto } from '../../../contracts';
import { NotFoundError } from '../../domain/errors/errors';
import { PAGE_ASSET_REPOSITORY } from '../../repositories/tokens';
import type { PageAssetRepository } from '../../repositories/page-asset.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { DocumentAccessService } from './document-access.service';

export interface ListPageAssetsRequest {
  userId: string;
  documentId: string;
}

/** The figures for the open document's current version, in page order. */
@Injectable()
export class ListPageAssetsHandler extends AbstractRequestHandlerTemplate<
  ListPageAssetsRequest,
  PageAssetDto[]
> {
  constructor(
    @Inject(PAGE_ASSET_REPOSITORY)
    private readonly assets: PageAssetRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: ListPageAssetsRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);
    const assets = await this.assets.list(cmd.documentId, doc.contentVersion);
    return CommandResponse.of(
      assets.map((asset) => ({
        id: asset.id,
        pageNumber: asset.pageNumber,
        width: asset.width,
        height: asset.height,
        caption: asset.caption,
      })),
    );
  }
}

export interface GetPageAssetFileRequest {
  userId: string;
  documentId: string;
  assetId: string;
}

@Injectable()
export class GetPageAssetFileHandler extends AbstractRequestHandlerTemplate<
  GetPageAssetFileRequest,
  { fileRef: string; mimeType: string }
> {
  constructor(
    @Inject(PAGE_ASSET_REPOSITORY)
    private readonly assets: PageAssetRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: GetPageAssetFileRequest) {
    // Ownership is proven through the parent document, and the asset must
    // actually belong to the document in the URL — an id from someone else's
    // document reads as missing.
    await this.access.require(cmd.documentId, cmd.userId);
    const asset = await this.assets.findById(cmd.assetId);
    if (!asset || asset.documentId !== cmd.documentId) {
      throw new NotFoundError('Figure');
    }
    return CommandResponse.of({
      fileRef: asset.fileRef,
      mimeType: asset.mimeType,
    });
  }
}
