"""Notification delivery provider abstraction."""
from __future__ import annotations

import asyncio
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from email.policy import SMTP
from email.utils import formataddr, make_msgid, parseaddr
from typing import Protocol

from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

from app.core.config import settings


@dataclass(frozen=True, slots=True)
class DeliveryResult:
    provider: str
    message_id: str | None = None


class NotificationDeliveryError(RuntimeError):
    """Safe provider failure with a stable machine-readable code."""

    def __init__(self, code: str, *, retryable: bool = True) -> None:
        super().__init__(code)
        self.code = code
        self.retryable = retryable


class NotificationProvider(Protocol):
    name: str

    async def deliver_email(
        self,
        *,
        recipient: str,
        subject: str,
        body_text: str,
        body_html: str,
    ) -> DeliveryResult: ...


class CloudflareSMTPEmailProvider:
    name = "cloudflare_smtp"

    def __init__(
        self,
        *,
        host: str,
        port: int,
        username: str,
        api_token: str,
        from_name: str,
        from_address: str,
        timeout_seconds: int,
    ) -> None:
        self._host = host
        self._port = port
        self._username = username
        self._api_token = api_token
        self._from_name = from_name
        self._from_address = from_address
        self._timeout_seconds = timeout_seconds

    def _deliver_sync(
        self,
        *,
        recipient: str,
        subject: str,
        body_text: str,
        body_html: str,
    ) -> DeliveryResult:
        msg = EmailMessage(policy=SMTP)
        msg["From"] = formataddr((self._from_name, self._from_address))
        msg["To"] = recipient
        msg["Subject"] = subject
        domain = self._from_address.rsplit("@", 1)[-1]
        msg["Message-ID"] = make_msgid(domain=domain)
        msg.set_content(body_text, cte="quoted-printable")
        msg.add_alternative(body_html, subtype="html", cte="quoted-printable")

        context = ssl.create_default_context()
        try:
            with smtplib.SMTP_SSL(
                self._host,
                self._port,
                timeout=self._timeout_seconds,
                context=context,
            ) as client:
                client.login(self._username, self._api_token)
                rejected = client.send_message(msg)
        except smtplib.SMTPAuthenticationError as exc:
            raise NotificationDeliveryError(
                "provider_authentication_failed", retryable=False
            ) from exc
        except (
            smtplib.SMTPConnectError,
            smtplib.SMTPServerDisconnected,
            TimeoutError,
            OSError,
        ) as exc:
            raise NotificationDeliveryError(
                "provider_connection_failed", retryable=True
            ) from exc
        except smtplib.SMTPRecipientsRefused as exc:
            raise NotificationDeliveryError(
                "provider_recipient_rejected", retryable=False
            ) from exc
        except smtplib.SMTPResponseException as exc:
            retryable = 400 <= int(exc.smtp_code) < 500
            raise NotificationDeliveryError(
                "provider_rejected_delivery", retryable=retryable
            ) from exc
        except smtplib.SMTPException as exc:
            raise NotificationDeliveryError(
                "provider_delivery_failed", retryable=True
            ) from exc

        if rejected:
            raise NotificationDeliveryError(
                "provider_recipient_rejected", retryable=False
            )
        return DeliveryResult(provider=self.name, message_id=msg["Message-ID"])

    async def deliver_email(
        self,
        *,
        recipient: str,
        subject: str,
        body_text: str,
        body_html: str,
    ) -> DeliveryResult:
        return await asyncio.to_thread(
            self._deliver_sync,
            recipient=recipient,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
        )



class PostalNotificationProvider:
    name = "postal_smtp"

    async def deliver_email(self, *, recipient: str, subject: str, body_text: str, body_html: str) -> DeliveryResult:
        from app.services.postal_smtp import EmailDeliveryError, send_postal_email
        try:
            await send_postal_email(recipient=recipient, subject=subject, html=body_html, plain=body_text)
        except EmailDeliveryError as exc:
            raise NotificationDeliveryError(str(exc), retryable=str(exc) != "postal_authentication_failed") from exc
        return DeliveryResult(provider=self.name)

