#!/usr/bin/env python3
"""Create one deliberately named company folder, without managed subdirectories."""

from __future__ import annotations

import argparse

from archive_config import load_archive_config


def setup(company_folder: str):
    config = load_archive_config()
    archive_root = config.investment_archive_root
    if not archive_root.is_dir():
        raise FileNotFoundError(f"Investment Archive does not exist: {archive_root}")
    company_root = config.company_root(company_folder)
    company_root.mkdir(exist_ok=True)
    return company_root


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("company_folder", help="For example: 兖矿能源")
    args = parser.parse_args()
    print(setup(args.company_folder))


if __name__ == "__main__":
    main()
