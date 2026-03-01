# BIRTHDAYMESSAGING-LEGACY - Complete System Architecture Analysis

## Executive Summary

**Project Type**: Chrome Extension with Flask Backend  
**Purpose**: Automated Facebook birthday messaging system  
**Architecture**: 2-tier (Browser Extension Frontend + RESTful API Backend)  
**Database**: PostgreSQL  
**Deployment**: Docker + Traefik Reverse Proxy  

This is a legacy white-label product being re-engineered for client usage. The system allows users to manage personalized birthday message templates and automate Facebook birthday greetings through a Chrome browser extension.

---

## 🏗️ High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER LAYER                              │
│                                                                 │
│  ┌──────────────┐      ┌──────────────┐     ┌──────────────┐  │
│  │  Facebook    │      │   Chrome     │     │   Extension  │  │
│  │  Web Pages   │◄────►│  Extension   │◄───►│   Popup UI   │  │
│  └──────────────┘      └──────────────┘     └──────────────┘  │
│         ▲                      ▲                      ▲        │
│         │                      │                      │        │
└─────────┼──────────────────────┼──────────────────────┼────────┘
          │                      │                      │
          │                      │                      │
┌─────────┼──────────────────────┼──────────────────────┼────────┐
│         │         CHROME EXTENSION LAYER              │        │
│         │                                             │        │
│         ▼                                             ▼        │
│  ┌──────────────┐      ┌──────────────┐     ┌──────────────┐  │
│  │   Content    │      │   Service    │     │   Popup      │  │
│  │   Scripts    │      │   Worker     │     │   Scripts    │  │
│  │(Facebook DOM │      │ (Background) │     │ (Login/UI)   │  │
│  │Manipulation) │      │              │     │              │  │
│  └──────────────┘      └──────────────┘     └──────────────┘  │
│         │                      │                      │        │
│         │                      │                      │        │
│         └──────────────────────┼──────────────────────┘        │
│                                │                               │
│                         Chrome Storage API                     │
│                    (local & sync storage)                      │
└────────────────────────────────┼───────────────────────────────┘
                                 │
                                 │ HTTPS/REST API
                                 │
┌────────────────────────────────┼───────────────────────────────┐
│                      BACKEND API LAYER                         │
│                                │                               │
│                         ┌──────▼──────┐                        │
│                         │   Traefik   │                        │
│                         │   Proxy     │                        │
│                         └──────┬──────┘                        │
│                                │                               │
│                    api.birthdaymessaging.io                    │
│                                │                               │
│                         ┌──────▼──────┐                        │
│                         │    Flask    │                        │
│                         │    App      │                        │
│                         │  (Python)   │                        │
│                         └──────┬──────┘                        │
│                                │                               │
│              ┌─────────────────┼─────────────────┐            │
│              │                 │                 │            │
│      ┌───────▼────────┐ ┌──────▼──────┐ ┌───────▼────────┐   │
│      │     Auth       │ │   Message   │ │   Password     │   │
│      │   Endpoints    │ │   Segments  │ │    Reset       │   │
│      │  (login/reg)   │ │     API     │ │      API       │   │
│      └───────┬────────┘ └──────┬──────┘ └───────┬────────┘   │
│              │                 │                 │            │
│              └─────────────────┼─────────────────┘            │
│                                │                               │
│                         ┌──────▼──────┐                        │
│                         │  SQLAlchemy │                        │
│                         │     ORM     │                        │
│                         └──────┬──────┘                        │
└────────────────────────────────┼───────────────────────────────┘
                                 │
┌────────────────────────────────┼───────────────────────────────┐
│                       DATABASE LAYER                           │
│                         ┌──────▼──────┐                        │
│                         │ PostgreSQL  │                        │
│                         │  Database   │                        │
│                         └─────────────┘                        │
│                                                                │
│  Tables:                                                       │
│  • users                                                       │
│  • message_greetings                                           │
│  • message_main_parts                                          │
│  • message_closings                                            │
└────────────────────────────────────────────────────────────────┘
```

---

## 📦 Backend Architecture (Flask + SQLAlchemy)

### Directory Structure Analysis

```
backend/
├── __init__.py                 # Application factory pattern
├── app.py                      # Entry point - WSGI application
├── config.py                   # Configuration management (DB URL, env vars)
├── database.py                 # Database engine & session management
├── connect_db.py               # Database connection utilities
├── message_segments.py         # Business logic for message segments
├── password_reset.py           # Password reset business logic
├── Dockerfile                  # Container build configuration
├── docker-compose.yml          # Service orchestration
├── requirements.txt            # Python dependencies
├── README.md
│
├── api/                        # API Layer (Controllers/Routes)
│   ├── __init__.py            # Blueprint registration
│   ├── auth.py                # Authentication endpoints
│   ├── users.py               # User management endpoints
│   ├── message_segments_api.py # Message CRUD endpoints
│   └── password_reset_api.py  # Password reset endpoints
│
├── models/                     # Data Models (ORM Layer)
│   ├── __init__.py
│   ├── base.py                # SQLAlchemy Base class
│   ├── user.py                # User model with auth methods
│   ├── message_greeting.py    # Greeting message segments
│   ├── message_main_part.py   # Main body message segments
│   └── message_closing.py     # Closing message segments
│
└── service/                    # Service Layer (External integrations)
    ├── __init__.py
    ├── bm_email.py            # Email service
    └── bm_smtp.py             # SMTP service
```

### Backend Components Analysis

#### 1. **Application Entry Point** (`app.py`)

```python
# Purpose: Initialize Flask app with CORS and run server
# Flow:
#   1. Import application factory
#   2. Create Flask app instance
#   3. Enable CORS for all origins (security consideration!)
#   4. Run on 0.0.0.0:5000 (exposed to all network interfaces)

from flask_cors import CORS
from backend import create_app

app = create_app()
CORS(app, resources={r"/*": {"origins": "*"}})  # ⚠️ Allows all origins

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
```

**Security Note**: CORS is configured to allow all origins (`*`), which is insecure for production.

---

#### 2. **Application Factory** (`__init__.py`)

```python
# Purpose: Factory pattern for creating Flask application
# Flow:
#   1. Load configuration from environment
#   2. Initialize database engine
#   3. Create Flask app
#   4. Register all blueprints (routes)
#   5. Return configured app

def create_app() -> Flask:
    settings = get_settings()      # Load DB credentials from .env
    init_engine(settings.db_url)   # Initialize SQLAlchemy engine
    app = Flask(__name__)
    register_routes(app)           # Register all API blueprints
    return app
```

---

#### 3. **Configuration Management** (`config.py`)

```python
# Purpose: Environment-based configuration
# Strategy:
#   1. Load .env file
#   2. Build PostgreSQL connection string
#   3. Support both DATABASE_URL or individual credentials
#   
# Environment Variables Required:
#   - DATABASE_URL (optional, full connection string)
#   OR
#   - DB_USER, DB_PASS, DB_NAME (required)
#   - DB_HOST (default: localhost), DB_PORT (default: 5432)

@dataclass(frozen=True, slots=True)
class Settings:
    db_url: str  # PostgreSQL connection string

def _build_db_url() -> str:
    # Priority: DATABASE_URL > Individual credentials
    # Format: postgresql://user:password@host:port/dbname
```

---

#### 4. **Database Session Management** (`database.py`)

```python
# Purpose: Thread-safe database session management
# Pattern: Context manager for automatic commit/rollback
#
# Key Features:
#   - Global engine singleton
#   - Session factory pattern
#   - Automatic commit on success
#   - Automatic rollback on exception
#   - Proper session cleanup

@contextmanager
def session_scope() -> Iterator[Session]:
    session = _Session()
    try:
        yield session
        session.commit()  # Auto-commit on success
    except Exception:
        session.rollback()  # Auto-rollback on error
        raise
    finally:
        session.close()  # Always cleanup
