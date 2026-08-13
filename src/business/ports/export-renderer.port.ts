import type { Block } from '../../contracts';

export interface ExportSection {
  pageNumber: number;
  blocks: Block[];
  topicTitle?: string;
}

/** Chromium vs Typst is a Phase-2 spike; both sit behind this (§4.8). */
export interface ExportRendererPort {
  render(input: {
    title: string;
    sections: ExportSection[];
    watermark: boolean;
  }): Promise<Buffer>;
}
