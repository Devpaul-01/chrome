"""
schemas/enums.py — Shared enumerations used across multiple schema modules.
"""

from enum import Enum


class GenderEnum(str, Enum):
    MALE = "MALE"
    FEMALE = "FEMALE"
    NEUTRAL = "NEUTRAL"
    ALL = "ALL"