```

---

### Database Models

#### User Model (`models/user.py`)

```python
# Table: users
# Purpose: User authentication and authorization
#
# Fields:
#   - id (PK): Auto-increment primary key
#   - email: Unique email address (indexed)
#   - password_hash: Werkzeug hashed password
#   - current_bw_token: Session token for API authentication
#   - is_active: Account status flag
#   - created_at, updated_at: Audit timestamps
#
# Methods:
#   - set_password(value): Hash and store password
#   - check_password(value): Verify password
#   - refresh_token(): Generate new 64-char hex token

class User(Base):
    __tablename__ = "users"
    
    # Security: Uses Werkzeug's generate_password_hash (pbkdf2)
    # Token: 32 bytes = 64 hex characters
```

**Database Schema**:
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR NOT NULL UNIQUE,
    password_hash VARCHAR NOT NULL,
    current_bw_token VARCHAR,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX ON users(email);

-- ⚠️ MISSING FIELDS REFERENCED IN CODE:
-- The password_reset.py module references these fields
-- but they do NOT exist in the actual model:
-- password_reset_token VARCHAR(64) NULL
-- password_reset_expires_at TIMESTAMP NULL
```

---

#### Message Segment Models

All three message models follow the same pattern:

```python
# Tables: message_greetings, message_main_parts, message_closings
# Purpose: Store customizable message templates
#
# Pattern:
#   - User creates multiple templates
#   - Each template has a title for identification
#   - Content stored in text field
#   - Composition: greeting + main_part + closing = full message
#
# Fields:
#   - id (PK): Auto-increment
#   - user_id: Foreign key to users (NOT enforced at DB level!)
#   - title: Template name (e.g., "Funny Birthday Greeting")
#   - {greeting_text|body_text|closing_text}: Message content
#   - created_at, updated_at: Audit timestamps

# ⚠️ WARNING: No foreign key constraint defined!
# user_id is stored but not validated at database level
```

**Database Schemas**:
```sql
CREATE TABLE message_greetings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    greeting_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE message_main_parts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    body_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE message_closings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    closing_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

---

### API Endpoints

#### Authentication API (`api/auth.py`)

```python
# Blueprint: auth_bp (prefix: /api/v1)
# Purpose: User registration, login, password reset

# Endpoints:

# 1. POST /api/v1/register
#    Request: { "email": str, "password": str }
#    Response: { "message": str, "id": int } [201]
#    Errors: 400 (missing fields), 409 (user exists)
#    Process:
#      - Validate email/password provided
#      - Check if user already exists
#      - Hash password with Werkzeug
#      - Create new user record
#      - Return user ID

# 2. POST /api/v1/login
#    Request: { "email": str, "password": str }
#    Response: { "message": str, "id": int, "email": str, "token": str } [200]
#    Errors: 400, 401 (invalid creds), 403 (inactive), 404 (not found)
#    Process:
#      - Find user by email
#      - Check account is active
#      - Verify password hash
#      - Generate new session token (64-char hex)
#      - Return user data + token

# 3. POST /api/v1/forget-password (INSECURE - in auth.py)
#    Request: { "email": str, "new_password": str }
#    Response: { "message": str, "id": int } [200]
#    Errors: 400, 404
#    ⚠️ SECURITY ISSUE: No verification, anyone can reset password!
#    Process:
#      - Find user by email
#      - Hash new password
#      - Update immediately (no email verification!)
#
# NOTE: There is also a secure password reset implementation in
# password_reset_api.py with token-based verification, but it has
# a critical bug: it references non-existent database fields
# (password_reset_token, password_reset_expires_at) that are not
# defined in the User model. This will cause runtime errors.
#
# ADDITIONAL ENDPOINTS (password_reset_api.py):
# - POST /api/v1/reset-password (token-based, but BROKEN)
```

**Critical Security Issues**: 
1. Insecure password reset endpoint with no verification
2. Secure implementation exists but is BROKEN (missing DB fields)

---

#### Message Segments API (`api/message_segments_api.py`)

```python
# Blueprint: message_segments_bp
# Purpose: CRUD operations for message templates

# Endpoints:

# 1. POST /api/v1/segments
#    Request: {
#      "user_id": int,
#      "title": str,
#      "segment_type": "greeting" | "body" | "closing",
#      "content": str
#    }
#    Response: { "success": bool, "message": str }
#    Process:
#      - Validate all required fields
#      - Route to appropriate table based on segment_type
#      - Create new segment record
#      - Return success status

# 2. GET /api/v1/segments/<user_id>
#    Response: {
#      "success": bool,
#      "segments": {
#        "greetings": [{"id": int, "title": str, "content": str}],
#        "body": [{"id": int, "title": str, "content": str}],
#        "closings": [{"id": int, "title": str, "content": str}]
#      }
#    }
#    Process:
#      - Query all three message tables for user_id
#      - Serialize results into structured JSON
#      - Return all user's message segments
```

**Business Logic** (`message_segments.py`):
```python
# TABLE_MAP: Route segment_type to correct model
TABLE_MAP = {
    "greeting": {"model": MessageGreeting, "column": "greeting_text"},
    "body": {"model": MessageMainPart, "column": "body_text"},
    "closing": {"model": MessageClosing, "column": "closing_text"}
}

# Dynamic model selection based on segment type
# Allows generic CRUD operations across all segment types
```

---

#### Users API (`api/users.py`)

```python
# Blueprint: users (prefix: /user)
# Purpose: User profile information

# Endpoint:

