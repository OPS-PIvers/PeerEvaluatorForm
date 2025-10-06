# Style Cleanup Plan - Google Apps Script Edition

## ⚠️ IMPORTANT: GAS Constraints

**Google Apps Script does NOT support:**
- ❌ Separate `.css` files
- ❌ CSS imports (`@import`)
- ❌ External stylesheet linking (`<link rel="stylesheet">`)

**Google Apps Script REQUIRES:**
- ✅ All CSS in `<style>` tags within HTML files
- ✅ CSS variables defined in each HTML file's `<style>` block
- ✅ HTML template includes (via `<?!= HtmlService.createHtmlOutputFromFile() ?>`)

---

## Revised Strategy for GAS

### Solution: Shared HTML Include Pattern

Instead of a separate `.css` file, we'll use **GAS HTML includes**:

1. Create `client/shared/design-tokens.html` with just CSS variables in `<style>` tags
2. Include it in each main HTML file using GAS scriptlet syntax
3. All CSS variables available across all files

---

## Phase 1: Foundation & Audit (2-3 hours)

### Step 1.1: Pre-Cleanup Audit (Same as before)

**Tasks:**
1. Create comprehensive color inventory
2. Document all current visual properties
3. Take baseline screenshots of all views

**Success Criteria:**
- ✅ Baseline documentation complete
- ✅ Screenshots captured
- ✅ Color inventory created

---

### Step 1.2: Create Design Tokens HTML Include

**Create:** `client/shared/design-tokens.html`

**Content:**

