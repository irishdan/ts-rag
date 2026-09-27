import { QdrantClient } from "@qdrant/js-client-rest";
import { ApiError } from "@qdrant/openapi-typescript-fetch";
import { EmbeddedQueryModel } from "../service/rag/embeddedQueryModel";
import { EmbeddedChunk } from "../vector/EmbeddedChunk";
import { config } from "../config";
import { AppError } from "../middleware/errorHandler";

class VectorRepository {
  private qdrantClient: QdrantClient;

  constructor() {
    this.qdrantClient = new QdrantClient({ url: "http://127.0.0.1:6333" });
  }

  async search(query: EmbeddedQueryModel, limit: number): Promise<EmbeddedChunk[]> {
    let filter = undefined;

    if (query.sourceId !== undefined) {
      filter = {
        must: [
          {
            key: "source_id",
            match: { value: query.sourceId },
          },
        ],
      };
    }

    let response;
    try {
      response = await this.qdrantClient.query(config.vector.collection, {
        query: query.embedding,
        filter,
        limit,
        with_payload: true,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        const notPopulatedError: AppError = new Error(
          `Qdrant collection "${config.vector.collection}" doesn't exist yet. Run the "populate" script from the repo root to create and populate it, then try again.`,
        );
        notPopulatedError.status = 503;
        throw notPopulatedError;
      }

      throw err;
    }

    return response.points.map((result) => {
      const payload = result.payload as { source_id?: number | string; content?: string } | undefined;
      const sourceId =
        payload?.source_id === undefined
          ? undefined
          : typeof payload.source_id === "number"
            ? payload.source_id
            : Number(payload.source_id);

      return new EmbeddedChunk(String(result.id), Number.isFinite(sourceId) ? sourceId : undefined, payload?.content);
    });
  }
}

export default new VectorRepository();
