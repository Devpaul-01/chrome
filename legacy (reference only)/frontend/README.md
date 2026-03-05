# Birthday Messaging - Chrome Extension Frontend

> Automated Facebook birthday messaging system - Legacy white-label product being re-engineered for client usage.

**Version:** 1.3.6  
**Type:** Chrome Extension (Manifest V3)  
**Status:** Legacy / Active Refactoring

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Development Setup](#development-setup)
- [File Structure](#file-structure)
- [Configuration](#configuration)
- [Usage Guide](#usage-guide)
- [API Integration](#api-integration)
- [Facebook Integration](#facebook-integration)
- [Extension Components](#extension-components)
- [Build & Deployment](#build--deployment)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Known Issues](#known-issues)
- [Roadmap](#roadmap)

---

## 🎯 Overview

Birthday Messaging is a Chrome browser extension that automates sending personalized birthday messages to Facebook friends. Users can create customizable message templates, schedule automated sends, and manage birthday greetings efficiently.

### Key Technologies

- **Framework:** Vanilla JavaScript (jQuery bundled, version ~3.6.x based on minified code)
- **Extension API:** Chrome Manifest V3
- **Build System:** Bundled/Minified (source not available) ⚠️
- **Styling:** Custom CSS + Bootstrap components
- **State Management:** Chrome Storage API
- **Backend API:** Flask REST API (see `../backend/`)

⚠️ **Note:** JavaScript files are minified/bundled. Original source code is not available in this repository.

### Project Status

This is a **legacy codebase** acquired as a white-label product. Active re-engineering is underway to modernize the technology stack and improve maintainability.

---

## ✨ Features


- ✅ **Automated Birthday Detection** - Scrapes Facebook for friend birthdays
- ✅ **Message Templates** - Create reusable greeting, body, and closing segments
- ✅ **Scheduled Messaging** - Set up automated daily or custom schedules
- ✅ **Personalization** - Dynamic name insertion and custom variables
- ✅ **Advance Notifications** - Get notified of upcoming birthdays
- ✅ **Manual Override** - Send messages manually when needed
- ✅ **Message History** - Track sent messages

### User Management

- ✅ User registration and authentication
- ✅ Password reset functionality
- ✅ Profile management
- ✅ Settings customization

### Extension Features

- ✅ Browser action popup for quick access
- ✅ Content scripts for Facebook DOM manipulation
- ✅ Background service worker for scheduling
- ✅ Chrome storage for data persistence
- ✅ Alarm API for scheduled tasks

---

## 🏗️ Architecture

### Extension Structure

```
┌─────────────────────────────────────┐
│        Chrome Extension             │
├─────────────────────────────────────┤
│                                     │
│  ┌──────────┐  ┌───────────────┐   │
│  │  Popup   │  │    Service    │   │
│  │  Pages   │  │    Worker     │   │
│  │(HTML/JS) │  │ (Background)  │   │
│  └────┬─────┘  └───────┬───────┘   │
│       │                │           │
│       │   Chrome APIs  │           │
│       │                │           │
│  ┌────┴────────────────┴───────┐   │
│  │   Content Scripts           │   │
│  │  (Facebook DOM Inject)      │   │
│  └─────────────────────────────┘   │
│                                     │
└─────────────────┬───────────────────┘
                  │
                  │ REST API (HTTPS)
                  │
┌─────────────────┴───────────────────┐
│      Flask Backend API              │
│   (PostgreSQL Database)             │
└─────────────────────────────────────┘
```

### Component Communication

```
Popup UI ←→ Chrome Storage ←→ Background Service Worker
    ↓                              ↓
Content Scripts ←────────────────→ Facebook DOM
    ↓
Backend API
```

### Data Flow

1. **User Authentication** → Backend API → Chrome Storage
2. **Template Creation** → Backend API → PostgreSQL
3. **Birthday Scan** → Facebook GraphQL API → Service Worker
4. **Message Send** → Service Worker → Content Script → Facebook Messenger

---

## 🚀 Quick Start

### Prerequisites

- **Chrome/Edge Browser:** Version 88 or higher
- **Backend API:** Running Flask backend (see `../backend/README.md`)
- **Facebook Account:** Active account for testing

### Installation (Development Mode)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd BIRTHDAYMESSAGING-LEGACY/frontend
   ```

2. **Configure API endpoints**
   ⚠️ **Note:** API endpoints are hardcoded in minified [js/config.js](js/config.js) and cannot be easily edited.
   
   Current hardcoded API base URL: `https://db.birthdaymessaging.io/api/`

3. **Load extension in Chrome**
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode" (top-right toggle)
   - Click "Load unpacked"
   - Select the `frontend` folder

4. **Verify installation**
   - Extension icon should appear in toolbar
   - Click icon to open login page
   - Check browser console for errors

### First-Time Setup

1. **Register an account**
   - Click extension icon
   - Choose "Register"
   - Enter email and password
   - Submit to create account

2. **Login**
   - Enter credentials
   - Click "Login"
   - Should redirect to dashboard

3. **Create message templates**
   - Navigate to Settings
   - Create greeting templates (e.g., "Happy Birthday!")
   - Create body templates (e.g., "Hope you have an amazing day")
   - Create closing templates (e.g., "Best wishes, [YOUR_NAME]")

4. **Configure schedule**
   - Go to Interval settings
   - Set time for daily birthday check
   - Configure message delay preferences

5. **Test manually**
   - Open Facebook birthdays page
   - Use "Send Now" to test a message

---

#### Development Workflow

⚠️ **Critical Limitation:** JavaScript files are minified/bundled without source maps.
Editing the code requires access to original source code and a build process.

```bash
# 1. Make changes to files (if you have original source)
vim src/login.js  # Original source (not included)

# 2. Rebuild/rebundle (build process not included)
npm run build

# 3. Reload extension in Chrome
# Option A: Click reload button in chrome://extensions/
# Option B: Use keyboard shortcut (Ctrl+R on extension page)

# 3. Test changes
# Open extension popup or navigate to Facebook

# 4. Check console for errors
# Right-click extension icon → Inspect popup
# Or: F12 on Facebook pages to see content script logs
```

### File Watching (Optional)

For automatic reload notifications:

```bash
# Install Node.js dependencies (optional)
npm install -g chokidar-cli

# Watch for file changes
chokidar "**/*.{js,css,html}" -c "echo 'Files changed - reload extension'"
```

### Debugging

#### Popup Debugging
```bash
# 1. Click extension icon to open popup
# 2. Right-click anywhere in popup
# 3. Select "Inspect"
# 4. DevTools opens with popup context
```

#### Background Service Worker Debugging
```bash
# 1. Go to chrome://extensions/
# 2. Find Birthday Messaging extension
# 3. Click "Inspect views: service worker"
# 4. DevTools opens with background context
```

#### Content Script Debugging
```bash
# 1. Open Facebook in Chrome
# 2. Press F12 to open DevTools
# 3. Go to Console tab
# 4. Content script logs appear here
```

#### Storage Inspection
```bash
# Chrome DevTools → Application → Storage
# - Local Storage: chrome-extension://<id>
# - Chrome Storage: Use chrome.storage API in console
```

---

## 📁 File Structure

```
frontend/
├── manifest.json                  # Extension configuration (Manifest V3)
├── README.md                      # This file
├── REFACTORING_PLAN.md           # Modernization roadmap
│
├── HTML Pages (Popup UI)
│   ├── login.html                # Entry point / Login page
│   ├── register.html             # User registration
│   ├── dashboard.html            # Main dashboard
│   ├── settings.html             # User settings & templates
│   ├── interval.html             # Schedule configuration
│   ├── forgot-password.html      # Password recovery
│   ├── change-password.html      # Password change
│   ├── updatepassword.html       # Password update page
│   ├── confirmation.html         # Action confirmations
│   ├── training.html             # User guide
│   ├── trainingPage.html         # Training page (alternate)
│   └── backgroundpage.html       # Background page (legacy)
│
├── js/                           # JavaScript files (all minified)
│   ├── Core & Configuration
│   │   ├── config.js            # API endpoints & settings (minified)
│   │   ├── config-old.js        # Old config version
│   │   ├── common.js            # Shared utilities (minified)
│   │   ├── helper.js            # Helper functions (minified)
│   │   └── htmlConst.js         # HTML templates (strings)
│   │
│   ├── Extension Components
│   │   ├── serviceWorker.js     # Background service worker (minified)
│   │   ├── contentScriptBundle.js # Facebook content script (minified)
│   │   ├── contentScriptBundle-old.js # Old version
│   │   └── worker.js            # Push notification worker
│   │
│   ├── Page Controllers
│   │   ├── login.js             # Login page logic (minified)
│   │   ├── login-old.js         # Old login version
│   │   ├── register.js          # Registration logic
│   │   ├── forgotpassword.js    # Password reset (minified)
│   │   ├── forgotpass-old.js    # Old password reset version
│   │   ├── changepassword.js    # Password change
│   │   └── updatepassword.js    # Password update API
│   │
│   ├── Feature Modules
│   │   ├── message.js           # Message composition (minified)
│   │   ├── messageGroups.js     # Message group management (minified)
│   │   ├── segmentGroups.js     # Segment CRUD operations (minified)
│   │   ├── posts.js             # Facebook post handling (minified)
│   │   └── images.js            # Image handling (minified)
│   │
│   ├── Services & API
│   │   ├── services.js          # Backend API calls (minified)
│   │   ├── serviceHelper.js     # Service utilities (minified)
│   │   └── socialLink.js        # Facebook integration ⭐ (minified)
│   │
│   ├── Third-party
│   │   └── bootstraptagsinput.js # Tag input component
│   │
│   └── *.LICENSE.txt            # License files for bundled code
│
├── css/                          # Stylesheets
│   └── customCss.css            # Custom styles
│
├── assets/                       # Static assets
│   ├── style.css                # Main styles
│   ├── toast.css                # Toast notifications
│   ├── login_bg.png             # Login background
│   └── *.svg                    # SVG icons (edit icons)
│
├── images/                       # Icons & images
│   ├── 62619b191202d2547f4aa10a-Birthday_messaging-1668510756126-small_icon.png   # 16x16
│   ├── 62619b191202d2547f4aa10a-Birthday_messaging-1668510756188-medium_icon.png # 48x48
│   ├── 62619b191202d2547f4aa10a-Birthday_messaging-1668510756252-large_icon.png  # 128x128
│   ├── 128X128.png               # Icon (128x128)
│   ├── 1024X1024.png             # Icon (1024x1024)
│   ├── icon125.png, icon249.png  # Additional icons
│   ├── style.css                 # Image folder styles
│   └── ...                      # Other assets (logos, loaders, backgrounds)
│
├── views/                        # Reusable components
│   ├── header.html              # Header template
│   └── footer.html              # Footer template
│
└── _metadata/                    # Chrome Web Store metadata
    └── generated_indexed_rulesets/
        └── _ruleset1            # Declarative Net Request rules
```

### Key Files Explained

| File | Purpose |
|------|---------|
| `manifest.json` | Extension configuration, permissions, entry points |
| `js/config.js` | API endpoints, global settings |
| `js/serviceWorker.js` | Background tasks, alarms, message passing |
| `js/contentScriptBundle.js` | Facebook DOM manipulation |
| `js/socialLink.js` | Facebook API integration, DTSG token scraping |
| `js/services.js` | Backend API client |
| `login.html` | Extension entry point |
| `dashboard.html` | Main user interface |

---

## ⚙️ Configuration

### API Endpoints

⚠️ **Important:** API endpoints are hardcoded in minified JavaScript files and cannot be changed without original source code.

**Current Production API Base URL** (hardcoded in minified code):
```
https://db.birthdaymessaging.io/api/
```

**Note:** The backend documentation may reference `api.birthdaymessaging.io`, but the actual production extension uses `db.birthdaymessaging.io`. To change API endpoints, you would need:
1. Access to original source code
2. Modify the configuration
3. Rebuild/rebundle the extension

### Extension Settings

Stored in Chrome Storage:

```javascript
// Get current settings
chrome.storage.sync.get(['settings'], (result) => {
  console.log(result.settings);
});

// Update settings
chrome.storage.sync.set({
  settings: {
    schedule: {
      time: "09:00",
      frequency: "daily"
    },
    messageDelay: {
      min: 30,
      max: 60
    }
  }
});
```

### Facebook Integration

The extension scrapes Facebook's birthday data. Key configuration:

```javascript
// In js/socialLink.js

// GraphQL Document ID (hardcoded - may change)
const BIRTHDAY_QUERY_DOC_ID = "4576878779047229";

// Birthday page URL
const BIRTHDAY_PAGE = "https://www.facebook.com/birthdays";

// Messenger base URL
const MESSENGER_URL = "https://www.facebook.com/messages/t/";
```

⚠️ **Warning:** These values may change if Facebook updates their platform.

---

## 📖 Usage Guide

### For End Users

#### Sending Birthday Messages

**Automatic Mode:**
1. Set up your schedule in Interval settings
2. Create message templates in Settings
3. Extension runs automatically at scheduled time
4. Messages sent to today's birthdays

**Manual Mode:**
1. Click extension icon
2. Go to Dashboard
3. View today's birthdays
4. Click "Send Message" on individual cards
5. Or use "Send All" for batch sending

#### Managing Templates

1. **Navigate to Settings** (from dashboard)
2. **Create Greeting Templates:**
   - Click "Add Greeting"
   - Enter title: e.g., "Casual Greeting"
   - Enter text: e.g., "Hey [NAME]! 🎉"
   - Save
3. **Create Body Templates:**
   - Similar process
   - Use `[NAME]` placeholder for personalization
4. **Create Closing Templates:**
   - Add your signature
   - Save

#### Variables Available

- `[NAME]` - Friend's first name
- `[FULLNAME]` - Friend's full name
- `[MYNAME]` - Your name (from settings)
- `[DATE]` - Current date

### For Developers

#### Adding a New Page

   <head>
     <title>New Feature</title>
     <link rel="stylesheet" href="assets/style.css">
   </head>
   <body>
     <div id="content"></div>
     <script src="js/common.js"></script>
     <script src="js/new-feature.js"></script>
   </body>
   </html>
   ```

2. **Create JavaScript controller**
   ```javascript
   // js/new-feature.js
   document.addEventListener('DOMContentLoaded', function() {
     // Your initialization code
   });
   ```

3. **Link from existing pages**
   ```html
   <a href="new-feature.html">New Feature</a>
   ```

#### Making API Calls

```javascript
// Using existing services.js pattern

// GET request
fetch(`${BW_API}/endpoint`, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
})
.then(response => response.json())
.then(data => {
  // Handle response
})
.catch(error => {
  console.error('Error:', error);
});

// POST request
fetch(`${BW_API}/endpoint`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    key: 'value'
  })
})
.then(response => response.json())
.then(data => {
  // Handle response
});
```

#### Chrome Storage Patterns

```javascript
// Save data
chrome.storage.local.set({
  key: 'value'
}, () => {
  console.log('Saved');
});

// Get data
chrome.storage.local.get(['key'], (result) => {
  console.log('Value:', result.key);
});

// Remove data
chrome.storage.local.remove('key', () => {
  console.log('Removed');
});

// Clear all
chrome.storage.local.clear(() => {
  console.log('All cleared');
});
```

#### Sending Messages Between Components

```javascript
// From popup to background
chrome.runtime.sendMessage({
  action: 'doSomething',
  data: { }
}, (response) => {
  console.log('Response:', response);
});

// In background (serviceWorker.js)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'doSomething') {
    // Handle action
    sendResponse({ success: true });
  }
});

// To content script
chrome.tabs.sendMessage(tabId, {
  action: 'manipulateDOM',
  data: { }
});
```

---

## 🔌 API Integration

### Authentication Flow

⚠️ **Note:** Endpoints shown with `/api/v1/` prefix. The backend blueprint defines this prefix.

```javascript
// 1. Register
POST /api/v1/register
Body: { email, password }
Response: { message, id } [201 Created]
Errors: 400 (missing fields), 409 (user exists)

// 2. Login
POST /api/v1/login
Body: { email, password }
Response: { message, id, email, token } [200 OK]
Errors: 400, 401 (invalid credentials), 403 (inactive), 404 (not found)

// 3. Store token
chrome.storage.local.set({
  store: {
    user: {
      email: email,
      bw_token: token,
      uid: generateUID()
    }
  }
});
```

### Message Segments

```javascript
// Get all segments for user
GET /api/v1/segments/{user_id}
Response: {
  success: true,
  segments: {
    greetings: [{ id, title, content }],
    body: [{ id, title, content }],
    closings: [{ id, title, content }]
  }
}

// Create new segment
POST /api/v1/segments
Body: {
  user_id: 123,
  title: "Template Title",
  segment_type: "greeting" | "body" | "closing",
  content: "Template text with [NAME]"
}
Response: { success: true, message: "Segment created" }
```

### Password Reset

```javascript
// Request password reset (INSECURE ENDPOINT)
POST /api/v1/forget-password
Body: { email, new_password }
Response: { message, id } [200 OK]
Errors: 400 (missing fields), 404 (user not found)

// ⚠️ CRITICAL SECURITY WARNING: 
// This endpoint has NO verification - anyone with an email can reset the password!
// A secure token-based endpoint exists (POST /api/v1/reset-password) but is broken
// due to missing database fields.
```

---

## 📘 Facebook Integration

### How It Works

The extension interacts with Facebook through:

1. **DTSG Token Scraping** - Extracts security token from Facebook pages
2. **GraphQL API** - Fetches birthday data using Facebook's internal API
3. **DOM Manipulation** - Injects messages into Messenger interface

### DTSG Token Extraction

⚠️ **Note:** The following code is a reconstruction of the minified logic. Actual implementation is in minified `js/socialLink.js`.

```javascript
// Reconstructed from js/socialLink.js (minified)
async function getDtsg() {
  const response = await fetch('https://m.facebook.com/composer/ocelot/async_loader/');
  const html = await response.text();
  
  // Regex to extract DTSG token
  const dtsgPattern = /\"token\":\"[^\"]+\"/;
  const dtsg = html.match(dtsgPattern)[0]
    .split('token')[1]
    .match(/[a-zA-Z0-9_-]+.[a-zA-Z0-9_-]+/g)[0];
  
  return dtsg;
}
```

### Birthday Data Fetching

```javascript
// GraphQL query to Facebook
async function scanFB() {
  const { dtsg, fbId } = await getDtsg();
  
  const response = await fetch('https://www.facebook.com/api/graphql/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      fb_dtsg: dtsg,
      doc_id: '4576878779047229', // BirthdayCometRootQuery
      variables: JSON.stringify({
        offset_month: -1,
        scale: 1
      })
    })
  });
  
  const data = await response.json();
  return data.data.viewer.birthdays;
}
```

### DOM Message Injection

```javascript
// In content script (contentScriptBundle.js)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'messagingThroughTabFB') {
    // 1. Find message input
    const input = document.querySelector('[contenteditable="true"]');
    
    // 2. Insert message
    input.innerHTML = request.constructedMessage;
    
    // 3. Trigger input event
    input.dispatchEvent(new Event('input', { bubbles: true }));
    
    // 4. Find and click send button
    const sendBtn = document.querySelector('[aria-label="Send"]');
    sendBtn.click();
    
    sendResponse({ success: true });
  }
});
```

### Known Facebook Limitations

⚠️ **Fragile Integration:**
- DOM selectors may break with Facebook updates
- DTSG token extraction relies on HTML structure
- GraphQL document IDs may change
- Rate limiting may apply

🔄 **Workarounds:**
- Regular monitoring of Facebook changes
- Multiple fallback selectors
- Error handling and retry logic
- User notifications when integration breaks

---

## 🧩 Extension Components

### Manifest V3 Structure

```json
{
  "manifest_version": 3,
  "name": "Birthday messaging",
  "version": "1.3.6",
  
  "action": {
    "default_popup": "login.html"
  },
  
  "background": {
    "service_worker": "js/serviceWorker.js"
  },
  
  "content_scripts": [{
    "matches": ["*://*.facebook.com/*"],
    "js": ["js/contentScriptBundle.js"]
  }],
  
  "permissions": [
    "storage",
    "alarms",
    "declarativeNetRequest",
    "clipboardRead"
  ],
  
  "host_permissions": [
    "*://db.birthdaymessaging.io/*",
    "https://www.facebook.com/*"
  ]
}
```

### Service Worker (Background)

**Purpose:** Long-running background tasks

**Responsibilities:**
- Schedule birthday scans using Chrome Alarms API
- Manage message sending workflow
- Handle inter-component communication
- Persist state across extension lifecycle

**Key Events:**
```javascript
// Extension installed
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
});

