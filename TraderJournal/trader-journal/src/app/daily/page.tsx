"use client";

import { useEffect, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DailyRow {
  date: string;
  account_value: number | null;
  goal_R: number | null;
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function DailyPage() {
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [date, setDate] = useState(todayISO());
  const [accountValue, setAccountValue] = useState("");
  const [goalR, setGoalR] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/daily");
      if (!resp.ok) throw new Error("Failed to load");
      const data = (await resp.json()) as DailyRow[];
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // When the user picks a date that already has a row, prefill the form
  useEffect(() => {
    const existing = rows.find((r) => r.date === date);
    if (existing) {
      setAccountValue(existing.account_value === null ? "" : String(existing.account_value));
      setGoalR(existing.goal_R === null ? "" : String(existing.goal_R));
    } else {
      setAccountValue("");
      setGoalR("");
    }
  }, [date, rows]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch("/api/daily", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          account_value: accountValue === "" ? null : Number(accountValue),
          goal_R: goalR === "" ? null : Number(goalR),
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || "Save failed");
      }
      setSavedAt(Date.now());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (rowDate: string) => {
    if (!confirm(`Remove daily entry for ${rowDate}?`)) return;
    setError(null);
    try {
      const resp = await fetch(`/api/daily?date=${encodeURIComponent(rowDate)}`, {
        method: "DELETE",
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || "Delete failed");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const recentSaved = savedAt && Date.now() - savedAt < 2000;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Daily Inputs</h1>
        <p className="text-sm text-slate-400 mt-1">
          Per-day account_value and goal_R. Risk % and Acc % on each trade are
          computed against the account_value for that trade&apos;s date.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Form */}
      <form
        onSubmit={submit}
        className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 space-y-3"
      >
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Set / update day
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Date">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="h-9 w-44 bg-transparent border-slate-700 text-sm"
            />
          </Field>
          <Field label="Account Value ($)">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={accountValue}
              onChange={(e) => setAccountValue(e.target.value)}
              placeholder="25000.00"
              className="h-9 w-40 bg-transparent border-slate-700 text-sm"
            />
          </Field>
          <Field label="Goal R">
            <Input
              type="number"
              step="0.01"
              value={goalR}
              onChange={(e) => setGoalR(e.target.value)}
              placeholder="2"
              className="h-9 w-28 bg-transparent border-slate-700 text-sm"
            />
          </Field>
          <Button type="submit" disabled={saving} className="h-9">
            {saving ? "Saving..." : "Save"}
          </Button>
          {recentSaved && (
            <span className="text-xs text-emerald-400 self-center">Saved</span>
          )}
        </div>
        <p className="text-[11px] text-slate-500">
          Saving a date that already exists overwrites it. Empty fields save as
          NULL (Risk % and Acc % won&apos;t compute for that day).
        </p>
      </form>

      {/* Table */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center justify-between">
          <span>History ({rows.length} days)</span>
          {loading && <span className="text-blue-400 normal-case">Loading...</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
                <Th>Date</Th>
                <Th align="right">Account Value</Th>
                <Th align="right">Goal R</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500 text-sm">
                    No entries yet.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr
                  key={row.date}
                  className={cn(
                    "border-b border-slate-800 hover:bg-slate-800/40 transition-colors",
                    row.date === date && "bg-slate-800/60"
                  )}
                >
                  <Td>
                    <button
                      type="button"
                      className="text-blue-400 hover:text-blue-300 hover:underline font-mono"
                      onClick={() => setDate(row.date)}
                    >
                      {row.date}
                    </button>
                  </Td>
                  <Td align="right" className="font-mono">
                    {row.account_value === null
                      ? "—"
                      : `$${row.account_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </Td>
                  <Td align="right" className="font-mono">
                    {row.goal_R === null ? "—" : row.goal_R.toFixed(2)}
                  </Td>
                  <Td align="right">
                    <button
                      type="button"
                      onClick={() => remove(row.date)}
                      className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                    >
                      Remove
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="block text-[11px] uppercase tracking-wider text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th className={cn("px-4 py-2 font-medium", align === "right" && "text-right")}>
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  className,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={cn(
        "px-4 py-2 text-slate-300",
        align === "right" && "text-right",
        className
      )}
    >
      {children}
    </td>
  );
}
