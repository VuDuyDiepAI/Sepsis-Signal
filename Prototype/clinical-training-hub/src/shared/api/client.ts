export async function api(path: string, options: RequestInit = {}) {
  const r = await fetch("/api" + path, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
    credentials: "include",
  }).catch(() => {
    throw new Error(
      "Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối và thử lại.",
    );
  });
  if (!r.ok) {
    const e = await r
      .json()
      .catch(() => ({ detail: "Không thể kết nối máy chủ." }));
    throw new Error(
      typeof e.detail === "string"
        ? e.detail
        : "Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.",
    );
  }
  return r.json();
}

export const post = (path: string, data: unknown = {}) =>
  api(path, { method: "POST", body: JSON.stringify(data) });
