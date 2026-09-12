#!/usr/bin/env python3
import sys
from collections import defaultdict
from pathlib import Path

if len(sys.argv) != 2:
    print("usage: validate_env_unique.py <env-file>", file=sys.stderr)
    raise SystemExit(2)

path = Path(sys.argv[1])
if not path.is_file():
    print(f"ERROR: environment file not found: {path}", file=sys.stderr)
    raise SystemExit(2)

keys = defaultdict(list)

for lineno, raw in enumerate(path.read_text().splitlines(), 1):
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key = line.split("=", 1)[0].strip()
    if key:
        keys[key].append(lineno)

duplicates = {key: lines for key, lines in keys.items() if len(lines) > 1}

if duplicates:
    print(f"ENV_UNIQUE=FAIL DUPLICATE_COUNT={len(duplicates)}")
    for key, lines in sorted(duplicates.items()):
        print(f"DUPLICATE={key} LINES={','.join(map(str, lines))}")
    raise SystemExit(1)

print(f"ENV_UNIQUE=PASS VARIABLES={len(keys)}")
