# File Dependencies and Defensive Programming
## Peer Evaluator Form - Google Apps Script

**Last Updated:** 2025-11-12
**Purpose:** Documents cross-module dependencies and defensive programming patterns

---

## ⚠️ IMPORTANT: Google Apps Script Load Behavior

**Google Apps Script loads ALL files SIMULTANEOUSLY** - there is NO guaranteed sequential load order.

Files are NOT loaded alphabetically or in any predictable sequence. All `.gs` files in a project are loaded and executed in parallel when the script runs.

### Implications

1. **Cannot rely on file names** to control load order
2. **Cannot assume** one file loads before another
3. **Must use defensive programming** to handle dependencies
4. **Global variables/functions** may not be available when first accessed

### Solution: Defensive Programming

All cross-module dependencies use existence checks to handle simultaneous loading:

```javascript
// ✅ CORRECT: Check if constant exists before using
if (typeof RATE_LIMITS !== 'undefined' && RATE_LIMITS.someAction) {
  const limit = RATE_LIMITS.someAction.maxRequests;
}

// ✅ CORRECT: Check if function exists before calling
if (typeof auditLog === 'function') {
  auditLog(AUDIT_ACTIONS.SOME_ACTION, details);
}

// ❌ WRONG: Assume constant is available
const limit = RATE_LIMITS.someAction.maxRequests; // May throw ReferenceError

// ❌ WRONG: Assume function is available
auditLog(AUDIT_ACTIONS.SOME_ACTION, details); // May throw ReferenceError
```

---

## File Dependencies Map

### Constants.js
**Provides:**
- `SHEET_NAMES`
- `AVAILABLE_ROLES`
- `SPECIAL_ROLES`
- `RATE_LIMITS`
- `INPUT_LIMITS`
- `ALLOWED_EVIDENCE_PATTERNS`
- `CACHE_SALT_PROPERTY`
- `SECURITY_ADMIN_EMAIL_PROPERTY`

**Dependencies:** None ✅

---

### Utils.js
**Provides:**
- `escapeHtml()`
- `escapeHtmlSecure()`
- `sanitizeText()`
- `isValidEmail()`
- `checkRateLimit()`
- `validateInputLength()`
- `isValidDriveUrl()`
- `validateObservationData()`
- `getSecuritySalt()`
- `initializeSecuritySalt()`

**Dependencies:**
- Constants.js (for `RATE_LIMITS`, `INPUT_LIMITS`, etc.)
- AuditService.js (for `auditLog()` - optional, guarded)

**Notes:**
- `checkRateLimit()` calls `auditLog()` with existence check
- Can function without AuditService but with reduced functionality

---

### AuditService.js
**Provides:**
- `AUDIT_ACTIONS` (constants)
- `auditLog()`
- `setupSecurityAlerts()`
- `getUserAuditLogs()`
- `generateAuditReport()`

**Dependencies:**
- Constants.js (for `SECURITY_ADMIN_EMAIL_PROPERTY`)
- Utils.js (for `isValidEmail()`, `generateUniqueId()`)
- SessionManager.js (for `getUserSession()` - optional)

---

### CacheManager.js
**Provides:**
- `generateCacheKey()`
- `getCachedDataEnhanced()`
- `setCachedDataEnhanced()`
- `invalidateDependentCaches()`

**Dependencies:**
- Constants.js (for cache settings)
- Utils.js (for `getSecuritySalt()`, `debugLog()`)

---

### ObservationService.js
**Provides:**
- `getObservationById()` ← PUBLIC function (no underscore)
- `_getObservationsDb()` ← PRIVATE function (with underscore)
- `saveObservation()`
- `finalizeObservation()`
- `deleteObservation()`

**Dependencies:**
- Constants.js
- Utils.js
- SheetService.js

**IMPORTANT:**
- `getObservationById()` is the PUBLIC function (no security checks)
- `_getObservationsDb()` is PRIVATE (direct sheet access)

---

### ObservationSecurityService.js
**Provides:**
- `canAccessObservation()` ← Core authorization function
- `canEditObservation()`
- `canFinalizeObservation()`
- `canDeleteObservation()`
- `getObservationSecure()` ← Secure wrapper
- `getObservationsForUserSecure()`
- `validateObservationEmailRecipient()`

**Dependencies:**
- ObservationService.js (calls `getObservationById()` and `_getObservationsDb()`)
- AuditService.js (calls `auditLog()`)
- Utils.js (calls `checkRateLimit()`)
- UserService.js (calls `createUserContext()`)

**CRITICAL NOTES:**
- **Calls `getObservationById()`** (public function, NO underscore)
- **Calls `_getObservationsDb()`** (private function, WITH underscore)
- These are intentional cross-module dependencies for security layering
- Security service wraps data access layer with authorization

---

### UserService.js
**Provides:**
- `validateUserAccess()`
- `createUserContext()`
- `getUserByEmail()`

**Dependencies:**
- Constants.js
- Utils.js
- AuditService.js (calls `auditLog()`)
- SheetService.js

---

## File Listing

For reference, here are all server-side JavaScript files in the project:

