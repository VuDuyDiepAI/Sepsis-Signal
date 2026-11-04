export const dateStr = (s: string) =>
  s
    ? new Date(
        s.length === 10 ? s + "T12:00:00" : s.endsWith("Z") ? s : s + "Z",
      ).toLocaleDateString("vi-VN")
    : "Chưa thiết lập";

export const localISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
