/**
 * A maths document taken the way an upload's pages are, with no database
 * behind it: for trying maths pages end to end on sample PDFs.
 *
 *   npm run maths:try -- <file.pdf> [--out <dir>] [--summary "..."]
 *
 * The PDF's text layer is read and tidied as extraction does; each page's
 * maths is found from its raw text; maths pages (and pages with no text)
 * are read again from their image by the OCR engine, a reading kept only
 * when it holds most of the text layer; and every page is simplified, a
 * maths page by the maths model, its working checked by code, sent back
 * once when a line is wrong, and cut at its last true line if it still
 * is. The report says what code found; the notes are written to the out
 * dir (scene-out/maths/<name> by default) as notes.json, for the reader's
 * dev page.
 */
import 'reflect-metadata';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CoreModule } from '../src/core.module';
import type { Block } from '../src/contracts';
import {
  checkNote,
  checkSolution,
  lostNumbers,
  mathsSignals,
  settleNote,
} from '../src/business/domain/maths-work';
import { cleanExtractedText } from '../src/business/domain/text';
import type { LlmGatewayPort } from '../src/business/ports/llm.port';
import type { OcrEnginePort } from '../src/business/ports/ocr.port';
import type { PdfToolkitPort } from '../src/business/ports/pdf-toolkit.port';
import {
  LLM_GATEWAY,
  OCR_ENGINE,
  PDF_TOOLKIT,
} from '../src/business/ports/tokens';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule],
})
class MathsTryModule {}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const option = (flag: string) => {
    const at = args.indexOf(flag);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const file = args.find(
    (a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'),
  );
  if (!file) {
    console.error('npm run maths:try -- <file.pdf> [--out <dir>]');
    process.exit(2);
  }
  const name = basename(file).replace(/\.[^.]+$/, '');
  const out = resolve(option('--out') ?? join('scene-out', 'maths', name));
  mkdirSync(out, { recursive: true });
  const app = await NestFactory.createApplicationContext(MathsTryModule, {
    logger: ['warn', 'error'],
  });
  try {
    const pdf = app.get<PdfToolkitPort>(PDF_TOOLKIT);
    const ocr = app.get<OcrEnginePort>(OCR_ENGINE);
    const llm = app.get<LlmGatewayPort>(LLM_GATEWAY);
    const bytes = readFileSync(file);
    const pages = (await pdf.extractPages(bytes)).map((page) => {
      const signals = mathsSignals(page.text);
      return {
        ...page,
        raw: page.text,
        text: cleanExtractedText(page.text),
        signals,
        ocr: false,
      };
    });
    // Scans and maths pages, read again from their image.
    const wanted = pages.filter((p) => p.isEmpty || p.signals.maths);
    if (wanted.length && ocr.isConfigured()) {
      // The engine, tried again when it is busy; failing that, the text
      // layer stands, as the OCR step leaves it after its retries.
      let read: { pageNumber: number; markdown: string }[] = [];
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          read = await ocr.readPages(
            bytes,
            wanted.map((p) => p.pageNumber),
          );
          break;
        } catch (error) {
          console.log(`   OCR try ${attempt}: ${(error as Error).message}`);
          await new Promise((done) => setTimeout(done, 15_000 * attempt));
        }
      }
      // A scan the engine could not read, by the vision model, from the
      // image the page is.
      if (!read.length) {
        const scans = wanted.filter((p) => p.isEmpty).map((p) => p.pageNumber);
        for (const image of scans.length
          ? await pdf.pageImages(bytes, scans)
          : []) {
          const seen = await llm.ocrPage(image);
          read.push({
            pageNumber: image.pageNumber,
            markdown: seen.value.blocks
              .map((b) => (b.type === 'math' ? `$$${b.text}$$` : b.text))
              .join('\n'),
          });
          console.log(
            `   page ${image.pageNumber} read by ${seen.usage.model}`,
          );
        }
      }
      for (const one of read) {
        const page = pages.find((p) => p.pageNumber === one.pageNumber);
        const chars = one.markdown.replace(/\s/g, '').length;
        if (!page || !chars) continue;
        if (!page.isEmpty && chars < page.charCount * 0.6) continue;
        page.text = one.markdown;
        page.ocr = true;
        page.isEmpty = false;
        // A scan's maths is found in what the OCR read.
        if (!page.signals.maths) page.signals = mathsSignals(one.markdown);
      }
    }
    const notes: {
      page: number;
      maths: boolean;
      ocr: boolean;
      source: string;
      blocks: Block[];
    }[] = [];
    for (const page of pages) {
      if (page.isEmpty) continue;
      const maths = page.signals.maths;
      console.log(
        `\n── page ${page.pageNumber}: ${maths ? 'maths' : 'prose'} (${page.signals.lines} maths lines, density ${page.signals.density}, ${page.signals.lost} lost glyphs)${page.ocr ? ', read from its image' : ''}`,
      );
      const ask = {
        pageText: page.text,
        summary: option('--summary') ?? null,
        pageNumber: page.pageNumber,
        maths,
      };
      const first = await llm.simplifyPage(ask);
      console.log(`   ${first.usage.model}, ${first.usage.latencyMs}ms`);
      let blocks = first.value;
      if (maths) {
        const problems = checkNote(blocks, page.text);
        if (problems.length) {
          console.log(`   goes back: ${problems.join(' | ')}`);
          const second = await llm.simplifyPage({
            ...ask,
            previous: blocks,
            problems,
          });
          const again = checkNote(second.value, page.text);
          console.log(
            `   second try: ${again.length ? again.join(' | ') : 'sound'}`,
          );
          if (again.length <= problems.length) blocks = second.value;
        }
        blocks = settleNote(blocks, page.text);
      }
      for (const block of blocks) {
        if (block.type !== 'working' || !block.working) {
          console.log(`   ${block.type}: ${block.text.slice(0, 110)}`);
          continue;
        }
        const found = checkSolution(block.working, page.text);
        console.log(
          `   WORKING: ${block.text}${block.working.cut ? '  [cut at its last true line]' : ''}`,
        );
        for (const given of block.working.given)
          console.log(`      given ${given}`);
        block.working.steps.forEach((step, i) =>
          console.log(
            `      ${found.steps[i].padEnd(9)} ${step.latex}    ← ${step.does}${step.why ? ` (${step.why})` : ''}`,
          ),
        );
        console.log(
          `      answer ${block.working.answer ?? '—'} [${found.answer}]; check ${block.working.check ?? '—'} [${found.check}]`,
        );
      }
      if (maths) {
        const lost = lostNumbers(page.text, blocks);
        if (lost.length)
          console.log(`   numbers not in the note: ${lost.join(', ')}`);
      }
      notes.push({
        page: page.pageNumber,
        maths,
        ocr: page.ocr,
        source: page.text,
        blocks,
      });
    }
    writeFileSync(join(out, 'notes.json'), JSON.stringify(notes, null, 2));
    console.log(`\n→ ${join(out, 'notes.json')}`);
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
