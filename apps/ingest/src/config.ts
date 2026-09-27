import dotenv from "dotenv";

dotenv.config();

interface IngestConfig {
  port: number;
  vector: {
    collection: string;
  };
  chunk: {
    maxTokens: number;
    overlapTokens: number;
  };
}

export const config: IngestConfig = {
  port: Number(process.env.PORT) || 3001,
  vector: {
    collection: process.env.VECTOR_DB_COLLECTION!,
  },
  chunk: {
    maxTokens: Number(process.env.RAG_CHUNK_MAX_TOKENS!),
    overlapTokens: Number(process.env.RAG_CHUNK_OVERLAP_TOKENS!),
  },
};
