"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";

export function RunHunterButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function startRun() {
    setStarting(true);
    setMessage(null);
    try {
      const response = await fetch(apiUrl("/api/hunter/runs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await response.json()) as {
        ok: boolean;
        data?: { started: boolean; reason?: string };
      };
      if (json.ok && json.data?.started) {
        setMessage("Hunt started - refresh to watch progress.");
      } else {
        setMessage(json.data?.reason ?? "Could not start the hunt.");
      }
      startTransition(() => router.refresh());
    } catch {
      setMessage("API server unreachable. Start it with: npm run dev");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="row">
      <button
        className="btn"
        onClick={startRun}
        disabled={disabled || starting || isPending}
      >
        {starting ? "Starting..." : "Start new hunt"}
      </button>
      {message && <span className="dim">{message}</span>}
    </div>
  );
}