// Alarm triggered
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dailyBirthdayScan') {
    scanAndSendMessages();
  }
});

// Message received
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle messages from popup/content scripts
});
```

### Content Scripts

**Purpose:** Interact with Facebook page DOM

**Injection:** Automatically on all facebook.com pages

**Capabilities:**
- Read birthday information from page
- Inject messages into Messenger
- Manipulate DOM elements
- Intercept network requests

**Limitations:**
- Cannot access Chrome APIs directly (must use message passing)
- Isolated JavaScript context (cannot access page variables)

### Popup Pages

**Purpose:** User interface for extension settings

**Lifecycle:** Created when clicked, destroyed when closed

**State Management:** Must load state from Chrome Storage on each open

---

## 🔨 Build & Deployment

### Current Process (Manual)

No build step required. Files are used directly:

1. **Make code changes**
2. **Reload extension** in Chrome
3. **Test functionality**
4. **Commit to git**

### Packaging for Distribution

```bash
# Create extension package
cd frontend
zip -r birthday-messaging-v1.3.6.zip . \
  -x "*.git*" \
  -x "node_modules/*" \
  -x "*.md" \
  -x ".vscode/*"

# Result: birthday-messaging-v1.3.6.zip
```

### Chrome Web Store Deployment

1. **Prepare assets**
   - Screenshots (1280x800 or 640x400)
   - Promotional images
   - Extension icon (128x128)

2. **Create store listing**
   - Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   - Upload ZIP file
   - Fill in description, screenshots
   - Set pricing (free)

3. **Submit for review**
   - Google reviews (typically 1-3 days)
   - May request changes for policy compliance

4. **Publish**
   - After approval, click "Publish"
   - Extension goes live

### Version Management

Update version in:
- `manifest.json` → `"version": "1.3.7"`
- Git tag: `git tag v1.3.7`

Follow [Semantic Versioning](https://semver.org/):
- MAJOR.MINOR.PATCH
- e.g., 1.3.6 → 1.4.0 (new features)

---

## 🧪 Testing

### Manual Testing Checklist

**Authentication:**
- [ ] New user registration
- [ ] Login with valid credentials
- [ ] Login with invalid credentials
- [ ] Password reset flow
- [ ] Session persistence
- [ ] Logout functionality

**Dashboard:**
- [ ] Displays today's birthdays
- [ ] Displays upcoming birthdays
- [ ] Quick send button works
- [ ] Navigation to settings works

**Message Templates:**
- [ ] Create greeting template
- [ ] Create body template
- [ ] Create closing template
- [ ] Edit existing template
- [ ] Delete template
- [ ] Variable substitution works

**Scheduling:**
- [ ] Set daily schedule
- [ ] Configure message delays
- [ ] Alarm triggers at correct time
- [ ] Automatic sending works

**Facebook Integration:**
- [ ] DTSG token extraction succeeds
- [ ] Birthday data fetched correctly
- [ ] Message injected into Messenger
- [ ] Send button clicked programmatically
- [ ] Message appears in conversation

### Browser Testing

Test on:
- [ ] Chrome (latest)
- [ ] Chrome (1 version back)
- [ ] Edge (latest)
- [ ] Different screen sizes

### Error Scenarios

- [ ] Backend API unreachable
- [ ] Facebook login expired
- [ ] Invalid DTSG token
- [ ] Network timeout
- [ ] Storage quota exceeded

---

## 🐛 Troubleshooting

### Extension Won't Load

**Symptom:** Extension doesn't appear in toolbar

**Solutions:**
1. Check `manifest.json` for syntax errors
   ```bash
   cat manifest.json | python -m json.tool
   ```
2. Verify all referenced files exist
3. Check Chrome console for errors
4. Try reloading extension: `chrome://extensions/` → Click reload

