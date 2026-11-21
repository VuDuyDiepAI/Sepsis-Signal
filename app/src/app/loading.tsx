export default function Loading() {
  return (
    <div role="status" aria-label="Đang tải nội dung" className="section-stack">
      <p>Đang tải không gian lâm sàng…</p>
      <div className="stats-grid">
        {[1, 2, 3, 4].map((i) => (
          <div className="skeleton" key={i} />
        ))}
      </div>
      <div className="skeleton" style={{ height: 350 }} />
    </div>
  );
}
