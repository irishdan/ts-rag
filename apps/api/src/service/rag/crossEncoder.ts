import {
  AutoModelForSequenceClassification,
  AutoTokenizer,
  PreTrainedModel,
  PreTrainedTokenizer,
  ProgressCallback,
} from "@huggingface/transformers";

class CrossEncoder {
  static DEFAULT_MODEL_ID = "mixedbread-ai/mxbai-rerank-xsmall-v1";

  private static model?: PreTrainedModel;
  private static tokenizer?: PreTrainedTokenizer;
  private static loadedModelId?: string;

  static async getInstance(modelId: string = this.DEFAULT_MODEL_ID, progressCallback?: ProgressCallback) {
    if (this.model && this.tokenizer && this.loadedModelId === modelId) {
      return [this.tokenizer, this.model] as const;
    }

    const loaded = await Promise.all([
      AutoTokenizer.from_pretrained(modelId),
      AutoModelForSequenceClassification.from_pretrained(modelId, {
        progress_callback: progressCallback,
      }),
    ]);

    this.tokenizer = loaded[0];
    this.model = loaded[1];
    this.loadedModelId = modelId;

    return [this.tokenizer, this.model] as const;
  }

  static async score(query: string, docs: string[], modelId: string = this.DEFAULT_MODEL_ID) {
    const [tokenizer, model] = await this.getInstance(modelId);

    const inputs = tokenizer(new Array(docs.length).fill(query), {
      text_pair: docs,
      padding: true,
      truncation: true,
    });

    const { logits } = await model(inputs);

    return logits.sigmoid().tolist();
  }
}

export default CrossEncoder;