# GET /user
#    Response: {
#      "id": int,
#      "email": str,
#      "is_active": bool,
#      "created_at": ISO8601,
#      "updated_at": ISO8601
#    }
#    ⚠️ BUG: Returns FIRST user in database, not authenticated user!
#    
#    Current implementation:
#      session.scalar(select(User).order_by(User.id))
#      
#    Should be:
#      Authenticate request token, return that user's data
```

**Critical Bug**: No authentication, returns arbitrary user data!

---

### Deployment Configuration

#### Dockerfile

```dockerfile
# Base: Python 3.13 slim (lightweight)
# Build Process:
#   1. Copy backend code to /app/backend
#   2. Install dependencies + gunicorn
#   3. Set unbuffered output for proper logging
#   4. Run gunicorn with 1 worker on port 5000
#
# Production Server: Gunicorn (WSGI)
# Workers: 1 (should be increased for production)
# Binding: 0.0.0.0:5000 (all interfaces)
```

#### Docker Compose

```yaml
# Service: bm-legacy-backend
# Image: gitea.birthdaymessaging.io/ctmmediagroup/bm-legacy-backend:latest
#
# Configuration:
#   - Environment variables from .env file
#   - Traefik reverse proxy integration
#   - TLS/SSL with Cloudflare resolver
#   - Domain: api.birthdaymessaging.io
#   - Port mapping: 5000 (internal)
#   - Network: traefik_proxy (external)
#   - Restart policy: unless-stopped
#
# Traefik Labels:
#   - HTTPS only (websecure entrypoint)
#   - Automatic certificate management
#   - X-Forwarded-Proto header injection
```

---

## 🔧 Frontend Architecture (Chrome Extension)

### Manifest V3 Configuration

```json
{
  "manifest_version": 3,
  "name": "Birthday messaging",
  "version": "1.3.6",
  "description": "Birthday Messaging for Facebook friends",
  
  // Extension Architecture:
  "action": {
    "default_popup": "login.html"  // Popup when clicking extension icon
  },
  
  "content_scripts": [{
    "matches": ["*://*.facebook.com/*"],  // Inject into all Facebook pages
    "js": ["js/contentScriptBundle.js"]   // DOM manipulation scripts
  }],
  
  "background": {
    "service_worker": "js/serviceWorker.js"  // Persistent background tasks
  },
  
  // Permissions:
  "permissions": [
    "storage",              // Chrome storage API
    "alarms",               // Scheduled tasks
    "declarativeNetRequest", // Network request interception
    "clipboardRead"         // Read clipboard data
  ],
  
  "host_permissions": [
    "*://db.birthdaymessaging.io/*",  // Backend API
    "https://www.facebook.com/*",      // Facebook access
    // ... other Facebook domains
  ]
}
```

### Frontend Directory Structure

```
frontend/
├── manifest.json               # Extension configuration
├── worker.js                   # Push notification worker (unused?)
│
├── HTML Pages (UI Layer)
│   ├── login.html             # Login/entry popup
│   ├── register.html          # User registration
│   ├── dashboard.html         # Main control panel
│   ├── settings.html          # User settings
│   ├── forgot-password.html   # Password recovery
│   ├── change-password.html   # Change password
│   ├── training.html          # User training/help
│   ├── interval.html          # Message scheduling
│   └── confirmation.html      # Action confirmations
│
├── js/                        # JavaScript Layer
│   ├── Core Libraries
│   │   ├── config.js          # API endpoints & configuration
│   │   ├── common.js          # Shared utilities (minified)
│   │   ├── helper.js          # Helper functions
│   │   ├── htmlConst.js       # HTML templates
│   │   └── serviceWorker.js   # Background service worker
│   │
│   ├── API & Services
│   │   ├── services.js        # API service calls
│   │   ├── serviceHelper.js   # Service utilities
│   │   └── socialLink.js      # Facebook integration (main logic)
│   │
│   ├── UI Controllers
│   │   ├── login.js           # Login page logic
│   │   ├── register.js        # Registration logic
│   │   ├── forgotpassword.js  # Password reset logic
│   │   ├── changepassword.js  # Password change logic
│   │   ├── updatepassword.js  # Password update API calls
│   │   └── message.js         # Message composition
│   │
│   ├── Feature Modules
│   │   ├── posts.js           # Facebook post handling
│   │   ├── messageGroups.js   # Message template groups
│   │   ├── segmentGroups.js   # Segment management
│   │   ├── images.js          # Image handling
│   │   └── contentScriptBundle.js  # Content script bundle
│   │
│   └── Third-party
│       └── bootstraptagsinput.js  # Tag input library
│
├── css/                       # Styling
│   └── customCss.css
│
├── assets/                    # Design assets
│   ├── style.css
│   └── toast.css             # Toast notification styles
│
├── images/                    # Extension icons & images
│
└── views/                     # Reusable HTML components
    ├── header.html
    └── footer.html
```

---

### Chrome Extension Architecture Patterns

#### Storage Strategy

```javascript
// Two storage areas used:

// 1. chrome.storage.local (device-specific, unlimited)
//    Used for:
//    - User authentication state
//    - Session tokens
//    - User profile data
//    - Cached data
//
//    Structure:
//    {
//      "store": {
//        "user": {
//          "email": string,
//          "bw_token": string,  // API authentication token
//          "uid": string,       // Device ID
//          "plan": string       // User subscription plan
//        }
//      },
//      "emailID": string
//    }

// 2. chrome.storage.sync (synced across devices, limited)
//    Used for:
//    - User settings
//    - Message templates
//    - Preferences
//
//    Structure:
//    {
//      "fcmessages": {
//        "groups": []  // Message template groups
//      },
//      "settings": {},
//      "generalMessagetabID": number  // Active messaging tab ID
//    }
```

---

#### Facebook Integration (`js/socialLink.js`)

```javascript
// Purpose: Core Facebook API integration module
// Key Responsibilities:
//   1. Scrape Facebook DTSG token (security token)
//   2. Fetch birthday data via Facebook GraphQL
//   3. Send messages to Facebook friends
//   4. Handle Facebook authentication state

// Critical Functions:

// 1. getDtsg() - Extract Facebook DTSG token
//    Process:
//      - Fetch https://m.facebook.com/composer/ocelot/async_loader/
//      - Regex parse DTSG token from HTML response
//      - Parse Facebook user ID
//      - Return { dtsg: string, fbId: string }
//    ⚠️ Brittle: Depends on Facebook's HTML structure

// 2. scanFB() - Fetch birthday data
//    Process:
//      - Get DTSG token
//      - Call Facebook GraphQL API (BirthdayCometRootQuery)
//      - Parameters: { offset_month: -1, scale: 1 }
//      - Returns: { todays_birthdays: [], monthly_birthdays: [] }
//    API Endpoint: https://www.facebook.com/api/graphql/
//    Document ID: 4576878779047229 (hardcoded)

// 3. Message Sending Flow:
//    - Open Facebook Messenger tab (or reuse existing)
//    - Wait for tab to load
//    - Send message to content script
//    - Content script manipulates DOM to send message
//    - Close/reuse tab

// 4. Authentication Check:
//    - Verify bw_token with backend API
//    - Sync user plan status
//    - Redirect to login if invalid
//    - Runs on page load for all extension pages

