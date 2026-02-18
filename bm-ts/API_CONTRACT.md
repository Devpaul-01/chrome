# BirthdayMessaging API Contract

## Overview
All endpoints are served under `app.main`. Authentication uses Bearer JWTs issued via `/auth/register` and `/auth/login`; a short-lived access token and longer refresh token are returned together. Include `Authorization: Bearer <access_token>` on protected routes. All timestamps are ISO8601 UTC strings.

---  
## Auth Flow
1. **Register**: `POST /auth/register` creates the user, hashes the password, and immediately returns a new access + refresh token pair.  
2. **Login**: `POST /auth/login` validates credentials and returns the same token set.  
3. **Refresh**: `POST /auth/refresh` accepts a `refresh_token`, validates its type, and rotates both tokens by issuing a fresh access + refresh pair.  
4. **Client storage guidance**:
   - Store the access token in extension `storage.local`, scoped to the background service.
   - Keep refresh token private (e.g., only the background script reads it); never expose tokens to content scripts.
   - Use the refresh flow before the access token expires (default 15 minutes) to obtain a new pair.

---  
## Endpoints

### `POST /auth/register`
- **Auth**: No
- **Request**:
  ```json
  {
    "email": "user@example.com",
    "password": "Str0ngPass!"
  }
email (required string, EmailStr)
password (required string, min length 8)
Response:
json

{
  "access_token": "<jwt>",
  "refresh_token": "<jwt>",
  "token_type": "bearer"
}
Errors:
400 – {"detail":"Email already registered"}
422 – validation failure when payload missing/invalid fields
POST /auth/login
Auth: No
Request: same schema as register
Response: same as register
Errors:
401 – {"detail":"Invalid credentials"}
422 – malformed payload
POST /auth/refresh
Auth: No
Request:
json

{
  "refresh_token": "<jwt>"
}
Response: new access_token, refresh_token, token_type
Errors:
401 – {"detail":"Invalid refresh token"} when token missing, malformed, expired, or wrong type
422 – missing refresh_token
GET /auth/me
Auth: Bearer JWT
Response:
json

{
  "id": "uuid",
  "email": "user@example.com",
  "created_at": "2025-12-20T10:00:00Z"
}
Errors:
401 – invalid/missing token
POST /templates/
Auth: Bearer
Request:
json

{
  "segment_type": "GREETING",
  "content": "Hey there!",
  "label": "Friendly open"
}
segment_type (required, enum: GREETING | BODY | CLOSING)
content (required string, non-empty)
label (optional string)
Response:
json

{
  "id": "uuid",
  "segment_type": "GREETING",
  "content": "Hey there!",
  "label": "Friendly open",
  "created_at": "...",
  "updated_at": "..."
}
Errors:
401 – missing/invalid JWT
422 – invalid enum, empty content
GET /templates/
Auth: Bearer
Query: segment_type optional (one of the enum values)
Response: [{TemplateSegmentOut}] (non-deleted templates for the user)
Errors:
401 – unauthorized
422 – invalid segment_type value
PUT /templates/{segment_id}
Auth: Bearer
Request:
json

{
  "content": "Updated body",
  "label": "New label"
}
Both fields optional; at least one may be provided
Response: updated TemplateSegmentOut
Errors:
401 – invalid JWT
404 – template not found or already deleted ({"detail":"Template not found"})
422 – invalid payload
DELETE /templates/{segment_id}
Auth: Bearer
Response:
json

{"status":"deleted"}
Behavior: soft-deletes by setting deleted_at
Errors:
401 – unauthorized
404 – template missing/already deleted
GET /subscription/status
Auth: Bearer
Response:
json

{
  "is_active": true,
  "plan": "monthly",
  "current_period_end": "2025-12-31T00:00:00Z",
  "stripe_customer_id": "cus_123",
  "stripe_subscription_id": "sub_456"
}
plan derived from price ID (monthly/yearly)
Errors:
401 – missing/invalid token
POST /subscription/create-checkout-session
Auth: Bearer
Request:
json

{
  "plan": "yearly",
  "success_url": "https://example.com/success",
  "cancel_url": "https://example.com/cancel"
}
plan: literal "monthly" or "yearly"
success_url, cancel_url: valid URLs
Response:
json

{
  "checkout_url": "https://checkout.stripe.com/pay/..."
}
Errors:
401 – unauthorized
422 – invalid plan or URLs
400 – Stripe session creation failure (propagated via HTTPException if Stripe returns error)
POST /stripe/webhook
Auth: No (Stripe signs payload)
Request: raw body signed with stripe-signature header
Response:
json

{"received": true}
Errors:
400 – missing signature header ({"detail":"Missing Stripe signature"})
400 – invalid payload/signature
200 – unsupported event types simply return {"received": true}
Typical Error Catalog
Status	Example Body	Trigger
401	{"detail":"Could not validate credentials"}	Missing/expired/invalid JWT on protected route
401	{"detail":"Invalid credentials"}	Wrong email/password on login
401	{"detail":"Invalid refresh token"}	Refresh token missing or wrong type
403	–	Not used explicitly but reserved for future owner-only restrictions
404	{"detail":"Template not found"}	Template update/delete for another user or already deleted
422	{"detail":[{"loc":["body","segment_type"],"msg":"value is not a valid enumeration member",...}]}	Payload fails Pydantic validation
422	{"detail":[{"loc":["body","content"],"msg":"ensure this value has at least 1 characters"}]}	Empty template content
400	{"detail":"Email already registered"}	Duplicate registration
400	{"detail":"Missing Stripe signature"}	Webhook without stripe-signature header
Subscription Flow
Create Checkout Session: Client calls POST /subscription/create-checkout-session with desired plan and callback URLs. Backend ensures the Stripe customer exists for the logged-in user and returns checkout_url. The extension should open this URL (in new tab/window) to complete Stripe’s hosted flow.
Stripe Webhook Updates: Stripe sends events (customer.subscription.created/updated/deleted). The webhook verifies the signature, looks up the associated user via stripe_customer_id, and updates subscription_records. The database enforces one active subscription per user.
Status Endpoint: /subscription/status returns the last subscription record sorted by updated_at. Interpret:
is_active: true only when the latest record has status = "ACTIVE".
plan: mapped from the stored price_id (monthly or yearly).
current_period_end: use this to display renewal dates or allow sending only while active.
stripe_customer_id/stripe_subscription_id: useful for debugging or linking within the extension UI.
Auth Storage Recommendation
Store the access token in chrome.storage.local without exposing it to content scripts; only the background script should attach it to API calls.
Keep the refresh token similarly guarded; rotation happens via explicit POST /auth/refresh before access expiry.
Treat both tokens as secrets; do not send them to third parties or persist them outside the extension’s secure storage.
Examples Summary
Example Login Request
http

POST /auth/login
Content-Type: application/json

{
  "email": "alice@example.com",
  "password": "Secret123!"
}
Example Login Response
json

{
  "access_token": "eyJ0eXAiOiJKV1Q...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
Example Template Creation Error
json

{
  "detail": [
    {
      "loc": ["body", "segment_type"],
      "msg": "value is not a valid enumeration member; permitted: 'GREETING', 'BODY', 'CLOSING'",
      "type": "type_error.enum"
    }
  ]
}
Example Webhook Error
json

{
  "detail": "Invalid signature"
}
This document remains frozen until the backend implementation changes; all clients must rely solely on these endpoints and behaviors.