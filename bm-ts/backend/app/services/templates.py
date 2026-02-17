from __future__ import annotations

from random import choice
from typing import Sequence


def compose_message(
    greetings: Sequence[str],
    bodies: Sequence[str],
    closings: Sequence[str],
) -> str:
    if not greetings or not bodies or not closings:
        raise ValueError("All segment groups must contain at least one entry")
    return f"{choice(greetings)} {choice(bodies)} {choice(closings)}"
