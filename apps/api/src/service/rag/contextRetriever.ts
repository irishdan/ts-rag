import { EmbeddedChunk } from "../../vector/EmbeddedChunk";
import PromptTemplate from "./promptTemplate";
import OpenAI from "openai";
import { config } from "../../config";
import { QueryModel } from "./queryModel";
import { EmbeddedQueryModel } from "./embeddedQueryModel";
import VectorRepository from "../../repository/vectorRepository";
import CrossEncoder from "./crossEncoder";
import SentenceTransformer from "@ts-rag/embeddings";

export type StageCallback = (stage: string, details: Record<string, unknown>) => void;

export type SearchResult = {
  chunks: EmbeddedChunk[];
  // Not known until after search() returns — its own onStage event fires
  // before reranking runs, so the duration is handed back for the caller to
  // attach to whichever later event reveals it (mirrors how candidates/chunks
  // are revealed via the *next* stage's event rather than their own).
  rerankingDurationMs: number;
};

export class ContextRetriever {
  private openAiClient: OpenAI;

  constructor() {
    // it would be good to use only local models for context retrieval...
    this.openAiClient = new OpenAI({ apiKey: config.openai.apiKey });
  }

  async search(
    query: string,
    maxContextChunks: number = 5,
    expandToNQueries: number = 5,
    onStage?: StageCallback,
  ): Promise<SearchResult> {
    const queryModel = QueryModel.fromString(query);
    let stageStart = Date.now();

    // Self Query:
    // first we can extract any structured data from the query.
    // in this example we want to extract a specific source passage id.
    const selfQueryPrompt = PromptTemplate.generateSelfQueryTemplate(query);
    const selfQueryResponse = await this.openAiClient.responses.create({
      model: config.openai.queryExpansionModel,
      input: selfQueryPrompt,
      temperature: 0,
    });
    const output = selfQueryResponse.output_text.trim();

    queryModel.sourceId = output.match(/^\d+$/) ? parseInt(output) : undefined;

    if (queryModel.sourceId !== undefined) {
      console.log(`Successfully extracted source passage id: ${queryModel.sourceId}`);
    }

    onStage?.("self-query", {
      query,
      sourceId: queryModel.sourceId ?? null,
      model: config.openai.queryExpansionModel,
      durationMs: Date.now() - stageStart,
    });

    // Query Expansion:
    // the next thing to do is to expand the query...
    // @todo: do this with a local model...
    stageStart = Date.now();
    const separator = "#next-question#";
    const expansionPrompt = PromptTemplate.generateQueryExpansionTemplate(query, expandToNQueries - 1, separator);
    const expansionResponse = await this.openAiClient.responses.create({
      model: config.openai.queryExpansionModel,
      input: expansionPrompt,
      temperature: 0,
    });

    const queries = [queryModel];
    expansionResponse.output_text.split(separator).forEach((item) => {
      queries.push(QueryModel.fromString(item.trim(), queryModel));
    });

    onStage?.("query-expansion", {
      originalQuery: query,
      expandedQueries: queries.slice(1).map((q) => q.content),
      model: config.openai.queryExpansionModel,
      durationMs: Date.now() - stageStart,
    });

    stageStart = Date.now();
    onStage?.("retrieval", { queryCount: queries.length, model: config.models.embeddingModel });
    const qdrantQueries = queries.map((query) => {
      return this.searchSingleQuery(query, maxContextChunks);
    });

    const groupedResults = await Promise.all(qdrantQueries);

    // needs to be deduped also
    const uniqueResultsIds: string[] = [];
    let results = groupedResults.reduce((acc, result) => {
      result.forEach((item) => {
        if (!uniqueResultsIds.includes(item.documentId)) {
          uniqueResultsIds.push(item.documentId);
          acc.push(item);
        }
      });

      return acc;
    }, [] as EmbeddedChunk[]);
    const retrievalDurationMs = Date.now() - stageStart;

    let rerankingDurationMs = 0;
    if (results.length > 0) {
      stageStart = Date.now();
      onStage?.("reranking", {
        candidateCount: results.length,
        keepTopK: maxContextChunks,
        candidates: results,
        model: config.models.rerankingModel,
        retrievalDurationMs,
      });
      results = await this.rerank(queryModel, results, maxContextChunks);
      rerankingDurationMs = Date.now() - stageStart;
    }

    return { chunks: results, rerankingDurationMs };
  }

  /**
   * Executes the vector search for **one** `Query` model across the three data
   * categories (posts, articles, repos).
   */
  async searchSingleQuery(query: QueryModel, k = 3): Promise<EmbeddedChunk[]> {
    if (k < 3) throw new Error("k should be ≥ 3");

    // @todo what us k ? give it a more meaningful name

    const embeddings = await SentenceTransformer.encode([query.content], config.models.embeddingModel);
    const embeddedQuery = EmbeddedQueryModel.fromQueryModel(embeddings[0], query);

    return await VectorRepository.search(embeddedQuery, k);
  }

  private async rerank(query: QueryModel, chunks: EmbeddedChunk[], keepTopK: number): Promise<EmbeddedChunk[]> {
    const docs = chunks.map((chunk) => chunk.content ?? "");
    const scores: number[] = await CrossEncoder.score(query.content, docs, config.models.rerankingModel);

    return scores
      .map((score, i) => ({ score, chunk: chunks[i] }))
      .sort((a, b) => b.score - a.score)
      .slice(0, keepTopK)
      .map((entry) => entry.chunk);
  }
}