```html
<!-- design-tokens.html -->
<!-- GAS-Compatible Design System CSS Variables -->
<!-- Include this file in other HTML templates using: <?!= include('client/shared/design-tokens'); ?> -->

<style>
:root {
    /* ============================================
       DESIGN SYSTEM v1.0 - CSS Variables
       ============================================ */

    /* Base Colors */
    --color-white: #ffffff;
    --color-black: #000000;

    /* Text Colors */
    --color-text-default: #333333;
    --color-text-light: #374151;
    --color-text-muted: #4a5568;
    --color-text-disabled: #9ca3af;
    --color-text-deemphasized: #718096;

    /* Background Colors */
    --color-bg-body: #f5f5f5;
    --color-bg-white: #ffffff;

    /* Green System (Success, Assignments) */
    --color-green-base: #10b981;
    --color-green-dark: #059669;
    --color-green-darker: #047857;
    --color-green-light: #34d399;
    --color-green-light-bg: #f0fdf4;
    --color-green-light-border: #d1fae5;

    /* Amber System (Warnings, Assigned Mode) */
    --color-amber-base: #f59e0b;
    --color-amber-dark: #d97706;
    --color-amber-darker: #b45309;
    --color-amber-light-bg: #fef3c7;
    --color-amber-light-border: #fde68a;
    --color-amber-text-dark: #92400e;

    /* Blue System (Primary Actions, Links) */
    --color-blue-base: #3b82f6;
    --color-blue-dark: #2563eb;
    --color-blue-darker: #1e40af;
    --color-blue-light: #60a5fa;
    --color-blue-light-bg: #dbeafe;
    --color-blue-lighter-bg: #eff6ff;
    --color-blue-light-border: #bfdbfe;
    --color-blue-text-dark: #1e40af;
    --color-blue-focus-shadow: rgba(59, 130, 246, 0.1);

    /* Red System (Errors, Destructive Actions) */
    --color-red-base: #dc2626;
    --color-red-dark: #b91c1c;
    --color-red-darker: #991b1b;
    --color-red-light: #ef4444;
    --color-red-light-bg: #fee2e2;
    --color-red-lighter-bg: #fef2f2;
    --color-red-light-border: #fecaca;

    /* Orange System (Warnings, Alerts) */
    --color-orange-base: #f97316;
    --color-orange-dark: #ea580c;
    --color-orange-darker: #c2410c;
    --color-orange-light-bg: #ffedd5;
    --color-orange-light-border: #fed7aa;

    /* Purple System (Special Features, Transcription) */
    --color-purple-base: #9f7aea;
    --color-purple-dark: #805ad5;
    --color-purple-darker: #6b46c1;
    --color-purple-light-bg: #f3e8ff;
    --color-purple-light-border: #e9d5ff;

    /* Gray System (Borders, Backgrounds, Disabled States) */
    --color-gray-50: #f9fafb;
    --color-gray-100: #f3f4f6;
    --color-gray-200: #e5e7eb;
    --color-gray-300: #d1d5db;
    --color-gray-400: #9ca3af;
    --color-gray-500: #6b7280;
    --color-gray-600: #4b5563;
    --color-gray-700: #374151;
    --color-gray-800: #1f2937;
    --color-gray-900: #111827;

    /* Semantic Gray Aliases (backward compatibility) */
    --color-gray-text: var(--color-gray-600);
    --color-gray-text-light: var(--color-gray-700);
    --color-gray-border-light: var(--color-gray-300);
    --color-gray-border-medium: var(--color-gray-200);
    --color-gray-bg-light: #f8fafc;
    --color-gray-bg-lighter: var(--color-gray-50);
    --color-gray-bg-medium: var(--color-gray-500);
    --color-gray-bg-dark: var(--color-gray-600);
    --color-gray-hover-bg: var(--color-gray-100);
    --color-gray-component-not-assigned-border: var(--color-gray-200);
    --color-gray-assignment-indicator-not-assigned-bg: var(--color-gray-200);

    /* Domain-Specific Colors */
    --color-domain-1: #7c9ac5;
    --color-domain-1-dark: #5a82b8;
    --color-domain-2: #8fbc8f;
    --color-domain-2-dark: #6a9d6a;
    --color-domain-3: #dda15e;
    --color-domain-3-dark: #bc6c25;
    --color-domain-4: #9f7aea;
    --color-domain-4-dark: #805ad5;

    /* Look-Fors Header Colors */
    --color-lookfors-header: var(--color-blue-base);
    --color-lookfors-header-dark: var(--color-blue-dark);

    /* Transcription Feature Colors */
    --color-transcribe-gradient-start: #667eea;
    --color-transcribe-gradient-end: #764ba2;
    --color-transcribe-gradient-hover-start: #7c8ef0;
    --color-transcribe-gradient-hover-end: #8a5db8;
    --color-transcribe-shadow: rgba(102, 126, 234, 0.4);
    --color-transcribe-shadow-active: rgba(102, 126, 234, 0.3);

    /* ============================================
       GRADIENTS
       ============================================ */

    --gradient-header: linear-gradient(135deg, var(--color-gray-600), var(--color-gray-800));
    --gradient-domain-1: linear-gradient(135deg, var(--color-domain-1), var(--color-domain-1-dark));
    --gradient-domain-2: linear-gradient(135deg, var(--color-domain-2), var(--color-domain-2-dark));
    --gradient-domain-3: linear-gradient(135deg, var(--color-domain-3), var(--color-domain-3-dark));
    --gradient-domain-4: linear-gradient(135deg, var(--color-domain-4), var(--color-domain-4-dark));
    --gradient-lookfors: linear-gradient(135deg, var(--color-lookfors-header), var(--color-lookfors-header-dark));
    --gradient-success: linear-gradient(135deg, var(--color-green-base), var(--color-green-dark));
    --gradient-warning: linear-gradient(135deg, var(--color-amber-base), var(--color-amber-dark));
    --gradient-error: linear-gradient(135deg, var(--color-red-base), var(--color-red-dark));
    --gradient-transcribe: linear-gradient(135deg, var(--color-transcribe-gradient-start), var(--color-transcribe-gradient-end));

    /* ============================================
       SHADOWS
       ============================================ */

    --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.05);
    --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.1);
    --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.15);
    --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.2);
    --shadow-xl: 0 20px 40px rgba(0, 0, 0, 0.25);
    --shadow-2xl: 0 25px 50px rgba(0, 0, 0, 0.3);

    /* Colored Shadows */
    --shadow-blue: 0 4px 12px rgba(59, 130, 246, 0.3);
    --shadow-green: 0 4px 12px rgba(16, 185, 129, 0.3);
    --shadow-amber: 0 4px 12px rgba(245, 158, 11, 0.3);
    --shadow-red: 0 4px 12px rgba(220, 38, 38, 0.3);
    --shadow-transcribe: 0 4px 12px var(--color-transcribe-shadow);

    /* ============================================
       BORDER RADIUS
       ============================================ */

    --radius-none: 0;
    --radius-sm: 4px;
    --radius-md: 8px;
    --radius-lg: 12px;
    --radius-xl: 16px;
    --radius-2xl: 20px;
    --radius-3xl: 24px;
    --radius-full: 50%;
    --radius-pill: 9999px;

    /* ============================================
       SPACING
       ============================================ */

    --spacing-xs: 4px;
    --spacing-sm: 8px;
    --spacing-md: 12px;
    --spacing-lg: 16px;
    --spacing-xl: 24px;
    --spacing-2xl: 32px;
    --spacing-3xl: 48px;

    /* ============================================
       TYPOGRAPHY
       ============================================ */

    --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    --font-mono: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
    --font-email: Arial, sans-serif;

    /* ============================================
       Z-INDEX SCALE
       ============================================ */

    --z-base: 0;
    --z-dropdown: 100;
    --z-sticky: 101;
    --z-overlay: 1000;
    --z-modal: 10000;
    --z-popover: 10001;
    --z-tooltip: 10002;
}
</style>
```

