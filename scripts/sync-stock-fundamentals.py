#!/usr/bin/env python3
"""Best-effort offline sync for A-share fundamental inputs.

The app calculates valuation metrics from these durable inputs:
- totalShares
- deductedNetProfit
- netAsset

Akshare endpoints can be slow or change field names, so this script is defensive:
failed symbols are logged and old database values are preserved.
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import akshare as ak
import pandas as pd
import psycopg

APP_DATABASE_NAME = "postgres"
SOURCE = "akshare"


@dataclass
class Fundamental:
    symbol: str
    report_date: dt.date
    total_shares: float | None
    deducted_net_profit: float | None
    net_asset: float | None


def load_dotenv() -> None:
    env_path = Path(".env")
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        text = line.strip()
        if not text or text.startswith("#") or "=" not in text:
            continue
        key, value = text.split("=", 1)
        key = key.strip()
        if key in os.environ:
            continue
        os.environ[key] = value.strip().strip('"').strip("'")


def database_url() -> str:
    load_dotenv()
    base = os.environ.get("DATABASE")
    if not base:
        raise RuntimeError("DATABASE is required")
    parsed = urlsplit(base)
    return urlunsplit((parsed.scheme, parsed.netloc, f"/{APP_DATABASE_NAME}", parsed.query, parsed.fragment))


def number_from_value(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)) and pd.notna(value):
        return float(value)
    text = str(value).strip().replace(",", "")
    if not text or text in {"--", "-", "nan", "None"}:
        return None
    multiplier = 1.0
    if text.endswith("万亿"):
        multiplier = 1e12
        text = text[:-2]
    elif text.endswith("亿"):
        multiplier = 1e8
        text = text[:-1]
    elif text.endswith("万"):
        multiplier = 1e4
        text = text[:-1]
    text = text.replace("元", "").replace("股", "").replace("%", "")
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return None
    return float(match.group(0)) * multiplier


def date_from_value(value: Any) -> dt.date | None:
    if value is None or pd.isna(value):
        return None
    if isinstance(value, (dt.date, dt.datetime, pd.Timestamp)):
        return pd.Timestamp(value).date()
    text = str(value)
    match = re.search(r"(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})", text)
    if not match:
        return None
    return dt.date(int(match.group(1)), int(match.group(2)), int(match.group(3)))


def find_column(row: dict[str, Any], include: list[str], exclude: list[str] | None = None) -> Any:
    exclude = exclude or []
    for key, value in row.items():
        normalized = str(key).lower()
        if all(word.lower() in normalized for word in include) and not any(word.lower() in normalized for word in exclude):
            return value
    return None


def total_amount_from_value(value: Any) -> float | None:
    amount = number_from_value(value)
    if amount is None:
        return None
    # Total company financial statement amounts should not look like per-share values.
    if abs(amount) < 1_000_000:
        return None
    return amount


def fetch_symbols(conn: psycopg.Connection, explicit_symbols: list[str]) -> list[str]:
    if explicit_symbols:
        return sorted({symbol.strip().upper() for symbol in explicit_symbols if symbol.strip()})
    with conn.cursor() as cur:
        cur.execute('SELECT DISTINCT "symbol" FROM "StockHolding" ORDER BY "symbol"')
        return [row[0] for row in cur.fetchall()]


def fetch_total_shares(symbol: str) -> float | None:
    try:
        info = ak.stock_individual_info_em(symbol=symbol)
    except Exception as exc:
        print(f"[{symbol}] stock_individual_info_em failed: {exc}", file=sys.stderr)
        return None
    if info is None or info.empty:
        return None
    for _, row in info.iterrows():
        item = str(row.get("item") or row.get("项目") or "")
        if "总股本" in item:
            return number_from_value(row.get("value") or row.get("值"))
    return None


def fetch_financial_indicator(symbol: str) -> tuple[dt.date | None, float | None, float | None]:
    current_year = dt.date.today().year
    frames: list[pd.DataFrame] = []
    for start_year in (str(current_year - 2), str(current_year - 4)):
        try:
            frame = ak.stock_financial_analysis_indicator(symbol=symbol, start_year=start_year)
            if frame is not None and not frame.empty:
                frames.append(frame)
                break
        except Exception as exc:
            print(f"[{symbol}] stock_financial_analysis_indicator({start_year}) failed: {exc}", file=sys.stderr)

    if not frames:
        return None, None, None

    frame = frames[0].copy()
    date_column = next((col for col in frame.columns if "日期" in str(col) or "date" in str(col).lower()), frame.columns[0])
    frame["__report_date"] = frame[date_column].map(date_from_value)
    frame = frame.dropna(subset=["__report_date"]).sort_values("__report_date", ascending=False)
    if frame.empty:
        return None, None, None

    row = frame.iloc[0].to_dict()
    report_date = row["__report_date"]
    deducted_net_profit = (
        number_from_value(find_column(row, ["扣除", "非经常", "净利润"]))
        or number_from_value(find_column(row, ["扣非", "净利润"]))
    )
    net_asset = (
        total_amount_from_value(find_column(row, ["归属", "净资产"], exclude=["每股", "收益率", "roe", "%"]))
        or total_amount_from_value(find_column(row, ["股东", "权益"], exclude=["每股", "收益率", "roe", "%"]))
        or total_amount_from_value(find_column(row, ["净资产"], exclude=["每股", "收益率", "roe", "%"]))
    )
    return report_date, deducted_net_profit, net_asset


def fetch_fundamental(symbol: str) -> Fundamental | None:
    total_shares = fetch_total_shares(symbol)
    report_date, deducted_net_profit, net_asset = fetch_financial_indicator(symbol)
    if not report_date:
        print(f"[{symbol}] missing report date; skipped", file=sys.stderr)
        return None
    if total_shares is None and deducted_net_profit is None and net_asset is None:
        print(f"[{symbol}] no useful fundamental fields; skipped", file=sys.stderr)
        return None
    return Fundamental(symbol, report_date, total_shares, deducted_net_profit, net_asset)


def upsert_fundamental(conn: psycopg.Connection, item: Fundamental) -> None:
    with conn.cursor() as cur:
        cur.execute(
            '''
            INSERT INTO "StockFundamental"
              ("symbol", "reportDate", "totalShares", "deductedNetProfit", "netAsset", "source", "fetchedAt", "createdAt", "updatedAt")
            VALUES
              (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT ("symbol", "reportDate") DO UPDATE SET
              "totalShares" = COALESCE(EXCLUDED."totalShares", "StockFundamental"."totalShares"),
              "deductedNetProfit" = COALESCE(EXCLUDED."deductedNetProfit", "StockFundamental"."deductedNetProfit"),
              "netAsset" = COALESCE(EXCLUDED."netAsset", "StockFundamental"."netAsset"),
              "source" = EXCLUDED."source",
              "fetchedAt" = CURRENT_TIMESTAMP,
              "updatedAt" = CURRENT_TIMESTAMP
            ''',
            (item.symbol, item.report_date, item.total_shares, item.deducted_net_profit, item.net_asset, SOURCE),
        )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbols", nargs="*", default=[])
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--sleep", type=float, default=0.8)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    ok = 0
    failed: list[str] = []
    with psycopg.connect(database_url()) as conn:
        symbols = fetch_symbols(conn, args.symbols)
        if args.limit > 0:
            symbols = symbols[: args.limit]
        print(f"syncing {len(symbols)} symbols: {', '.join(symbols)}")

        for symbol in symbols:
            try:
                item = fetch_fundamental(symbol)
                if not item:
                    failed.append(symbol)
                    continue
                print(f"[{symbol}] report={item.report_date} totalShares={item.total_shares} deductedNetProfit={item.deducted_net_profit} netAsset={item.net_asset}")
                if not args.dry_run:
                    upsert_fundamental(conn, item)
                ok += 1
            except Exception as exc:
                print(f"[{symbol}] failed: {exc}", file=sys.stderr)
                failed.append(symbol)
            time.sleep(args.sleep)

        if args.dry_run:
            conn.rollback()
        else:
            conn.commit()

    print(f"done ok={ok} failed={len(failed)} failedSymbols={','.join(failed)}")
    return 0 if ok > 0 or not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
