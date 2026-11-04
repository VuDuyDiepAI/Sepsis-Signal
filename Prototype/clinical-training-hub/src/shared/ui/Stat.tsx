import { ArrowUpRight } from "lucide-react";
import { ReactNode } from "react";

export function Stat({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: ReactNode;
  label: string;
}) {
  return (
    <div className="stat">
      <div className="stat-top">
        <span className="icon-box">{icon}</span>
        <ArrowUpRight size={16} />
      </div>
      <strong>{value}</strong>
      <p>{label}</p>
    </div>
  );
}
