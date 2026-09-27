import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import "./ConfigPanel.css";

const CONFIG_URL = "http://localhost:3000/config";

type ConfigValues = {
  rag: {
    maxContextChunks: number;
    expandQueryToNQueries: number;
  };
  openai: {
    model: string;
    queryExpansionModel: string;
  };
  models: {
    embeddingModel: string;
    rerankingModel: string;
  };
};

export default function ConfigPanel() {
  const [values, setValues] = useState<ConfigValues | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch(CONFIG_URL)
      .then((response) => response.json())
      .then(setValues)
      .catch(() => setStatus("Failed to load config"));
  }, []);

  const applyRequest = async (request: () => Promise<Response>, successMessage: string) => {
    setSaving(true);
    setStatus(null);

    try {
      const response = await request();
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message ?? `Request failed (${response.status})`);
      }

      setValues(data);
      setStatus(successMessage);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!values) return;

    applyRequest(
      () =>
        fetch(CONFIG_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        }),
      "Saved",
    );
  };

  const handleReset = () => {
    applyRequest(() => fetch(CONFIG_URL, { method: "DELETE" }), "Reset to defaults");
  };

  return (
    <aside className="config-panel">
      <h2 className="config-title">Config</h2>
      {!values ? (
        <p className="config-loading">{status ?? "Loading…"}</p>
      ) : (
        <form className="config-form" onSubmit={handleSubmit}>
          <label className="config-field">
            <span className="config-field-label">
              Max context chunks
              <span className="config-field-hint">RAG_MAX_CONTEXT_CHUNKS</span>
            </span>
            <input
              type="number"
              min={1}
              value={values.rag.maxContextChunks}
              onChange={(event) =>
                setValues({ ...values, rag: { ...values.rag, maxContextChunks: Number(event.target.value) } })
              }
            />
          </label>

          <label className="config-field">
            <span className="config-field-label">
              Query expansions
              <span className="config-field-hint">RAG_QUERY_EXPANSION_EXPAND_TO</span>
            </span>
            <input
              type="number"
              min={1}
              value={values.rag.expandQueryToNQueries}
              onChange={(event) =>
                setValues({ ...values, rag: { ...values.rag, expandQueryToNQueries: Number(event.target.value) } })
              }
            />
          </label>

          <label className="config-field">
            <span className="config-field-label">
              Answer model
              <span className="config-field-hint">OPENAI_MODEL_ID</span>
            </span>
            <input
              type="text"
              value={values.openai.model}
              onChange={(event) => setValues({ ...values, openai: { ...values.openai, model: event.target.value } })}
            />
          </label>

          <label className="config-field">
            <span className="config-field-label">
              Query expansion model
              <span className="config-field-hint">OPENAI_QUERY_EXPANSION_MODEL_ID</span>
            </span>
            <input
              type="text"
              value={values.openai.queryExpansionModel}
              onChange={(event) =>
                setValues({ ...values, openai: { ...values.openai, queryExpansionModel: event.target.value } })
              }
            />
          </label>

          <label className="config-field">
            <span className="config-field-label">
              Reranking model
              <span className="config-field-hint">RERANKING_MODEL_ID</span>
            </span>
            <input
              type="text"
              value={values.models.rerankingModel}
              onChange={(event) =>
                setValues({ ...values, models: { ...values.models, rerankingModel: event.target.value } })
              }
            />
            <span className="config-field-note">
              Local model, re-scores already-retrieved chunks. Safe to change — a new model id just
              takes a moment to download/load the first time.
            </span>
          </label>

          <label className="config-field">
            <span className="config-field-label">
              Embedding model
              <span className="config-field-hint">EMBEDDING_MODEL_ID</span>
            </span>
            <input
              type="text"
              value={values.models.embeddingModel}
              onChange={(event) =>
                setValues({ ...values, models: { ...values.models, embeddingModel: event.target.value } })
              }
            />
            <span className="config-field-warning">
              ⚠ Query-time vectors only make sense compared against vectors from the <em>same</em>{" "}
              model. Changing this without re-running the <code>populate</code> script with the same model
              won't error — it'll just make retrieval silently meaningless.
            </span>
          </label>

          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" className="config-reset" onClick={handleReset} disabled={saving}>
            Reset to defaults
          </button>
          {status && <p className="config-status">{status}</p>}
        </form>
      )}
    </aside>
  );
}
