export interface PageAssetRecord {
  id: string;
  pageNumber: number;
  fileRef: string;
  mimeType: string;
  width: number;
  height: number;
  caption: string | null;
  orderIndex: number;
}

/** Figures belonging to a document's pages, scoped by content version. */
export interface PageAssetRepository {
  create(input: {
    documentId: string;
    contentVersion: number;
    pageNumber: number;
    fileRef: string;
    mimeType: string;
    width: number;
    height: number;
    caption?: string | null;
    orderIndex?: number;
  }): Promise<PageAssetRecord>;

  /** Every figure for a version of a document, in page and order-index order. */
  list(documentId: string, contentVersion: number): Promise<PageAssetRecord[]>;

  findById(
    assetId: string,
  ): Promise<(PageAssetRecord & { documentId: string }) | null>;

  /** A rewrite's figures replace the old version's. */
  clear(documentId: string): Promise<void>;
}
