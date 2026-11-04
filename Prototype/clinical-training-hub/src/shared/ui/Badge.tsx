import { statusNames } from "@/shared/lib/labels";

export function Badge({ status }: { status: string }) {
  return (
    <span className={"badge " + status.toLowerCase()}>
      <span />
      {statusNames[status] || status}
    </span>
  );
}

export const StatusBadge = Badge;