---

### Step 1.3: Update Code.js with Include Helper

**⚠️ CRITICAL: Add to `server/Code.js` (at the end of the file):**

```javascript
/**
 * Include helper for GAS HTML templates
 * Allows including HTML partials in other HTML files
 *
 * IMPORTANT: File paths in GAS are relative to project root
 * For subdirectories, use format: 'client/shared/design-tokens'
 * DO NOT use: './client/...' or '/client/...'
 *
 * Usage in HTML: <?!= include('client/shared/design-tokens'); ?>
 *
 * @param {string} filename - Path to HTML file (no .html extension)
 * @return {string} Content of the HTML file
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
```

**This is critical** - without this function, the include won't work!

**Note about file paths:**
- ✅ Correct: `include('client/shared/design-tokens')`
- ❌ Wrong: `include('./client/shared/design-tokens')`
- ❌ Wrong: `include('/client/shared/design-tokens')`

---

### Step 1.4: Set Up Testing Infrastructure (Same as before)

**Success Criteria:**
- ✅ `design-tokens.html` created
- ✅ `include()` function added to Code.js
- ✅ Testing checklist ready
- ✅ Baseline screenshots taken

---

## Phase 2: Core Files Unification (3-4 hours)

### Step 2.1: Update rubric.html

**Tasks:**

1. **Add design tokens include** at the top of `<head>`:
   ```html
   <!DOCTYPE html>
   <html>
   <head>
       <!-- Design System CSS Variables -->
       <?!= include('client/shared/design-tokens'); ?>

       <!-- Rest of your head content -->
       <meta charset="UTF-8">
       ...
   ```

2. **Remove duplicate :root variables** from existing `<style>` block:
   - Delete all the existing CSS variable definitions
   - Keep only component-specific styles

3. **Replace hardcoded colors** with CSS variables (same mapping as original plan)

4. **Test the include:**
   ```javascript
   // In browser console after page loads:
   console.log(getComputedStyle(document.documentElement).getPropertyValue('--color-blue-base'));
   // Should output: #3b82f6
   ```

**Example Before/After:**

**Before (rubric.html):**
```html
<head>
    <style>
        :root {
            /* Duplicate variables in every file! */
            --color-blue-base: #3b82f6;
            --color-green-base: #10b981;
            /* ... 20 more variables ... */
        }

        .domain-header {
            background: #7c9ac5; /* Hardcoded! */
        }
    </style>
</head>
```

**After (rubric.html):**
```html
<head>
    <!-- Shared design tokens -->
    <?!= include('client/shared/design-tokens'); ?>

    <style>
        /* No duplicate :root variables needed! */

        .domain-header {
            background: var(--color-domain-1); /* Using variable! */
        }
    </style>
</head>
```

**Testing:**
1. Deploy to GAS
2. Open rubric.html
3. Verify CSS variables work
4. Compare with baseline screenshots
5. Check browser console for errors

**Success Criteria:**
- ✅ Include works (variables available)
- ✅ No visual differences
- ✅ 95%+ variable usage
- ✅ No console errors

---

### Step 2.2: Update filter-interface.html

**Same process as rubric.html:**

