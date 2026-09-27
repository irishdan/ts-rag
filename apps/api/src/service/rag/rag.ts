import { ContextRetriever, StageCallback } from "./contextRetriever";
import { EmbeddedChunk } from "../../vector/EmbeddedChunk";
import Llm from "../llm/llm";
import { config } from "../../config";

export type StreamSummary = {
  generatingAnswerDurationMs: number;
  totalDurationMs: number;
};

class Rag {
  async *streamResponse(query: string, onStage?: StageCallback): AsyncGenerator<string, StreamSummary> {
    const pipelineStart = Date.now();
    const retriever = new ContextRetriever();

    const { chunks, rerankingDurationMs } = await retriever.search(
      query,
      config.rag.maxContextChunks,
      config.rag.expandQueryToNQueries,
      onStage,
    );
    const context = EmbeddedChunk.chunksToContext(chunks);

    onStage?.("generating-answer", {
      chunkCount: chunks.length,
      chunks,
      model: config.openai.model,
      rerankingDurationMs,
    });

    const generatingAnswerStart = Date.now();
    yield* Llm.streamPrompt(query, context);
    const generatingAnswerDurationMs = Date.now() - generatingAnswerStart;

    return { generatingAnswerDurationMs, totalDurationMs: Date.now() - pipelineStart };
  }
}

export default new Rag();
