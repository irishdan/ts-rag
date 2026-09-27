import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";
import RagPipeline from "./RagPipeline";
import type { StageEvent, StreamSummary } from "./RagPipeline";
import ConfigPanel from "./ConfigPanel";
import IngestPanel from "./IngestPanel";

const RAG_URL = "http://localhost:3000/rag";
const STREAM_URL = "http://localhost:3000/rag/stream";

const STAGE_LABELS: Record<string, string> = {
  "self-query": "Checking for a specific passage...",
  "query-expansion": "Expanding your question...",
  retrieval: "Searching the corpus...",
  reranking: "Ranking results...",
  "generating-answer": "Generating answer...",
};

function App() {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [streamReady, setStreamReady] = useState(false);
  const [stageEvents, setStageEvents] = useState<StageEvent[]>([]);
  const [summary, setSummary] = useState<StreamSummary | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // A single, persistent subscription to the global event stream — every
  // query started via POST /rag broadcasts its events here, regardless of
  // which submission triggered them.
  useEffect(() => {
    const eventSource = new EventSource(STREAM_URL);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("open", () => setStreamReady(true));

    eventSource.addEventListener("stage", (event) => {
      const data = JSON.parse(event.data);
      setStage(data.stage);
      setStageEvents((prev) => [...prev, data]);
    });

    eventSource.addEventListener("token", (event) => {
      const data = JSON.parse(event.data);
      setAnswer((prev) => (prev ?? "") + data.token);
    });

    eventSource.addEventListener("done", (event) => {
      setSummary(JSON.parse(event.data));
      setLoading(false);
      setStage(null);
    });

    eventSource.addEventListener("error", (event) => {
      if (event instanceof MessageEvent && event.data) {
        setError(JSON.parse(event.data).message ?? "Something went wrong");
        setLoading(false);
        setStage(null);
      } else {
        setStreamReady(false);
      }
    });

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim() || loading || !streamReady) return;

    setLoading(true);
    setAnswer("");
    setError(null);
    setStage(null);
    setStageEvents([]);
    setSummary(null);

    try {
      const response = await fetch(RAG_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!response.ok) throw new Error("Failed to start query");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <main className="page">
      <form className="query-form" onSubmit={handleSubmit}>
        <h1>Example RAG pipeline</h1>
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ask something about the corpus..."
          autoFocus
        />
        <button type="submit" disabled={loading || !streamReady || !query.trim()}>
          {loading ? (stage ? STAGE_LABELS[stage] : undefined) || "Asking..." : streamReady ? "Ask" : "Connecting..."}
        </button>
        {error && <p className="result error">{error}</p>}
        {answer && <p className="result answer">{answer}</p>}
      </form>
      <div className="middle-column">
        <IngestPanel />
        <RagPipeline
          stageEvents={stageEvents}
          answer={answer ?? ""}
          active={loading}
          errored={error !== null}
          summary={summary}
        />
      </div>
      <ConfigPanel />
    </main>
  );
}

export default App;
