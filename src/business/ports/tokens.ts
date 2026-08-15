/**
 * Injection tokens for ports. Interfaces vanish at runtime, so Nest needs a
 * concrete symbol to resolve them; the web layer binds each of these to a
 * driver chosen by env.
 */
export const CLOCK = Symbol('ClockPort');
export const STORAGE = Symbol('StoragePort');
export const CONVERTER = Symbol('ConverterPort');
export const PDF_TOOLKIT = Symbol('PdfToolkitPort');
export const LLM_GATEWAY = Symbol('LlmGatewayPort');
export const OCR_ENGINE = Symbol('OcrEnginePort');
export const VECTOR_STORE = Symbol('VectorStorePort');
export const EMAIL = Symbol('EmailPort');
export const PAYMENTS = Symbol('PaymentsPort');
export const IMAGE_SEARCH = Symbol('ImageSearchPort');
export const EVENT_BUS = Symbol('EventBusPort');
export const JOB_QUEUE = Symbol('JobQueuePort');
export const EXPORT_RENDERER = Symbol('ExportRendererPort');
export const SPEECH = Symbol('SpeechPort');
export const REALTIME = Symbol('RealtimePort');
export const WEB_IMPORT = Symbol('WebImportPort');