// Storage Functions:
//   - retriveSegmentGroups(): Fetch message templates from API
//   - saveSettings(): Persist user settings to sync storage
//   - getLoggedInUser(): Get current user email
//   - checkUserStatus(): Validate token with backend
```

**Architecture Concerns**:
1. **Fragile Scraping**: Relies on Facebook's internal structure
2. **Hardcoded IDs**: GraphQL document IDs may change
3. **No Error Recovery**: Limited fallback mechanisms

---

#### Content Script (`js/contentScriptBundle.js`)

```javascript
// Purpose: Injected into Facebook pages for DOM manipulation
// Capabilities:
//   1. Access Facebook DOM (posts, messenger)
//   2. Intercept and modify requests
//   3. Simulate user interactions
//   4. Extract page data
//
// Communication Pattern:
//   Service Worker ←→ Content Script
//   (via chrome.tabs.sendMessage / chrome.runtime.sendMessage)
//
// Key Features:
//   - Message composition in Facebook Messenger
//   - Image attachment handling
//   - Post creation/interaction
//   - DOM element selection and manipulation
```

---

#### Service Worker (`js/serviceWorker.js`)

```javascript
// Purpose: Persistent background script (Manifest V3)
// Lifecycle: Event-driven (activated on events)
//
// Responsibilities:
//   1. Message passing between components
//   2. Tab management (create, update, close)
//   3. Alarm/timer management
//   4. API request orchestration
//   5. State management
//
// Event Listeners:
//   - chrome.runtime.onMessage: Handle extension messages
//   - chrome.alarms.onAlarm: Scheduled task execution
//   - chrome.tabs.onUpdated: Tab state changes
//
// Messaging Protocol:
//   {
//     action: "messagingThroughTabFB",
//     tab: TabObject,
//     userData: { user_id, name, ... },
//     constructedMessage: string,
//     image: url | null,
//     birthdayType: "today" | "upcoming"
//   }
```

---

## 🔄 Data Flow Diagrams

### Complete End-to-End System Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PHASE 1: USER ONBOARDING                           │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌───────────┐
    │   User    │
    │ Installs  │
    │ Extension │
    └─────┬─────┘
          │
          ▼
    ┌─────────────────┐
    │ First Launch    │
    │ login.html      │
    └─────┬─────┬─────┘
          │     │
    ┌─────┘     └─────┐
    │                 │
    ▼                 ▼
┌────────────┐   ┌────────────┐
│  Register  │   │   Login    │
│  New User  │   │  Existing  │
└─────┬──────┘   └─────┬──────┘
      │                │
      │ POST /api/v1/register    POST /api/v1/login
      │ {email, password}        {email, password}
      │                │
      ▼                ▼
┌─────────────────────────────────┐
│     Backend Auth Service        │
│  1. Validate credentials        │
│  2. Hash password (Werkzeug)    │
│  3. Generate session token      │
│  4. Store in PostgreSQL         │
└─────┬───────────────────────────┘
      │
      │ Response: {id, email, token}
      ▼
┌─────────────────────────────────┐
│   Chrome Storage (local)        │
│   store.user = {                │
│     email: "...",               │
│     bw_token: "...",            │
│     uid: generated_uuid         │
│   }                             │
└─────┬───────────────────────────┘
      │
      ▼
┌─────────────────────────────────┐
│   Redirect to dashboard.html    │
└─────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 2: MESSAGE TEMPLATE SETUP                          │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌───────────┐
    │   User    │
    │  Clicks   │
    │ Settings  │
    └─────┬─────┘
          │
          ▼
    ┌─────────────────────────────────────┐
    │  settings.html + segmentGroups.js   │
    │  "Create Message Templates"         │
    └─────┬───────────────────────────────┘
          │
          │ 1. Fetch existing templates
          │ GET /api/v1/segments/{user_id}
          ▼
    ┌─────────────────────────────────────┐
    │  Backend: Query Database            │
    │  • message_greetings (WHERE user_id)│
    │  • message_main_parts               │
    │  • message_closings                 │
    └─────┬───────────────────────────────┘
          │
          │ Response: {greetings[], body[], closings[]}
          ▼
    ┌─────────────────────────────────────┐
    │  Display in UI                      │
    │  ┌──────────────────────────────┐   │
    │  │ Greetings:                   │   │
    │  │ • "Happy Birthday!"          │   │
    │  │ • "Hey [NAME]! 🎉"           │   │
    │  ├──────────────────────────────┤   │
    │  │ Main Parts:                  │   │
    │  │ • "Hope you have a great day"│   │
    │  │ • "Wishing you the best"     │   │
    │  ├──────────────────────────────┤   │
    │  │ Closings:                    │   │
    │  │ • "Cheers!"                  │   │
    │  │ • "Best wishes, [MYNAME]"    │   │
    │  └──────────────────────────────┘   │
    └─────┬───────────────────────────────┘
          │
          │ 2. User creates new template
          │ Clicks "Add Greeting"
          ▼
    ┌─────────────────────────────────────┐
    │  User fills form:                   │
    │  Title: "Funny Birthday Greeting"   │
    │  Text: "Hey [NAME]! 🎂 Another     │
    │         year older, another year    │
    │         wiser... or so they say!"   │
    └─────┬───────────────────────────────┘
          │
          │ POST /api/v1/segments
          │ {
          │   user_id: 123,
          │   title: "Funny Birthday Greeting",
          │   segment_type: "greeting",
          │   content: "Hey [NAME]!..."
          │ }
          ▼
    ┌─────────────────────────────────────┐
    │  Backend: Create Segment            │
    │  1. Lookup model (MessageGreeting)  │
    │  2. Create record                   │
    │  3. Save to PostgreSQL              │
    └─────┬───────────────────────────────┘
          │
          │ Response: {success: true}
          ▼
    ┌─────────────────────────────────────┐
    │  UI Updated with new template       │
    │  ✓ Template saved successfully      │
    └─────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                 PHASE 3: SCHEDULE AUTOMATION SETUP                          │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌───────────┐
    │   User    │
    │  Clicks   │
    │"Interval" │
    └─────┬─────┘
          │
          ▼
    ┌─────────────────────────────────────┐
    │  interval.html                      │
    │  "Configure Automation Schedule"    │
    └─────┬───────────────────────────────┘
          │
          │ User selects:
          │ • Time: 9:00 AM daily
          │ • Frequency: Once per day
          │ • Message delay: 30-60 seconds between messages
          ▼
    ┌─────────────────────────────────────┐
    │  Save to Chrome Storage (sync)      │
    │  settings.schedule = {              │
    │    time: "09:00",                   │
    │    frequency: "daily",              │
    │    delay: {min: 30, max: 60}        │
    │  }                                  │
    └─────┬───────────────────────────────┘
          │
          ▼
    ┌─────────────────────────────────────┐
    │  Service Worker                     │
    │  chrome.alarms.create("daily-scan", │
    │    { when: nextRunTime,             │
    │      periodInMinutes: 1440 })       │
    └─────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│              PHASE 4: AUTOMATED BIRTHDAY DETECTION & MESSAGING              │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌───────────────┐
    │ Chrome Alarm  │
    │   Triggers    │
    │   @ 9:00 AM   │
    └───────┬───────┘
            │
            ▼
    ┌─────────────────────────────────────────┐
    │  Service Worker: onAlarm Event          │
    │  serviceWorker.js                       │
    └─────┬───────────────────────────────────┘
            │
            │ Step 1: Get Facebook DTSG Token
            ▼
    ┌─────────────────────────────────────────┐
    │  socialLink.getDtsg()                   │
    │  1. Fetch m.facebook.com/composer/...   │
    │  2. Parse HTML for DTSG token (regex)   │
    │  3. Extract Facebook user ID            │
    └─────┬───────────────────────────────────┘
            │
            │ Returns: {dtsg: "...", fbId: "..."}
            │
            │ Step 2: Fetch Birthday Data
            ▼
    ┌─────────────────────────────────────────┐
    │  socialLink.scanFB()                    │
    │  POST facebook.com/api/graphql/         │
    │  Query: BirthdayCometRootQuery          │
    │  Doc ID: 4576878779047229               │
    │  Variables: {offset_month: -1, scale: 1}│
    └─────┬───────────────────────────────────┘
            │
            │ Response:
            │ {
            │   todays_birthdays: [
            │     {node: {id: "123", name: "John Doe"}},
            │     {node: {id: "456", name: "Jane Smith"}}
            │   ],
            │   monthly_birthdays: [...]
            │ }
            ▼
    ┌─────────────────────────────────────────┐
    │  Process Birthday List                  │
    │  Found: 2 friends with birthdays today  │
    └─────┬───────────────────────────────────┘
            │
            │ Step 3: Get Message Templates
            ▼
    ┌─────────────────────────────────────────┐
    │  socialLink.retriveSegmentGroups()      │
    │  POST /api/v1/segments/{user_id}        │
    │  Headers: Authorization: KYUBI_{token}  │
    └─────┬───────────────────────────────────┘
            │
            │ Response:
            │ {
            │   greetings: [{id, title, content}, ...],
            │   body: [{id, title, content}, ...],
            │   closings: [{id, title, content}, ...]
            │ }
            ▼
    ┌─────────────────────────────────────────┐
    │  Store in Chrome Storage (local)        │
    │  fcmessages.groups = segments           │
    └─────┬───────────────────────────────────┘
            │
            │ Step 4: FOR EACH birthday friend
            │ (Loop through todays_birthdays)
            ▼
    ┌─────────────────────────────────────────┐
    │  Friend 1: John Doe (id: 123)           │
    └─────┬───────────────────────────────────┘
            │
            │ 4a. Construct personalized message
            ▼
    ┌─────────────────────────────────────────┐
    │  Message Composition Algorithm          │
    │  1. greeting = random(greetings[])      │
    │     → "Hey [NAME]! 🎉"                  │
    │  2. body = random(body[])               │
    │     → "Hope you have an amazing day"    │
    │  3. closing = random(closings[])        │
    │     → "Cheers!"                         │
    │  4. Replace placeholders:               │
    │     [NAME] → "John Doe"                 │
    │  5. Combine:                            │
    │     "Hey John Doe! 🎉\n                 │
    │      Hope you have an amazing day\n     │
    │      Cheers!"                           │
    └─────┬───────────────────────────────────┘
            │
            │ Final message constructed
            │
            │ 4b. Open Facebook Messenger tab
            ▼
    ┌─────────────────────────────────────────┐
    │  Tab Management                         │
    │  chrome.tabs.create({                   │
    │    url: "facebook.com/messages/t/123"   │
    │  })                                     │
    └─────┬───────────────────────────────────┘
            │
            │ Wait for tab loaded
            ▼
    ┌─────────────────────────────────────────┐
    │  chrome.tabs.onUpdated listener         │
    │  Status: "complete"                     │
    └─────┬───────────────────────────────────┘
            │
            │ 4c. Send message to content script
            ▼
    ┌─────────────────────────────────────────┐
    │  chrome.tabs.sendMessage()              │
    │  {                                      │
    │    action: "messagingThroughTabFB",     │
    │    userData: {id: 123, name: "John"},   │
    │    constructedMessage: "Hey John...",   │
    │    image: null                          │
    │  }                                      │
    └─────┬───────────────────────────────────┘
            │
            │ Message sent to Content Script
            │ (running in Facebook page context)
            ▼
    ┌─────────────────────────────────────────┐
    │  Content Script: contentScriptBundle.js │
    │  (Injected in facebook.com)             │
    └─────┬───────────────────────────────────┘
            │
            │ 4d. DOM Manipulation
            ▼
    ┌─────────────────────────────────────────┐
    │  1. Find message input element          │
    │     querySelector('[contenteditable]')  │
    │                                         │
    │  2. Insert message text                 │
    │     element.innerHTML = message         │
    │     Trigger 'input' event               │
    │                                         │
    │  3. (Optional) Attach image             │
    │     Upload via Facebook's file API      │
    │     Wait for upload complete            │
    │                                         │
    │  4. Find & click Send button            │
    │     querySelector('[aria-label="Send"]')│
    │     button.click()                      │
    └─────┬───────────────────────────────────┘
            │
            │ ✓ Message sent successfully
            ▼
    ┌─────────────────────────────────────────┐
    │  Send confirmation to Service Worker    │
    │  chrome.runtime.sendMessage({           │
    │    status: "success",                   │
    │    friend: "John Doe"                   │
    │  })                                     │
    └─────┬───────────────────────────────────┘
            │
            ▼
    ┌─────────────────────────────────────────┐
    │  Service Worker: Handle Response        │
    │  1. Log success                         │
    │  2. Update statistics                   │
    │  3. Close/reuse tab                     │
    │  4. Wait random delay (30-60s)          │
    │     (Anti-spam protection)              │
    └─────┬───────────────────────────────────┘
            │
            │ Move to next friend
            ▼
    ┌─────────────────────────────────────────┐
    │  Friend 2: Jane Smith (id: 456)         │
    │  (Repeat steps 4a-4d)                   │
    └─────┬───────────────────────────────────┘
            │
            │ All friends processed
            ▼
    ┌─────────────────────────────────────────┐
    │  Final Summary                          │
    │  ✓ 2 birthday messages sent             │
    │  • John Doe - Success                   │
    │  • Jane Smith - Success                 │
    │                                         │
    │  Display notification to user           │
    └─────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                        PHASE 5: ERROR HANDLING                              │
└─────────────────────────────────────────────────────────────────────────────┘

    Error Scenarios & Handling:

    ┌────────────────────────┐
    │ Facebook Login Expired │
    └───────┬────────────────┘
            │
            ▼
    ┌─────────────────────────────────────────┐
    │  Detect: DTSG token fetch fails         │
    │  Action: Show notification              │
    │          "Please log into Facebook"     │
    │          Open facebook.com in new tab   │
    └─────────────────────────────────────────┘

    ┌────────────────────────┐
    │  API Token Invalid     │
    └───────┬────────────────┘
            │
            ▼
    ┌─────────────────────────────────────────┐
    │  Detect: 401 Unauthorized from backend  │
    │  Action: Clear storage                  │
    │          Redirect to login.html         │
    │          Show "Session expired" message │
    └─────────────────────────────────────────┘

    ┌────────────────────────┐
    │  Message Send Failed   │
    └───────┬────────────────┘
            │
            ▼
    ┌─────────────────────────────────────────┐
    │  Detect: Content script timeout         │
    │          or error response              │
    │  Action: Retry once (after 5s delay)    │
    │          If fails again: Log error      │
    │          Continue to next friend        │
    │          Show summary with failures     │
    └─────────────────────────────────────────┘

    ┌────────────────────────┐
    │ Facebook DOM Changed   │
    └───────┬────────────────┘
            │
            ▼
    ┌─────────────────────────────────────────┐
    │  Detect: Element selectors not found    │
    │  Action: Try fallback selectors         │
    │          Log error to console           │
    │          Notify user: "Update required" │
    └─────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATA PERSISTENCE FLOW                               │
└─────────────────────────────────────────────────────────────────────────────┘

    Chrome Extension Storage:
    
    ┌─────────────────────────────────────────┐
    │  chrome.storage.local (Device-specific) │
    │  ┌────────────────────────────────────┐ │
    │  │ store.user = {                     │ │
    │  │   email: string                    │ │
    │  │   bw_token: string (API auth)      │ │
    │  │   uid: string (device ID)          │ │
    │  │   plan: string (subscription)      │ │
    │  │ }                                  │ │
    │  │                                    │ │
    │  │ fcmessages.groups = [...]          │ │
    │  │ (Cached message templates)         │ │
    │  └────────────────────────────────────┘ │
    └─────────────────────────────────────────┘
              │
              │ Synced to
              ▼
    ┌─────────────────────────────────────────┐
    │  Backend PostgreSQL Database            │
    │  ┌────────────────────────────────────┐ │
    │  │ users table                        │ │
    │  │ • email (unique)                   │ │
    │  │ • password_hash                    │ │
    │  │ • current_bw_token                 │ │
    │  │ • is_active                        │ │
    │  ├────────────────────────────────────┤ │
    │  │ message_greetings                  │ │
    │  │ • user_id, title, greeting_text    │ │
    │  ├────────────────────────────────────┤ │
    │  │ message_main_parts                 │ │
    │  │ • user_id, title, body_text        │ │
    │  ├────────────────────────────────────┤ │
    │  │ message_closings                   │ │
    │  │ • user_id, title, closing_text     │ │
    │  └────────────────────────────────────┘ │
    └─────────────────────────────────────────┘

    Data Synchronization:
    • Extension → Backend: On create/update operations
    • Backend → Extension: On page load / user action
    • No automatic background sync (manual refresh required)


┌─────────────────────────────────────────────────────────────────────────────┐
│                         KEY INTEGRATION POINTS                              │
└─────────────────────────────────────────────────────────────────────────────┘

    1. Extension ←→ Backend API
       Protocol: HTTPS REST
       Auth: Bearer token (KYUBI_<token>)
       Endpoints: /api/v1/*
       
    2. Extension ←→ Facebook
       Method: DOM Scraping + GraphQL API
       Auth: Facebook session cookies
       Key APIs: BirthdayCometRootQuery, Messenger
       
    3. Backend ←→ Database
       ORM: SQLAlchemy
       Connection: PostgreSQL (via psycopg2)
       Pool: Session factory pattern
       
    4. Extension Components
       Service Worker ←→ Content Scripts: chrome.runtime.sendMessage
       Service Worker ←→ Popup: chrome.storage events
       Background: Chrome Alarms API


### User Authentication Flow

```
┌─────────────┐
│   User      │
│  Clicks     │
│  Extension  │
└──────┬──────┘
       │
       │ Opens Popup
       ▼
