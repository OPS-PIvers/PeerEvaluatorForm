# Strategic Plan: Web App Performance Optimization

This document outlines a detailed, multi-faceted plan to significantly improve the performance, speed, and user experience of the Peer Evaluator Google Apps Script web app. The goal is to transform the application to feel as responsive and modern as possible within the Apps Script environment.

## Guiding Principles

1.  **Reduce Server Calls:** Every call to a Google service (`SpreadsheetApp`, `CacheService`, etc.) is a network request and adds latency. We must minimize these calls.
2.  **Embrace the Client:** The user's browser is a powerful computer. Offload as much logic and rendering to the client as possible.
3.  **Perception is Reality:** The app should *feel* fast. Use modern UX patterns like loading indicators and optimistic updates to manage perceived latency.
4.  **Batch and Defer:** Read data in large, infrequent batches. Write data by collecting (deferring) changes and sending them as a single batch.

---

## Phase 1: Backend & Caching Overhaul (The Foundation)

This phase focuses on optimizing how data is retrieved and managed on the server side. These changes will provide the biggest initial performance boosts.

### 1.1. Implement a Multi-Layered Caching Strategy

**Problem:** The current caching is good but can be made more granular and intelligent.

**Solution:**

*   **Static Data Cache (Long-lived):** The structure of the rubrics (the components, proficiency descriptions, look-fors) rarely changes. This data should be cached for the maximum duration (6 hours).
*   **Dynamic Data Cache (Short-lived):** Data like observation records, which can be updated, should be cached for a shorter duration (e.g., 5-15 minutes).
*   **User-Specific Cache:** Cache data specific to a user (like their assigned subdomains) with a key that includes their email.
*   **Action:** Review every `CacheService.getScriptCache()` call. Create a centralized cache management utility (e.g., in `CacheManager.js`) that handles setting and getting data with appropriate TTLs (Time To Live) based on the data type.

### 1.2. Drastically Reduce `SpreadsheetApp` Calls

**Problem:** The code frequently reads from the spreadsheet, often one piece of data at a time. This is the single largest performance bottleneck in most Apps Script projects.

**Solution:**

*   **Read Once, Work in Memory:** Instead of getting individual rows or cells, modify functions like `_getObservationsDb` and `getStaffData` to read the *entire* sheet (`sheet.getDataRange().getValues()`) into a variable once. Then, perform all filtering, searching, and data manipulation on this in-memory JavaScript array.
*   **Cache the Full Dataset:** Store the entire sheet's content (the array of values) in the cache. Subsequent requests for data from that sheet should hit the cache first, avoiding any `SpreadsheetApp` calls altogether.
*   **Batch Writes:** Instead of writing a single cell change immediately (`saveProficiencySelection`, `saveNotes`), these changes should be queued on the client side and sent to the server in a single, batched request.

    *   **Proposed Workflow:**
        1.  Client-side JS stores changes in a local object (e.g., `let pendingChanges = {}`).
        2.  A "Save" button or an auto-save mechanism (triggered by `window.onbeforeunload` or a timer) sends the entire `pendingChanges` object to a single new server function (e.g., `saveAllObservationChanges(observationId, changes)`).
        3.  This server function then iterates through the changes and updates the Google Sheet in a single batch operation, which is much more efficient.

---

## Phase 2: Client-Side Architecture Refactor (The Modern UX)

This phase focuses on changing the rendering model to create a Single-Page Application (SPA)-like experience.

### 2.1. Adopt a Client-Side Rendering Model

**Problem:** The app is rendered on the server using scriptlets (`<?= ... ?>`). Every significant state change (like selecting a user to observe) requires a full page reload, which is slow and feels dated.

**Solution:**

1.  **Serve a Minimal HTML Shell:** The `doGet` function should return a very lightweight `index.html` file. This file should contain the basic page structure (header, footer, main content area) and all necessary CSS and JavaScript links, but no actual rubric data.
2.  **Fetch Data Asynchronously:** Once the shell loads, client-side JavaScript will make a call to a new server function (e.g., `getInitialAppData()`).
3.  **Return Pure JSON:** This server function will return all necessary data (user context, rubric structure, observation data) as a single JSON object. It will leverage the optimized caching and data access methods from Phase 1.
4.  **Render with JavaScript:** The client-side JavaScript will take this JSON object and dynamically build the HTML for the rubric, notes sections, and other components. This eliminates server-side rendering loops and makes the initial load feel much faster.

### 2.2. Implement UI State Management

**Problem:** With client-side rendering, we need a structured way to manage the application's state (current user, selected observation, etc.) in JavaScript.

**Solution:**

*   Create a global state object in your client-side JavaScript (e.g., `const AppState = { ... };`).
*   All user interactions (selecting a proficiency, typing notes) will update this state object first.
*   A dedicated `render()` function will be responsible for updating the DOM whenever the `AppState` changes. This ensures the UI is always a reflection of the current state.
*   This makes transitions between different views (e.g., from the staff selection list to the observation editor) instantaneous, as they only involve a re-render on the client, not a full page reload.

---

## Phase 3: Perceived Performance & UX Polish

This phase focuses on making the application *feel* fast and responsive, even during unavoidable waits.

### 3.1. Implement Universal Loading Indicators

**Problem:** When the app is waiting for the server, the UI can feel frozen and unresponsive.

**Solution:**

*   **Initial Load:** Display a full-page loading spinner or a "skeleton screen" (gray placeholder boxes that mimic the layout) while the initial data is being fetched.
*   **Async Actions:** Whenever a `google.script.run` call is made, show a smaller, more localized loading indicator. For example, when saving notes, a small spinner could appear on the "Save" button.
*   **Action:** Create a CSS class for loading spinners and skeleton loaders. Write JavaScript helper functions (`showLoading()`, `hideLoading()`) to easily toggle their visibility before and after server calls.

### 3.2. Use Optimistic UI Updates

**Problem:** Waiting for server confirmation after every small action (like checking a box) makes the UI feel sluggish.

**Solution:**

*   When a user performs a simple action (e.g., selecting a proficiency level), update the UI *immediately* as if the action has already succeeded.
*   Send the update to the server in the background.
*   If the server returns an error, *then* revert the UI change and show an error message (e.g., a toast notification). For the vast majority of successful requests, the user experiences an instantaneous interaction.

### 3.3. Debounce and Throttle User Input

**Problem:** Rapidly firing events (like typing in the notes editor) can overwhelm the server with save requests.

**Solution:**

*   **Debounce:** For actions like saving notes, use a debounce function. This ensures the `saveNotes` function is only called once the user has *stopped* typing for a set period (e.g., 1.5 seconds). This was proposed in the notes plan and should be adopted as a general strategy.
*   **Throttle:** For events that fire continuously (like scrolling, if we were to add scroll-based actions), use a throttle function to ensure the event handler is only executed once every X milliseconds.

By implementing these three phases, the web app will move from a traditional, server-rendered model to a modern, client-centric application that is faster, more responsive, and provides a significantly improved user experience.
