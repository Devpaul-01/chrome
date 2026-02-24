"""
services/templates.py — Template-segment composition helpers.

Provides ``compose_message``, which randomly selects one segment from each
of the three groups (greeting, body, closing) and concatenates them into a
full birthday message string.

This module is intentionally stateless and free of database / I/O calls so
it can be unit-tested without any fixtures.
"""

from __future__ import annotations

from random import choice
from typing import Sequence


def compose_message(
    greetings: Sequence[str],
    bodies: Sequence[str],
    closings: Sequence[str],
) -> str:
    """
    Assemble a birthday message by randomly picking one entry from each group.

    Raises ``ValueError`` if any group is empty so callers get a clear error
    instead of a silent blank-segment message.
    """
    if not greetings or not bodies or not closings:
        raise ValueError("All segment groups must contain at least one entry")
    return f"{choice(greetings)} {choice(bodies)} {choice(closings)}"