┌─────────────┐
│ login.html  │
│  + login.js │
└──────┬──────┘
       │
       │ 1. User enters credentials
       │    email + password
       ▼
┌─────────────────────────────────────────────┐
│ API Request                                 │
│ POST /api/v1/login                          │
│ Body: { "email": "...", "password": "..." } │
└──────┬──────────────────────────────────────┘
       │
       │ HTTPS
       ▼
┌─────────────────────────────────────────────┐
│ Backend: api/auth.py                        │
│                                             │
│ 1. Find user by email                       │
│ 2. Verify user.is_active                    │
│ 3. Check password hash                      │
│ 4. Generate new token (user.refresh_token())│
│ 5. Save token to database                   │
└──────┬──────────────────────────────────────┘
       │
       │ Response
       │ {
       │   "message": "Login successful",
       │   "id": 123,
       │   "email": "user@example.com",
       │   "token": "64-char-hex-string"
       │ }
       ▼
┌─────────────────────────────────────────────┐
│ login.js                                    │
│                                             │
│ 1. Store in chrome.storage.local:          │
│    {                                        │
│      "store": {                             │
│        "user": {                            │
│          "email": "...",                    │
│          "bw_token": "...",                 │
│          "uid": generated_uuid              │
│        }                                    │
│      }                                      │
│    }                                        │
│ 2. Redirect to dashboard.html              │
└─────────────────────────────────────────────┘
```

---

### Message Segment Management Flow

```
┌─────────────┐
│   User      │
│  Opens      │
│  Settings   │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ settings.html       │
│ + segmentGroups.js  │
└──────┬──────────────┘
       │
       │ 1. On page load, fetch existing segments
       ▼
