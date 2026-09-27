import dotenv from "dotenv";
import { EMBEDDING_MODEL_ID } from "@ts-rag/embeddings";

dotenv.config();

interface Index {
  port: number;
  nodeEnv: string;
  openai: {
    apiKey: string;
    model: string;
    queryExpansionModel: string;
  }
  rag: {
    maxContextChunks: number
    expandQueryToNQueries: number
  },
  models: {
    embeddingModel: string
    rerankingModel: string
  },
  vector: {
    collection: string
  }
}

const DEFAULT_RERANKING_MODEL_ID = "mixedbread-ai/mxbai-rerank-xsmall-v1";

export const config: Index = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  openai: {
    apiKey: process.env.OPENAI_API_KEY!,
    model: process.env.OPENAI_MODEL_ID!,
    queryExpansionModel: process.env.OPENAI_QUERY_EXPANSION_MODEL_ID!,
  },
  vector: {
    collection: process.env.VECTOR_DB_COLLECTION!
  },
  rag: {
    maxContextChunks: Number(process.env.RAG_MAX_CONTEXT_CHUNKS!),
    expandQueryToNQueries: Number(process.env.RAG_QUERY_EXPANSION_EXPAND_TO!),
  },
  models: {
    embeddingModel: process.env.EMBEDDING_MODEL_ID || EMBEDDING_MODEL_ID,
    rerankingModel: process.env.RERANKING_MODEL_ID || DEFAULT_RERANKING_MODEL_ID,
  }
};
