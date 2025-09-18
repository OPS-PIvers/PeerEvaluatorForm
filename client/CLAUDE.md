# CLAUDE.md - Client Directory

This document provides guidance for AI assistants working with the `client` directory of the Peer Evaluator Form application.

## Directory Overview

The `client` directory contains all the HTML templates that are served to the user's browser. These files represent the user interface (UI) of the application and are processed by Google Apps Script's `HtmlService`. They include a mix of HTML, CSS (within `<style>` tags), and client-side JavaScript (within `<script>` tags), along with Apps Script scriptlets (`<?= ... ?>`) for server-side data injection.

### Directory Structure

```
client/
├── CLAUDE.md                        # This file - client-specific guidance
├── peerevaluator/
│   └── filter-interface.html        # Main dashboard for special access roles
├── shared/
│   ├── error-page.html              # Error display template with debugging info
│   └── finalized-observation-email.html # Email template for finalized observations
└── staff/
    └── rubric.html                  # Read-only rubric view for standard users
```

### Key Characteristics

-   **Templated HTML:** Files use scriptlets to dynamically insert data from the server (Code.js).
-   **Single-Page Application (SPA) feel:** `filter-interface.html` acts as the main entry point for authenticated users, dynamically showing and hiding different views (e.g., filters, observation lists, rubric editor) without full page reloads.
-   **Client-Side Logic:** Significant JavaScript logic within `<script>` tags handles user interactions, makes asynchronous calls to the server using `google.script.run`, and manipulates the DOM.
-   **Shared CSS:** A comprehensive set of CSS rules is defined within `filter-interface.html` and `rubric.html` to maintain a consistent visual style across the application.

## File Breakdown

### `client/peerevaluator/filter-interface.html`

-   **Purpose:** This is the primary interface for the `Peer Evaluator` and other special roles. It serves as a dashboard and the entry point for starting or viewing observations.
-   **Functionality:**
    -   Displays a dashboard with quick actions.
    -   Provides filters to find staff by role, year, and name.
    -   Lists existing observations (drafts and finalized) for a selected staff member.
    -   Acts as the container for the interactive rubric editor, which is dynamically generated and injected into the `#rubricContainer` div.
    -   Contains a large, shared block of CSS that styles most of the application's components.
    -   Includes extensive client-side JavaScript for handling UI events, data loading, and communication with the server-side `Code.js` functions.

### `client/shared/error-page.html`

-   **Purpose:** A standardized, user-friendly error page.
-   **Functionality:**
    -   Displayed when a critical, unrecoverable error occurs in the `doGet` function.
    -   Uses scriptlets to display detailed error information (message, request ID, stack trace) for debugging purposes.

### `client/shared/finalized-observation-email.html`

-   **Purpose:** An HTML template for the email notification sent to a staff member when their observation is finalized.
-   **Functionality:**
    -   Dynamically includes the staff member's name and a link to the Google Drive folder containing the observation materials.
    -   Styled for a professional appearance in email clients.

### `client/staff/rubric.html`

-   **Purpose:** This template is used to display a **read-only** view of the rubric. It's the primary view for standard users (like `Teacher`) who are viewing their own assigned subdomains.
-   **Functionality:**
    -   Renders the complete Danielson Framework rubric, with domains and components.
    -   Dynamically highlights or hides components based on the user's role and assigned subdomains for the year.
    -   Includes a view-toggle button for users to switch between viewing only their "Assigned Areas" and the "Full Rubric".
    -   Contains client-side JavaScript for UI interactions like the view-toggle, domain navigation, and expanding/collapsing "look-for" sections.

## Development Guidelines

-   **Consolidate CSS:** When adding new UI elements, first check `filter-interface.html` for existing CSS classes that can be reused. Add new styles to the main `<style>` block in `filter-interface.html` to maintain a single source of truth for styling.
-   **Reuse JavaScript Functions:** The script in `filter-interface.html` contains many utility functions (e.g., `showLoading`, `showError`, `showToast`). Reuse these functions instead of creating new ones.
-   **Use `google.script.run`:** All communication with the server must go through the `google.script.run` API. Follow the existing pattern of using `.withSuccessHandler()` and `.withFailureHandler()` for asynchronous calls.
-   **Security:** Always use the server-provided `escapeHtml` function (or its client-side equivalent in the template) when rendering data from the server or user input to prevent XSS vulnerabilities.
