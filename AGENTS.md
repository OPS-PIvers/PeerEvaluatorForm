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
    -   **Data Storage for Observations:** `PropertiesService` is used as a key-value store (like a simple NoSQL database) to save observation records as JSON strings.
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
├─── .clasp.json              # Google Apps Script CLI configuration.
├─── .gitignore               # Standard git ignore file.
├─── appsscript.json          # GAS manifest: defines scopes, dependencies, and web app settings.
├─── AGENTS.md                # This file.
├─── CacheManager.js          # Manages advanced, versioned caching.
├─── Code.js                  # Main server-side entry point (doGet) and orchestrator.
├─── Constants.js             # Global constants (sheet names, roles, cache settings, etc.).
├─── error-page.html          # HTML template for displaying fatal errors.
├─── filter-interface.html    # HTML/JS for the filter view shown to special access roles.
├─── GEMINI.md                # Instructional context for the Gemini AI model.
├─── ObservationService.js    # Backend logic for managing observation records.
├─── rubric.html              # HTML/JS template for rendering the main evaluation rubric.
├─── SessionManager.js        # Handles user sessions and state change detection.
├─── SheetService.js          # Data access layer for all Google Sheets operations.
├─── Tests.js                 # Unit tests for utility functions.
├─── UserService.js           # Manages user authentication, role retrieval, and context creation.
├─── Utils.js                 # General utility and helper functions.
└─── ValidationService.js     # Handles data validation and system health checks.
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
-   `_getObservationsDb()`: Retrieves the entire observation "database" from `PropertiesService`.
-   `_saveObservationsDb(db)`: Saves the observation "database" back to `PropertiesService`.
-   `createNewObservation(...)`: Creates a new observation record.
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
-   **Observation Object:** The structure used to store observation data in `PropertiesService`. Includes observer/observed info, status, timestamps, and the actual observation data (`observationData` and `evidenceLinks`).
-   **Rubric Data Object:** The object returned by `getAllDomainsData()` and passed to the HTML templates. It contains the title, subtitle, and an array of `domains`, which in turn contain an array of `components`.

## 6. Deployment & Environment Setup

-   **Deployment:** The project is deployed as a Google Apps Script web app.
-   **Execution:** The web app is set to "Execute as: User accessing the web app". This is critical for security, as it ensures that API calls respect the permissions of the currently logged-in user.
-   **Access:** The web app is configured for "DOMAIN" access, meaning only users within the same Google Workspace domain can access it.
-   **Script Properties:** A crucial setup step is to set the `SHEET_ID` in the Script Properties. This tells the script which Google Sheet to use as its database.

## 7. Development Workflow & Coding Conventions

-   **Modularity:** Code is separated into "services" based on functionality (`UserService`, `SheetService`, etc.). `Code.js` acts as the main controller that orchestrates these services.
-   **Constants:** All hardcoded strings, sheet names, and configuration values should be defined in `Constants.js`.
-   **Caching:** All functions that read data from Google Sheets should be aggressively cached using the functions in `CacheManager.js` to ensure performance.
-   **Client-Server Communication:** Use `google.script.run` for all communication from the client (`.html` files) to the server (`.js` files).
-   **Error Handling:** Wrap potentially failing operations (especially API calls) in `try...catch` blocks. Use the `formatErrorMessage` utility for consistent error logging.
-   **Validation:** Use the functions in `ValidationService.js` to validate data and system health.
-   **Debugging:** Use the `debugLog()` utility for logging. The application supports a `?debug=true` URL parameter to enable more verbose logging and display a debug info panel on the UI.
