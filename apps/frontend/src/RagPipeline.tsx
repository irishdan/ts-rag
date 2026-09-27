import "./RagPipeline.css";

export type StageEvent = Record<string, unknown> & { stage: string };

export type StreamSummary = {
  generatingAnswerDurationMs: number;
  totalDurationMs: number;
};

type ChunkInfo = {
  documentId: string;
  sourceId?: number;
  content?: string;
};

const STAGE_ORDER = ["self-query", "query-expansion", "retrieval", "reranking", "generating-answer"] as const;

const STAGE_TITLES: Record<(typeof STAGE_ORDER)[number], string> = {
  "self-query": "Self Query",
  "query-expansion": "Query Expansion",
  retrieval: "Retrieval",
  reranking: "Reranking",
  "generating-answer": "Answer Generation",
};

type Props = {
  stageEvents: StageEvent[];
  answer: string;
  active: boolean;
  errored: boolean;
  summary: StreamSummary | null;
};

function findStage(events: StageEvent[], stage: string): StageEvent | undefined {
  return events.find((event) => event.stage === stage);
}

function eventAfter(events: StageEvent[], stage: string): StageEvent | undefined {
  const index = events.findIndex((event) => event.stage === stage);
  return index === -1 ? undefined : events[index + 1];
}

function truncate(text: string | undefined, max = 110): string {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function formatDuration(ms: number | undefined): string | undefined {
  if (ms === undefined) return undefined;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

export default function RagPipeline({ stageEvents, answer, active, errored, summary }: Props) {
  // -1 (nothing active yet) when empty: indexOf(undefined) finds no match.
  const currentIndex = STAGE_ORDER.indexOf(
    stageEvents[stageEvents.length - 1]?.stage as (typeof STAGE_ORDER)[number],
  );

  return (
    <div className="pipeline">
      <div className="pipeline-header">
        <h2 className="pipeline-title">RAG pipeline</h2>
        {summary && <span className="pipeline-total-duration">{formatDuration(summary.totalDurationMs)}</span>}
      </div>
      {STAGE_ORDER.map((stage, index) => {
        const event = findStage(stageEvents, stage);
        const status =
          !event || index > currentIndex
            ? "pending"
            : index < currentIndex
              ? "done"
              : errored
                ? "error"
                : active
                  ? "active"
                  : "done";

        return (
          <div key={stage} className={`pipeline-stage pipeline-stage--${status}`}>
            <div className="pipeline-stage-marker">
              <span className="pipeline-stage-dot" />
              {index < STAGE_ORDER.length - 1 && <span className="pipeline-stage-line" />}
            </div>
            <div className="pipeline-stage-body">
              <h3>{STAGE_TITLES[stage]}</h3>
              {event && (
                <StageDetail
                  stage={stage}
                  event={event}
                  stageEvents={stageEvents}
                  answer={answer}
                  active={status === "active"}
                  summary={summary}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type StageDetailProps = {
  stage: (typeof STAGE_ORDER)[number];
  event: StageEvent;
  stageEvents: StageEvent[];
  answer: string;
  active: boolean;
  summary: StreamSummary | null;
};

function StageDetail({ stage, event, stageEvents, answer, active, summary }: StageDetailProps) {
  const model = event.model as string | undefined;

  switch (stage) {
    case "self-query": {
      const sourceId = event.sourceId as number | null;
      return (
        <>
          <Meta model={model} durationMs={event.durationMs as number | undefined} />
          <Field label="Input" text={event.query as string} />
          <Field
            label="Output"
            text={sourceId !== null ? `Extracted passage id: ${sourceId}` : "No specific passage referenced"}
          />
        </>
      );
    }

    case "query-expansion": {
      const expandedQueries = (event.expandedQueries as string[]) ?? [];
      return (
        <>
          <Meta model={model} durationMs={event.durationMs as number | undefined} />
          <Field label="Input" text={event.originalQuery as string} />
          <ListField label={`Output — ${expandedQueries.length} rewrites`} items={expandedQueries} />
        </>
      );
    }

    case "retrieval": {
      const next = eventAfter(stageEvents, "retrieval");
      const candidates = next?.candidates as ChunkInfo[] | undefined;
      return (
        <>
          <Meta model={model} durationMs={next?.retrievalDurationMs as number | undefined} />
          <Field label="Input" text={`${event.queryCount} queries searched in parallel`} />
          {candidates ? (
            <ChunkListField label={`Output — ${candidates.length} unique candidates found`} chunks={candidates} />
          ) : (
            <Field label="Output" text="Searching…" pending />
          )}
        </>
      );
    }

    case "reranking": {
      const candidateCount = event.candidateCount as number;
      const keepTopK = event.keepTopK as number;
      const next = eventAfter(stageEvents, "reranking");
      const chunks = next?.chunks as ChunkInfo[] | undefined;
      return (
        <>
          <Meta model={model} durationMs={next?.rerankingDurationMs as number | undefined} />
          <Field label="Input" text={`${candidateCount} candidates, keeping top ${keepTopK}`} />
          {chunks ? (
            <ChunkListField label={`Output — ${chunks.length} chunks kept`} chunks={chunks} />
          ) : (
            <Field label="Output" text="Ranking…" pending />
          )}
        </>
      );
    }

    case "generating-answer": {
      const chunkCount = event.chunkCount as number;
      return (
        <>
          <Meta model={model} durationMs={summary?.generatingAnswerDurationMs} />
          <Field label="Input" text={`${chunkCount} context chunks`} />
          <Field label="Output" text={answer || (active ? "Waiting for first token…" : "")} pending={!answer} />
        </>
      );
    }

    default:
      return null;
  }
}

function Meta({ model, durationMs }: { model?: string; durationMs?: number }) {
  const duration = formatDuration(durationMs);
  if (!model && !duration) return null;

  return (
    <div className="pipeline-meta">
      {model}
      {model && duration && " · "}
      {duration}
    </div>
  );
}

function Field({ label, text, pending }: { label: string; text: string; pending?: boolean }) {
  return (
    <div className="pipeline-field">
      <span className="pipeline-field-label">{label}</span>
      <p className={pending ? "pipeline-pending" : undefined}>{text}</p>
    </div>
  );
}

function ListField({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="pipeline-field">
      <span className="pipeline-field-label">{label}</span>
      <ul className="pipeline-list">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function ChunkListField({ label, chunks }: { label: string; chunks: ChunkInfo[] }) {
  return (
    <div className="pipeline-field">
      <span className="pipeline-field-label">{label}</span>
      <ul className="pipeline-list pipeline-chunks">
        {chunks.map((chunk) => (
          <li key={chunk.documentId}>
            <span className="pipeline-chunk-source">#{chunk.sourceId}</span> {truncate(chunk.content)}
          </li>
        ))}
      </ul>
    </div>
  );
}
