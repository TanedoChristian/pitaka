import GrowTabs from "@/components/GrowTabs";

export default function GrowLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grow">
      <header className="page-head">
        <p className="eyebrow">Grow</p>
        <h1 className="grow-title">Spend wisely, grow steadily</h1>
      </header>
      <GrowTabs />
      {children}
      <p className="grow-disclaimer small muted">
        Pitaka is a coach, not a licensed adviser. Market data, promos and fuel prices come from public sources
        researched by your agent and may be delayed or wrong. Check the linked source before you act.
      </p>
    </div>
  );
}
