import { pipeline } from "@huggingface/transformers";

export const EMBEDDING_MODEL_ID = "Xenova/all-MiniLM-L6-v2";

// Shared between apps/api and apps/ingest so both embed with the exact same
// model by default — otherwise query-time vectors wouldn't be comparable to
// the ones stored during ingest. apps/api can pass a different `modelId` to
// deliberately experiment with a different embedding model at query time
// (see its /config endpoint) — doing so breaks that pairing on purpose:
// retrieval will compare vectors from two different models, which is not a
// meaningful comparison, so results will be nonsense until either ingest is
// re-run with the same model or the override is cleared. apps/ingest never
// passes this — it always uses EMBEDDING_MODEL_ID.
class SentenceTransformer {
  async encode(sentences: string[], modelId: string = EMBEDDING_MODEL_ID): Promise<number[][]> {
    const extractor = await pipeline("feature-extraction", modelId, { dtype: "fp32" });
    const embeddings = await extractor(sentences, {
      pooling: "mean",
      normalize: true,
    });

    return embeddings.tolist();
  }
}

export default new SentenceTransformer();
