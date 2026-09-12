"""Transactional email templates for BirthdayMessaging billing lifecycle events."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from html import escape
from urllib.parse import urlparse


@dataclass(frozen=True, slots=True)
class RenderedEmail:
    subject: str
    text: str
    html: str


def _fmt_date(value: datetime) -> str:
    return value.strftime("%B %d, %Y")


def _safe_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in {"https", "http"} or not parsed.netloc:
        return ""
    return value


def _layout(
    *,
    title: str,
    preheader: str,
    greeting: str,
    intro: str,
    details: list[tuple[str, str]],
    body: str,
    account_url: str,
    support_email: str,
) -> tuple[str, str]:
    detail_text = "\n".join(f"{label}: {value}" for label, value in details)
    text = f"{greeting}\n\n{intro}\n\n{detail_text}\n\n{body}"
    if account_url:
        text += f"\n\nManage your account: {account_url}"
    text += f"\n\nQuestions? Contact {support_email}.\n\nBirthdayMessaging"

    rows = "".join(
        f'<tr><td style="padding:7px 0;color:#6b7280;font-size:13px;width:42%;">{escape(label)}</td>'
        f'<td style="padding:7px 0;font-size:14px;font-weight:600;text-align:right;">{escape(value)}</td></tr>'
        for label, value in details
    )

    button = ""
    safe_account_url = _safe_url(account_url)
    if safe_account_url:
        button = (
            '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0 8px;">'
            '<tr><td style="border-radius:7px;background:#111827;">'
            f'<a href="{escape(safe_account_url, quote=True)}" style="display:inline-block;padding:12px 20px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">Manage account</a>'
            '</td></tr></table>'
        )

    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(title)}</title></head>
<body style="margin:0;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;color:#202124;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{escape(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f7fa;padding:28px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">
<tr><td style="padding:34px 38px;">
<div style="font-size:21px;font-weight:700;margin-bottom:26px;">BirthdayMessaging</div>
<h1 style="font-size:26px;line-height:1.25;margin:0 0 18px;">{escape(title)}</h1>
<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">{escape(greeting)}</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 22px;">{escape(intro)}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;"><tr><td style="padding:15px 18px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">{rows}</table></td></tr></table>
<p style="font-size:15px;line-height:1.6;margin:24px 0 0;">{escape(body)}</p>
{button}
</td></tr>
<tr><td style="border-top:1px solid #e5e7eb;padding:20px 38px;font-size:12px;line-height:1.6;color:#6b7280;">This is an automated account notification from BirthdayMessaging.<br>Questions? <a href="mailto:{escape(support_email, quote=True)}" style="color:#4b5563;">{escape(support_email)}</a></td></tr>
</table></td></tr></table></body></html>"""
    return text, html


def render_subscription_email(
    *,
    notification_type: str,
    recipient_email: str,
    plan_name: str,
    amount: str | None,
    currency: str | None,
    starts_at: datetime,
    expires_at: datetime,
    account_url: str,
    support_email: str,
) -> RenderedEmail:
    # Current user schema does not expose a display name; avoid guessing from email.
    greeting = "Hello,"
    payment = f"{amount} {currency}" if amount and currency else None
    details = [("Plan", plan_name)]
    if payment:
        details.append(("Payment", payment))
    details.extend(
        [
            ("Coverage starts", _fmt_date(starts_at)),
            ("Coverage ends", _fmt_date(expires_at)),
        ]
    )

    if notification_type == "subscription_activated":
        title = "Your BirthdayMessaging account is active"
        intro = "Your payment has been confirmed and your BirthdayMessaging subscription is now active."
        body = "You can sign in and start using the features included with your plan."
        subject = title
        preheader = "Your BirthdayMessaging subscription is active."
    elif notification_type == "subscription_renewed":
        title = "Your BirthdayMessaging subscription was renewed"
        intro = "Your renewal payment has been confirmed and your coverage has been extended."
        body = "Your remaining prepaid time has been preserved and the new coverage period is shown below."
        subject = "BirthdayMessaging subscription renewed"
        preheader = "Your BirthdayMessaging coverage has been extended."
    elif notification_type.startswith("subscription_reminder_"):
        days = notification_type.rsplit("_", 1)[-1].removesuffix("d")
        plural = "" if days == "1" else "s"
        title = "Your BirthdayMessaging subscription is expiring soon"
        intro = f"Your BirthdayMessaging subscription is scheduled to expire in {days} day{plural}."
        body = "Renewing early will extend your coverage without removing remaining prepaid time."
        subject = f"BirthdayMessaging subscription expires in {days} day{plural}"
        preheader = "A reminder about your upcoming subscription expiration."
    elif notification_type == "subscription_expired":
        title = "Your BirthdayMessaging subscription has expired"
        intro = "Your paid BirthdayMessaging coverage has ended."
        body = "Renew your subscription to restore paid features."
        subject = title
        preheader = "Your BirthdayMessaging paid coverage has ended."
    else:
        raise ValueError("unsupported_notification_template")

    text, html = _layout(
        title=title,
        preheader=preheader,
        greeting=greeting,
        intro=intro,
        details=details,
        body=body,
        account_url=account_url,
        support_email=support_email,
    )
    return RenderedEmail(subject=subject, text=text, html=html)