1. Add include at top of `<head>`
2. Remove duplicate :root variables
3. Replace hardcoded colors
4. Test thoroughly

**Success Criteria:**
- ✅ Include works
- ✅ No visual differences
- ✅ All features work (modals, observation CRUD)
- ✅ 95%+ variable usage

---

### Step 2.3: Validate GAS Deployment

**Critical GAS-Specific Testing:**

1. **Push to GAS using clasp:**
   ```bash
   clasp push
   ```

2. **Verify in GAS Editor:**
   - Open script.google.com/home
   - Check that `design-tokens.html` is present
   - Check that `include()` function exists in Code.gs
   - Verify no syntax errors

3. **Deploy as web app:**
   - Deploy → Test deployments
   - Open in browser
   - Verify styles load correctly

4. **Check GAS logs:**
   ```javascript
   Logger.log('Design tokens included successfully');
   ```

**Common GAS Issues to Watch For:**

❌ **Include path wrong:**
```html
<!-- WRONG - will fail -->
<?!= include('client/shared/design-tokens.css'); ?>

<!-- CORRECT - no .html extension needed -->
<?!= include('client/shared/design-tokens'); ?>
```

❌ **Include function missing:**
```javascript
// Must be in Code.gs or Code.js
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
```

❌ **File not pushed to GAS:**
```bash
# Verify .clasp.json includes client/shared/
{
  "scriptId": "...",
  "rootDir": "./",
  "filePushOrder": ["client/**"]
}
```

**Success Criteria:**
- ✅ All files push to GAS successfully
- ✅ Include function works in deployed app
- ✅ Variables accessible in all views
- ✅ No GAS deployment errors

---

## Phase 3: Shared Files Integration (2-3 hours)

### Step 3.1: Update error-page.html

**Option A: Use Include (If error page is GAS-served)**

```html
<!DOCTYPE html>
<html>
<head>
    <?!= include('client/shared/design-tokens'); ?>
    <style>
        /* Error page specific styles */
    </style>
</head>
```

**Option B: Inline Fallback (If standalone)**

```html
<!DOCTYPE html>
<html>
<head>
    <style>
        /* Inline minimal design tokens for standalone use */
        :root {
            --color-red-base: #dc2626;
            --color-gray-50: #f9fafb;
            --color-gray-700: #374151;
            /* ... only what's needed for error page ... */
        }
    </style>
</head>
```

**Choose based on:** Does error page use `doGet()` or is it static?

---

### Step 3.2: Update email template

**Email templates CANNOT use GAS includes** (sent via email, not rendered by GAS)

**Solution: Inline everything**

```html
<!-- finalized-observation-email.html -->
<!DOCTYPE html>
<html>
<head>
    <style>
        /* Inline design tokens for email compatibility */
        /* Source: design-tokens.html (manually synced) */

        /* Only include what's used in email */
        body {
            font-family: Arial, sans-serif; /* Email-safe */
            color: #333333;
            background: #f9fafb;
        }

        .button {
            background: #3b82f6; /* Matches --color-blue-base */
            color: #ffffff;
            border-radius: 8px; /* Matches --radius-md */
        }

        /* etc... */
    </style>
</head>
```

**Maintenance Strategy:**
- Keep color values in comments: `/* --color-blue-base */`
- Update manually when design-tokens.html changes
- Use exact same hex values
- Document: "Synced with design-tokens.html v1.0"

---

### Step 3.3: Commit & Validate Phase 3

**GAS-Specific Validation:**

1. **Push to GAS:**
   ```bash
   clasp push
   ```

2. **Deploy and test:**
   - Test error page rendering
   - Send test observation email
   - Verify colors match main app

3. **Check GAS quotas:**
   - Ensure include() doesn't exceed execution limits
   - Check file size limits (each HTML < 50KB recommended)

**Success Criteria:**
- ✅ Error page uses design tokens
- ✅ Email colors match app (manual sync)
- ✅ All files under GAS size limits
- ✅ Include function performs well

---

## Phase 4: Validation & Documentation (1-2 hours)

### Step 4.1: GAS-Specific Performance Testing

**Test Include Performance:**

