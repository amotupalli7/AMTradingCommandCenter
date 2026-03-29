import { cn } from "@/lib/utils";

interface StatsCardProps {
  label: string;
  value: string;
  colorClass?: string;
}

export function StatsCard({ label, value, colorClass }: StatsCardProps) {
  return (
    <div className="bg-slate-900/60 rounded-lg border border-slate-700/50 p-4">
      <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
        {label}
      </div>
      <div
        className={cn(
          "text-xl font-bold mt-1 font-mono tracking-tight",
          colorClass || "text-white"
        )}
      >
        {value}
      </div>
    </div>
  );
}
