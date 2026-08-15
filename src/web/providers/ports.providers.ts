import { Logger, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CLOCK,
  CONVERTER,
  EMAIL,
  EVENT_BUS,
  EXPORT_RENDERER,
  IMAGE_SEARCH,
  JOB_QUEUE,
  LLM_GATEWAY,
  OCR_ENGINE,
  PAYMENTS,
  PDF_TOOLKIT,
  REALTIME,
  SPEECH,
  STORAGE,
  VECTOR_STORE,
  WEB_IMPORT,
} from '../../business/ports/tokens';
import { BullmqQueueAdapter } from '../adapters/bullmq-queue.adapter';
import { DriveConverterAdapter } from '../adapters/drive-converter.adapter';
import { DriveStorageAdapter } from '../adapters/drive-storage.adapter';
import { FakeLlmAdapter } from '../adapters/fake-llm.adapter';
import { FakePaymentsAdapter } from '../adapters/fake-payments.adapter';
import { GoogleDriveClient } from '../adapters/google-drive.client';
import { GoogleImageSearchAdapter } from '../adapters/google-image-search.adapter';
import { LocalStorageAdapter } from '../adapters/local-storage.adapter';
import { LogEmailAdapter } from '../adapters/log-email.adapter';
import { MistralOcrAdapter } from '../adapters/mistral-ocr.adapter';
import { MysqlVectorStoreAdapter } from '../adapters/mysql-vector-store.adapter';
import { NullImageSearchAdapter } from '../adapters/null-image-search.adapter';
import { AiSdkLlmAdapter } from '../adapters/ai-sdk/ai-sdk-llm.adapter';
import {
  OpenAiRealtimeAdapter,
  OpenAiSpeechAdapter,
} from '../adapters/ai-sdk/openai-voice.adapters';
import { PassthroughConverterAdapter } from '../adapters/passthrough-converter.adapter';
import { PdfExportRendererAdapter } from '../adapters/pdf-export-renderer.adapter';
import { WebImportAdapter } from '../adapters/web-import/web-import.adapter';
import { PdfjsToolkitAdapter } from '../adapters/pdfjs-toolkit.adapter';
import { RedisEventBusAdapter } from '../adapters/redis-event-bus.adapter';
import { SystemClock } from '../adapters/system-clock';

const logger = new Logger('Ports');

/**
 * Every port is bound here, and the choice is made by env at boot.
 *
 * The default in each case is the one that runs with nothing configured, so a
 * fresh clone boots and works end to end; production opts in to the real
 * provider by setting a variable. That's what keeps "runnable locally" from
 * decaying — the local path is the default path, not a special case.
 */
export const portProviders: Provider[] = [
  GoogleDriveClient,

  { provide: CLOCK, useClass: SystemClock },
  { provide: VECTOR_STORE, useClass: MysqlVectorStoreAdapter },
  { provide: PDF_TOOLKIT, useClass: PdfjsToolkitAdapter },
  { provide: EVENT_BUS, useClass: RedisEventBusAdapter },
  { provide: JOB_QUEUE, useClass: BullmqQueueAdapter },
  { provide: EXPORT_RENDERER, useClass: PdfExportRendererAdapter },
  // Reads whole scanned documents in one hosted call when MISTRAL_API_KEY is
  // set; the OCR step falls back to per-page vision without it.
  { provide: OCR_ENGINE, useClass: MistralOcrAdapter },
  { provide: WEB_IMPORT, useClass: WebImportAdapter },
  // Voice rides on the same OpenAI key as the text gateway.
  { provide: SPEECH, useClass: OpenAiSpeechAdapter },
  { provide: REALTIME, useClass: OpenAiRealtimeAdapter },

  // Payments are stubbed until billing lands.
  { provide: PAYMENTS, useClass: FakePaymentsAdapter },
  { provide: EMAIL, useClass: LogEmailAdapter },

  {
    provide: STORAGE,
    inject: [ConfigService, GoogleDriveClient],
    useFactory: (config: ConfigService, drive: GoogleDriveClient) => {
      if (config.get('STORAGE_DRIVER') === 'drive' && drive.isConfigured()) {
        return new DriveStorageAdapter(drive);
      }
      if (config.get('STORAGE_DRIVER') === 'drive') {
        logger.warn(
          'STORAGE_DRIVER=drive but no service account is configured; using local disk',
        );
      }
      return new LocalStorageAdapter(config);
    },
  },

  {
    provide: CONVERTER,
    inject: [ConfigService, GoogleDriveClient],
    useFactory: (config: ConfigService, drive: GoogleDriveClient) => {
      // PDF-only is a legitimate configuration, and says so up front rather
      // than failing halfway through the pipeline.
      if (config.get('CONVERTER_DRIVER') !== 'drive')
        return new PassthroughConverterAdapter();

      // Asking for Drive without credentials used to downgrade silently to
      // PDF-only. The downgrade is invisible until someone uploads a DOCX and
      // watches it fail, so it's a boot failure instead — the same rule the
      // model gateway follows for a missing key.
      if (!drive.isConfigured()) {
        throw new Error(
          'CONVERTER_DRIVER=drive but GOOGLE_SERVICE_ACCOUNT_JSON is not set. ' +
            'Set the service-account JSON (and GOOGLE_WORKSPACE_SUBJECT), or ' +
            'set CONVERTER_DRIVER=passthrough to accept PDFs only.',
        );
      }
      return new DriveConverterAdapter(drive);
    },
  },

  {
    provide: LLM_GATEWAY,
    inject: [ConfigService],
    useFactory: (config: ConfigService) => {
      // The stand-in never simplifies anything — it restructures the page's own
      // text — so it is opt-in only. Falling back to it on a missing key would
      // let a misconfigured deployment look like it was working.
      if (config.get('LLM_DRIVER') === 'fake') {
        logger.warn(
          'LLM_DRIVER=fake — no model is being called, output is NOT simplified',
        );
        return new FakeLlmAdapter();
      }
      return new AiSdkLlmAdapter(config);
    },
  },

  {
    provide: IMAGE_SEARCH,
    inject: [ConfigService],
    useFactory: (config: ConfigService) =>
      config.get('GOOGLE_SEARCH_API_KEY') &&
      config.get('GOOGLE_SEARCH_ENGINE_ID')
        ? new GoogleImageSearchAdapter(config)
        : new NullImageSearchAdapter(),
  },
];
