# AGENTS.md - Guide for AI Coding Agents

This document provides a comprehensive guide for AI agents, like Jules, to understand and work with the "Peer Evaluator Form" Google Apps Script project.

## 1. Project Overview

This is a Google Apps Script (GAS) web application that serves a dynamic, multi-role evaluation rubric based on the Danielson Framework for Teaching. The system is designed for an educational environment where staff members have different roles (e.g., Teacher, Administrator, Peer Evaluator) and require different views and permissions for evaluating or viewing evaluations of themselves and others.

The application's backend is powered by Google Sheets, which acts as a database for user roles, rubric content, and configuration settings. The frontend is rendered using HTML Service, with client-side interactions handled by JavaScript that communicates with the GAS backend.

A key feature is the **Peer Evaluation** system, which allows designated "Peer Evaluators" to conduct observations of other staff members, record proficiency levels against rubric components, upload evidence to Google Drive, and generate PDF summary reports.

## 2. Core Architecture & Key Features

The project follows a modular, service-oriented architecture.

-   **Backend Logic (Google Apps Script - `.js` files):**
    -   **Data Source:** Google Sheets is the primary data store.
        -   `Staff` sheet: Manages user identity, roles, and evaluation years.
        -   `Settings` sheet: Configures which rubric subdomains are assigned to which roles for specific years.
        -   **Role-specific sheets** (e.g., `Teacher`, `Nurse`): Contain the actual rubric content for each role.
    -   **Data Storage for Observations:** The `Observation_Data` sheet in the project's Google Sheet is used as the database to store observation records. Each row in the sheet represents a single observation.
    -   **File Storage:** Google Drive is used to store evidence files and generated PDF reports in a structured folder system.
-   **Frontend Logic (HTML Service - `.html` files):**
    -   The UI is built with standard HTML, CSS, and JavaScript.
    -   Client-side JavaScript communicates with the server-side GAS functions using `google.script.run`.
    -   The UI dynamically changes based on the user's role and actions (e.g., showing a filter view for admins, a rubric for teachers, or an observation editor for peer evaluators).
-   **Key Features:**
    -   **Multi-Role System:** Dynamically adapts the UI and data based on the user's role defined in the `Staff` sheet.
    -   **Special Access Roles:** `Administrator`, `Peer Evaluator`, and `Full Access` roles have special interfaces to filter and view data for other users.
    -   **Peer Observation Workflow:** A complete workflow for creating, editing, finalizing, and deleting peer observations.
    -   **Dynamic Rubric Rendering:** The rubric is generated based on the user's role and assigned subdomains for their specific evaluation year.
    -   **Advanced Caching:** A sophisticated, versioned caching system (`CacheManager.js`) using `CacheService` to minimize Google Sheets API calls and improve performance.
    -   **Automatic Change Detection:** An `onEdit` trigger automatically clears relevant caches when user roles or rubric content are modified in the Google Sheet, ensuring data consistency.
    -   **PDF Generation:** Converts finalized observations into styled PDF documents and saves them to Google Drive.

## 3. File Tree and Descriptions

```
/workspaces/PeerEvaluatorForm/
├─── AGENTS.md                          # This file - Comprehensive AI agent guide.
├─── CLAUDE.md                          # Instructional context for Claude AI.
├─── CacheManager.js                    # Advanced versioned caching system.
├─── Code.js                           # Main server-side entry point (doGet) and orchestrator.
├─── Constants.js                      # Global constants (sheet names, roles, cache settings, etc.).
├─── GEMINI.md                         # Instructional context for Gemini AI.
├─── ObservationService.js             # Backend logic for managing observation records.
├─── SessionManager.js                 # User sessions and state change detection.
├─── SheetService.js                   # Data access layer for all Google Sheets operations.
├─── UserService.js                    # User authentication, role retrieval, and context creation.
├─── Utils.js                          # General utility and helper functions.
├─── ValidationService.js              # Data validation and system health checks.
├─── appsscript.json                   # GAS manifest: scopes, dependencies, and web app settings.
├─── error-page.html                   # HTML template for displaying fatal errors.
├─── filter-interface.html             # HTML/JS for filter view (special access roles).
├─── finalized-observation-email.html  # HTML template for finalized observation emails.
├─── lookfors-todo.md                  # Development notes for look-fors functionality.
├─── observation-notes-todo.md         # Development notes for observation notes.
├─── pdf-rubric.html                   # HTML template for generating PDF reports.
├─── performance-todo.md               # Development notes for performance optimization.
└─── rubric.html                       # Main HTML/JS template for evaluation rubric interface.
```

