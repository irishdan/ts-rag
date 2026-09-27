import { useState } from "react";
import "./IngestPanel.css";

const POPULATE_URL = "http://localhost:3001/populate";
const VECTOR_DB_DASHBOARD_URL = "http://localhost:6333/dashboard";

export default function IngestPanel() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePopulate = async () => {
    setLoading(true);
    setStatus(null);
    setError(null);

    try {
      const response = await fetch(POPULATE_URL, { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message ?? `Request failed (${response.status})`);
      }

      setStatus(`Populated ${data.chunkCount} chunks from ${data.passageCount} passages`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="ingest-panel">
      <h2 className="ingest-title">Ingest pipeline</h2>
      <p className="ingest-description">
        Fetches the dataset from Hugging Face, cleans/chunks/embeds it, and upserts into Qdrant —
        the same thing the <code>populate</code> script does.
      </p>
      <div className="ingest-actions">
        <button type="button" onClick={handlePopulate} disabled={loading}>
          {loading ? "Populating… (can take a minute)" : "Populate vector DB"}
        </button>
        <a
          className="ingest-secondary-button"
          href={VECTOR_DB_DASHBOARD_URL}
          target="_blank"
          rel="noreferrer"
        >
          Vector DB dashboard
        </a>
      </div>
      {error && <p className="ingest-result ingest-error">{error}</p>}
      {status && <p className="ingest-result ingest-success">{status}</p>}
    </section>
  );
}
