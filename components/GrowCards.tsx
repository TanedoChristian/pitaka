import { formatPeso } from "@/lib/format";
import { formatPrice, RISK_LEVELS, type Forecast, type InvestIdea, type InvestPick, type Risk } from "@/lib/grow";

export function riskDistance(a: Risk, b: Risk) {
  return Math.abs(RISK_LEVELS.indexOf(a) - RISK_LEVELS.indexOf(b));
}

const ARROW = { up: "▲", down: "▼", sideways: "◆" } as const;
const TREND = { up: "Leaning up", down: "Leaning down", sideways: "Range-bound" } as const;

function withUnit(n: number | null, unit: string) {
  if (n === null) return "—";
  const v = formatPrice(n);
  if (unit === "₱") return `₱${v}`;
  if (unit === "USD" || unit === "$") return `$${v}`;
  if (unit === "%") return `${v}%`;
  return unit ? `${v} ${unit}` : v;
}

export function ForecastCard({ f }: { f: Forecast }) {
  // Place today's price on a track that spans the forecast range (and the price, if it sits outside it).
  const hasRange = f.low !== null && f.high !== null;
  const min = hasRange ? Math.min(f.low!, f.price ?? f.low!) : 0;
  const max = hasRange ? Math.max(f.high!, f.price ?? f.high!) : 0;
  const span = max - min || 1;
  const at = (v: number) => `${((v - min) / span) * 100}%`;
  return (
    <article className={`card forecast ${f.direction}`}>
      <div className="spread">
        <span className="chip">{f.group}</span>
        <span className="small muted">{f.horizon}</span>
      </div>
      <div className="forecast-title">
        <strong>{f.asset}</strong>
        <span className={`trend ${f.direction}`}>
          {ARROW[f.direction]} {TREND[f.direction]}
        </span>
      </div>
      {hasRange && (
        <div className="range" aria-label={`Likely range ${withUnit(f.low, f.unit)} to ${withUnit(f.high, f.unit)}`}>
          <div className="range-track">
            <span className="range-band" style={{ left: at(f.low!), width: `calc(${at(f.high!)} - ${at(f.low!)})` }} />
            {f.price !== null && <span className="range-now" style={{ left: at(f.price) }} title={`Now ${withUnit(f.price, f.unit)}`} />}
          </div>
          <div className="spread small">
            <span>{withUnit(f.low, f.unit)}</span>
            {f.price !== null && <span className="muted">now {withUnit(f.price, f.unit)}</span>}
            <span>{withUnit(f.high, f.unit)}</span>
          </div>
        </div>
      )}
      <p className="small muted">{f.drivers}</p>
      <div className="spread small">
        <span className={`confidence ${f.confidence}`}>{f.confidence} confidence</span>
        {f.url && (
          <a href={f.url} target="_blank" rel="noopener noreferrer">
            Source ↗
          </a>
        )}
      </div>
    </article>
  );
}

export function IdeaCard({ idea, mine, rank }: { idea: InvestIdea & Partial<Pick<InvestPick, "expected" | "risks">>; mine: boolean; rank?: number }) {
  return (
    <article className={`card idea${mine ? " mine" : ""}${rank === 1 ? " top" : ""}`}>
      <div className="spread wrap">
        <span className="idea-tags">
          {rank !== undefined && <span className="idea-rank">#{rank}</span>}
          <span className={`risk-chip ${idea.risk}`}>{idea.risk}</span>
        </span>
        {idea.vehicle && <span className="small muted">{idea.vehicle}</span>}
      </div>
      <h3>{idea.title}</h3>
      <p className="small">{idea.why}</p>
      {idea.risks && (
        <p className="small muted">
          <strong>Watch out:</strong> {idea.risks}
        </p>
      )}
      {idea.how && (
        <p className="small muted">
          <strong>How to start:</strong> {idea.how}
        </p>
      )}
      <dl className="idea-facts small">
        {idea.expected && (
          <div>
            <dt>Expect</dt>
            <dd>{idea.expected}</dd>
          </div>
        )}
        {idea.horizon && (
          <div>
            <dt>Keep it in</dt>
            <dd>{idea.horizon}</dd>
          </div>
        )}
        {idea.min_amount !== null && (
          <div>
            <dt>Start with</dt>
            <dd>{formatPeso(idea.min_amount)}</dd>
          </div>
        )}
      </dl>
      {idea.url && (
        <a className="perk-link small" href={idea.url} target="_blank" rel="noopener noreferrer">
          Official page ↗
        </a>
      )}
    </article>
  );
}

