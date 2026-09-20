"""Read KD version evidence and locate symbols without executing or modifying KD."""

import argparse
import csv
import hashlib
import json
from pathlib import Path
import re
import sys


def inspect(root, symbols=(), selected=(), limit=12):
    root = Path(root).resolve(strict=True)
    if not root.is_dir():
        raise ValueError("Game root must be a directory")
    marker = root / "Screens/MiniGame/KinkyDungeon/Text_KinkyDungeon.csv"
    version = None
    if marker.is_file():
        with marker.open(encoding="utf-8-sig", newline="") as stream:
            for row in csv.reader(stream):
                if row and row[0] == "KDVersionStr" and len(row) > 1:
                    version = row[1]
                    break
    if selected:
        files = []
        for relative in selected:
            candidate = (root / relative).resolve(strict=True)
            if not candidate.is_relative_to(root) or not candidate.is_file():
                raise ValueError(f"Expected a file inside game root: {relative}")
            files.append(candidate)
        layout = "explicit-files"
    else:
        files = sorted({p for folder in ("Game/src", "Data", "Scripts")
                        for p in (root / folder).rglob("*.ts")
                        if "node_modules" not in p.relative_to(root).parts
                        and not p.name.endswith(".d.ts")})
        layout = "typescript"
        has_gameplay_sources = any(p.is_relative_to(root / "Game/src") for p in files)
        if not has_gameplay_sources and (root / "out/main.js").is_file():
            files = [root / "out/main.js"]
            layout = "bundle"
    if not files:
        raise ValueError("No supported KD source files; supply --file relative/path")
    symbols = list(dict.fromkeys(symbols))
    patterns = {symbol: re.compile(r"(?<![\w$])" + re.escape(symbol) + r"(?![\w$])")
                for symbol in symbols}
    matches = {symbol: [] for symbol in symbols}
    counts = dict.fromkeys(symbols, 0)
    evidence = {}
    if marker.is_file():
        evidence[marker.relative_to(root).as_posix()] = hashlib.sha256(marker.read_bytes()).hexdigest()
    for file in dict.fromkeys(files):
        data = file.read_bytes()
        relative = file.relative_to(root).as_posix()
        hit = False
        if patterns:
            for number, line in enumerate(data.decode("utf-8-sig").splitlines(), 1):
                for symbol, pattern in patterns.items():
                    if pattern.search(line):
                        hit = True
                        counts[symbol] += 1
                        if len(matches[symbol]) < limit:
                            declaration = re.search(r"\bfunction\s+" + re.escape(symbol) + r"\s*\(", line)
                            matches[symbol].append({"file": relative, "line": number,
                                                    "kind": "function-declaration" if declaration else "reference"})
        if hit or selected or layout == "bundle":
            evidence[relative] = hashlib.sha256(data).hexdigest()
    return {"root": root.as_posix(), "version_marker": version, "layout": layout,
            "files_scanned": len(set(files)), "sha256": evidence,
            "symbols": {s: {"matches": matches[s], "total_matches": counts[s],
                            "truncated": counts[s] > limit} for s in symbols},
            "missing_symbols": [s for s in symbols if not counts[s]],
            "scope": "Static file evidence; version marker and symbol presence do not prove runtime compatibility."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, help="KD source or resources/app directory")
    parser.add_argument("--symbol", action="append", default=[], help="Exact symbol, repeatable")
    parser.add_argument("--file", action="append", default=[], help="Relative file to restrict search, repeatable")
    parser.add_argument("--limit", type=int, default=12, help="Maximum locations per symbol")
    args = parser.parse_args()
    if args.limit < 1:
        parser.error("--limit must be positive")
    try:
        result = inspect(args.root, args.symbol, args.file, args.limit)
    except (OSError, ValueError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
