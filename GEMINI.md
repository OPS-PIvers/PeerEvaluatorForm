# Project Overview: Peer Evaluator Form

This document provides a comprehensive overview of the Peer Evaluator Form, a Google Apps Script (GAS) web application designed for professional evaluations and observations.

## 1. Core Purpose & Functionality

The application is a multi-role rubric and observation system. It allows users with a "Peer Evaluator" role to conduct formal observations of other staff members (e.g., Teachers), record notes, upload media evidence, and provide ratings against a predefined rubric. Staff members who are being observed can then view their finalized evaluations.

---

## 2. Roles & Permissions

The application has two primary user workflows based on roles defined in the `Staff` Google Sheet.

### a. Peer Evaluator (The Observer)
- **Permissions:** Full read/write access to the observation workflow.
- **Workflow:**
    1.  Uses filters to select a staff member to observe.
    2.  Views the **Observation Dashboard** for the selected user, which lists all past and in-progress observations.
    3.  Can **Begin a New Observation**, which creates a dedicated Google Drive folder and Notes document.
    4.  Can **Resume** an "In Progress" observation, loading the interactive rubric.
    5.  Within the rubric, they can:
        - Click cells to assign **ratings** (e.g., "Proficient", "Distinguished").
        - Expand sections to write detailed **notes**, which are saved to the Google Doc.
        - **Upload media files** (images, videos) as evidence, which are saved to the observation's Drive folder.
    6.  Progress is saved automatically and can be saved manually.
    7.  Once complete, they can **Finalize and Submit** the observation. This locks the record, sets its status to "Finalized", and generates a PDF summary in the Drive folder.
    8.  Can **Rename** or **Delete** observations they have created.

### b. Teacher / Staff (The Observee)
- **Permissions:** Read-only access.
- **Workflow:**
    1.  Upon loading the app, they see their personal **Observee Dashboard**.
    2.  This dashboard lists all of their observations that have been marked as **"Finalized"**.
    3.  They can click to **View** a finalized rubric. This view is **read-only**.
    4.  The view includes a link to the associated Google Drive folder to review any uploaded media.
    5.  If no finalized observations exist, they see the default, read-only rubric for their assigned role.

---

## 3. Technical Architecture & Key Files

### a. Development & Deployment
- **`clasp` is Essential:** All development and deployment is managed via `clasp`.
- **Pushing:** `clasp push` uploads the latest code files to the Apps Script project. This **does not** make the changes live for the web app.
- **Deploying:** `clasp deploy` creates a new, versioned deployment. This is the command that **makes changes live**.

### b. Key Files
- **`Code.js`**: The main server-side orchestrator. It handles the `doGet` request, manages user context, and exposes all necessary functions (e.g., `createObservation`, `getObservationDetails`) to the client-side `google.script.run` API. **Crucially, this file is the gatekeeper for role-based security, checking if the active user is a 'Peer Evaluator' before allowing any data modification.**
- **`SheetService.js`**: The data access layer. All interactions with Google Sheets (reading the `Staff` list, reading/writing to the `Observations` and `Ratings` sheets) and Google Drive (creating folders/docs, uploading files) are handled here.
- **`rubric.html`**: The complete Single-Page Application (SPA). It contains all the HTML, CSS, and client-side JavaScript for the entire user interface. It dynamically shows/hides the appropriate dashboards (`observation-dashboard`, `observee-dashboard`) or the interactive rubric (`rubric-container`) based on the user's role and actions.
- **`Constants.js`**: Stores global constants for the application, such as `SHEET_NAMES` and `OBSERVATION_STATUS` (`In Progress`, `Finalized`).
- **`Tests.js`**: Contains the test suite for the server-side logic. Tests are designed to be run from within the Apps Script Editor by selecting the test functions (e.g., `runObservationTests`) and clicking "Run".
- **`appsscript.json`**: The project manifest. Defines required Google services (Drive, Docs, Sheets) and OAuth scopes (permissions).
- **`rubric-pdf.html`**: A simplified HTML template used by `SheetService.js` to generate the final PDF report of an observation.