---

### Login Fails

**Symptom:** "Invalid credentials" or no response

**Solutions:**
1. **Check API endpoint:**
   - Open DevTools (F12) → Network tab
   - Attempt login
   - Check if request reaches backend
   - Verify response status code

2. **Verify backend is running:**
   ```bash
   curl https://api.birthdaymessaging.io/api/v1/
   ```

3. **Check CORS configuration:**
   - Backend must allow extension origin
   - Look for CORS errors in console

4. **Clear storage:**
   ```javascript
   chrome.storage.local.clear()
   chrome.storage.sync.clear()
   ```

---

### Birthday Scan Fails

**Symptom:** No birthdays detected or error message

**Solutions:**
1. **Verify Facebook login:**
   - Open Facebook in same Chrome profile
   - Ensure you're logged in
   - Check for 2FA prompts

2. **Check DTSG extraction:**
   - Open DevTools → Console
   - Manually trigger: `getDtsg()`
   - Check for regex errors

3. **Facebook DOM changed:**
   - Inspect Facebook birthday page source
   - Update selectors in `js/socialLink.js`
   - May require code update

4. **Rate limiting:**
   - Wait 5-10 minutes
   - Try again
   - Reduce scan frequency

---

### Message Won't Send

**Symptom:** Message composition fails or doesn't appear

