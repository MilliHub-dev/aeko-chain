#!/usr/bin/env python3
"""Fail CI when two AEKO custom native programs claim the same program id."""

from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROGRAM_ROOT = ROOT / "programs"
PATTERN = re.compile(
    r"pub const\s+([A-Z0-9_]+_PROGRAM_ID_BYTES):\s*\[u8;\s*32\]\s*=\s*\[(\d+)u8;\s*32\];"
)

claims: dict[bytes, list[tuple[str, str]]] = defaultdict(list)

for lib in sorted(PROGRAM_ROOT.glob("*/src/lib.rs")):
    text = lib.read_text(encoding="utf-8")
    for name, repeated_byte in PATTERN.findall(text):
        value = int(repeated_byte)
        if not 0 <= value <= 255:
            raise SystemExit(f"[FAIL] {lib}: invalid repeated byte {value}")
        claims[bytes([value]) * 32].append((str(lib.relative_to(ROOT)), name))

duplicates = {program_id: owners for program_id, owners in claims.items() if len(owners) > 1}
if duplicates:
    print("[FAIL] Duplicate AEKO custom program IDs detected:")
    for program_id, owners in duplicates.items():
        print(f"  repeated-byte={program_id[0]}")
        for path, name in owners:
            print(f"    - {path}: {name}")
    raise SystemExit(1)

print(f"[PASS] {len(claims)} AEKO custom program IDs are unique")
