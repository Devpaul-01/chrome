"""Tests for app.core.encryption — Fernet-based encrypt/decrypt helpers."""

from __future__ import annotations

import pytest
from cryptography.fernet import Fernet, InvalidToken


# Build a standalone Fernet instance for testing so we avoid importing the
# module-level ``fernet`` object (which depends on ``settings``).
_TEST_KEY = Fernet.generate_key().decode()


@pytest.fixture()
def encryption_funcs(monkeypatch):
    """Return (encrypt_value, decrypt_value) backed by a test Fernet key."""
    from cryptography.fernet import Fernet as _Fernet

    test_fernet = _Fernet(_TEST_KEY)
    # Patch the module-level fernet before importing the helpers
    import app.core.encryption as enc_mod

    monkeypatch.setattr(enc_mod, "fernet", test_fernet)
    return enc_mod.encrypt_value, enc_mod.decrypt_value


def test_round_trip(encryption_funcs):
    encrypt, decrypt = encryption_funcs
    plaintext = "smtp-password-123"
    cipher = encrypt(plaintext)
    assert cipher != plaintext
    assert decrypt(cipher) == plaintext


def test_different_encryptions_differ(encryption_funcs):
    encrypt, _ = encryption_funcs
    # Fernet uses a random IV so encrypting the same value twice yields different ciphertexts
    a = encrypt("same-value")
    b = encrypt("same-value")
    assert a != b


def test_decrypt_invalid_token(encryption_funcs):
    _, decrypt = encryption_funcs
    with pytest.raises(InvalidToken):
        decrypt("not-a-valid-fernet-token")


def test_empty_string_round_trip(encryption_funcs):
    encrypt, decrypt = encryption_funcs
    assert decrypt(encrypt("")) == ""


def test_unicode_round_trip(encryption_funcs):
    encrypt, decrypt = encryption_funcs
    text = "пароль-密码-🔑"
    assert decrypt(encrypt(text)) == text


def test_wrong_key_cannot_decrypt(encryption_funcs):
    encrypt, _ = encryption_funcs
    cipher = encrypt("secret")

    other_fernet = Fernet(Fernet.generate_key())
    with pytest.raises(InvalidToken):
        other_fernet.decrypt(cipher.encode())