**Solutions:**
1. **Check content script injection:**
   - Open Facebook Messenger
   - Press F12 → Console
   - Look for content script logs
   - Verify script is injected

2. **DOM selector issues:**
   - Inspect Messenger input element
   - Update selector in content script
   - Test with `document.querySelector('[contenteditable]')`

3. **Manual test:**
   ```javascript
   // In Facebook console
   const input = document.querySelector('[contenteditable]');
   input.innerHTML = 'Test message';
   input.dispatchEvent(new Event('input', { bubbles: true }));
   ```

4. **Check permissions:**
   - Verify `manifest.json` has Facebook host permissions
   - Reload extension after permission changes

---

### Storage Issues

**Symptom:** Settings not saving or data loss

**Solutions:**
1. **Check storage quota:**
   ```javascript
   chrome.storage.local.getBytesInUse(null, (bytes) => {
     console.log('Storage used:', bytes);
   });
   ```

2. **Clear corrupted data:**
   ```javascript
   chrome.storage.local.clear(() => {
     console.log('Storage cleared');
   });
   ```

3. **Verify sync enabled:**
   - Chrome Settings → Sync
   - Ensure Chrome Sync is enabled

---

### Performance Issues

**Symptom:** Extension slow or unresponsive

**Solutions:**
1. **Check service worker:**
   - `chrome://extensions/` → Inspect service worker
   - Look for errors or infinite loops