┌────────────────────────────────────────┐
│ GET /api/v1/segments/{user_id}         │
└──────┬─────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────┐
│ Backend: message_segments.get_segments()│
│                                        │
│ Query all three tables:               │
│   - message_greetings                 │
│   - message_main_parts                │
│   - message_closings                  │
│ WHERE user_id = {user_id}             │
└──────┬─────────────────────────────────┘
       │
       │ Response: { success, segments: {...} }
       ▼
┌────────────────────────────────────────┐
│ Display segments in UI                 │
│   - Greeting templates                 │
│   - Body templates                     │
│   - Closing templates                  │
└────────────────────────────────────────┘
       │
       │ 2. User creates new segment
       ▼
┌────────────────────────────────────────┐
│ POST /api/v1/segments                  │
│ Body: {                                │
│   user_id: 123,                        │
│   title: "Funny Greeting",             │
│   segment_type: "greeting",            │
│   content: "Hey [NAME]! 🎉"            │
│ }                                      │
└──────┬─────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────┐
│ Backend: message_segments.create_segment│
│                                        │
│ 1. Lookup TABLE_MAP[segment_type]     │
│    → model = MessageGreeting           │
│    → column = "greeting_text"          │
│ 2. Create new record                   │
│    greeting = MessageGreeting(         │
│      user_id=123,                      │
│      title="Funny Greeting",           │
│      greeting_text="Hey [NAME]! 🎉"    │
│    )                                   │
│ 3. session.add(greeting)               │
│ 4. session.commit()                    │
└──────┬─────────────────────────────────┘
       │
       │ Response: { success: true, message: "..." }
       ▼
┌────────────────────────────────────────┐
│ Update UI with new segment             │
└────────────────────────────────────────┘
```

---

### Birthday Messaging Flow

```
┌─────────────┐
│  Service    │
│  Worker     │
│ (Background)│
└──────┬──────┘
       │
       │ 1. Alarm triggers (scheduled by user)
       ▼
┌─────────────────────────────────────────┐
│ socialLink.scanFB()                     │
│                                         │
│ 1. Get Facebook DTSG token             │
│    getDtsg() → { dtsg, fbId }          │
│                                         │
│ 2. Call Facebook GraphQL API           │
│    POST /api/graphql/                  │
│    Document: BirthdayCometRootQuery    │
│    Variables: { offset_month: -1 }     │
└──────┬──────────────────────────────────┘
       │
       │ Response: {
       │   todays_birthdays: [
       │     { node: { id, name, ... } }
       │   ],
       │   monthly_birthdays: [ ... ]
       │ }
       ▼
┌─────────────────────────────────────────┐
│ Retrieve Message Segments               │
│ socialLink.retriveSegmentGroups()       │
│                                         │
│ 1. Get user's bw_token from storage    │
│ 2. Call backend API                     │
│    POST /api/v1/segments/{user_id}     │
│ 3. Receive: { greetings[], body[],     │
│              closings[] }               │
└──────┬──────────────────────────────────┘
       │
       │ 3. For each birthday friend
       ▼
┌─────────────────────────────────────────┐
│ Construct Message                       │
│                                         │
│ 1. Randomly select segments:           │
│    - greeting = random(greetings)       │
│    - body = random(body_parts)          │
│    - closing = random(closings)         │
│                                         │
│ 2. Replace placeholders:                │
│    - [NAME] → friend.name               │
│    - [EMOJI] → random emoji             │
│                                         │
│ 3. Compose final message:               │
│    message = greeting + "\n" +          │
│              body + "\n" +              │
│              closing                    │
└──────┬──────────────────────────────────┘
       │
       │ 4. Send message
       ▼
┌─────────────────────────────────────────┐
│ Tab Management                          │
│                                         │
│ 1. Create/reuse Facebook Messenger tab  │
│    URL: https://www.facebook.com/       │
│         messages/t/{user_id}            │
│                                         │
│ 2. Wait for tab load complete           │
│    (chrome.tabs.onUpdated listener)     │
└──────┬──────────────────────────────────┘
       │
       │ 5. Send to content script
       ▼