## 4. Function Index by File

### `Code.js` (Orchestrator)
-   `doGet(e)`: **Primary entry point for the web app.** Determines user context and decides whether to show the rubric (`rubric.html`) or the filter interface (`filter-interface.html`).
-   `loadRubricData(filterParams)`: Server-side function called by the client to fetch data based on filters.
-   `getStaffListForDropdown(role, year)`: Fetches a list of staff members for the filter UI.
-   `getObservationOptions(observedEmail)`: Gets existing observations for a selected staff member.
-   `createNewObservationForPeerEvaluator(observedEmail)`: Creates a new observation draft.
-   `loadObservationForEditing(observationId)`: Loads an existing draft for editing.
-   `finalizeObservation(observationId)`: Marks an observation as "Finalized".
-   `deleteObservation(observationId)`: Deletes a "Draft" observation.
-   `exportObservationToPdf(observationId)`: Generates and saves a PDF report.
-   `onEditTrigger(e)`: The function executed by the `onEdit` trigger. Detects changes in the `Staff` sheet or rubric sheets and clears caches accordingly.

### `UserService.js`
-   `createUserContext(email)`: **Crucial function.** Creates a comprehensive context object for the current user, including their role, year, permissions, and any detected state changes.
-   `getUserByEmail(email)`: Retrieves a user's record from the `Staff` sheet.
-   `validateUserAccess(email)`: Validates if a user has access to the system.

### `SheetService.js`
-   `getStaffData()`: Reads and parses all user data from the `Staff` sheet.
-   `getSettingsData()`: Reads and parses the role-to-subdomain mappings from the `Settings` sheet.
-   `getRoleSheetData(roleName)`: Reads the entire content of a specific role's rubric sheet (e.g., `Teacher`).

### `ObservationService.js`
-   `_getObservationsDb()`: Retrieves all observation records from the `Observation_Data` sheet.
-   `_appendObservationToSheet(observation)`: Appends a new observation record to the `Observation_Data` sheet.
-   `createNewObservation(...)`: Creates a new observation record.
-   `saveLookForSelection(...)`: Saves the state of a "look-for" checkbox.
-   `getObservationById(observationId)`: Retrieves a single observation.
-   `updateObservationStatus(...)`: Changes an observation's status (e.g., to "Finalized").
-   `uploadMediaEvidence(...)`: Handles file uploads to Google Drive.

### `CacheManager.js`
-   `generateCacheKey(...)`: Creates a versioned key for caching.
-   `getCachedDataEnhanced(...)` / `setCachedDataEnhanced(...)`: Advanced get/set functions for the cache.
-   `incrementMasterCacheVersion()`: Invalidates all caches by changing the master version key.
-   `forceCleanAllCaches()`: Emergency function to clear all caches.

### `filter-interface.html` (Client-Side JS)
-   Contains the JavaScript logic for the dashboard/filter view presented to users with special access roles. It handles UI interactions for selecting roles, years, and staff members, and then calls the appropriate server-side functions.

### `rubric.html` (Client-Side JS)
-   Contains the JavaScript logic for rendering the main rubric interface. It handles toggling look-fors, switching between "full" and "assigned" views, and will handle the interactive rating selection.

## 5. Data Structures

-   **User Context Object:** The object returned by `createUserContext()` is central to the application. It contains everything the server and client need to know about the current user's session.
-   **Observation Object:** The structure used for an observation record, which is stored as a row in the `Observation_Data` sheet. It includes observer/observed info, status, timestamps, and the actual observation data (`observationData`, `evidenceLinks`, and `checkedLookFors`).
-   **Rubric Data Object:** The object returned by `getAllDomainsData()` and passed to the HTML templates. It contains the title, subtitle, and an array of `domains`, which in turn contain an array of `components`.

