# Retrieval Augmented Generation Example

A small TypeScript monorepo demonstrating a basic but complete RAG pipeline: local
embedding/reranking models (via `@huggingface/transformers`) combined with OpenAI for query
understanding and answer generation, backed by a Qdrant vector store.

The dataset is [`rag-datasets/rag-mini-wikipedia`](https://huggingface.co/datasets/rag-datasets/rag-mini-wikipedia)
(`text-corpus` config) — ~3,200 short Wikipedia paragraph excerpts across a wide range of topics.
It's fetched live from Hugging Face at ingest time, so no dataset file is checked into this repo.

An npm-workspaces monorepo (works with npm, yarn, pnpm, or bun — see "Getting it running" below),
three apps and one shared package:

- **`apps/api/`** — Express server, the query-time RAG pipeline
- **`apps/ingest/`** — the offline pipeline that fetches, cleans, chunks, embeds, and populates Qdrant
- **`apps/frontend/`** — React + Vite single-page app to ask questions and watch the pipeline run
- **`packages/embeddings/`** — shared embedding model wrapper, so ingest-time and query-time vectors come from the same model

This is a local experiment/playground, not a production service.

## Getting it running

**Requirements:** Node.js 24+ (`nvm use`), a package manager (npm, yarn, pnpm, bun — pick one),
Docker (for Qdrant).

```bash
cp apps/api/.env.example apps/api/.env         # then add your OPENAI_API_KEY
cp apps/ingest/.env.example apps/ingest/.env   # VECTOR_DB_COLLECTION must match apps/api/.env
docker compose up -d                            # starts Qdrant
npm install
npm run preload                                 # warms the local HF models
npm run populate                                # fetches the dataset and populates Qdrant
npm run dev                                     # starts api, ingest, and frontend together
```

(Commands shown with `npm` — substitute `yarn`/`yarn <script>`, `pnpm install`/`pnpm <script>`, or
`bun install`/`bun run <script>` if you prefer. The repo has no committed lockfile, so your package
manager of choice will generate its own on install.)

Then open http://localhost:5173, type a question, and hit "Ask". Qdrant's dashboard is at
http://localhost:6333/dashboard.

Each app reads its own `.env` — there's no shared root `.env`. `ingest` doesn't need an OpenAI key.

## Ingest pipeline

Populating the vector store (the `populate` script, or `POST /populate` on `apps/ingest`'s own
server) runs `apps/ingest/src/populateService.ts`:

1. **Truncate** — the Qdrant collection is deleted and recreated empty, so re-running populate
   never produces duplicate copies of the dataset.
2. **Fetch** — pages through the dataset via Hugging Face's datasets-server API until all ~3,200
   `{ id, passage }` rows are retrieved.
3. **Clean** — each passage is Unicode-normalized and has whitespace collapsed.
4. **Chunk** — each passage is split into sentences and greedily packed into token-bounded chunks
   (using the embedding model's own tokenizer), with a few sentences of overlap carried between
   consecutive chunks so context isn't lost at boundaries.
5. **Embed + upsert** — chunks are embedded in batches with the local embedding model and upserted
   into Qdrant with `{ source_id, chunk_index, content }`.

## RAG pipeline (query time)

The whole pipeline lives in `ContextRetriever.search()` (`apps/api/src/service/rag/contextRetriever.ts`)
and runs in this order for every query:

1. **Self query** — the raw query is sent to an OpenAI model, asking it to extract a specific
   source-passage id if the user explicitly references one (e.g. "what does passage 42 say..."). If
   found, this becomes a Qdrant metadata filter applied to every subsequent search.
2. **Query expansion** — the same model generates several alternate phrasings of the question, to
   reduce the chance that similarity search misses relevant documents phrased differently than the
   query.
3. **Embedding + retrieval** — each query variant is embedded locally and used to run a Qdrant
   similarity search, optionally scoped by the self-query filter.
4. **Aggregation / dedup** — results from all searches are merged and deduplicated into a single
   candidate set.
5. **Reranking** — candidates are scored against the *original* query with a local cross-encoder
   and sorted; only the top `k` survive.
6. **Context assembly** — the surviving chunks are formatted into a plain-text context block.
7. **Answer generation** — the query plus context is sent to OpenAI, instructed to answer only from
   the given context (and to say so if the context doesn't contain the answer).

`POST /rag` starts the pipeline for a query and returns immediately. `GET /rag/stream` is a single
global SSE connection (used by the frontend) that broadcasts every query's `stage`, `token`, and
`done`/`error` events to whoever's currently connected — there's no per-query id. A client is
expected to already be subscribed to the stream before posting a query, otherwise it'll miss that
query's events.

## Configuration

Each app has its own `.env` (see `apps/api/.env.example`, `apps/ingest/.env.example`). The
important shared setting is `VECTOR_DB_COLLECTION`, which must match between `apps/api` and
`apps/ingest`. Most of `apps/api`'s RAG/model settings can also be changed at runtime without a
restart via `GET`/`POST`/`DELETE /config` (used by the frontend's config panel).

See inline comments in `apps/api/.env.example` and `apps/ingest/.env.example` for the full list of
variables.
