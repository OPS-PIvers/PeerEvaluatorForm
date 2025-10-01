Peer Evaluator Form - AI Context Engineering Documentation
This document provides a detailed breakdown of the files within the "Peer Evaluator Form" Google Apps Script project. The goal is to provide clear context for AI agents to understand the purpose, functionality, and user workflow associated with each file.

Workflows
The application is built around three primary user workflows, with some roles having overlapping responsibilities:

Staff Member: The standard user (e.g., Teacher, Nurse). They primarily view their own evaluation rubric and finalized observations.

Peer Evaluator: A user with special permissions to create, edit, manage, and finalize observations of other staff members.

Administrator: A user with high-level access to view staff and their summative evaluation status. They can also perform evaluations.

Full Access: A role with the combined permissions of a Peer Evaluator and Administrator.

Server-Side Logic (/server/)
These files contain the core backend logic, running on Google's servers.

server/Code.js
Description: This is the main orchestrator and primary entry point for the web application. It handles incoming web requests (doGet), manages user sessions, and exposes server-side functions that the client-side UI calls to fetch data or perform actions. It directs users to the correct interface based on their role and permissions.

Functionality:

Initial user authentication and routing.

Serves the main HTML interfaces.

Handles AJAX-like requests from the client for loading data, creating/saving observations, and triggering PDF generation.

Contains the onEditTrigger function that automatically responds to changes made in the backend Google Sheet.

Workflow: Administrator, Peer Evaluator, Staff Member

server/UserService.js
Description: Manages all user-related logic, including authentication, role retrieval, and building the user's context for a session. It is the source of truth for "who" the user is and "what" they are allowed to do.

Functionality:

Fetches user records (role, year, etc.) from the Staff sheet.

Creates a userContext object that defines the user's permissions and access level for the current session.

Validates if a user is authorized to access the application.

Workflow: Administrator, Peer Evaluator, Staff Member

server/SheetService.js
Description: The data access layer for all interactions with the backend Google Sheet. This service is responsible for reading and parsing data from various sheets like Staff, Settings, and the role-specific rubric sheets.

Functionality:

Reads user data from the Staff sheet.

Reads role-specific subdomain assignments from the Settings sheet.

Reads the rubric content from role-specific sheets (e.g., Teacher, Nurse).

Initializes and validates the structure of the Observation_Data sheet.

Workflow: Administrator, Peer Evaluator, Staff Member

server/ObservationService.js
Description: Manages the entire lifecycle of a peer observation. It handles creating, reading, updating, and deleting observation records, which are stored as individual rows in the Observation_Data sheet. It also manages associated files in Google Drive.

Functionality:

Creates new "Draft" observation records.

Saves proficiency scores, notes, and evidence links.

Handles file uploads to dedicated, private Google Drive folders.

Updates an observation's status (e.g., to "Finalized").

Manages the sharing of observation folders upon finalization.

Deletes observation records and their associated Drive folders.

Workflow: Peer Evaluator, Administrator

server/PdfService.js
Description: This service is dedicated to generating styled, professional PDF reports of finalized observations. It converts the observation data into a Google Doc with specific formatting and then saves it as a PDF.

Functionality:

Generates a styled PDF from an observation's data.

Saves the generated PDF to the correct observation folder in Google Drive.

Handles the regeneration of PDFs for already finalized observations.

Workflow: Peer Evaluator, Administrator

server/CacheManager.js
Description: Implements a sophisticated, versioned caching system to minimize direct calls to the Google Sheet, significantly improving performance. It ensures that the application uses fresh data without constantly re-fetching it.

Functionality:

Generates unique, versioned keys for cached data.

Stores and retrieves data from Google's CacheService.

Invalidates all caches by incrementing a master version number when data changes.

Detects data changes by comparing data hashes.

Workflow: Administrator, Peer Evaluator, Staff Member

server/SessionManager.js
Description: Manages user sessions and tracks changes to a user's state (like a role change) between visits. This is critical for automatically clearing a user's cache when their permissions are updated by an admin.

Functionality:

Creates and retrieves user sessions.

Stores a user's current state (role, year).

Detects differences between the current and stored state to identify role changes.

Workflow: Administrator, Peer Evaluator, Staff Member

server/UiService.js
Description: A server-side service responsible for generating and managing the user interface components and pages. It centralizes the logic for creating different views.

Functionality:

