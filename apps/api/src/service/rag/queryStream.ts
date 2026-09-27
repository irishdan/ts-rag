import { EventEmitter } from "events";
import Rag from "./rag";

export type QueryStreamEvent = {
  event: "stage" | "token" | "done" | "error";
  data: unknown;
};

// Decouples running the RAG pipeline from streaming its output over SSE:
// `start` kicks the pipeline off and its events are broadcast to every
// current subscriber; `subscribe` is how GET /rag/stream listens in. There's
// a single global stream — no per-query id — so events are only seen by
// whoever's already connected when they're emitted.
class QueryStreamBroadcaster {
  private emitter = new EventEmitter();

  start(query: string): void {
    void this.run(query);
  }

  subscribe(onEvent: (event: QueryStreamEvent) => void): () => void {
    const handler = (event: QueryStreamEvent) => onEvent(event);
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  private async run(query: string) {
    const emit = (event: QueryStreamEvent["event"], data: unknown) => {
      this.emitter.emit("event", { event, data });
    };

    try {
      const stream = Rag.streamResponse(query, (stage, details) => emit("stage", { stage, ...details }));

      // Manual iteration (rather than `for await...of`) so we can capture the
      // generator's return value once exhausted — it carries the final timing
      // summary, which isn't known until the answer has finished streaming.
      let next = await stream.next();
      while (!next.done) {
        emit("token", { token: next.value });
        next = await stream.next();
      }
      emit("done", next.value);
    } catch (err) {
      emit("error", { message: err instanceof Error ? err.message : "Something went wrong" });
    }
  }
}

export default new QueryStreamBroadcaster();
