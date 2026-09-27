import { VectorBaseDocument } from "./VectorBaseDocument";

export class EmbeddedChunk extends VectorBaseDocument {
  constructor(
    public documentId: string,
    public sourceId?: number,
    public content?: string,
  ) {
    super();
  }

  static chunksToContext(chunks: EmbeddedChunk[]): string {
    let context = "";

    chunks.forEach((chunk, i) => {
      context += `Chunk ${i + 1} (source passage ${chunk.sourceId}):\n`;
      context += `${chunk.content}\n`;
    });

    return context;
  }
}
