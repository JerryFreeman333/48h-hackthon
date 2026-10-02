import type { ReactNode } from "react";

export function StateBadge({ children, state = "unknown" }: { children: ReactNode; state?: "known" | "unknown" | "conflict" }) {
  return <span className={`state-badge state-${state}`}>{children}</span>;
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return <header className="page-header"><h1>{title}</h1>{children}</header>;
}
