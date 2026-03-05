# Accessibility (A11y) Features Documentation

## Overview

The BirthdayMessaging extension has been enhanced with comprehensive accessibility features to ensure it's usable by everyone, including people with disabilities who use assistive technologies like screen readers, keyboard-only navigation, and other accessibility tools.

## Compliance

Our accessibility implementation follows:
- **WCAG 2.1 Level AA** guidelines
- **ARIA 1.2** specifications
- **Web Content Accessibility Guidelines** best practices
- **Chrome Extension Accessibility** guidelines

## Key Accessibility Features

### 1. Keyboard Navigation

#### Keyboard Shortcuts
- **Alt + H** - Navigate to home/main view
- **Alt + D** - Open dashboard (analytics view)
- **Alt + L** - Logout
- **Esc** - Return to main view

#### Tab Navigation
- All interactive elements are keyboard accessible via Tab/Shift+Tab
- Logical tab order follows visual layout
- Focus indicators clearly visible with orange outline (#f08500)

#### Skip Links
- "Skip to main content" link appears when Tab is pressed
- Allows keyboard users to bypass repetitive navigation

### 2. Screen Reader Support

#### ARIA Attributes
✅ Proper ARIA roles on all interactive elements
✅ `aria-label` for all buttons and inputs
✅ `aria-invalid` for form validation errors
✅ `aria-busy` for loading states (all async submit buttons)
✅ `aria-pressed` for toggle buttons
✅ `aria-describedby` linking inputs to error messages
✅ `aria-live` regions for dynamic content updates
✅ `role="tablist"` / `role="tab"` / `aria-selected` on tab navigation
✅ `role="tabpanel"` + `aria-labelledby` on active content panel
✅ `role="dialog"` + `aria-modal="true"` + `aria-labelledby` on overlay modals

#### Live Regions
- Toast notifications announced via `aria-live="polite"` or `aria-live="assertive"`
- Form validation errors announced immediately
- Loading states announced to screen readers
- Success/error messages announced automatically

#### Screen Reader Announcements
Utility function `announceToScreenReader()` used for:
- Navigation changes
- Form submissions
- Success/error messages
- State updates

`assertive` priority (errors) fires immediately. `polite` priority announcements are **debounced to 500 ms** to prevent flooding during rapid WebSocket updates.

### 3. Semantic HTML

#### Landmarks
- `<header role="banner">` - Extension header with logo
- `<main role="main">` - Main content area
- `<nav aria-label="Settings navigation">` - Settings navigation
- `<footer role="contentinfo">` - Footer with keyboard shortcuts
- `<section>` - Logical content sections

#### Headings Hierarchy
Proper heading structure (h1 → h2 → h3) for screen reader navigation

### 4. Form Accessibility

#### Input Labels
- All inputs have visible labels (not just placeholders)
- Labels properly associated with inputs
- Required fields marked with `aria-required="true"`

#### Error Handling
- Errors linked to inputs via `aria-describedby`
- Error messages have `role="alert"` for immediate announcement
- Visual and programmatic error indicators
- Descriptive error messages

#### Validation Feedback
- Real-time validation with `aria-invalid`
- Character count for textareas with `aria-live`
- Password strength indicators (register form)
- Clear success/error states

### 5. Visual Accessibility

#### Focus Indicators
```css
*:focus-visible {
  outline: 3px solid #f08500 !important;
  outline-offset: 2px !important;
}
```
- High contrast orange (#f08500) focus outlines
- Visible on all interactive elements
- 3px thick for visibility
- 2px offset for clarity

#### Color Contrast
- Text meets WCAG AA contrast ratios
- Error text: red (#c33) on light background
- Success text: green (#363) on light background
- Button text: white on orange gradient

#### Reduced Motion Support
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```
Respects user's motion preferences to prevent motion sickness

#### High Contrast Mode
```css
@media (prefers-contrast: high) {
  .card {
    border: 2px solid #000;
  }
  button {
    border: 2px solid #000 !important;
  }
}
```

### 6. Loading States

All loading states include:
- Visual spinner (custom GIF)
- `role="status"` on container
- `aria-busy="true"` on buttons
- Descriptive loading messages
- Screen reader announcement

Example:
```tsx
<div role="status" aria-live="polite">
  <Spinner size="lg" message="Initializing..." />
</div>
```

### 7. Error Boundaries

React ErrorBoundary component:
- Catches rendering errors
- Provides fallback UI
- Accessible error messages
- "Try Again" and "Reload Extension" buttons

## Component-Specific Features

### AuthForm
- ✅ Toggle buttons with `aria-pressed`
- ✅ Email validation with instant feedback
- ✅ Password requirements with live status
- ✅ Error messages linked via `aria-describedby`
- ✅ Disabled state with `aria-disabled`

### TemplateEditor
- ✅ Character counter with `aria-live`
- ✅ Validation feedback announced
- ✅ Descriptive labels for all fields
- ✅ Error messages with `role="alert"`

### MessageQueue & MessageHistory
- ✅ Real-time updates announced
- ✅ Confirmation dialogs for destructive actions
- ✅ Status badges with semantic colors
- ✅ Proper button labels

### Dashboard
- ✅ Statistics presented with proper labels
- ✅ Real-time updates announced
- ✅ Loading states properly communicated

### Toast Notifications
- ✅ `role="alert"` for immediate attention
- ✅ `aria-live="polite"` for non-critical messages
- ✅ Close button with `aria-label`
- ✅ Auto-dismiss with configurable duration

## Utility Functions

### `accessibility.ts` provides:

#### `announceToScreenReader(message, priority)`
Announce messages to screen readers via live region
```typescript
announceToScreenReader('Form submitted successfully', 'polite');
```

#### `getFocusableElements(container)`
Get all keyboard-focusable elements in a container

#### `trapFocus(container)`
Trap keyboard focus within a modal/dialog

#### `moveFocusTo(element)`
Move focus to element and scroll into view

#### `generateId(prefix)`
Generate unique IDs for ARIA relationships

#### `ariaBoolean(value)`
Convert boolean to ARIA string ("true"/"false")

#### `handleKeyboardNavigation(options)`
Keyboard navigation for lists/grids (Arrow keys, Home, End, Enter, Space, Escape)

#### `handleEscapeKey(callback)`
Simple Escape key handler for modals

#### `prefersReducedMotion()`
Check if user prefers reduced motion

## Testing Accessibility

### Manual Testing

#### Keyboard Navigation
1. Tab through all interactive elements
2. Ensure focus indicators are visible
3. Test keyboard shortcuts (Alt+H, Alt+D, Alt+L)
4. Navigate forms with Tab/Shift+Tab/Enter

#### Screen Reader Testing
- **NVDA** (Windows) - Free
- **JAWS** (Windows) - Commercial
- **VoiceOver** (Mac) - Built-in (Cmd+F5)
- **TalkBack** (Android) - Built-in

Test scenarios:
1. Form submission
2. Error handling
3. Navigation between views
4. Toast notifications
5. Loading states

#### Browser DevTools
- Chrome DevTools Lighthouse Accessibility audit
- Inspect ARIA attributes
- Check color contrast
- Test with browser zoom (200%, 400%)

### Automated Testing Tools

#### Browser Extensions
- **axe DevTools** - Comprehensive accessibility testing
- **WAVE** - Web accessibility evaluation tool
- **Accessibility Insights** - Microsoft's accessibility toolkit

#### Command Line
```bash
# Install pa11y
npm install -g pa11y

# Test the extension popup
pa11y http://localhost:3000
```

## Common Patterns

### Button with Loading State
```tsx
<button
  disabled={isLoading}
  aria-busy={ariaBoolean(isLoading)}
  aria-disabled={ariaBoolean(isLoading)}
>
  {isLoading && <Spinner size="sm" />}
  <span>{isLoading ? 'Loading...' : 'Submit'}</span>
</button>
```

### Input with Error
```tsx
const [errorId] = useState(() => generateId('error'));

<input
  aria-invalid={ariaBoolean(hasError)}
  aria-describedby={hasError ? errorId : undefined}
/>
{hasError && (
  <p id={errorId} role="alert">Error message</p>
)}
```

### Live Region for Dynamic Content
```tsx
<div aria-live="polite" aria-atomic="true">
  {message}
</div>
```

### Modal/Dialog
```tsx
useEffect(() => {
  const cleanup = trapFocus(dialogRef.current);
  return cleanup;
}, []);

<div role="dialog" aria-modal="true" aria-labelledby="dialog-title">
  <h2 id="dialog-title">Dialog Title</h2>
  {/* Dialog content */}
</div>
```

## Known Limitations

1. **Chrome Extension Sandbox**: Some ARIA features may have limited support
2. **Popup Size**: Fixed width (20rem) may not accommodate high zoom levels
3. **WebSocket Announcements**: May be verbose for heavy real-time updates

## Future Improvements

### Planned Enhancements
- [ ] Implement roving tabindex for template lists
- [ ] Add more keyboard shortcuts for common actions
- [ ] Improve mobile screen reader support
- [ ] Add voice control support
- [ ] Implement accessible drag-and-drop for template reordering
- [ ] Add customizable keyboard shortcuts
- [ ] Improve announcements for batch operations

### User Preferences
- [ ] Allow users to disable animations (beyond prefers-reduced-motion)
- [ ] Configurable keyboard shortcuts
- [ ] Adjustable focus indicator style
- [ ] Custom toast duration

## Resources

### Guidelines & Standards
- [WCAG 2.1](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [Chrome Extension Accessibility](https://developer.chrome.com/docs/extensions/mv3/a11y/)
- [WebAIM](https://webaim.org/)

### Testing Tools
- [Lighthouse](https://developers.google.com/web/tools/lighthouse)
- [axe DevTools](https://www.deque.com/axe/devtools/)
- [WAVE](https://wave.webaim.org/)
- [Pa11y](https://pa11y.org/)

### Screen Readers
- [NVDA Download](https://www.nvaccess.org/download/)
- [JAWS Trial](https://www.freedomscientific.com/products/software/jaws/)
- [VoiceOver Guide](https://www.apple.com/accessibility/voiceover/)

## Accessibility Statement

We are committed to ensuring digital accessibility for people with disabilities. We continually improve the user experience for everyone and apply relevant accessibility standards.

### Conformance Status
**Partially Conformant** - Some parts of the content do not fully conform to WCAG 2.1 Level AA.

### Feedback
If you encounter accessibility barriers, please contact us:
- Email: [Support email]

We welcome your feedback on the accessibility of this extension. Please let us know if you encounter accessibility barriers and we will work to address them.

---

**Last Updated**: February 23, 2026  
**Tested With**: NVDA 2024, Chrome 120, Keyboard-only navigation  
**Status**: ✅ Production Ready