## 6. Deployment & Environment Setup

This section outlines the technical configuration of the Google Apps Script project, based on the `appsscript.json` manifest file.

-   **Deployment Model:** The project is deployed as a Google Apps Script web app.
-   **Execution (`executeAs`):** The web app is configured to run as **`USER_ACCESSING`**. This means that when the script accesses Google services (such as Sheets or Drive), it does so using the permissions of the user currently accessing the web app. This is critical for security, as it ensures that API calls respect the permissions of the currently logged-in user.
-   **Access (`access`):** The web app is configured for **`DOMAIN`** access, meaning only users within the same Google Workspace domain can access it.
-   **Runtime:** The project uses the modern **`V8`** runtime.
-   **Timezone:** The script's timezone is set to **`America/Chicago`**.
-   **Script Properties:** A crucial setup step is to set the `SHEET_ID` in the Script Properties. This tells the script which Google Sheet to use as its database.
-   **OAuth Scopes:** The script requires the following permissions to function correctly. These scopes are requested when a user first authorizes the application:
    -   `https://www.googleapis.com/auth/script.webapp.deploy`
    -   `https://www.googleapis.com/auth/spreadsheets`
    -   `https://www.googleapis.com/auth/userinfo.email`
    -   `https://www.googleapis.com/auth/script.scriptapp`
    -   `https://www.googleapis.com/auth/drive`
    -   `https://www.googleapis.com/auth/documents`

## 7. Development Workflow & Coding Conventions

-   **Modularity:** Code is separated into "services" based on functionality (`UserService`, `SheetService`, etc.). `Code.js` acts as the main controller that orchestrates these services.
-   **Constants:** All hardcoded strings, sheet names, and configuration values should be defined in `Constants.js`.
-   **Caching:** All functions that read data from Google Sheets should be aggressively cached using the functions in `CacheManager.js` to ensure performance.
-   **Client-Server Communication:** Use `google.script.run` for all communication from the client (`.html` files) to the server (`.js` files).
-   **Error Handling:** Wrap potentially failing operations (especially API calls) in `try...catch` blocks. Use the `formatErrorMessage` utility for consistent error logging.
-   **Validation:** Use the functions in `ValidationService.js` to validate data and system health.
-   **Debugging:** Use the `debugLog()` utility for logging. The application supports a `?debug=true` URL parameter to enable more verbose logging and display a debug info panel on the UI.

### 7.1 **MANDATORY: Existing Code Analysis Protocol**

**🚨 CRITICAL REQUIREMENT: Before implementing ANY new functionality, you MUST perform comprehensive analysis of existing code to prevent duplicates and conflicts.**

#### **Pre-Implementation Search Process**

Always perform these searches before adding new features:

```bash
# 1. Function name variations
grep -r "functionName\|function_name\|FunctionName" .

# 2. CSS classes and IDs
grep -r "\.class-name\|#element-id" .

# 3. HTML elements and event handlers  
grep -r "onclick.*function\|addEventListener\|onchange" .

# 4. Related keywords and comments
grep -ri "feature.*keyword\|todo.*feature\|fixme" .

# 5. Toggle/interaction functions (common pattern)
grep -r "toggle\|Toggle\|show\|hide\|expand" .
```

#### **Analysis Decision Framework**

For each piece of existing code discovered:

| **Code State** | **Required Action** | **Example** |
|---------------|-------------------|-------------|
| **✅ Complete & Working** | Extend/enhance existing code | Add new options to existing toggle function |
| **🟡 Partial Implementation** | Complete OR replace entirely | Found incomplete `toggleSection()` → finish it |
| **🔴 Broken/Incomplete** | Fix OR replace with working version | Buggy function → rewrite properly |
| **🔄 Duplicate Functions** | Consolidate into single implementation | 2+ functions doing same thing → merge |
| **❌ No Existing Code** | Safe to create new implementation | Confirmed no related functionality exists |

#### **Mandatory Cleanup Requirements**

