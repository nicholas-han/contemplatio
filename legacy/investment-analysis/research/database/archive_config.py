"""Load and validate the local Investment Archive configuration."""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG_PATH = REPO_ROOT / "config" / "local.json"
CONFIG_ENV_VAR = "INVESTMENT_ANALYSIS_CONFIG"
COMPANY_FOLDER_PATTERN = re.compile(r'^[^/\\:*?"<>|\x00]+$')


@dataclass(frozen=True)
class ArchiveConfig:
    version: int
    investment_archive_root: Path
    config_path: Path

    def company_root(self, company_folder: str) -> Path:
        validate_company_folder(company_folder)
        return self.investment_archive_root / company_folder

    def catalog_database_path(self) -> Path:
        return self.investment_archive_root / "catalog.sqlite"

    def company_database_path(self, company_folder: str) -> Path:
        return self.company_root(company_folder) / "company.sqlite"


def validate_company_folder(company_folder: str) -> None:
    if (
        company_folder in {"", ".", ".."}
        or company_folder != company_folder.strip()
        or not COMPANY_FOLDER_PATTERN.fullmatch(company_folder)
    ):
        raise ValueError(
            "Company folder must be one safe path component without leading or "
            "trailing whitespace or any of / \\ : * ? \" < > |."
        )


def load_archive_config(config_path: Path | None = None) -> ArchiveConfig:
    configured_path = os.environ.get(CONFIG_ENV_VAR)
    path = Path(configured_path) if configured_path else (config_path or DEFAULT_CONFIG_PATH)
    path = path.expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(
            f"Local config not found: {path}. Copy config/local.example.json "
            "to config/local.json and set investment_archive_root."
        )

    raw = json.loads(path.read_text(encoding="utf-8"))
    version = raw.get("version")
    if version != 2:
        raise ValueError(f"Unsupported config version: {version!r}")

    archive_value = raw.get("investment_archive_root")
    if not isinstance(archive_value, str) or not archive_value.strip():
        raise ValueError("investment_archive_root must be a non-empty string")
    archive_root = Path(archive_value).expanduser().resolve()

    return ArchiveConfig(
        version=version,
        investment_archive_root=archive_root,
        config_path=path,
    )
