/**
 * Injection tokens for ports. Interfaces vanish at runtime, so Nest needs a
 * concrete symbol to resolve them; the web layer binds each of these to a
 * driver chosen by env.
 */
export const CLOCK = Symbol('ClockPort');
export const STORAGE = Symbol('StoragePort');
export const STARTER_LIBRARY = Symbol('StarterLibraryPort');
export const CONVERTER = Symbol('ConverterPort');
export const PDF_TOOLKIT = Symbol('PdfToolkitPort');
export const LLM_GATEWAY = Symbol('LlmGatewayPort');
export const OCR_ENGINE = Symbol('OcrEnginePort');
export const VECTOR_STORE = Symbol('VectorStorePort');
export const EMAIL = Symbol('EmailPort');
export const GOOGLE_IDENTITY = Symbol('GoogleIdentityPort');
export const PAYMENTS = Symbol('PaymentsPort');
export const IMAGE_SEARCH = Symbol('ImageSearchPort');
export const EVENT_BUS = Symbol('EventBusPort');
export const JOB_QUEUE = Symbol('JobQueuePort');
export const EXPORT_RENDERER = Symbol('ExportRendererPort');
export const SPEECH = Symbol('SpeechPort');
/** A school's catalogue's voice: Kokoro on a rented GPU, never the per-character one. */
export const LECTURE_SPEECH = Symbol('LectureSpeechPort');
/** A learner's own upload's voice: Kokoro on Railway when it is set up, else SPEECH. */
export const UPLOAD_SPEECH = Symbol('UploadSpeechPort');
/** Visualize's voice: the upload voice, or Gemini when SCENE_VOICE_ENGINE says so. */
export const SCENE_SPEECH = Symbol('SceneSpeechPort');
export const TRANSCRIPTION = Symbol('TranscriptionPort');
export const REALTIME = Symbol('RealtimePort');
export const WEB_IMPORT = Symbol('WebImportPort');
export const ALIGNER = Symbol('AlignerPort');
