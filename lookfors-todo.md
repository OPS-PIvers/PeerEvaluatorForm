# Implementation Plan: Save and Display Checked Look-Fors

This document outlines the steps to implement the functionality to save the state of "look-for" checkboxes and ensure that only the checked look-fors are included in the generated PDF observation report.

## 1. Update the Observation Data Structure

The first step is to add a new field to the observation data model to store the checked look-fors.

### 1.1. Modify `ObservationService.js`

In `ObservationService.js`, update the `createNewObservation` function to include a new property `checkedLookFors` in the `newObservation` object. This will ensure that all new observations have a place to store this data.

**File:** `ObservationService.js`

**Function:** `createNewObservation`

**Change:**

```javascript
// ... inside createNewObservation function
const newObservation = {
  // ... other properties
  evidenceLinks: {}, // e.g., { "1a:": [{url: "...", name: "...", uploadedAt: "..."}, ...] }
  checkedLookFors: {} // e.g., { "1a:": ["Look-for text 1", "Look-for text 2"] }
};
// ...
```

## 2. Capture and Save Checkbox State from the UI

Next, we need to capture the state of the checkboxes in the `rubric.html` file and save it to the server.

### 2.1. Add Event Listeners in `rubric.html`

In `rubric.html`, add a JavaScript function to handle the checking and unchecking of look-for checkboxes. This function will call a new server-side function to save the state.

**File:** `rubric.html`

**Add a new function:**

```javascript
function handleLookForChange(checkbox, componentId) {
    const lookForText = checkbox.nextElementSibling.textContent;
    const isChecked = checkbox.checked;

    if (currentObservationId) {
        google.script.run
            .withSuccessHandler(() => console.log(`Saved look-for: ${componentId} -> ${lookForText}`))
            .withFailureHandler(error => {
                console.error('Save failed:', error);
                showToast('Failed to save look-for selection. Please check your connection.');
            })
            .saveLookForSelection(currentObservationId, componentId, lookForText, isChecked);
    }
}
```

### 2.2. Update Checkbox HTML in `rubric.html`

Modify the look-for checkboxes to call the new `handleLookForChange` function.

**File:** `rubric.html`

**Change:**

```html
<!-- Inside the look-fors-grid loop -->
<input type="checkbox" id="practice-<?= domainIdx ?>-<?= i ?>-<?= j ?>" name="practice-<?= domainIdx ?>-<?= i ?>-<?= j ?>" onchange="handleLookForChange(this, '<?= component.componentId ?>')">
```

### 2.3. Create `saveLookForSelection` in `ObservationService.js`

Create a new server-side function in `ObservationService.js` to handle saving the look-for selections.

**File:** `ObservationService.js`

**Add a new function:**

```javascript
function saveLookForSelection(observationId, componentId, lookForText, isChecked) {
  if (!observationId || !componentId || !lookForText) {
    return { success: false, error: 'Observation ID, component ID, and look-for text are required.' };
  }

  try {
    const spreadsheet = openSpreadsheet();
    const sheet = getSheetByName(spreadsheet, OBSERVATION_SHEET_NAME);
    if (!sheet) {
      throw new Error(`Sheet "${OBSERVATION_SHEET_NAME}" not found.`);
    }

    const row = _findObservationRow(sheet, observationId);
    if (row === -1) {
      return { success: false, error: 'Observation not found.' };
    }

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const lookForsCol = headers.indexOf('checkedLookFors') + 1;
    const lastModifiedCol = headers.indexOf('lastModifiedAt') + 1;

    if (lookForsCol === 0) {
        return { success: false, error: 'checkedLookFors column not found in the sheet.' };
    }

    const lookForsCell = sheet.getRange(row, lookForsCol);
    const currentLookForsString = lookForsCell.getValue();
    let currentLookFors = {};
    try {
        if(currentLookForsString){
            currentLookFors = JSON.parse(currentLookForsString);
        }
    } catch(e){
        console.warn(`Could not parse checkedLookFors for ${observationId}. Starting fresh. Data: ${currentLookForsString}`);
    }

    if (!currentLookFors[componentId]) {
        currentLookFors[componentId] = [];
    }

    if (isChecked) {
        if (!currentLookFors[componentId].includes(lookForText)) {
            currentLookFors[componentId].push(lookForText);
        }
    } else {
        const index = currentLookFors[componentId].indexOf(lookForText);
        if (index > -1) {
            currentLookFors[componentId].splice(index, 1);
        }
    }

    lookForsCell.setValue(JSON.stringify(currentLookFors, null, 2));
    if(lastModifiedCol > 0){
        sheet.getRange(row, lastModifiedCol).setValue(new Date().toISOString());
    }
    SpreadsheetApp.flush();

    debugLog('Look-for selection saved', { observationId, componentId, lookForText, isChecked });
    return { success: true };
  } catch (error) {
    console.error(`Error saving look-for for observation ${observationId}:`, error);
    return { success: false, error: 'An unexpected error occurred.' };
  }
}
```

### 2.4. Update `setupObservationSheet` in `SheetService.js`

Add the `checkedLookFors` column to the `Observation_Data` sheet if it doesn't exist.

**File:** `SheetService.js`

**Function:** `setupObservationSheet`

**Change:**

```javascript
// ... inside setupObservationSheet function
const headers = [
    "observationId", "observerEmail", "observedEmail", "observedName",
    "observedRole", "observedYear", "status", "createdAt",
    "lastModifiedAt", "finalizedAt", "observationData", "evidenceLinks",
    "observationName", "observationDate", "checkedLookFors" // Add new field
];
// ...
```

This plan provides a complete, end-to-end solution for capturing and storing the checked "look-for" items. The PDF generation has been updated separately to use `DocumentApp` and will correctly handle this data.
