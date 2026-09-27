import { AutoTokenizer, PreTrainedTokenizer } from "@huggingface/transformers";

const TOKENIZER_MODEL_ID = "Xenova/all-MiniLM-L6-v2";

export type TextChunk = {
  content: string;
  chunkIndex: number;
  tokenCount: number;
};

type SentenceWithTokenCount = {
  sentence: string;
  tokenCount: number;
};

class TextChunker {
  private tokenizer?: PreTrainedTokenizer;

  async preload(): Promise<void> {
    await this.getTokenizer();
  }

  clean(text: string): string {
    return text.normalize("NFC").replace(/\s+/g, " ").trim();
  }

  /**
   * Splits cleaned text into sentence-bounded, token-aware chunks of at most
   * `maxTokens` tokens (per the embedding model's own tokenizer), carrying
   * `overlapTokens` worth of trailing sentences into the next chunk so
   * context isn't lost at chunk boundaries.
   */
  async chunk(text: string, maxTokens: number, overlapTokens: number): Promise<TextChunk[]> {
    const cleaned = this.clean(text);
    if (!cleaned) return [];

    const tokenizer = await this.getTokenizer();
    const sentences = this.splitSentences(cleaned).map((sentence) => ({
      sentence,
      tokenCount: tokenizer.encode(sentence).length,
    }));

    const chunks: TextChunk[] = [];
    let current: SentenceWithTokenCount[] = [];
    let currentTokens = 0;

    const flush = () => {
      if (current.length === 0) return;
      chunks.push({
        content: current.map((s) => s.sentence).join(" "),
        chunkIndex: chunks.length,
        tokenCount: currentTokens,
      });
    };

    for (const item of sentences) {
      if (current.length > 0 && currentTokens + item.tokenCount > maxTokens) {
        flush();

        const overlap: SentenceWithTokenCount[] = [];
        let overlapTokenCount = 0;
        for (let i = current.length - 1; i >= 0 && overlapTokenCount < overlapTokens; i--) {
          overlap.unshift(current[i]);
          overlapTokenCount += current[i].tokenCount;
        }

        current = overlap;
        currentTokens = overlapTokenCount;
      }

      current.push(item);
      currentTokens += item.tokenCount;
    }

    flush();

    return chunks;
  }

  private splitSentences(text: string): string[] {
    const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
    return Array.from(segmenter.segment(text), (s) => s.segment.trim()).filter(Boolean);
  }

  private async getTokenizer(): Promise<PreTrainedTokenizer> {
    if (!this.tokenizer) {
      this.tokenizer = await AutoTokenizer.from_pretrained(TOKENIZER_MODEL_ID);
    }

    return this.tokenizer;
  }
}

export default new TextChunker();
