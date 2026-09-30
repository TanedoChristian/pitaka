import { ageLabel } from "@/lib/grow";

/** "Updated 3h ago · by agent" line under a Grow card heading. */
export function Updated({ at, source }: { at: Date | string; source?: string }) {
  const d = new Date(at);
  const stale = Date.now() - d.getTime() > 1000 * 60 * 60 * 36;
  return (
    <span className={`updated small${stale ? " stale" : ""}`} title={d.toLocaleString("en-PH", { timeZone: "Asia/Manila" })}>
      <span className="updated-dot" aria-hidden="true" />
      Updated {ageLabel(d)}
      {source ? ` · ${source === "rss" ? "live feeds" : source}` : ""}
    </span>
  );
}

/** Shown before the local agent has pushed anything for this section. */
export function AgentEmpty({ task, what }: { task: string; what: string }) {
  return (
    <section className="card agent-empty">
      <div className="agent-empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 17l6-6 4 4 6-8" />
          <path d="M14 7h6v6" />
        </svg>
      </div>
      <h2>No {what} yet</h2>
      <p className="small muted">
        Your research agent runs on your computer with Claude Code and sends results here. From the Pitaka folder, run:
      </p>
      <pre className="cmd">npm run agent -- {task}</pre>
      <p className="small muted">
        First time? See <strong>agent/README.md</strong> for the one-time setup (URL and secret).
      </p>
    </section>
  );
}

export function RefreshHint({ task }: { task: string }) {
  return (
    <p className="refresh-hint small muted">
      Refresh on your computer: <code>npm run agent -- {task}</code>
    </p>
  );
}
