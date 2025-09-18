# Implementation Plan: Work Product Observation

## 1. Overview

This document outlines the implementation plan for the "Work Product" feature. This feature introduces a new type of observation, initiated by a Peer Evaluator, which allows a staff member to answer a set of reflective questions. These answers are then visible to the Peer Evaluator within their observation view for analysis and feedback.

The primary goals are:
- To introduce the "Work Product" functionality without disrupting the existing observation workflow.
- To ensure the user experience is intuitive for both Peer Evaluators and staff members.
- To maintain the stability and reliability of the application.

## 2. Success Criteria

- **For Peer Evaluators:**
  - When a Peer Evaluator selects a staff member, they see two buttons: "Create Observation" and "Create Work Product".
  - Admin users do not see the "Create Work Product" button.
  - Clicking "Create Work Product" initiates the standard observation creation flow.
  - When viewing a "Work Product" observation draft, the Peer Evaluator can see the staff member's answers to the questions dynamically load into the script editor.
- **For Staff Members:**
  - When a staff member opens a rubric that is part of a "Work Product" observation, they see a "Work Product Questions" button.
  - This button is not present for standard observations.
  - Clicking the button opens a modal with 5 questions and text input fields.
  - Text entered into the fields is auto-saved.
  - The staff member can open and close the modal to see their previously saved answers.
- **System Stability:**
  - The existing observation creation and viewing process is unaffected.
  - No data loss or corruption occurs.

## 3. Data Model Changes

To differentiate between a standard observation and a work product observation, a new column will be added to the primary data sheet (e.g., "Observations" sheet) in the Google Sheet.

- **Sheet:** `Observations` (or equivalent)
- **New Column:** `Type`
- **Values:**
  - `Standard` (for existing observations, this can be the default).
  - `Work Product` (for the new observation type).

A new sheet will also be created to store the answers to the work product questions.

- **New Sheet:** `WorkProductAnswers`
- **Columns:**
  - `ObservationID`: Foreign key linking to the `Observations` sheet.
  - `Question1_Answer`
  - `Question2_Answer`
  - `Question3_Answer`
  - `Question4_Answer`
  - `Question5_Answer`

## 4. Backend Implementation (Server-side)

### 4.1. `UserService.js`

- **Modify `getUserRole()` (or equivalent):** Ensure there is a clear way to identify a "Peer Evaluator". This might already exist. If not, logic will be added to determine the role based on user properties or a configuration sheet.

### 4.2. `ObservationService.js`

- **Modify `createObservation()`:**
  - Add a parameter `observationType` to the function.
  - When creating a new observation, set the `Type` column in the sheet based on this parameter. Default to `Standard` if not provided.
- **Create `createWorkProductObservation()`:**
  - This new function will call `createObservation()` with `observationType` set to `Work Product`.
- **Create `getObservationType(observationId)`:**
  - This function will retrieve the `Type` of an observation from the sheet.
- **Create `saveWorkProductAnswers(observationId, answers)`:**
  - This function will receive an object containing the answers to the 5 questions.
  - It will use `upsert` logic to save or update the answers in the `WorkProductAnswers` sheet for the given `observationId`.
- **Create `getWorkProductAnswers(observationId)`:**
  - This function will retrieve the answers for a given `observationId` from the `WorkProductAnswers` sheet.

### 4.3. `UiService.js` or `Code.js` (Entry Points)

- **Modify `getInitialViewForPeerEvaluator()` (or equivalent):**
  - After the user is identified as a "Peer Evaluator", the server-side logic will pass a flag or variable to the `filter-interface.html` template to indicate that the "Create Work Product" button should be rendered.
- **Modify `getRubricViewForStaff()` (or equivalent):**
  - When a staff member loads their rubric, this service will call `ObservationService.getObservationType()`.
  - It will pass a flag to the `rubric.html` template indicating whether the "Work Product Questions" button should be displayed.
- **Expose new server-side functions:** The new functions in `ObservationService` (`saveWorkProductAnswers`, `getWorkProductAnswers`) need to be exposed as endpoints that can be called from the client-side Javascript (e.g., using `google.script.run`).

## 5. Frontend Implementation (Client-side)

### 5.1. `client/peerevaluator/filter-interface.html`

- **Add "Create Work Product" Button:**
  - A new button will be added next to the "Create Observation" button.
  - It will be conditionally rendered based on the flag passed from `UiService.js`.
  - `onclick`, this button will call a new server-side function, e.g., `google.script.run.createWorkProductObservation(...)`.
- **Dynamic Loading of Answers:**
  - The Javascript in the observation/scripting view will be modified.
  - A function will be added that periodically calls `google.script.run.getWorkProductAnswers()`.
  - The retrieved answers will be formatted and displayed in a designated, non-editable area within the script editor. This provides the peer evaluator with the content to tag and analyze.

### 5.2. `client/staff/rubric.html`

- **Add "Work Product Questions" Button:**
  - A new button will be added to the top of the rubric page.
  - It will be conditionally rendered based on the flag passed from `UiService.js`.
- **Create Questions Modal:**
  - A modal dialog will be created, initially hidden.
  - The modal will contain:
    - A title: "Work Product Reflection Questions"
    - 5 questions (using placeholders for now):
      - `[Placeholder for Question 1]`
      - `[Placeholder for Question 2]`
      - `[Placeholder for Question 3]`
      - `[Placeholder for Question 4]`
      - `[Placeholder for Question 5]`
    - A multi-line text input field (`<textarea>`) for each question.
    - A "Close" button.
- **Auto-save Functionality:**
  - An `onkeyup` or `onblur` event listener will be attached to each textarea.
  - On event trigger, a Javascript function will be called that:
    1. Collects the current text from all 5 textareas into a Javascript object.
    2. Calls `google.script.run.saveWorkProductAnswers(observationId, answersObject)`.
    3. A small visual indicator (e.g., "Saving..." -> "Saved") will provide feedback to the user.
- **Loading Existing Answers:**
  - When the rubric page loads and the observation is a "Work Product" type, the client-side Javascript will call `google.script.run.getWorkProductAnswers()` and populate the textareas with the returned data.