```javascript
// In Code.js - measure include performance
function testIncludePerformance() {
  const start = new Date().getTime();
  const tokens = include('client/shared/design-tokens');
  const end = new Date().getTime();

  Logger.log('Include time: ' + (end - start) + 'ms');
  Logger.log('Token size: ' + tokens.length + ' characters');

  return {
    time: end - start,
    size: tokens.length
  };
}
```

**Performance Targets:**
- Include execution: < 50ms
- Token file size: < 20KB
- Total HTML size: < 200KB per file

---

### Step 4.2: Create GAS-Specific Documentation

**Update DESIGN_SYSTEM.md with GAS section:**

```markdown
## Google Apps Script Implementation

### File Structure
```
client/
├── shared/
│   └── design-tokens.html      # CSS variables (included in other files)
├── staff/
│   └── rubric.html             # Includes design-tokens.html
└── peerevaluator/
    └── filter-interface.html   # Includes design-tokens.html

server/
└── Code.js                      # Contains include() helper function
```

### Including Design Tokens

**In any GAS HTML file:**
```html
<!DOCTYPE html>
<html>
<head>
    <!-- Include design tokens (GAS scriptlet) -->
    <?!= include('client/shared/design-tokens'); ?>

    <!-- Your page-specific styles -->
    <style>
        .my-component {
            color: var(--color-blue-base);
        }
    </style>
</head>
```

### Important GAS Constraints

1. **No separate .css files** - Use .html files with <style> tags
2. **No @import** - Use GAS include() function
3. **No external stylesheets** - Everything must be inline or included
4. **Email templates** - Must inline all styles (cannot use includes)

### Updating Design Tokens

1. Edit `client/shared/design-tokens.html`
2. Push to GAS: `clasp push`
3. Changes automatically apply to all files that include it
4. Manually sync email template colors (add comment with version)

### Performance Considerations

- Include executes server-side (fast, ~10-30ms)
- Token file is cached by browser
- Total overhead: minimal (~5-10KB per page)
```

---

### Step 4.3: Update .clasp.json

**⚠️ CRITICAL: Verify .clasp.json configuration:**

```json
{
  "scriptId": "YOUR_SCRIPT_ID",
  "rootDir": "",  // MUST be empty string "" NOT "./" or "."
  "scriptExtensions": [".js", ".gs"],
  "htmlExtensions": [".html"],
  "filePushOrder": [
    "server/Constants.js",
    "server/Utils.js",
    "server/Code.js",
    "client/shared/design-tokens.html",
    "client/**/*.html"
  ]
}
```

**Critical rootDir Configuration:**
- ✅ Correct: `"rootDir": ""`  (empty string)
- ❌ Wrong: `"rootDir": "./"` (causes path issues)
- ❌ Wrong: `"rootDir": "."` (causes path issues)

**Why this matters:** GAS file paths are relative to the project root. An empty string ensures correct path resolution for subdirectories.

**Important:** Design tokens should push BEFORE other HTML files that depend on it.

---

### Step 4.4: Final GAS Deployment Checklist

**Pre-Deployment:**
- [ ] `design-tokens.html` created
- [ ] `include()` function in Code.js
- [ ] All HTML files updated with include
- [ ] .clasp.json includes design-tokens.html
- [ ] Local testing complete

**Deployment:**
- [ ] `clasp push` successful
- [ ] Files visible in GAS editor
- [ ] No syntax errors in GAS
- [ ] Web app redeployed
- [ ] Test deployment URL works

**Post-Deployment:**
- [ ] All views render correctly
- [ ] CSS variables work in all files
- [ ] No console errors
- [ ] Performance acceptable
- [ ] Email template colors match

---

## GAS-Specific Troubleshooting

### Issue: Include not working

**Symptoms:** CSS variables undefined, styles broken

**Solutions:**
1. Check `include()` function exists in Code.js
2. Verify file path: `'client/shared/design-tokens'` (no .html)
3. Check file pushed to GAS: Look in script.google.com editor
4. Verify scriptlet syntax: `<?!= include(...) ?>` (note the `!`)

### Issue: File not pushing to GAS

**Symptoms:** design-tokens.html not in GAS editor

**Solutions:**
1. Check `.claspignore` doesn't exclude it
2. Verify `.clasp.json` rootDir is correct (should be empty string "" for project root)
3. Try explicit push: `clasp push -f`
4. Check GAS quotas (files limit: 100)
5. **IMPORTANT:** In GAS editor, subdirectory files appear as flat names like `client_shared_design-tokens` (underscores replace slashes), but in code you still use `client/shared/design-tokens`

