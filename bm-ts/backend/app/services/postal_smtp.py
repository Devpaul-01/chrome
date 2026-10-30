"""Shared authenticated Postal SMTP STARTTLS transport."""
from __future__ import annotations
import asyncio
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from app.core.config import settings

class EmailDeliveryError(RuntimeError):
    """Safe error without SMTP secrets or message contents."""

def _send_sync(recipient: str, subject: str, html: str, plain: str) -> None:
    if not all((settings.postal_smtp_username, settings.postal_smtp_password, settings.email_from_address)):
        raise EmailDeliveryError("postal_smtp_configuration_missing")
    message = EmailMessage()
    message["From"] = formataddr((settings.email_from_name, settings.email_from_address))
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(plain)
    message.add_alternative(html, subtype="html")
    try:
        with smtplib.SMTP(settings.postal_smtp_host, settings.postal_smtp_port, timeout=settings.postal_smtp_timeout_seconds) as client:
            client.ehlo()
            client.starttls(context=ssl.create_default_context())
            client.ehlo()
            client.login(settings.postal_smtp_username, settings.postal_smtp_password)
            refused = client.send_message(message)
            if refused:
                raise EmailDeliveryError("postal_recipient_rejected")
    except EmailDeliveryError:
        raise
    except smtplib.SMTPAuthenticationError as exc:
        raise EmailDeliveryError("postal_authentication_failed") from exc
    except (smtplib.SMTPException, OSError, TimeoutError) as exc:
        raise EmailDeliveryError("postal_delivery_failed") from exc

async def send_postal_email(*, recipient: str, subject: str, html: str, plain: str) -> None:
    await asyncio.to_thread(_send_sync, recipient, subject, html, plain)
