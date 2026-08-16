"""Local JSON state store: launched entities, actions taken, leads seen.

Keeps the agent idempotent and auditable across runs. One state file per
business profile lives under AGENT_HOME.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any


class StateStore:
    def __init__(self, home: Path, profile_slug: str):
        self.home = Path(home)
        self.home.mkdir(parents=True, exist_ok=True)
        self.path = self.home / f"{profile_slug}.state.json"
        self._data: dict[str, Any] = self._load()

    def _load(self) -> dict[str, Any]:
        if self.path.exists():
            try:
                return json.loads(self.path.read_text())
            except json.JSONDecodeError:
                # Corrupt state: keep a backup and start fresh rather than crash.
                self.path.rename(self.path.with_suffix(".corrupt.json"))
        return {
            "campaigns": {},        # campaign_id -> metadata
            "ad_sets": {},          # ad_set_id -> metadata (incl. budget, status)
            "ads": {},              # ad_id -> metadata
            "lead_forms": {},       # form_id -> metadata
            "seen_lead_ids": [],
            "action_log": [],       # every mutation the agent performed
            "sim": {},              # dry-run simulator internals
        }

    def save(self) -> None:
        self.path.write_text(json.dumps(self._data, indent=2, default=str))

    # -- dict-style access -------------------------------------------------
    def __getitem__(self, key: str) -> Any:
        return self._data[key]

    def __setitem__(self, key: str, value: Any) -> None:
        self._data[key] = value

    def get(self, key: str, default: Any = None) -> Any:
        return self._data.get(key, default)

    # -- helpers -----------------------------------------------------------
    def log_action(self, action: str, **details: Any) -> None:
        self._data["action_log"].append(
            {"ts": time.strftime("%Y-%m-%d %H:%M:%S"), "action": action, **details}
        )

    def register(self, kind: str, entity_id: str, meta: dict[str, Any]) -> None:
        self._data[kind][entity_id] = meta

    def mark_leads_seen(self, lead_ids: list[str]) -> list[str]:
        """Return only the ids not seen before, and remember them."""
        seen = set(self._data["seen_lead_ids"])
        fresh = [i for i in lead_ids if i not in seen]
        self._data["seen_lead_ids"].extend(fresh)
        return fresh
