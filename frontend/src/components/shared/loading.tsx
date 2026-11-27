export default function Loading() {
  return (
    <div role="status" aria-label="Đang tải nội dung" className="section-stack">
      <p>Đang tải không gian lâm sàng…</p>
      <div className="skeleton" style={{ height: 48 }} />
      <div className="skeleton" style={{ height: 350 }} />
    </div>
  );
}
