// Shown instantly on navigation (and prefetched) while the page's queries run.
export default function Loading() {
  return (
    <div className="loading" aria-busy="true" aria-label="Loading">
      <div className="skel skel-title" />
      <div className="card skel skel-card" />
      <div className="card skel skel-card" />
    </div>
  );
}