class SendGridEmailProvider:
    name = "sendgrid"

    def __init__(self, *, api_key: str, from_address: str) -> None:
        self._api_key = api_key
        self._from_address = from_address

    async def deliver_email(
        self,
        *,
        recipient: str,
        subject: str,
        body_text: str,
        body_html: str,
    ) -> DeliveryResult:
        message = Mail(
            from_email=self._from_address,
            to_emails=recipient,
            subject=subject,
            plain_text_content=body_text,
            html_content=body_html,
        )
        try:
            response = await asyncio.to_thread(
                SendGridAPIClient(self._api_key).send,
                message,
            )
        except Exception as exc:
            raise NotificationDeliveryError("provider_delivery_failed") from exc

        status_code = getattr(response, "status_code", None)
        if status_code is not None and not 200 <= int(status_code) < 300:
            retryable = int(status_code) == 429 or int(status_code) >= 500
            raise NotificationDeliveryError(
                "provider_rejected_delivery",
                retryable=retryable,
            )
        headers = getattr(response, "headers", {}) or {}
        return DeliveryResult(
            provider=self.name,
            message_id=headers.get("X-Message-Id") or headers.get("x-message-id"),
        )


def _validate_address(value: str, setting_name: str) -> None:
    _, addr = parseaddr(value.strip())
    if not addr or "@" not in addr:
        raise RuntimeError(f"{setting_name} must be a valid email address.")


def validate_notification_runtime_config() -> None:
    """Fail worker startup before any delivery if runtime config is unsafe."""
    provider = settings.notification_provider.strip().lower()
    _validate_address(settings.email_from_address, "EMAIL_FROM_ADDRESS")

    if provider == "cloudflare_smtp":
        if not settings.cloudflare_email_api_token.strip():
            raise RuntimeError(
                "CLOUDFLARE_EMAIL_API_TOKEN is required for Cloudflare email delivery."
            )
        if settings.cloudflare_smtp_username != "api_token":
            raise RuntimeError(
                "CLOUDFLARE_SMTP_USERNAME must be the literal value 'api_token'."
            )
        if settings.cloudflare_smtp_port != 465:
            raise RuntimeError(
                "CLOUDFLARE_SMTP_PORT must be 465 for implicit TLS."
            )
    elif provider == "postal_smtp":
        if not settings.postal_smtp_username or not settings.postal_smtp_password:
            raise RuntimeError("Postal SMTP credentials are required.")
        if settings.postal_smtp_port != 587:
            raise RuntimeError("Postal SMTP requires port 587 STARTTLS.")
    elif provider == "sendgrid":
        if not settings.sendgrid_api_key.strip():
            raise RuntimeError("SENDGRID_API_KEY is required for SendGrid delivery.")
    else:
        raise RuntimeError(
            "Unsupported NOTIFICATION_PROVIDER; use 'cloudflare_smtp' or 'sendgrid'."
        )

    if settings.notification_worker_batch_size < 1:
        raise RuntimeError("NOTIFICATION_WORKER_BATCH_SIZE must be positive.")
    if settings.notification_worker_interval_seconds < 1:
        raise RuntimeError("NOTIFICATION_WORKER_INTERVAL_SECONDS must be positive.")
    if settings.notification_processing_lease_seconds < 30:
        raise RuntimeError("NOTIFICATION_PROCESSING_LEASE_SECONDS must be at least 30.")
    if settings.notification_max_attempts < 1:
        raise RuntimeError("NOTIFICATION_MAX_ATTEMPTS must be positive.")


def get_notification_provider() -> NotificationProvider:
    validate_notification_runtime_config()
    provider = settings.notification_provider.strip().lower()
    if provider == "cloudflare_smtp":
        return CloudflareSMTPEmailProvider(
            host=settings.cloudflare_smtp_host,
            port=settings.cloudflare_smtp_port,
            username=settings.cloudflare_smtp_username,
            api_token=settings.cloudflare_email_api_token,
            from_name=settings.email_from_name,
            from_address=settings.email_from_address,
            timeout_seconds=settings.cloudflare_smtp_timeout_seconds,
        )
    if provider == "postal_smtp":
        return PostalNotificationProvider()
    return SendGridEmailProvider(
        api_key=settings.sendgrid_api_key,
        from_address=settings.email_from_address,
    )