2. **Reduce storage reads:**
   - Cache frequently accessed data
   - Batch storage operations

3. **Optimize content scripts:**
   - Minimize DOM queries
   - Use event delegation
   - Avoid heavy processing

---

## 🤝 Contributing

### Development Process

1. **Fork repository**
2. **Create feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make changes**
4. **Test thoroughly**
5. **Commit with descriptive message**
   ```bash
   git commit -m "feat: add new feature description"
   ```
6. **Push to fork**
   ```bash
   git push origin feature/your-feature-name
   ```
7. **Create Pull Request**

### Coding Standards

**JavaScript:**
- Use camelCase for variables and functions
- Use PascalCase for constructors
- Add JSDoc comments for functions
- Avoid global variables when possible
- Handle errors gracefully

**Example:**
```javascript
/**
 * Fetches user data from backend API
 * @param {number} userId - The user ID to fetch
 * @returns {Promise<Object>} User data object
 * @throws {Error} If API request fails
 */
async function fetchUserData(userId) {
  try {
    const response = await fetch(`${BW_API}/users/${userId}`);
    if (!response.ok) throw new Error('Failed to fetch');
    return await response.json();
  } catch (error) {
    console.error('fetchUserData error:', error);
    throw error;
  }
}
```

## ⚠️ Known Issues