When implementing new functionality, you **MUST**:

1. **🔍 REMOVE** all duplicate functions
2. **🧹 DELETE** unused CSS classes/styles
3. **🗑️ ELIMINATE** commented-out code blocks
4. **📝 UPDATE** related documentation and comments
5. **🎯 ENSURE** consistent naming conventions
6. **✅ VERIFY** no dead code remains

#### **Code Integration Best Practices**

**✅ CORRECT Approach:**
```javascript
// Single, comprehensive function handling all cases
function toggleSection(sectionType, elementId, options = {}) {
    // Centralized toggle logic for evidence, lookfors, etc.
    const element = document.getElementById(elementId);
    // ... complete implementation
}
```

**❌ INCORRECT Approach:**
```javascript  
// Multiple functions for similar purposes (AVOID THIS)
function toggleEvidence(id) { /* ... */ }
function toggleLookFors(id) { /* ... */ }
function toggleSection(id) { /* ... */ }  // Duplicate functionality!
```

#### **Real-World Case Study: Evidence Section Duplicate Function Issue**

**What Went Wrong:**
1. ❌ Failed to search for existing `toggleEvidenceSection()` function
2. ❌ Added complete new implementation alongside partial existing one  
3. ❌ Created conflicting, duplicate functionality
4. ❌ Left incomplete CSS and HTML structures

**What Should Have Happened:**
1. ✅ **Search**: `grep -r "toggleEvidence\|evidence.*section" .`
2. ✅ **Discovery**: Found existing incomplete function
3. ✅ **Analysis**: Determined function was partial implementation
4. ✅ **Decision**: Replace incomplete function entirely
5. ✅ **Implementation**: Single, complete function with all features
6. ✅ **Cleanup**: Remove old incomplete function
7. ✅ **Verification**: Confirm no duplicates remain

#### **Emergency Cleanup Protocol**

If you discover conflicting/duplicate code during development:

1. **🛑 STOP** current implementation immediately
2. **📋 INVENTORY** all related functions, CSS, and HTML
3. **🎯 CHOOSE** the most complete/correct implementation
4. **🗑️ REMOVE** all duplicates and incomplete versions
5. **🔧 CONSOLIDATE** functionality into single implementation  
6. **🧪 TEST** thoroughly to ensure functionality works
7. **📝 DOCUMENT** the cleanup process in commit messages

#### **Quality Assurance Checklist**

Before completing any feature implementation:

- [ ] **Searched for existing functionality using multiple patterns**
- [ ] **No duplicate functions exist in codebase**  
- [ ] **No unused CSS classes or styles remain**
- [ ] **No commented-out code blocks left behind**
- [ ] **All related functionality is consolidated**
- [ ] **Function names follow consistent conventions**
- [ ] **Documentation reflects current implementation**
- [ ] **All features tested and working correctly**
- [ ] **No JavaScript console errors present**

### 7.2 **Code Organization Standards**

-   **Service Pattern**: Group related functionality into service modules (`UserService.js`, `SheetService.js`, etc.)
-   **Single Responsibility**: Each function should have one clear purpose
-   **DRY Principle**: Don't Repeat Yourself - consolidate similar functionality
-   **Consistent Naming**: Use camelCase for functions, kebab-case for CSS classes
-   **Error Boundaries**: Always include proper error handling and fallbacks

### 7.3 **Performance Optimization**

-   **Cache First**: Check cache before making expensive operations
-   **Batch Operations**: Group similar API calls together when possible  
-   **Minimize DOM Queries**: Store element references when accessed multiple times
-   **Lazy Loading**: Initialize heavy components only when needed
-   **Memory Management**: Clean up event listeners and references

### 7.4 **Testing Requirements**

-   **Unit Testing**: Test individual functions in isolation
-   **Integration Testing**: Verify components work together correctly
-   **User Role Testing**: Test functionality across different user roles
-   **Cache Testing**: Verify caching system works correctly
-   **Error Path Testing**: Test error handling and edge cases

**Remember: Prevention of code duplication is infinitely better than cleanup after the fact. Always analyze before you implement.**
