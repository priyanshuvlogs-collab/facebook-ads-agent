"""Environment-driven runtime settings (credentials, integrations, agent home)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv


def _bool(value: str | None, default: bool = False) -> bool:
    if value is None or value.strip() == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class Settings:
    """Runtime configuration resolved from environment variables / .env."""

    access_token: str = ""
    ad_account_id: str = ""
    page_id: str = ""
    instagram_actor_id: str = ""
    api_version: str = "v21.0"

    llm_provider: str = ""
    llm_api_key: str = ""
    llm_model: str = ""

    lead_webhook_url: str = ""
    slack_webhook_url: str = ""

    dry_run: bool = True
    agent_home: Path = field(default_factory=lambda: Path(".state"))

    @classmethod
    def load(cls, env_file: str | None = None) -> "Settings":
        load_dotenv(env_file or ".env", override=False)
        settings = cls(
            access_token=os.getenv("META_ACCESS_TOKEN", ""),
            ad_account_id=os.getenv("META_AD_ACCOUNT_ID", ""),
            page_id=os.getenv("META_PAGE_ID", ""),
            instagram_actor_id=os.getenv("META_INSTAGRAM_ACTOR_ID", ""),
            api_version=os.getenv("META_API_VERSION", "v21.0"),
            llm_provider=os.getenv("LLM_PROVIDER", "").lower(),
            llm_api_key=os.getenv("LLM_API_KEY", ""),
            llm_model=os.getenv("LLM_MODEL", ""),
            lead_webhook_url=os.getenv("LEAD_WEBHOOK_URL", ""),
            slack_webhook_url=os.getenv("SLACK_WEBHOOK_URL", ""),
            dry_run=_bool(os.getenv("DRY_RUN"), default=True),
            agent_home=Path(os.getenv("AGENT_HOME", ".state")),
        )
        return settings

    @property
    def has_meta_credentials(self) -> bool:
        return bool(self.access_token and self.ad_account_id and self.page_id)

    @property
    def effective_dry_run(self) -> bool:
        """Dry-run is forced on when credentials are missing (safety first)."""
        return self.dry_run or not self.has_meta_credentials
