"use client";

import { useState, useRef, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface EditableFieldProps {
  label: string;
  value: string;
  tradeId: number;
  field: string;
  onSaved?: () => void;
}

export function EditableField({
  label,
  value,
  tradeId,
  field,
  onSaved,
}: EditableFieldProps) {
  const [currentValue, setCurrentValue] = useState(value || "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasChanges = currentValue !== (value || "");

  const save = useCallback(async () => {
    if (!hasChanges) return;

    setStatus("saving");
    try {
      const resp = await fetch(`/api/trade/${tradeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value: currentValue }),
      });

      if (!resp.ok) {
        throw new Error("Save failed");
      }

      setStatus("saved");
      onSaved?.();

      // Reset status after a bit
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setStatus("idle"), 3000);
    }
  }, [currentValue, field, hasChanges, onSaved, tradeId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save();
    }
    // Stop propagation so arrow keys don't navigate trades while typing
    e.stopPropagation();
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </label>
        <div className="flex items-center gap-2">
          {status === "saved" && (
            <span className="text-xs text-emerald-400">Saved</span>
          )}
          {status === "error" && (
            <span className="text-xs text-red-400">Error saving</span>
          )}
          {status === "saving" && (
            <span className="text-xs text-blue-400">Saving...</span>
          )}
          {hasChanges && status === "idle" && (
            <button
              onClick={save}
              className="text-xs px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              Save
            </button>
          )}
        </div>
      </div>
      <Textarea
        value={currentValue}
        onChange={(e) => setCurrentValue(e.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        rows={2}
        className={cn(
          "resize-y bg-slate-900/50 border-slate-700 text-sm text-slate-200 placeholder:text-slate-500 transition-colors",
          status === "saved" && "border-emerald-500/50",
          status === "error" && "border-red-500/50"
        )}
        placeholder={`Add ${label.toLowerCase()}...`}
      />
      <p className="text-[10px] text-slate-600">Ctrl+Enter to save</p>
    </div>
  );
}
