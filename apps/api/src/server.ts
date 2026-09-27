import express, { Request, Response } from "express";
import cors from "cors";
import { config } from "./config";
import { z } from "zod";
import QueryStream from "./service/rag/queryStream";
import { errorHandler } from "./middleware/errorHandler";

const app = express();
app.use(cors());
app.use(express.json());

export const llmRequest = z.object({
  query: z.string(),
});

// Only the fields it's safe/sensible to change at runtime — never apiKey, port,
// nodeEnv, or vector.collection (changing those without a restart doesn't make
// sense, and apiKey is a secret that shouldn't round-trip through a JSON API).
const configOverrideRequest = z.object({
  rag: z
    .object({
      maxContextChunks: z.number().int().positive().optional(),
      expandQueryToNQueries: z.number().int().min(1).optional(),
    })
    .optional(),
  openai: z
    .object({
      model: z.string().min(1).optional(),
      queryExpansionModel: z.string().min(1).optional(),
    })
    .optional(),
  // Local transformers.js models. Unlike the OpenAI model ids above, changing
  // these has real costs/risks: a first-time model id triggers a fresh
  // download+load (same as the `preload` script, can take a while), and — for
  // embeddingModel specifically — query-time vectors only mean anything
  // compared against vectors stored by the *same* model, so overriding it
  // without re-running the `populate` script with the same model makes retrieval
  // silently meaningless rather than erroring. rerankingModel has no such
  // hazard; it only re-scores already-retrieved candidates.
  models: z
    .object({
      embeddingModel: z.string().min(1).optional(),
      rerankingModel: z.string().min(1).optional(),
    })
    .optional(),
});

// Snapshot of the env-loaded startup values, so overrides can be reset without
// restarting the server.
const defaultOverridableConfig = {
  rag: { ...config.rag },
  openai: { model: config.openai.model, queryExpansionModel: config.openai.queryExpansionModel },
  models: { ...config.models },
};

const overridableConfig = () => ({
  rag: { ...config.rag },
  openai: { model: config.openai.model, queryExpansionModel: config.openai.queryExpansionModel },
  models: { ...config.models },
});

app.get("/config", (_req: Request, res: Response) => {
  res.status(200).json(overridableConfig());
});

app.post("/config", (req: Request, res: Response) => {
  const input = configOverrideRequest.parse(req.body);

  if (input.rag?.maxContextChunks !== undefined) config.rag.maxContextChunks = input.rag.maxContextChunks;
  if (input.rag?.expandQueryToNQueries !== undefined) config.rag.expandQueryToNQueries = input.rag.expandQueryToNQueries;
  if (input.openai?.model !== undefined) config.openai.model = input.openai.model;
  if (input.openai?.queryExpansionModel !== undefined) config.openai.queryExpansionModel = input.openai.queryExpansionModel;
  if (input.models?.embeddingModel !== undefined) config.models.embeddingModel = input.models.embeddingModel;
  if (input.models?.rerankingModel !== undefined) config.models.rerankingModel = input.models.rerankingModel;

  res.status(200).json(overridableConfig());
});

app.delete("/config", (_req: Request, res: Response) => {
  config.rag.maxContextChunks = defaultOverridableConfig.rag.maxContextChunks;
  config.rag.expandQueryToNQueries = defaultOverridableConfig.rag.expandQueryToNQueries;
  config.openai.model = defaultOverridableConfig.openai.model;
  config.openai.queryExpansionModel = defaultOverridableConfig.openai.queryExpansionModel;
  config.models.embeddingModel = defaultOverridableConfig.models.embeddingModel;
  config.models.rerankingModel = defaultOverridableConfig.models.rerankingModel;

  res.status(200).json(overridableConfig());
});

// Starts the RAG pipeline; its events are broadcast to whoever's currently
// connected to GET /rag/stream. Fire-and-forget from the caller's point of
// view — a client is expected to already be subscribed to the stream before
// posting here.
app.post("/rag", (req: Request, res: Response) => {
  const input = llmRequest.parse(req.body);

  QueryStream.start(input.query);

  res.status(202).json({ status: "started" });
});

// A single global SSE stream: every query started via POST /rag broadcasts
// its stage/token/done/error events here, to every currently-connected client.
app.get("/rag/stream", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const unsubscribe = QueryStream.subscribe(({ event, data }) => send(event, data));

  req.on("close", () => {
    unsubscribe();
    res.end();
  });
});

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});