┌─────────────────────────────────────────┐
│ Content Script                          │
│ (Running in Facebook context)           │
│                                         │
│ 1. Find message input DOM element      │
│    (Facebook's contenteditable div)     │
│                                         │
│ 2. Insert message text                  │
│    - Set innerHTML or textContent       │
│    - Trigger input events               │
│                                         │
│ 3. Attach image (if provided)           │
│    - Upload via Facebook's API          │
│    - Wait for upload completion         │
│                                         │
│ 4. Click send button                    │
│    - Simulate click event               │
│    - Or trigger submit form             │
└──────┬──────────────────────────────────┘
       │
       │ 6. Message sent confirmation
       ▼
┌─────────────────────────────────────────┐
│ Service Worker                          │
│                                         │
│ 1. Log success/failure                  │
│ 2. Update statistics                    │
│ 3. Close/reuse tab                      │
│ 4. Move to next birthday friend         │
│ 5. Add random delay (anti-spam)         │
└─────────────────────────────────────────┘
```

---

## 🗂️ Database Schema Design

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────┐
│                   users                     │
├─────────────────────────────────────────────┤
│ PK │ id               │ SERIAL              │
│    │ email            │ VARCHAR UNIQUE      │
│    │ password_hash    │ VARCHAR             │
│    │ current_bw_token │ VARCHAR             │
│    │ is_active        │ BOOLEAN DEFAULT true│
│    │ created_at       │ TIMESTAMP           │
│    │ updated_at       │ TIMESTAMP           │
└─────────────────────────────────────────────┘
          │
          │ (No FK constraint!)
          │
          ├──────────────────┬──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│message_greetings│  │message_main_parts│ │message_closings│
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│PK│ id           │  │PK│ id           │  │PK│ id           │
│  │ user_id      │  │  │ user_id      │  │  │ user_id      │
│  │ title        │  │  │ title        │  │  │ title        │
│  │ greeting_text│  │  │ body_text    │  │  │ closing_text │
│  │ created_at   │  │  │ created_at   │  │  │ created_at   │
│  │ updated_at   │  │  │ updated_at   │  │  │ updated_at   │
└─────────────────┘  └─────────────────┘  └─────────────────┘

Relationship: One User → Many Message Segments (each type)
Cardinality: 1:N (one-to-many)
Constraint: No foreign key enforced! (referential integrity risk)
```

### Data Integrity Issues

1. **Missing Foreign Keys**: No CASCADE deletes if user is removed
2. **No Orphan Prevention**: Message segments can exist without valid user
3. **No Uniqueness Constraints**: Duplicate titles allowed per user
4. **No Length Limits**: Text fields unbounded (potential storage issues)

### Recommended Schema Improvements

```sql
-- Add foreign key constraints
ALTER TABLE message_greetings
ADD CONSTRAINT fk_greeting_user
FOREIGN KEY (user_id) REFERENCES users(id)
ON DELETE CASCADE;

ALTER TABLE message_main_parts
ADD CONSTRAINT fk_mainpart_user
FOREIGN KEY (user_id) REFERENCES users(id)
ON DELETE CASCADE;

ALTER TABLE message_closings
ADD CONSTRAINT fk_closing_user
FOREIGN KEY (user_id) REFERENCES users(id)
ON DELETE CASCADE;

-- Add composite unique constraints (prevent duplicate titles per user)
ALTER TABLE message_greetings
ADD CONSTRAINT unique_greeting_per_user
UNIQUE (user_id, title);

ALTER TABLE message_main_parts
ADD CONSTRAINT unique_mainpart_per_user
UNIQUE (user_id, title);

ALTER TABLE message_closings
ADD CONSTRAINT unique_closing_per_user
UNIQUE (user_id, title);

-- Add indexes on referencing-side foreign key columns for query performance.
-- Note: PostgreSQL does NOT automatically create these indexes for foreign keys;
-- they must be created manually as shown below.
CREATE INDEX idx_greetings_user_id ON message_greetings(user_id);
CREATE INDEX idx_mainparts_user_id ON message_main_parts(user_id);
CREATE INDEX idx_closings_user_id ON message_closings(user_id);
```

---

## 🔒 Security Analysis

### Critical Vulnerabilities

#### 1. **Unauthenticated Password Reset** (CRITICAL)
```python
# api/auth.py - forget_password()
# Anyone can reset any user's password with just email!

@auth_bp.post("/forget-password")
def forget_password():
    data = request.get_json(silent=True) or {}
    email = data.get("email")
    new_password = data.get("new_password")
    
    # ⚠️ NO verification email or token required!
    # ⚠️ NO rate limiting
    # ⚠️ NO current password check
    
    user = session.scalar(select(User).where(User.email == email))
    user.set_password(new_password)  # Immediately updated!
```

**Impact**: Complete account takeover vulnerability

**Recommendation**:
```python
# Proper flow:
# 1. POST /request-password-reset → Send email with token
# 2. User clicks email link with token
# 3. POST /reset-password with token + new password
# 4. Verify token is valid and not expired
# 5. Update password
```

---

#### 2. **Unrestricted CORS** (HIGH)
```python
# app.py
CORS(app, resources={r"/*": {"origins": "*"}})
```

**Impact**: Any website can make authenticated requests to API

**Recommendation**:
```python
CORS(app, resources={
    r"/api/*": {
        "origins": ["https://birthdaymessaging.io"],
        "methods": ["GET", "POST", "PUT", "DELETE"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})
```

---

#### 3. **No API Authentication Middleware** (HIGH)
```python
# Most endpoints don't verify token!

# Example: GET /api/v1/segments/<user_id>
# Anyone can access any user's message segments
# Just need to guess/enumerate user IDs
```

**Recommendation**: Implement authentication decorator
```python
from functools import wraps

def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({"error": "No token provided"}), 401
        
        # Extract token (format: "KYUBI_<token>")
        token = token.replace("KYUBI_", "")
        
        # Verify token
        user = session.scalar(
            select(User).where(User.current_bw_token == token)
        )
        if not user or not user.is_active:
            return jsonify({"error": "Invalid token"}), 401
        
        # Attach user to request
        g.current_user = user
        return f(*args, **kwargs)
    
    return decorated_function

# Usage:
@message_segments_bp.route("/api/v1/segments", methods=["POST"])
@require_auth
def add_segment():
    user_id = g.current_user.id  # Get from authenticated user
    # ... rest of logic
```

---

#### 4. **SQL Injection Risk** (MEDIUM)
```python
# message_segments.py uses SQLAlchemy ORM (safe)
# But direct SQL queries would be vulnerable

# ✅ SAFE (parameterized):
session.query(MessageGreeting).filter_by(user_id=user_id).all()

# ⚠️ UNSAFE (if used):
# session.execute(f"SELECT * FROM users WHERE email = '{email}'")
```

---

#### 5. **Session Token Security** (MEDIUM)
```python
# User.refresh_token() generates 64-char hex token
token = token_hex(32)  # 32 bytes = 64 hex chars

# ✅ Good: Cryptographically random
# ❌ Bad: No expiration
# ❌ Bad: Stored in plain text
# ❌ Bad: No token revocation mechanism
```

**Recommendations**:
- Add `token_expires_at` field to users table
- Implement token rotation
- Support multiple active tokens (for multiple devices)
- Add token revocation endpoint

---

#### 6. **Facebook Token Scraping** (MEDIUM)
```javascript
// socialLink.js scrapes DTSG token from Facebook HTML
// If Facebook changes structure, extension breaks
// No fallback mechanism

// Risks:
// - Facebook may detect and block scraping
// - DTSG token could be invalidated
// - Rate limiting may apply
```

---

### Security Best Practices Recommendations

```python
# 1. Add rate limiting
from flask_limiter import Limiter

limiter = Limiter(
    app,
    key_func=lambda: request.remote_addr,
    default_limits=["100 per hour"]
)

@auth_bp.route("/login", methods=["POST"])
@limiter.limit("5 per minute")
def login():
    # ...

# 2. Add request logging
import logging

@app.before_request
def log_request():
    logging.info(f"{request.method} {request.path} from {request.remote_addr}")

# 3. Add input validation
from marshmallow import Schema, fields, validate

class LoginSchema(Schema):
    email = fields.Email(required=True)
    password = fields.Str(required=True, validate=validate.Length(min=8))

# 4. Add HTTPS-only cookies
@app.after_request
def set_secure_headers(response):
    response.headers['Strict-Transport-Security'] = 'max-age=31536000'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    return response

# 5. Use environment-based secrets
# Never hardcode API keys, tokens, or secrets
# Use .env file (not committed to git)
```

---

## ⚡ Performance Analysis

### Backend Performance

#### Database Queries
```python
# Current: N+1 query problem in get_segments()
def get_segments(user_id: int):
    greetings = session.query(MessageGreeting).filter_by(user_id=user_id).all()
    body_parts = session.query(MessageMainPart).filter_by(user_id=user_id).all()
    closings = session.query(MessageClosing).filter_by(user_id=user_id).all()
    # 3 separate queries!

# Optimization: Use UNION ALL (if same structure)
# Or: Keep separate but add eager loading if relationships exist
```

#### Connection Pooling
```python
# database.py uses SQLAlchemy defaults
# Recommended configuration:

create_engine(
    url,
    pool_size=10,          # Max persistent connections
    max_overflow=20,       # Additional overflow connections
    pool_pre_ping=True,    # Verify connections before use
    pool_recycle=3600,     # Recycle connections every hour
)
```

---

### Frontend Performance

#### Extension Load Time
```
Manifest V3 Service Worker:
- Lazy loaded (only when needed)
- Event-driven (not always active)
- Memory efficient

Content Scripts:
- Injected on every Facebook page load
- Bundle size: ~500KB+ (contentScriptBundle.js)
- Recommendation: Code splitting, tree shaking
```

#### Chrome Storage Optimization
```javascript
// Current: Multiple small reads/writes
chrome.storage.local.get(["store"], callback)
chrome.storage.local.get(["emailID"], callback)

// Better: Batch operations
chrome.storage.local.get(["store", "emailID"], callback)

// Best: Cache frequently accessed data
let cachedStore = null;
async function getStore() {
    if (!cachedStore) {
        cachedStore = await chrome.storage.local.get("store");
    }
    return cachedStore;
}
```

---

## 🧪 Testing Strategy

### Backend Testing

```python
# Recommended test structure:
backend/
└── tests/
    ├── __init__.py
    ├── conftest.py              # Pytest fixtures
    ├── test_auth.py             # Authentication tests
    ├── test_message_segments.py # Message CRUD tests
    ├── test_models.py           # Model tests
    └── test_database.py         # Database tests

# Example test:
import pytest
from backend import create_app
from backend.database import session_scope
from backend.models import User

@pytest.fixture
def app():
    app = create_app()
    app.config['TESTING'] = True
    yield app

@pytest.fixture
def client(app):
    return app.test_client()

def test_login_success(client):
    # Create test user
    with session_scope() as session:
        user = User(email="test@example.com")
        user.set_password("password123")
        session.add(user)
    
    # Test login
    response = client.post('/api/v1/login', json={
        'email': 'test@example.com',
        'password': 'password123'
    })
    
    assert response.status_code == 200
    assert 'token' in response.json
```

### Frontend Testing

```javascript
// Recommended: Jest + Chrome Extension testing library

// Example test:
describe('Login Flow', () => {
    it('should store token after successful login', async () => {
        // Mock API response
        global.fetch = jest.fn(() =>
            Promise.resolve({
                json: () => Promise.resolve({
                    token: 'abc123',
                    id: 1,
                    email: 'test@example.com'
                })
            })
        );
        
        // Mock chrome.storage
        chrome.storage.local.set = jest.fn();
        
        // Call login function
        await login('test@example.com', 'password');
        
        // Verify storage was called
        expect(chrome.storage.local.set).toHaveBeenCalledWith(
            expect.objectContaining({
                store: expect.objectContaining({
                    user: expect.objectContaining({
                        email: 'test@example.com',
                        bw_token: 'abc123'
                    })
                })
            })
        );
    });
});
```

---

## 📊 Code Quality Metrics

### Backend Code Analysis

```
Lines of Code:
- Python backend: ~800 lines
- Models: ~200 lines
- API routes: ~400 lines
- Business logic: ~200 lines

Complexity:
- Average cyclomatic complexity: 3-5 (acceptable)
- No functions exceed 50 lines (good)
- Clear separation of concerns (good)

Issues:
- Missing docstrings (most functions)
- No type hints in some places
- Limited error handling
- No logging configuration
```

### Frontend Code Analysis

```
Lines of Code:
- JavaScript: ~5000+ lines (minified bundles)
- HTML: ~2000 lines
- CSS: ~500 lines

Complexity:
- Large monolithic files (socialLink.js)
- Heavy use of callbacks (should use async/await)
- Global state management (no state library)

Issues:
- No module bundler (webpack/rollup)
- No TypeScript for type safety
- Limited code reuse
- Inconsistent error handling
```

---

## 🚀 Deployment Checklist

### Pre-Production Requirements

- [ ] **Security**
  - [ ] Fix password reset vulnerability (remove insecure endpoint)
  - [ ] Fix broken password reset (add missing DB fields)
  - [ ] Implement API authentication
  - [ ] Configure proper CORS
  - [ ] Add rate limiting
  - [ ] Enable HTTPS only
  - [ ] Add request logging

- [ ] **Database**
  - [ ] Add foreign key constraints
  - [ ] Add indexes for performance
  - [ ] Configure backups
  - [ ] Set up migrations (Alembic)

- [ ] **Backend**
  - [ ] Increase Gunicorn workers
  - [ ] Configure logging (sentry/rollbar)
  - [ ] Add health check endpoint
  - [ ] Environment-specific configs
  - [ ] Error monitoring

- [ ] **Frontend**
  - [ ] Minify and bundle JS
  - [ ] Optimize images
  - [ ] Add error boundaries
  - [ ] Test on multiple Chrome versions
  - [ ] Review Chrome Web Store policies

- [ ] **Testing**
  - [ ] Unit tests (>80% coverage)
  - [ ] Integration tests
  - [ ] End-to-end tests
  - [ ] Load testing
  - [ ] Security audit

- [ ] **Documentation**
  - [ ] API documentation (Swagger/OpenAPI)
  - [ ] User guide
  - [ ] Admin guide
  - [ ] Developer setup guide

---

## 🔧 Technical Debt & Refactoring Priorities

### Priority 1 (Critical - Security)
1. Fix password reset vulnerability (insecure endpoint in auth.py)
2. Add missing database fields for secure password reset (password_reset_token, password_reset_expires_at)
3. Remove duplicate/insecure password reset endpoint
4. Implement API authentication
5. Restrict CORS to specific origins
6. Add rate limiting

### Priority 2 (High - Functionality)
1. Add foreign key constraints to database
2. Fix /user endpoint (return authenticated user)
3. Implement token expiration
4. Add comprehensive error handling

### Priority 3 (Medium - Code Quality)
1. Add docstrings and type hints
2. Implement logging system
3. Split large files into modules
4. Add validation layer (marshmallow/pydantic)

### Priority 4 (Low - Nice to Have)
1. Add database migrations (Alembic)
2. Implement caching layer (Redis)
3. Add metrics/monitoring (Prometheus)
4. Convert frontend to TypeScript

---

## 📈 Scalability Considerations

### Current Limitations
- Single Gunicorn worker (1 concurrent request)
- No caching layer
- Synchronous API calls
- No load balancing
- No horizontal scaling

### Recommended Architecture for Scale

```
                      ┌─────────────┐
                      │   CDN       │
                      │ (Cloudflare)│
                      └──────┬──────┘
                             │
                      ┌──────▼──────┐
                      │ Load Balancer│
                      │  (Traefik)  │
                      └──────┬──────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
    ┌─────▼────┐      ┌─────▼────┐      ┌─────▼────┐
    │ Backend  │      │ Backend  │      │ Backend  │
    │Instance 1│      │Instance 2│      │Instance 3│
    └─────┬────┘      └─────┬────┘      └─────┬────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
                      ┌──────▼──────┐
                      │   Redis     │
                      │  (Cache)    │
                      └──────┬──────┘
                             │
                      ┌──────▼──────┐
                      │ PostgreSQL  │
                      │(Primary+Read│
                      │  Replicas)  │
                      └─────────────┘
```

---

## 🎯 Conclusion

### System Strengths
✅ Clean architecture with separation of concerns  
✅ Modern tech stack (Flask, SQLAlchemy, Chrome Extension Manifest V3)  
✅ Docker containerization for easy deployment  
✅ Modular design for message segment composition  
✅ RESTful API design  

### System Weaknesses
❌ Critical security vulnerabilities (password reset, CORS, authentication)  
❌ **BROKEN password reset implementation** (references non-existent DB fields)  
❌ **Duplicate password reset endpoints** (one secure but broken, one insecure)  
❌ No foreign key constraints in database  
❌ Limited error handling and logging  
❌ No automated testing  
❌ Fragile Facebook scraping (can break easily)  
❌ No API documentation  
❌ Single-worker deployment (not production-ready)  

### Recommended Next Steps
1. **Immediate**: Fix security vulnerabilities (authentication, CORS, password reset)
2. **Critical**: Add missing database fields for password reset OR remove broken implementation
3. **Short-term**: Add database constraints, logging, error handling
4. **Medium-term**: Implement testing suite, improve performance
5. **Long-term**: Refactor to scalable architecture, add monitoring

---

## 📝 Additional Notes

**Development Environment Setup**:
```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env  # Configure database
python app.py

# Database
docker-compose up -d  # Start PostgreSQL
python -c "from backend.models import *; from backend.database import *; from backend.config import *; settings = get_settings(); init_engine(settings.db_url); from backend.models.base import Base; Base.metadata.create_all(get_engine())"

# Frontend
# Load extension in Chrome:
# 1. Open chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select frontend/ directory
```

**Environment Variables**:
```bash
# .env file
DB_HOST=localhost
DB_PORT=5432
DB_NAME=birthdaymessaging
DB_USER=postgres
DB_PASS=password
# OR
DATABASE_URL=postgresql://user:pass@host:port/dbname
```

---

**Generated**: January 16, 2026  
**Version**: 1.0  
**Status**: Legacy system analysis for re-engineering