### Critical

1. **Facebook Integration Fragility**
   - **Issue:** DTSG token extraction relies on HTML structure
   - **Impact:** Extension breaks when Facebook updates

2. **Security: Password Reset**
   - **Issue:** No email verification required
   - **Impact:** Account takeover vulnerability

3. **CORS Configuration**
   - **Issue:** Backend allows all origins
   - **Impact:** Security vulnerability

### High Priority

4. **No Error Recovery**
   - **Issue:** Limited fallback mechanisms for failed operations
   - **Impact:** Poor user experience on errors

5. **Rate Limiting**
   - **Issue:** No rate limit handling for Facebook API
   - **Impact:** May get temporarily blocked

### Medium Priority

6. **Storage Quota**
   - **Issue:** No handling of storage quota exceeded
   - **Impact:** Data loss if quota reached

7. **Offline Support**
   - **Issue:** No offline functionality
   - **Impact:** Extension unusable without internet

8. **Browser Compatibility**
   - **Issue:** Manifest V3 only, not tested on Firefox
   - **Impact:** Firefox requires Manifest V2 or V3 compatibility layer
   - **Status:** Chrome/Edge only (Manifest V3 compatible browsers)
---

## 🗺️ Roadmap

### Phase 1: Stability & Security 
- [x] Document current architecture
- [ ] Fix critical security vulnerabilities
- [ ] Improve error handling
- [ ] Add comprehensive logging
- [ ] Obtain/recover original source code

