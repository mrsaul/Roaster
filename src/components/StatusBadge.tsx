import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-secondary text-secondary-foreground",
  confirmed: "bg-primary/10 text-primary",
  fulfilled: "bg-muted text-muted-foreground",
  synced: "bg-success/10 text-success",
  received: "bg-success/10 text-success",
  approved: "bg-info/10 text-info",
  packaging: "bg-warning/10 text-warning",
  ready_for_delivery: "bg-primary/10 text-primary",
  delivered: "bg-muted text-muted-foreground",
};

interface StatusBadgeProps {
  status: string;
  // HIDDEN — Sellsy — preserved for future use
  // sellsyId?: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium", STATUS_STYLES[status])}>
      {/* HIDDEN — Sellsy — preserved for future use */}
      {/* {status === "synced" && sellsyId ? (
        <span className="font-mono tabular-nums">{sellsyId}</span>
      ) : ( */}
        <span className="capitalize">{status}</span>
      {/* )} */}
    </span>
  );
}
