import type { Block, NoteSource } from '../../contracts';

export interface ExportSection {
  pageNumber: number;
  blocks: Block[];
  topicTitle?: string;
}

/** One of the reader's notes, as the appendix prints it. */
export interface ExportNote {
  body: string;
  pageNumber: number | null;
  quotedText: string | null;
  source: NoteSource;
}

/** Chromium vs Typst is a Phase-2 spike; both sit behind this (§4.8). */
export interface ExportRendererPort {
  render(input: {
    title: string;
    sections: ExportSection[];
    watermark: boolean;
    /** Printed as an appendix; omitted entirely when there are none. */
    notes?: ExportNote[];
  }): Promise<Buffer>;
}