### Phase 2: Modernization 
- [ ] Migrate to React + TypeScript
- [ ] Implement Vite build system
- [ ] Add automated testing
- [ ] Improve Facebook integration reliability

### Phase 3: Features 
- [ ] Advanced scheduling options
- [ ] Message analytics
- [ ] Image attachment support
- [ ] Multiple account support
- [ ] Dark mode

### Phase 4: Platform Expansion
- [ ] Firefox support (requires Manifest V2 compatibility)
- [ ] Safari support
- [ ] Mobile companion app

---

## 📚 Additional Resources

- **System Architecture:** See [../SYSTEM_ARCHITECTURE_ANALYSIS.md](../SYSTEM_ARCHITECTURE_ANALYSIS.md)
- **Backend Documentation:** See [../backend/README.md](../backend/README.md)
- **Chrome Extension Docs:** <https://developer.chrome.com/docs/extensions/>
- **Manifest V3 Guide:** <https://developer.chrome.com/docs/extensions/mv3/intro/>
- **Meta Developer Documentation:** <https://developers.facebook.com/docs/>
- **Semantic Versioning:** <https://semver.org/>

---

## 📄 License

**Status:** Legacy white-label product  
**License:** Proprietary (under re-engineering)

---

## 🙏 Acknowledgments

- Original white-label product authors
- Chrome Extension community
- Open source libraries used (jQuery, Bootstrap)

---

**Last Updated:** January 17, 2026  
**Maintainer:** Development Team  
**Status:** Active Development
