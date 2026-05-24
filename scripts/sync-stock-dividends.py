#!/usr/bin/env python3
"""Best-effort offline sync for A-share dividend events.

The app stores raw dividend events and lets the user mark which events count
as normalized recurring dividends. This script preserves old values when a
source fails or a field cannot be parsed.
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import re
import sys
import time
import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import psycopg
import requests

APP_DATABASE_NAME = "postgres"
SOURCE = "xueqiu"


@dataclass
class DividendEvent:
    symbol: str
    event_key: str
    ex_dividend_date: dt.date | None
    announcement_date: dt.date | None = None
    record_date: dt.date | None = None
    payment_date: dt.date | None = None
    cash_per_ten: float | None = None
    bonus_shares_per_ten: float | None = None
    transfer_shares_per_ten: float | None = None
    dividend_base_shares: float | None = None
    status: str | None = None
    description: str | None = None


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
    if isinstance(value, (int, float)):
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
    if value is None:
        return None
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    text = str(value)
    match = re.search(r"(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})", text)
    if match:
        return dt.date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
    match = re.search(r"(20\d{2})(\d{2})(\d{2})", text)
    if match:
        return dt.date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
    match = re.search(r"(20\d{2}).*年报", text)
    if match:
        return dt.date(int(match.group(1)), 12, 31)
    match = re.search(r"(20\d{2}).*三季", text)
    if match:
        return dt.date(int(match.group(1)), 9, 30)
    match = re.search(r"(20\d{2}).*中报", text)
    if match:
        return dt.date(int(match.group(1)), 6, 30)
    match = re.search(r"(20\d{2}).*一季", text)
    if match:
        return dt.date(int(match.group(1)), 3, 31)
    return None


def find_column(row: dict[str, Any], include: list[str], exclude: list[str] | None = None) -> Any:
    exclude = exclude or []
    for key, value in row.items():
        normalized = str(key).lower()
        if all(word.lower() in normalized for word in include) and not any(word.lower() in normalized for word in exclude):
            return value
    return None


def fetch_symbols(conn: psycopg.Connection, explicit_symbols: list[str]) -> list[str]:
    if explicit_symbols:
        return sorted({symbol.strip().upper() for symbol in explicit_symbols if symbol.strip()})
    with conn.cursor() as cur:
        cur.execute('SELECT DISTINCT "symbol" FROM "StockHolding" ORDER BY "symbol"')
        return [row[0] for row in cur.fetchall()]


def xueqiu_symbol(symbol: str) -> str:
    return f"SH{symbol}" if symbol.startswith("6") else f"SZ{symbol}"


def build_event_key(symbol: str, event_date: dt.date, description: str | None) -> str:
    digest = hashlib.md5((description or "").encode("utf-8")).hexdigest()[:12]
    return f"{symbol}:{event_date.isoformat()}:{digest}"


def date_from_millis(value: Any) -> dt.date | None:
    if value is None:
        return None
    try:
        return dt.datetime.fromtimestamp(int(value) / 1000).date()
    except Exception:
        return None


def event_key(event: DividendEvent) -> str:
    return event.event_key


def merge_event(target: DividendEvent, source: DividendEvent) -> DividendEvent:
    target.announcement_date = source.announcement_date or target.announcement_date
    target.record_date = source.record_date or target.record_date
    target.payment_date = source.payment_date or target.payment_date
    target.cash_per_ten = source.cash_per_ten if source.cash_per_ten is not None else target.cash_per_ten
    target.bonus_shares_per_ten = source.bonus_shares_per_ten if source.bonus_shares_per_ten is not None else target.bonus_shares_per_ten
    target.transfer_shares_per_ten = source.transfer_shares_per_ten if source.transfer_shares_per_ten is not None else target.transfer_shares_per_ten
    target.dividend_base_shares = source.dividend_base_shares or target.dividend_base_shares
    target.status = source.status or target.status
    target.description = source.description or target.description
    return target


def parse_dividend_row(symbol: str, row: dict[str, Any]) -> DividendEvent | None:
    announcement_date = date_from_value(find_column(row, ["公告"])) or date_from_value(find_column(row, ["预案", "日期"]))
    ex_date = (
        date_from_value(find_column(row, ["除权", "除息"]))
        or date_from_value(find_column(row, ["除息"]))
        or date_from_value(find_column(row, ["实施", "日期"]))
    )

    cash = (
        number_from_value(find_column(row, ["派", "现金"], exclude=["比例"]))
        or number_from_value(find_column(row, ["派息"]))
        or number_from_value(find_column(row, ["现金", "分红"]))
    )


def parse_xueqiu_dividend_item(symbol: str, item: dict[str, Any]) -> DividendEvent | None:
    description = str(item.get("plan_explain") or "").strip() or None
    text = description or ""
    cash = None
    bonus = None
    transfer = None

    match = re.search(r"10\s*派\s*(\d+(?:\.\d+)?)", text)
    if match:
        cash = float(match.group(1))
    match = re.search(r"10\s*送\s*(\d+(?:\.\d+)?)", text)
    if match:
        bonus = float(match.group(1))
    match = re.search(r"10\s*转\s*(\d+(?:\.\d+)?)", text)
    if match:
        transfer = float(match.group(1))

    ex_date = date_from_millis(item.get("ashare_ex_dividend_date") or item.get("ex_dividend_date"))
    record_date = date_from_millis(item.get("equity_date"))
    payment_date = date_from_millis(item.get("dividend_date"))
    announcement_date = date_from_value(item.get("dividend_year"))
    event_date = ex_date or announcement_date or record_date or payment_date
    if not event_date:
        return None
    if cash is None and bonus is None and transfer is None:
        return None

    status_match = re.search(r"\(([^)）]+)[)）]", text)
    status = status_match.group(1) if status_match else None
    return DividendEvent(
        symbol=symbol,
        event_key=build_event_key(symbol, event_date, description or str(item.get("dividend_year") or "")),
        ex_dividend_date=ex_date,
        announcement_date=announcement_date,
        record_date=record_date,
        payment_date=payment_date,
        cash_per_ten=cash,
        bonus_shares_per_ten=bonus,
        transfer_shares_per_ten=transfer,
        status=status,
        description=description,
    )


def fetch_xueqiu_dividend_events(symbol: str, size: int = 30) -> list[DividendEvent]:
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0",
        "Referer": f"https://xueqiu.com/S/{xueqiu_symbol(symbol)}",
    })
    session.get(f"https://xueqiu.com/snowman/S/{xueqiu_symbol(symbol)}/detail#/FHPS", timeout=20)
    response = session.get(
        "https://stock.xueqiu.com/v5/stock/f10/cn/bonus.json",
        params={"symbol": xueqiu_symbol(symbol), "size": size, "page": 1, "extend": "true"},
        timeout=20,
    )
    response.raise_for_status()
    payload = response.json()
    items = payload.get("data", {}).get("items", [])
    events = [parse_xueqiu_dividend_item(symbol, item) for item in items]
    return [event for event in events if event]
    bonus = number_from_value(find_column(row, ["送"], exclude=["转"]))
    transfer = number_from_value(find_column(row, ["转"]))
    base_shares = (
        number_from_value(find_column(row, ["股本"]))
        or number_from_value(find_column(row, ["基数"]))
    )
    description = str(find_column(row, ["方案"]) or find_column(row, ["说明"]) or "").strip() or None

    # Some Akshare sources expose dividend plans only as text like "10派3.2元转4股".
    text = " ".join(str(value) for value in row.values() if value is not None)
    if cash is None:
        match = re.search(r"10\s*派\s*(\d+(?:\.\d+)?)", text)
        if match:
            cash = float(match.group(1))
    if bonus is None:
        match = re.search(r"10\s*送\s*(\d+(?:\.\d+)?)", text)
        if match:
            bonus = float(match.group(1))
    if transfer is None:
        match = re.search(r"10\s*转\s*(\d+(?:\.\d+)?)", text)
        if match:
            transfer = float(match.group(1))

    event_date = ex_date or announcement_date or date_from_value(find_column(row, ["日期"]))
    if not event_date:
        return None
    if cash is None and bonus is None and transfer is None:
        return None

    return DividendEvent(
        symbol=symbol,
        event_key=build_event_key(symbol, event_date, description or text),
        ex_dividend_date=ex_date,
        announcement_date=announcement_date,
        record_date=date_from_value(find_column(row, ["登记"])),
        payment_date=date_from_value(find_column(row, ["派息"])) or date_from_value(find_column(row, ["到账"])),
        cash_per_ten=cash,
        bonus_shares_per_ten=bonus,
        transfer_shares_per_ten=transfer,
        dividend_base_shares=base_shares,
        status=str(find_column(row, ["进度"]) or find_column(row, ["状态"]) or "").strip() or None,
        description=description,
    )


def call_akshare_function(name: str, symbol: str) -> Any:
    import akshare as ak

    func = getattr(ak, name, None)
    if not func:
        return None
    try:
        frame = func(symbol=symbol)
    except TypeError:
        try:
            frame = func(code=symbol)
        except TypeError:
            frame = func()
    if frame is None or frame.empty:
        return None
    return frame


def fetch_dividend_events(symbol: str) -> list[DividendEvent]:
    try:
        events = fetch_xueqiu_dividend_events(symbol)
        if events:
            print(f"[{symbol}] xueqiu bonus events={len(events)}")
            return sorted(events, key=lambda item: item.ex_dividend_date or item.announcement_date or dt.date.min, reverse=True)
    except Exception as exc:
        print(f"[{symbol}] xueqiu bonus failed: {exc}", file=sys.stderr)

    function_names = [
        "stock_dividend_benefit_em",
        "stock_bonus_em",
        "stock_dividend_cninfo",
    ]
    events: dict[str, DividendEvent] = {}

    for name in function_names:
        try:
            frame = call_akshare_function(name, symbol)
        except Exception as exc:
            print(f"[{symbol}] {name} failed: {exc}", file=sys.stderr)
            continue
        if frame is None or frame.empty:
            continue
        print(f"[{symbol}] {name} columns={list(frame.columns)}")
        for _, row in frame.iterrows():
            event = parse_dividend_row(symbol, row.to_dict())
            if not event:
                continue
            key = event_key(event)
            events[key] = merge_event(events[key], event) if key in events else event

    return sorted(events.values(), key=lambda item: item.ex_dividend_date or item.announcement_date or dt.date.min, reverse=True)


def upsert_dividend_event(conn: psycopg.Connection, event: DividendEvent) -> None:
    with conn.cursor() as cur:
        cur.execute(
            '''
            INSERT INTO "StockDividendEvent"
                            ("eventKey", "symbol", "announcementDate", "recordDate", "exDividendDate", "paymentDate", "cashPerTen", "bonusSharesPerTen", "transferSharesPerTen", "dividendBaseShares", "status", "description", "source", "fetchedAt", "createdAt", "updatedAt")
            VALUES
                            (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        ON CONFLICT ("eventKey") DO UPDATE SET
              "announcementDate" = COALESCE(EXCLUDED."announcementDate", "StockDividendEvent"."announcementDate"),
              "recordDate" = COALESCE(EXCLUDED."recordDate", "StockDividendEvent"."recordDate"),
              "paymentDate" = COALESCE(EXCLUDED."paymentDate", "StockDividendEvent"."paymentDate"),
              "cashPerTen" = COALESCE(EXCLUDED."cashPerTen", "StockDividendEvent"."cashPerTen"),
              "bonusSharesPerTen" = COALESCE(EXCLUDED."bonusSharesPerTen", "StockDividendEvent"."bonusSharesPerTen"),
              "transferSharesPerTen" = COALESCE(EXCLUDED."transferSharesPerTen", "StockDividendEvent"."transferSharesPerTen"),
              "dividendBaseShares" = COALESCE(EXCLUDED."dividendBaseShares", "StockDividendEvent"."dividendBaseShares"),
              "status" = COALESCE(EXCLUDED."status", "StockDividendEvent"."status"),
              "description" = COALESCE(EXCLUDED."description", "StockDividendEvent"."description"),
              "source" = EXCLUDED."source",
              "fetchedAt" = CURRENT_TIMESTAMP,
              "updatedAt" = CURRENT_TIMESTAMP
            ''',
            (
                event.event_key,
                event.symbol,
                event.announcement_date,
                event.record_date,
                event.ex_dividend_date,
                event.payment_date,
                event.cash_per_ten,
                event.bonus_shares_per_ten,
                event.transfer_shares_per_ten,
                event.dividend_base_shares,
                event.status,
                event.description,
                SOURCE,
            ),
        )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbols", nargs="*", default=[])
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--sleep", type=float, default=0.8)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    ok = 0
    written = 0
    failed: list[str] = []
    with psycopg.connect(database_url()) as conn:
        symbols = fetch_symbols(conn, args.symbols)
        if args.limit > 0:
            symbols = symbols[: args.limit]
        print(f"syncing dividends for {len(symbols)} symbols: {', '.join(symbols)}")

        for symbol in symbols:
            try:
                events = fetch_dividend_events(symbol)
                if not events:
                    print(f"[{symbol}] no dividend events", file=sys.stderr)
                    failed.append(symbol)
                    continue
                for event in events:
                    print(f"[{symbol}] ex={event.ex_dividend_date} announcement={event.announcement_date} cash10={event.cash_per_ten} bonus10={event.bonus_shares_per_ten} transfer10={event.transfer_shares_per_ten} status={event.status}")
                    if not args.dry_run:
                        upsert_dividend_event(conn, event)
                        written += 1
                ok += 1
            except Exception as exc:
                print(f"[{symbol}] failed: {exc}", file=sys.stderr)
                failed.append(symbol)
            time.sleep(args.sleep)

        if args.dry_run:
            conn.rollback()
        else:
            conn.commit()

    print(f"done ok={ok} written={written} failed={len(failed)} failedSymbols={','.join(failed)}")
    return 0 if ok > 0 or not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