Creates the filter/dashboard interface for special access roles.

Generates user-friendly error pages with debugging information.

Determines the appropriate page title based on the user's role.

Workflow: Administrator, Peer Evaluator, Staff Member

server/Utils.js
Description: A collection of shared helper and utility functions used across various server-side modules. This file helps to keep the codebase DRY (Don't Repeat Yourself).

Functionality:

Data sanitization and HTML escaping.

Unique ID generation.

Performance logging and debugging tools.

Parsing and formatting data from the Google Sheet.

Workflow: Administrator, Peer Evaluator, Staff Member

server/ValidationService.js
Description: Provides centralized data validation and system health checks. It ensures that the data being used is in the correct format and that the system's configuration is valid.

Functionality:

Validates user roles and ensures their corresponding rubric sheets exist.

Checks the integrity of user data from the Staff sheet.

Performs system-wide configuration checks.

Workflow: Administrator, Peer Evaluator, Staff Member

Client-Side Interface (/client/)
These files are HTML templates that are rendered in the user's browser. They contain the UI structure, styling, and client-side JavaScript.

client/peerevaluator/filter-interface.html
Description: This is the main dashboard and interactive interface for users with special access, primarily the Peer Evaluator. It allows them to find staff members, manage observations, and launch the rubric editor.

Functionality:

Provides filters to search for staff by role, year, or name.

Displays lists of "Draft" and "Finalized" observations.

Contains the client-side JavaScript for handling all peer evaluation actions (creating, editing, deleting, finalizing observations).

Dynamically loads and renders the interactive rubric for editing.

Workflow: Peer Evaluator, Administrator

client/staff/rubric.html
Description: This template displays the read-only evaluation rubric for a standard Staff Member. It allows them to see their assigned subdomains for the year and view the full Danielson Framework.

Functionality:

Renders the complete rubric structure (domains and components).

Highlights the specific subdomains assigned to the user.

Allows the user to toggle between viewing only their "Assigned Areas" and the "Full Rubric".

Workflow: Staff Member

client/shared/error-page.html
Description: A standardized page for displaying critical, unrecoverable errors to the user.

Functionality:

Provides a user-friendly error message.

Includes detailed debugging information (error message, request ID, stack trace) to help developers diagnose issues.

Workflow: Administrator, Peer Evaluator, Staff Member

client/shared/finalized-observation-email.html
Description: An HTML template for the email notification that is automatically sent to a staff member once a peer observation has been finalized.

Functionality:

Dynamically inserts the staff member's name and a direct link to the Google Drive folder containing all observation materials.

Workflow: Peer Evaluator, Staff Member

Configuration & Meta Files
These files configure the project, guide AI agents, or support the development workflow.

appsscript.json
Description: The manifest file for the Google Apps Script project. It defines essential project settings, API permissions (OAuth scopes), and web app configurations.

Functionality:

Sets the timezone and runtime version (V8).

Specifies that the web app executes as the USER_ACCESSING it, ensuring security.

Lists all required Google service permissions (Drive, Docs, Sheets, etc.).

Workflow: Developer/System

.clasp.json
Description: The configuration file for clasp, the command-line tool for Google Apps Script. It links the local file directory to a specific Apps Script project on Google's servers.

Functionality:

Contains the scriptId that identifies the online project.

Defines the project's root directory.

Workflow: Developer/System

.claspignore & .gitignore
Description: These files tell clasp and git which files and folders to ignore when pushing code to Google's servers or to the GitHub repository, respectively.

Functionality:

Prevents documentation (.md), local settings (.vscode/), and repository files (.git/) from being deployed as part of the Apps Script project.

Workflow: Developer/System

.github/workflows/clasp-deploy.yml
Description: A GitHub Actions workflow that automates the deployment of the project.

Functionality:

Automatically runs when code is pushed to the main branch.

Uses clasp to push the latest code to the Google Apps Script project, deploying the changes.

Workflow: Developer/System

AGENTS.md, CLAUDE.md, GEMINI.md, audio_modal.md, .github/copilot-instructions.md
Description: These are documentation and instruction files specifically created to provide context and guidance for AI coding agents and developers. They explain the project's architecture, key features, and development conventions.

Functionality:

Streamlines development by providing a single source of truth about the project's structure and logic.

Helps AI assistants understand how to work with the code effectively.

Workflow: Developer/AI Agent