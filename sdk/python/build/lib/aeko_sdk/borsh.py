from __future__ import annotations

from dataclasses import dataclass

from .base58 import b58encode


@dataclass
class BorshReader:
    data: bytes
    offset: int = 0

    def _take(self, length: int) -> bytes:
        next_offset = self.offset + length
        if next_offset > len(self.data):
            raise ValueError("Borsh payload ended unexpectedly.")
        chunk = self.data[self.offset:next_offset]
        self.offset = next_offset
        return chunk

    def read_u8(self) -> int:
        return self._take(1)[0]

    def read_u16(self) -> int:
        return int.from_bytes(self._take(2), "little")

    def read_u32(self) -> int:
        return int.from_bytes(self._take(4), "little")

    def read_u64(self) -> int:
        return int.from_bytes(self._take(8), "little")

    def read_bool(self) -> bool:
        return self.read_u8() == 1

    def read_pubkey(self) -> str:
        return b58encode(self._take(32))

    def read_string(self) -> str:
        return self._take(self.read_u32()).decode("utf-8")

    def read_option_string(self) -> str | None:
        return self.read_string() if self.read_u8() == 1 else None

    def read_option_u64(self) -> int | None:
        return self.read_u64() if self.read_u8() == 1 else None

    def read_option_u16(self) -> int | None:
        return self.read_u16() if self.read_u8() == 1 else None

    def read_vec(self, item_reader):
        length = self.read_u32()
        return [item_reader() for _ in range(length)]
