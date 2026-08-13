import { Injectable } from '@nestjs/common';
import type {
  ImageResult,
  ImageSearchPort,
} from '../../business/ports/image-search.port';

/**
 * No image provider configured. Returns nothing rather than fabricating
 * results, so the Visualize panel shows its designed no-results state instead
 * of pretending it found diagrams.
 */
@Injectable()
export class NullImageSearchAdapter implements ImageSearchPort {
  async search(): Promise<ImageResult[]> {
    return [];
  }
}
