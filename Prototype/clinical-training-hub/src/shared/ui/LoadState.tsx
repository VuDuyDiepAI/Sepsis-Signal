export function LoadState({
  loading,
  error,
}: {
  loading: boolean;
  error: string;
}) {
  return error ? (
    <div className="error" role="alert">
      {error}
    </div>
  ) : loading ? (
    <div className="skeleton" role="status" aria-label="Đang tải dữ liệu">
      <i />
      <i />
      <i />
    </div>
  ) : null;
}
