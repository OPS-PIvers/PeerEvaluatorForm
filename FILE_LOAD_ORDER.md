# File Load Order and Dependencies
## Peer Evaluator Form - Google Apps Script

**Last Updated:** 2025-11-12
**Purpose:** Documents file loading order and cross-module dependencies

---

## Required Load Order

Google Apps Script loads files alphabetically by default. The security implementation requires certain files to be loaded before others to ensure functions are available when called.

### Critical Dependencies

```
1. server/0_Constants.js         ← Must load FIRST (defines all constants)
2. server/Utils.js              ← Must load SECOND (defines helper functions)
3. server/AuditService.js       ← Must load THIRD (defines auditLog())
4. server/CacheManager.js       ← Depends on: _Constants, Utils
5. server/ValidationService.js  ← Depends on: _Constants, Utils
6. server/UserService.js        ← Depends on: _Constants, Utils, AuditService
7. server/SessionManager.js     ← Depends on: UserService, CacheManager
8. server/SheetService.js       ← Depends on: _Constants, Utils
9. server/ObservationService.js ← Depends on: _Constants, Utils, SheetService
10. server/ObservationSecurityService.js ← Depends on: ObservationService, AuditService
11. server/PdfService.js        ← Depends on: _Constants, Utils
12. server/UiService.js         ← Depends on: _Constants, Utils
13. server/Code.js              ← Main orchestrator, depends on ALL above
```

---

## File Dependencies Map

### 0_Constants.js
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
- 0_Constants.js (for `RATE_LIMITS`, `INPUT_LIMITS`, etc.)
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
- 0_Constants.js (for `SECURITY_ADMIN_EMAIL_PROPERTY`)
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
- 0_Constants.js (for cache settings)
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
- 0_Constants.js
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
- 0_Constants.js
- Utils.js
- AuditService.js (calls `auditLog()`)
- SheetService.js

---

## Alphabetical Loading Considerations

Google Apps Script loads files alphabetically. The current file names ensure correct order:

```
✅ CORRECT ORDER (alphabetical):
- AuditService.js       (A)
- CacheManager.js       (C)
- Code.js               (C)
- 0_Constants.js         (_C)
- ObservationSecurityService.js (O)
- ObservationService.js (O)
- PdfService.js         (P)
- SessionManager.js     (S)
- SheetService.js       (S)
- UiService.js          (U)
- UserService.js        (U)
- Utils.js              (U)
- ValidationService.js  (V)
```

**✅ RESOLVED:** 0_Constants.js loads FIRST alphabetically (underscore sorts first)!

### Solution: Ensure 0_Constants.js loads first

**Option 1:** (IMPLEMENTED) Rename to ensure alphabetical precedence
- Renamed `Constants.js` to `0_Constants.js` (underscore sorts first) ✅
- Utils.js loads after 0_Constants.js (U > _C alphabetically)

**Option 2:** Rely on Apps Script's handling of dependencies
- Apps Script generally resolves dependencies correctly
- Constants are global and available once script initializes
- Not recommended for critical load order

**Option 3:** Explicit dependency management
- Use wrapper functions that check for constant availability
- Used as secondary defense (e.g., auditLog() existence checks)

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
**Cause:** AuditService.js not loaded or load order incorrect
**Solution:**
1. Verify AuditService.js exists in project
2. Check file is saved and deployed
3. Add existence guard: `if (typeof auditLog === 'function')`

### Error: "ReferenceError: RATE_LIMITS is not defined"
**Cause:** 0_Constants.js not loaded
**Solution:**
1. Verify 0_Constants.js exists (renamed from Constants.js)
2. Ensure file is deployed
3. Check for syntax errors in 0_Constants.js
4. Verify underscore prefix is present for alphabetical precedence

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
- Keep 0_Constants.js simple and dependency-free
- Use descriptive function names to avoid conflicts

### ❌ DON'T:
- Create circular dependencies
- Assume load order without testing
- Use global variables without declaring them in Constants
- Call functions without checking existence first (for optional deps)

---

## Summary

**Load Order:** Alphabetical by default, but Apps Script resolves most dependencies

**Critical Dependencies:**
1. 0_Constants.js → Everything depends on this (loads first alphabetically)
2. Utils.js → Core helpers, widely used
3. AuditService.js → Security logging
4. ObservationService.js → Data access layer
5. ObservationSecurityService.js → Security layer

**Key Takeaway:** The security architecture intentionally layers authorization (ObservationSecurityService) on top of data access (ObservationService). This is not a bug, it's a feature.

---

**Maintained By:** Development Team
**Review Frequency:** After any file additions or structural changes