### Issue: Styles not applying

**Symptoms:** Variables defined but not working

**Solutions:**
1. Check include is in `<head>`, not `<body>`
2. Verify `<style>` tag inside design-tokens.html
3. Check browser console for CSS syntax errors
4. Test: `getComputedStyle(document.documentElement).getPropertyValue('--color-blue-base')`

### Issue: Email template broken

**Symptoms:** Email doesn't match design

**Solutions:**
1. Email templates CANNOT use includes
2. Must inline all styles manually
3. Copy exact hex values from design-tokens.html
4. Test in Gmail/Outlook, not just preview

---

## Key Differences from Original Plan

| Original Plan | GAS-Compliant Plan |
|---------------|-------------------|
| Create `.css` file | Create `.html` file with `<style>` tag |
| Use `<link rel="stylesheet">` | Use `<?!= include('...') ?>` |
| CSS imports with `@import` | GAS server-side includes |
| Separate file for tokens | HTML file with style block |
| Build script for compilation | Manual sync for email templates |

---

## Final Validation

### GAS Deployment Test Script

**Run in GAS editor:**

```javascript
function validateDesignSystem() {
  // Test include function
  try {
    const tokens = include('client/shared/design-tokens');
    Logger.log('✅ Include works, size: ' + tokens.length);
  } catch (e) {
    Logger.log('❌ Include failed: ' + e.message);
    return;
  }

  // Test variables present
  if (tokens.indexOf('--color-blue-base') > -1) {
    Logger.log('✅ Variables found in tokens');
  } else {
    Logger.log('❌ Variables missing');
  }

  // Test file structure
  const html = HtmlService.createTemplateFromFile('client/staff/rubric');
  const output = html.evaluate().getContent();

  if (output.indexOf('--color-blue-base') > -1) {
    Logger.log('✅ Variables included in rubric.html');
  } else {
    Logger.log('❌ Variables not included in rubric.html');
  }

  Logger.log('Validation complete');
}
```

---

## Success Metrics (GAS-Adjusted)

| Metric | Target | Measurement |
|--------|--------|-------------|
| CSS variable usage | 95%+ | Count var() vs hex in rendered HTML |
| Hardcoded colors | <20 | Grep for #[0-9a-f]{3,6} in HTML files |
| Include performance | <50ms | Log execution time |
| File size | <50KB | Check design-tokens.html size |
| GAS deployment | Success | clasp push without errors |
| Browser rendering | Identical | Screenshot comparison |

---

## Updated Timeline

| Phase | Duration | GAS-Specific Tasks |
|-------|----------|-------------------|
| Phase 1 | 2-3 hours | Create design-tokens.html, add include() |
| Phase 2 | 3-4 hours | Update HTML files with includes, test GAS deployment |
| Phase 3 | 2-3 hours | Handle error page & email (inline approach) |
| Phase 4 | 1-2 hours | GAS-specific validation, documentation |
| **Total** | **8-12 hours** | Same as original |

---

## Quick Start (GAS-Compliant)

1. ✅ Create `client/shared/design-tokens.html` (HTML file, not CSS!)
2. ✅ Add `include()` function to `server/Code.js`
3. ✅ Update HTML files to include tokens: `<?!= include('client/shared/design-tokens'); ?>`
4. ✅ Remove duplicate :root variables from each HTML file
5. ✅ Replace hardcoded colors with variables
6. ✅ Test locally, then `clasp push`
7. ✅ Deploy and validate in GAS

---

## Critical GAS Gotchas

⚠️ **File Extension:** Use `.html` not `.css`
⚠️ **Include Syntax:** `<?!= ... ?>` not `<?= ... ?>`
⚠️ **File Path:** No extension in include path
⚠️ **Email Templates:** Cannot use includes, must inline
⚠️ **Push Order:** design-tokens.html must push before files that use it
⚠️ **Deployment:** Must redeploy web app after pushing changes

---

**This plan is 100% Google Apps Script compliant!** 🚀

No separate .css files, no external stylesheets, only GAS-native HTML includes with server-side scriptlets.