```
📁 Project Files (alphabetical listing - NOT load order):
- AuditService.js
- CacheManager.js
- Code.js
- Constants.js
- ObservationSecurityService.js
- ObservationService.js
- PdfService.js
- SessionManager.js
- SheetService.js
- UiService.js
- UserService.js
- Utils.js
- ValidationService.js
```

**⚠️ IMPORTANT:** File alphabetical order is IRRELEVANT for load order! Google Apps Script loads all files simultaneously.

### Solution: Defensive Programming (CORRECT APPROACH)

Since Google Apps Script loads files simultaneously, we **CANNOT** control load order through file naming. The correct solution is defensive programming:

**✅ IMPLEMENTED PATTERN:** Existence checks before using cross-module dependencies

```javascript
// Pattern 1: Check constant exists before using
if (typeof RATE_LIMITS !== 'undefined' && RATE_LIMITS.someAction) {
  // Use RATE_LIMITS safely
}

// Pattern 2: Check function exists before calling
if (typeof auditLog === 'function') {
  auditLog(AUDIT_ACTIONS.SOME_ACTION, details);
}

// Pattern 3: Graceful degradation
const limit = (typeof RATE_LIMITS !== 'undefined' && RATE_LIMITS.someAction)
  ? RATE_LIMITS.someAction.maxRequests
  : 100; // fallback value
```

**Why this works:** Even though files load simultaneously, global constants and functions become available once their containing file finishes loading. Existence checks ensure we only use them when available.

---

## Dependency Guards (Defensive Programming)

### Pattern: Optional Dependencies

When calling functions that may not be loaded yet:

```javascript
// GOOD: Check existence before calling
if (typeof auditLog === 'function' && typeof AUDIT_ACTIONS !== 'undefined') {
  auditLog(AUDIT_ACTIONS.RATE_LIMIT_EXCEEDED, details);
}

// BAD: Assume function exists
auditLog(AUDIT_ACTIONS.RATE_LIMIT_EXCEEDED, details); // May throw ReferenceError
```

### Current Guarded Calls

1. **Utils.js line 1010:** `auditLog()` call guarded with existence check ✅
2. **More guards may be needed** as implementation evolves

---

## Testing Load Order

To verify correct load order:

```javascript
function testFileLoadOrder() {
  const requiredFunctions = [
    'escapeHtml',
    'auditLog',
    'checkRateLimit',
    'getObservationById',
    'canAccessObservation',
    'createUserContext'
  ];

  const requiredConstants = [
    'SHEET_NAMES',
    'RATE_LIMITS',
    'AUDIT_ACTIONS'
  ];

  console.log('=== Testing File Load Order ===');

  requiredFunctions.forEach(fname => {
    if (typeof this[fname] === 'function') {
      console.log(`✅ ${fname} loaded`);
    } else {
      console.error(`❌ ${fname} NOT loaded`);
    }
  });

  requiredConstants.forEach(cname => {
    if (typeof this[cname] !== 'undefined') {
      console.log(`✅ ${cname} defined`);
    } else {
      console.error(`❌ ${cname} NOT defined`);
    }
  });
}
```

---

## Troubleshooting

### Error: "ReferenceError: auditLog is not defined"
**Cause:** AuditService.js not loaded yet (simultaneous loading race condition)
**Solution:**
1. Verify AuditService.js exists in project
2. Check file is saved and deployed
3. **Always use existence guard:** `if (typeof auditLog === 'function')`
4. This is expected behavior - use defensive programming

### Error: "ReferenceError: RATE_LIMITS is not defined"
**Cause:** Constants.js not loaded yet (simultaneous loading race condition)
**Solution:**
1. Verify Constants.js exists in project
2. Ensure file is deployed
3. Check for syntax errors in Constants.js
4. **Always use existence guard:** `if (typeof RATE_LIMITS !== 'undefined')`
5. This is expected behavior - use defensive programming

### Error: "TypeError: getObservationById is not a function"
**Cause:** ObservationService.js not loaded
**Solution:**
1. Verify ObservationService.js exists
2. Check function name (should NOT have underscore)
3. Deploy all files

---

## Best Practices

### ✅ DO:
- Use existence checks for optional dependencies
- Document cross-module function calls
- Keep Constants.js simple and dependency-free
- Use descriptive function names to avoid conflicts

### ❌ DON'T:
- Create circular dependencies
- **Assume any specific load order** - files load simultaneously
- Use global variables without declaring them in Constants
- Call cross-module functions without existence checks
- **Rely on file naming to control load order** - it doesn't work

---

## Summary

**Load Behavior:** Google Apps Script loads ALL files SIMULTANEOUSLY - no guaranteed order

**Solution:** Defensive programming with existence checks

**Critical Dependencies:**
1. Constants.js → Provides constants used by all other files
2. Utils.js → Provides utility functions used by other files
3. AuditService.js → Provides audit logging (optional dependency)
4. ObservationService.js → Provides data access layer
5. ObservationSecurityService.js → Wraps data access with security checks

**Key Pattern:** All cross-module dependencies use `typeof` checks to verify availability before use.

**Key Takeaway:** The security architecture intentionally layers authorization (ObservationSecurityService) on top of data access (ObservationService). This is not a bug, it's a feature.

---

**Maintained By:** Development Team
**Review Frequency:** After any file additions or structural changes
