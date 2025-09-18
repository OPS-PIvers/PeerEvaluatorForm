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

To support this in a scalable way, two new sheets will be created: one for the questions and one for the answers. This normalized approach allows for adding, removing, or reordering questions without code changes.

- **New Sheet 1: `WorkProductQuestions`**
  - **Purpose:** Stores the questions themselves.
  - **Columns:**
    - `QuestionID` (Primary Key, e.g., `WPQ1`)
    - `QuestionText` (e.g., "What was the goal of the work product?")
    - `Order` (A number to determine the display order, e.g., `1`)

- **New Sheet 2: `WorkProductAnswers`**
  - **Purpose:** Stores the staff members' answers.
  - **Columns:**
    - `AnswerID` (Primary Key, e.g., a UUID)
    - `ObservationID` (Foreign Key to the `Observations` sheet)
    - `QuestionID` (Foreign Key to the `WorkProductQuestions` sheet)
    - `AnswerText` (The staff member's response)

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
- **Create `getWorkProductQuestions()`:**
  - This new function will retrieve all questions from the `WorkProductQuestions` sheet, ordered by the `Order` column.
- **Create `saveWorkProductAnswer(observationId, questionId, answerText)`:**
  - This function will receive the text for a single answer.
  - It will use `upsert` logic to find a row where `ObservationID` and `QuestionID` match, and update the `AnswerText`. If no match is found, it will create a new row.
- **Create `getWorkProductAnswers(observationId)`:**
  - This function will retrieve all answers for a given `observationId` from the `WorkProductAnswers` sheet. It will return a list of objects, each containing `QuestionID` and `AnswerText`.

### 4.3. `UiService.js` or `Code.js` (Entry Points)

- **Modify `getInitialViewForPeerEvaluator()` (or equivalent):**
  - After the user is identified as a "Peer Evaluator", the server-side logic will pass a flag or variable to the `filter-interface.html` template to indicate that the "Create Work Product" button should be rendered.
- **Modify `getRubricViewForStaff()` (or equivalent):**
  - When a staff member loads their rubric, this service will call `ObservationService.getObservationType()`.
  - It will pass a flag to the `rubric.html` template indicating whether the "Work Product Questions" button should be displayed.
- **Expose new server-side functions:** The new functions in `ObservationService` (`saveWorkProductAnswers`, `getWorkProductAnswers`) need to be exposed as endpoints that can be called from the client-side Javascript (e.g., using `google.script.run`).

## 5. Frontend Implementation (Client-side)

### 5.1. `filter-interface.html`

- **Add "Create Work Product" Button:**
  - A new button will be added next to the "Create Observation" button.
  - It will be conditionally rendered based on the flag passed from `UiService.js`.
  - `onclick`, this button will call a new server-side function, e.g., `google.script.run.createWorkProductObservation(...)`.
- **Dynamic Loading of Answers:**
  - To avoid excessive server calls and potential quota issues with Google Apps Script, a manual refresh approach is recommended.
  - A "Refresh Answers" button will be added to the Peer Evaluator's observation view.
  - Clicking this button will call `google.script.run.getWorkProductAnswers()` to fetch the latest answers.
  - The retrieved answers will be formatted and displayed in a designated, non-editable area within the script editor.
  - *Alternative:* If polling is a requirement, it should use a long interval (e.g., 30-60 seconds) to minimize load.

### 5.2. `rubric.html`

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
  - To prevent an excessive number of server calls on each keystroke, the auto-save function will be "debounced".
  - An `oninput` event listener will be attached to each textarea.
  - This listener will trigger a debounced function that waits for the user to stop typing for a short period (e.g., 1.5 seconds) before executing.
  - Once executed, the function will:
    1. Collect the current text from the textarea that triggered the event.
    2. Call `google.script.run.saveWorkProductAnswer(observationId, questionId, answerText)`.
    3. A small visual indicator (e.g., "Saving..." -> "Saved") will provide feedback to the user.
- **Loading Existing Answers:**
  - When the rubric page loads and the observation is a "Work Product" type, the client-side Javascript will call `google.script.run.getWorkProductAnswers()` and populate the textareas with the returned data.
