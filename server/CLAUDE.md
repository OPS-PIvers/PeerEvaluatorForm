# CLAUDE.md - Server Directory

This document provides guidance for AI assistants working with the `server` directory of the Peer Evaluator Form application.

## Directory Overview

The `server` directory contains all the server-side Google Apps Script (`.js`) files. This code runs on Google's servers and is responsible for all business logic, data access, and authentication. The files are organized into a modular, service-oriented architecture.

### Directory Structure

```
server/
├── 0_Constants.js                    # Global constants and configuration (loads first)
├── CLAUDE.md                        # This file - server-specific guidance
├── CacheManager.js                  # Advanced caching system with versioning
├── Code.js                          # Main orchestrator and entry point
├── ObservationService.js            # Manages peer evaluation observations
├── PdfService.js                    # PDF generation, styling, and Drive integration
├── SessionManager.js                # User sessions and state persistence
├── SheetService.js                  # Data access layer for Google Sheets
├── UiService.js                     # Server-side UI component generation and pages
├── UserService.js                   # User authentication and context creation
├── Utils.js                         # Utility functions and constants
└── ValidationService.js             # Data validation and error handling
```

## File Breakdown

### `Code.js`

-   **Purpose:** The main entry point and orchestrator of the application.
-   **Functionality:**
    -   Contains the `doGet(e)` function, which is the primary entry point for the web app.
    -   Handles initial user authentication and context creation.
    -   Serves the appropriate HTML template (`filter-interface.html` for special roles, `rubric.html` for others).
    -   Exposes server-side functions to be called from the client via `google.script.run`. These functions act as a bridge between the client-side UI and the backend services.
    -   Contains the `onEditTrigger` function to handle changes in the Google Sheet.

### `UserService.js`

-   **Purpose:** Manages user-related data and authentication.
-   **Functionality:**
    -   `getUserByEmail(email)`: Fetches a user's data (name, role, year) from the "Staff" sheet.
    -   `createUserContext()`: The most critical function in this file. It builds a comprehensive context object for the current user, including their role, permissions, assigned subdomains, and special access rights. It also detects role changes.
    -   `validateUserAccess(email)`: Checks if a user is listed in the "Staff" sheet and has a valid role.

### `SheetService.js`

-   **Purpose:** Acts as the data access layer for all interactions with the Google Sheet.
-   **Functionality:**
    -   `openSpreadsheet()`: Opens the Google Sheet using the ID from Script Properties.
    -   `getStaffData()`: Reads and parses all user data from the "Staff" sheet.
    -   `getSettingsData()`: Reads and parses the role-to-subdomain mappings from the "Settings" sheet.
    -   `getRoleSheetData(roleName)`: Reads the entire content of a specific role's rubric sheet (e.g., "Teacher", "Nurse").
    -   `setupObservationSheet()`: Ensures the `Observation_Data` sheet exists and has the correct headers.

### `ObservationService.js`

-   **Purpose:** Manages all logic related to peer evaluation observations.
-   **Functionality:**
    -   Stores and retrieves observation data from the "Observation_Data" sheet.
    -   `createNewObservation(...)`: Creates a new draft observation record.
    -   `getObservationById(id)`: Retrieves a single observation record.
    -   `saveProficiencySelection(...)`, `saveLookForSelection(...)`, `saveObservationNotes(...)`: Saves specific pieces of data for an observation.
    -   `finalizeObservation(id)`: Changes an observation's status to "Finalized", generates the PDF, and sends a notification email.
    -   `deleteObservationRecord(...)`: Deletes an observation record and its associated Drive folder.

### `CacheManager.js`

-   **Purpose:** Implements an advanced caching system to improve performance.
-   **Functionality:**
    -   `generateCacheKey(...)`: Creates versioned cache keys to ensure data freshness.
    -   `getCachedDataEnhanced(...)` / `setCachedDataEnhanced(...)`: Wrappers around `CacheService` that handle versioning and JSON serialization.
    -   `incrementMasterCacheVersion()`: A key function to invalidate all caches at once by changing the master version number. This is the primary mechanism for cache busting.
    -   `invalidateDependentCaches(...)`: (Future-facing) Logic to clear specific caches based on data dependencies.

### `SessionManager.js`

-   **Purpose:** Manages user sessions and detects changes in user state between visits.
-   **Functionality:**
    -   `detectUserStateChanges(...)`: Compares a user's current role and year against the previously stored state to detect changes.
    -   `storeUserState(...)`: Saves the user's current state (role, year) to `PropertiesService` for the next visit.
    -   This service is crucial for the automatic cache clearing when an admin changes a user's role in the "Staff" sheet.

### `ValidationService.js`

-   **Purpose:** Provides centralized data validation and system health checks.
-   **Functionality:**
    -   `validateRole(role)`: Checks if a role is valid, if its sheet exists, and if it has content.
    -   `validateUserData(user)`: Checks if a user object has a valid email, role, and year.
    -   `createEnhancedErrorPage(...)`: Generates the user-facing error page with debug information.

### `Utils.js`

-   **Purpose:** Contains shared utility functions used across multiple services.
-   **Functionality:**
    -   `escapeHtml(unsafe)`: Prevents XSS attacks.
    -   `generateUniqueId(prefix)`: Creates unique IDs for requests and sessions.
    -   `logPerformanceMetrics(...)`, `debugLog(...)`: Centralized logging functions.
    -   `getAssignedSubdomainsForRoleYear(...)`: A key utility that determines which subdomains a user should see based on their role and year, by looking up the data from `Settings`.

## Development Guidelines

-   **Maintain Modularity:** When adding new functionality, place it in the appropriate service file. For example, user-related logic goes in `UserService.js`, and sheet reading/writing goes in `SheetService.js`.
-   **Use Services:** Do not call `SpreadsheetApp` or `CacheService` directly from `Code.js`. Use the functions provided by `SheetService.js` and `CacheManager.js`.
-   **Centralize Constants:** All constants (sheet names, column numbers, error messages) should be defined in `0_Constants.js`.
-   **Cache Everything:** Any data read from the spreadsheet should be cached. Use the `getCachedDataEnhanced` and `setCachedDataEnhanced` functions from `CacheManager.js`.
-   **Handle Role Changes:** When data that affects user views is changed (e.g., the "Settings" sheet), ensure that the cache is properly invalidated, typically by calling `incrementMasterCacheVersion()`.
