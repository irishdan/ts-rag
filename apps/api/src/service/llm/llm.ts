import OpenAI from "openai";
import { config } from "../../config";

class Llm {
  private openAiClient: OpenAI;

  constructor() {
    this.openAiClient = new OpenAI({ apiKey: config.openai.apiKey });
  }

  async *streamPrompt(query: string, context?: string): AsyncGenerator<string> {
    const stream = this.openAiClient.responses.stream({
      model: config.openai.model,
      input: this.buildPrompt(query, context),
      temperature: 0.5,
    });

    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        yield event.delta;
      }
    }
  }

  private buildPrompt(query: string, context?: string): string {
    return `
You are a helpful assistant that answers questions using only the provided context, which is drawn
from a small corpus of Wikipedia excerpts. Answer what the user asked using the provided context as
the primary source of information.
If there is no context, please just answer "Computer says no!".
If the context does not contain the answer to the user's question, please just answer "Computer says no!".
User query: ${query}
Context: ${context}
    `;
  }
}

export default new Llm();
