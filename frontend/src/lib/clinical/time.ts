/** Local EMR timestamps have a fixed +07:00 timezone; do not use the browser's timezone. */
export function localTimestamp(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return NaN;
  const normalized = value.length === 16 ? value + ":00" : value;
  const time = Date.parse(normalized + "+07:00");
  return Number.isFinite(time) &&
    new Date(time + 7 * 3600000).toISOString().slice(0, 19) === normalized
    ? time
    : NaN;
}
export function predictionHour(
  value: string | undefined | null,
  fallback: number,
) {
  return value !== null &&
    value !== undefined &&
    /^\d+$/.test(value) &&
    Number(value) <= 36
    ? Number(value)
    : fallback;
}
