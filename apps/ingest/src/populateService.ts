import { QdrantClient } from "@qdrant/js-client-rest";
import SentenceTransformer from "@ts-rag/embeddings";
import TextChunker from "./textChunker";
import { randomUUID } from "node:crypto";
import { config } from "./config";

const DATASET_ROWS_URL =
  "https://datasets-server.huggingface.co/rows?dataset=rag-datasets%2Frag-mini-wikipedia&config=text-corpus&split=passages";
const PAGE_SIZE = 100;
const EMBEDDING_BATCH_SIZE = 32;

type WikiPassage = {
  id: number;
  passage: string;
};

type DatasetRowsResponse = {
  rows: { row: WikiPassage }[];
  num_rows_total: number;
};

type PassageChunk = {
  sourceId: number;
  chunkIndex: number;
  content: string;
};

export type PopulateResult = {
  passageCount: number;
  chunkCount: number;
};

async function fetchPassages(): Promise<WikiPassage[]> {
  const passages: WikiPassage[] = [];
  let offset = 0;
  let totalRows = Infinity;

  while (offset < totalRows) {
    const response = await fetch(`${DATASET_ROWS_URL}&offset=${offset}&length=${PAGE_SIZE}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch dataset rows at offset ${offset}: ${response.status} ${response.statusText}`);
    }

    const body: DatasetRowsResponse = await response.json();
    passages.push(...body.rows.map(({ row }) => row));

    totalRows = body.num_rows_total;
    offset += PAGE_SIZE;
  }

  return passages;
}

async function chunkPassages(passages: WikiPassage[]): Promise<PassageChunk[]> {
  const chunks: PassageChunk[] = [];

  for (const passage of passages) {
    const passageChunks = await TextChunker.chunk(passage.passage, config.chunk.maxTokens, config.chunk.overlapTokens);

    passageChunks.forEach((chunk) => {
      chunks.push({ sourceId: passage.id, chunkIndex: chunk.chunkIndex, content: chunk.content });
    });
  }

  return chunks;
}

async function embedAndUpsert(client: QdrantClient, collectionName: string, chunks: PassageChunk[]): Promise<void> {
  for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
    const vectors = await SentenceTransformer.encode(batch.map((chunk) => chunk.content));

    await client.upsert(collectionName, {
      points: batch.map((chunk, index) => ({
        id: randomUUID(),
        vector: vectors[index],
        payload: {
          source_id: chunk.sourceId,
          chunk_index: chunk.chunkIndex,
          content: chunk.content,
        },
      })),
    });

    console.log(`Upserted ${Math.min(i + EMBEDDING_BATCH_SIZE, chunks.length)}/${chunks.length} chunks`);
  }
}

let populateInProgress = false;

// Shared by both the CLI (populate.ts, the `populate` script) and the HTTP trigger
// (server.ts, `POST /populate`) so there's exactly one implementation of "what
// populating actually does".
export async function runPopulate(): Promise<PopulateResult> {
  if (populateInProgress) {
    const error: Error & { status?: number } = new Error("A populate run is already in progress");
    error.status = 409;
    throw error;
  }

  populateInProgress = true;

  try {
    const collectionName = config.vector.collection;
    const client = new QdrantClient({ url: "http://127.0.0.1:6333" });

    // Truncate first so re-running populate is idempotent — otherwise every
    // run just upserts another full copy on top under fresh random ids,
    // since nothing here is keyed by source passage id.
    const { exists } = await client.collectionExists(collectionName);

    if (exists) {
      console.log(`Collection "${collectionName}" already exists — deleting it before repopulating...`);
      await client.deleteCollection(collectionName);
    }

    console.log(`Creating collection "${collectionName}"...`);
    await client.createCollection(collectionName, {
      vectors: {
        size: 384,
        distance: "Cosine",
      },
    });

    console.log("Fetching rag-mini-wikipedia passages from Hugging Face...");
    const passages = await fetchPassages();
    console.log(`Fetched ${passages.length} passages`);

    console.log("Cleaning and chunking passages...");
    const chunks = await chunkPassages(passages);
    console.log(
      `Produced ${chunks.length} chunks (maxTokens=${config.chunk.maxTokens}, overlapTokens=${config.chunk.overlapTokens})`,
    );

    console.log("Embedding and upserting into Qdrant...");
    await embedAndUpsert(client, collectionName, chunks);

    console.log("✅  Vector database populated");

    return { passageCount: passages.length, chunkCount: chunks.length };
  } finally {
    populateInProgress = false;
  }
}
