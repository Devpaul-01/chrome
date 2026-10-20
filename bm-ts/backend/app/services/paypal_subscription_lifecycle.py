from __future__ import annotations
from datetime import datetime, timezone
from app.db.models import RecurringSubscription
STATUS_MAP={"BILLING.SUBSCRIPTION.ACTIVATED":"ACTIVE","BILLING.SUBSCRIPTION.CANCELLED":"CANCELLED","BILLING.SUBSCRIPTION.SUSPENDED":"SUSPENDED","BILLING.SUBSCRIPTION.EXPIRED":"EXPIRED","BILLING.SUBSCRIPTION.PAYMENT.FAILED":"PAYMENT_FAILED"}
def apply_paypal_subscription_lifecycle(*,subscription:RecurringSubscription,event_type:str,resource:dict)->bool:
    status=STATUS_MAP.get(event_type)
    if getattr(subscription,"provider",None)!="paypal":return False
    if status is None:return False
    subscription.status=status;subscription.updated_at=datetime.now(timezone.utc)
    billing=resource.get("billing_info") if isinstance(resource.get("billing_info"),dict) else {}
    nxt=billing.get("next_billing_time")
    if isinstance(nxt,str) and nxt:
        try:subscription.next_billing_at=datetime.fromisoformat(nxt.replace("Z","+00:00"))
        except ValueError:pass
    if event_type in {"BILLING.SUBSCRIPTION.CANCELLED","BILLING.SUBSCRIPTION.EXPIRED"}:subscription.cancel_at_period_end=True
    return True
