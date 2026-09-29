from __future__ import annotations
import hashlib
from decimal import Decimal
from typing import Any, Mapping
import httpx
from app.core.config import settings

class PayPalError(Exception): pass
class PayPalConfigurationError(PayPalError): pass
class PayPalTransportError(PayPalError): pass
class PayPalResponseError(PayPalError): pass
class PayPalWebhookAuthenticationError(PayPalError): pass
class PayPalProviderError(PayPalError):
    def __init__(self,status_code:int,provider_name:str|None=None):
        super().__init__("PayPal rejected the provider request."); self.status_code=status_code; self.provider_name=provider_name

def base_url():
    e=settings.paypal_environment.strip().lower()
    if e=="sandbox": return "https://api-m.sandbox.paypal.com"
    if e=="live": return "https://api-m.paypal.com"
    raise PayPalConfigurationError("PAYPAL_ENVIRONMENT must be sandbox or live.")

def require_config():
    base_url()
    if not settings.paypal_client_id.strip() or not settings.paypal_client_secret.strip(): raise PayPalConfigurationError("PayPal credentials are not configured.")

def request_id(namespace,value): return f"bm-{namespace}-{hashlib.sha256(value.encode()).hexdigest()[:48]}"

def timeout(): return httpx.Timeout(connect=settings.paypal_connect_timeout_seconds,read=settings.paypal_read_timeout_seconds,write=settings.paypal_read_timeout_seconds,pool=settings.paypal_connect_timeout_seconds)

async def access_token(client):
    require_config()
    try: r=await client.post("/v1/oauth2/token",data={"grant_type":"client_credentials"},auth=(settings.paypal_client_id,settings.paypal_client_secret),headers={"Accept":"application/json"})
    except (httpx.TimeoutException,httpx.NetworkError) as x: raise PayPalTransportError("PayPal authentication is temporarily unavailable.") from x
    if r.status_code>=500: raise PayPalTransportError("PayPal authentication is temporarily unavailable.")
    if r.status_code>=400: raise PayPalConfigurationError("PayPal credentials were rejected.")
    try: d=r.json()
    except ValueError as x: raise PayPalResponseError("PayPal returned invalid authentication JSON.") from x
    t=str(d.get("access_token") or "") if isinstance(d,dict) else ""
    if not t: raise PayPalResponseError("PayPal authentication response was incomplete.")
    return t

async def request(method,path,*,payload=None,idempotency_key=None):
    try:
        async with httpx.AsyncClient(base_url=base_url(),timeout=timeout()) as c:
            t=await access_token(c); h={"Authorization":f"Bearer {t}","Content-Type":"application/json","Accept":"application/json","Prefer":"return=representation"}
            if idempotency_key: h["PayPal-Request-Id"]=idempotency_key
            r=await c.request(method,path,json=payload,headers=h)
    except PayPalError: raise
    except (httpx.TimeoutException,httpx.NetworkError) as x: raise PayPalTransportError("PayPal request outcome is uncertain.") from x
    if r.status_code>=500: raise PayPalTransportError("PayPal returned a temporary provider failure.")
    try: d=r.json() if r.content else {}
    except ValueError as x: raise PayPalResponseError("PayPal returned invalid JSON.") from x
    if r.status_code>=400: raise PayPalProviderError(r.status_code,str(d.get("name") or "") if isinstance(d,dict) else None)
    if not isinstance(d,dict): raise PayPalResponseError("PayPal returned an invalid response envelope.")
    return d

async def create_order(*,amount:Decimal,currency:str,description:str,custom_id:str,idempotency_key:str):
    p={"intent":"CAPTURE","purchase_units":[{"custom_id":custom_id,"description":description[:127],"amount":{"currency_code":currency.upper(),"value":f"{amount:.2f}"}}],"application_context":{"return_url":settings.paypal_return_url,"cancel_url":settings.paypal_cancel_url,"user_action":"PAY_NOW","shipping_preference":"NO_SHIPPING"}}
    return await request("POST","/v2/checkout/orders",payload=p,idempotency_key=request_id("create",idempotency_key))

async def capture_order(order_id): return await request("POST",f"/v2/checkout/orders/{order_id}/capture",payload={},idempotency_key=request_id("capture",order_id))

def approval_url(order):
    for l in order.get("links") or []:
        if isinstance(l,dict) and str(l.get("rel") or "").lower() in {"approve","payer-action"}:
            h=str(l.get("href") or "")
            if h.startswith("https://"): return h
    raise PayPalResponseError("PayPal order did not include an approval URL.")


async def verify_webhook(headers: Mapping[str, str], event: Mapping[str, Any]) -> bool:
    webhook_id = settings.paypal_webhook_id.strip()
    if not webhook_id:
        raise PayPalConfigurationError("PAYPAL_WEBHOOK_ID is not configured.")
    fields = {
        "auth_algo": headers.get("paypal-auth-algo", ""),
        "cert_url": headers.get("paypal-cert-url", ""),
        "transmission_id": headers.get("paypal-transmission-id", ""),
        "transmission_sig": headers.get("paypal-transmission-sig", ""),
        "transmission_time": headers.get("paypal-transmission-time", ""),
    }
    if not all(fields.values()):
        raise PayPalWebhookAuthenticationError("Missing PayPal transmission headers.")
    result = await request(
        "POST",
        "/v1/notifications/verify-webhook-signature",
        payload={**fields, "webhook_id": webhook_id, "webhook_event": dict(event)},
    )
    return str(result.get("verification_status") or "").upper() == "SUCCESS"
