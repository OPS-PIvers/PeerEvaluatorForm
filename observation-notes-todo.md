# Implementation Plan: Rich Text Observation Notes

This document outlines the steps to implement a rich text notes feature for each subdomain within an observation. This will replace the separate "look-fors" and media upload sections with a unified, expandable "Notes & Evidence" area.

## 1. UI Overhaul: Unified "Notes & Evidence" Section

The first step is to refactor the UI in `rubric.html` to create a more intuitive and consolidated interface for adding evidence.

### 1.1. Consolidate UI Elements in `rubric.html`

For each component, replace the individual "Best Practices" collapsible and the "Media Upload" section with a single button that expands to show all related actions.

**File:** `rubric.html`

**Change:**

1.  **Remove** the existing `.look-fors-section` and `.media-upload-container` divs.
2.  **Add** a new button and a container for the new expandable section within the `.component-section` div.

```html
<!-- Inside the .component-section div, after the performance-levels-content -->
<div class="evidence-section">
    <button class="evidence-toggle-btn" onclick="toggleEvidenceSection('evidence-<?= component.componentId ?>')">
        <span>📝</span> Notes & Evidence
    </button>
    <div class="evidence-content" id="evidence-<?= component.componentId ?>">
        <!-- Rich Text Editor, Look-fors, and Media Upload will go here -->
    </div>
</div>
```

### 1.2. Integrate a Rich Text Editor

We will use **Quill.js**, a modern and lightweight rich text editor. It can be included directly from a CDN, requiring no local file installation.

**File:** `rubric.html`

**Change:**

1.  **Add Quill.js CSS and JS** to the `<head>` section.

    ```html
    <!-- In <head> -->
    <link href="https://cdn.quilljs.com/1.3.6/quill.snow.css" rel="stylesheet">
    <script src="https://cdn.quilljs.com/1.3.6/quill.js"></script>
    ```

2.  **Add the RTE container** and the other elements inside the new `.evidence-content` div.

    ```html
    <!-- Inside the .evidence-content div -->
    <div class="notes-container">
        <h4>Observation Notes</h4>
        <div id="notes-editor-<?= component.componentId ?>"></div>
    </div>

    <div class="look-fors-container">
        <h4>Best Practices (Look-fors)</h4>
        <div class="look-fors-grid">
            <!-- The existing loop for look-for checkboxes goes here -->
            <? for (var j = 0; j < component.bestPractices.length; j++) { ?>
                <div class="look-for-item">
                    <input type="checkbox" id="practice-<?= component.componentId ?>-<?= j ?>" onchange="handleLookForChange(this, '<?= component.componentId ?>')">
                    <label for="practice-<?= component.componentId ?>-<?= j ?>"><?= component.bestPractices[j] ?></label>
                </div>
            <? } ?>
        </div>
    </div>

    <div class="media-upload-container">
        <h4>Upload Evidence</h4>
        <input type="file" class="media-upload-input" id="media-upload-<?= component.componentId ?>">
        <button class="media-upload-button" onclick="handleMediaUpload('<?= component.componentId ?>')">Upload</button>
        <div class="media-links-container" data-component-id="<?= component.componentId ?>">
            <ul><!-- Links will be populated here --></ul>
        </div>
    </div>
    ```

### 1.3. Add JavaScript to Manage the UI and Save Data

**File:** `rubric.html`

**Change:** Add the following JavaScript functions inside the `<script>` tag.

```javascript
// Store Quill instances
const quillInstances = {};

function toggleEvidenceSection(contentId) {
    const content = document.getElementById(contentId);
    content.classList.toggle('expanded');
    
    const componentId = contentId.replace('evidence-', '');

    // Initialize Quill on first expansion
    if (content.classList.contains('expanded') && !quillInstances[componentId]) {
        const editor = new Quill('#notes-editor-' + componentId, {
            theme: 'snow',
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, false] }],
                    ['bold', 'italic', 'underline'],
                    [{'list': 'ordered'}, {'list': 'bullet'}],
                    ['clean']
                ]
            }
        });
        
        // Load existing notes
        if (observationNotes[componentId]) {
            editor.root.innerHTML = observationNotes[componentId];
        }

        // Add a debounce function to save notes automatically after user stops typing
        let timeout;
        editor.on('text-change', () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                saveNotes(componentId, editor.root.innerHTML);
            }, 1500); // Save 1.5 seconds after typing stops
        });

        quillInstances[componentId] = editor;
    }
}

function saveNotes(componentId, content) {
    if (!currentObservationId) return;

    // Update local data
    observationNotes[componentId] = content;

    google.script.run
        .withSuccessHandler(() => console.log(`Notes saved for ${componentId}`))
        .withFailureHandler(error => {
            console.error('Failed to save notes:', error);
            showToast('Error saving notes. Please check your connection.');
        })
        .saveObservationNotes(currentObservationId, componentId, content);
}

// Modify the initializeObservation function to handle notes
let observationNotes = {};
function initializeObservation(observation) {
    // ... (existing code)
    observationNotes = observation.observationNotes || {};
    // ... (existing code)
}
```

## 2. Update Backend to Store Notes

### 2.1. Update Observation Data Structure

Modify the data model to include a field for the rich text notes.

**File:** `ObservationService.js`
**Function:** `createNewObservation`

```javascript
// ... inside createNewObservation function
const newObservation = {
  // ... other properties
  checkedLookFors: {},
  observationNotes: {} // e.g., { "1a:": "<p>Some <strong>formatted</strong> notes.</p>" }
};
// ...
```

**File:** `SheetService.js`
**Function:** `setupObservationSheet`

```javascript
// ... inside setupObservationSheet function
const headers = [
    // ... other headers
    "observationName", "observationDate", "checkedLookFors", "observationNotes" // Add new field
];
// ...
```

### 2.2. Create `saveObservationNotes` Server-Side Function

**File:** `ObservationService.js`

```javascript
function saveObservationNotes(observationId, componentId, notesContent) {
  if (!observationId || !componentId) {
    return { success: false, error: 'Observation ID and component ID are required.' };
  }

  try {
    const spreadsheet = openSpreadsheet();
    const sheet = getSheetByName(spreadsheet, OBSERVATION_SHEET_NAME);
    if (!sheet) throw new Error(`Sheet "${OBSERVATION_SHEET_NAME}" not found.`);

    const row = _findObservationRow(sheet, observationId);
    if (row === -1) return { success: false, error: 'Observation not found.' };

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const notesCol = headers.indexOf('observationNotes') + 1;
    const lastModifiedCol = headers.indexOf('lastModifiedAt') + 1;

    if (notesCol === 0) {
        return { success: false, error: 'observationNotes column not found.' };
    }

    const notesCell = sheet.getRange(row, notesCol);
    const currentNotesString = notesCell.getValue();
    let currentNotes = {};
    try {
        if(currentNotesString) currentNotes = JSON.parse(currentNotesString);
    } catch(e){
        console.warn(`Could not parse observationNotes for ${observationId}.`);
    }

    // Sanitize HTML content before saving
    currentNotes[componentId] = sanitizeHtml(notesContent);

    notesCell.setValue(JSON.stringify(currentNotes, null, 2));
    if(lastModifiedCol > 0){
        sheet.getRange(row, lastModifiedCol).setValue(new Date().toISOString());
    }
    SpreadsheetApp.flush();

    return { success: true };
  } catch (error) {
    console.error(`Error saving notes for observation ${observationId}:`, error);
    return { success: false, error: 'An unexpected error occurred.' };
  }
}

// Add a simple HTML sanitizer to prevent script injection
function sanitizeHtml(html) {
    // This is a very basic sanitizer. For a real-world application,
    // a more robust library would be recommended if available.
    // It allows simple formatting tags.
    const allowedTags = /<\/?(p|strong|em|u|ol|ul|li|br|h1|h2)>/g;
    return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
               .replace(/>/g, '&gt;').replace(/</g, '&lt;')
               .replace(/&lt;(\/?(p|strong|em|u|ol|ul|li|br|h1|h2))&gt;/g, '<$1>');
}
```

## 3. Update PDF Generation to Include Notes

The notes are saved as HTML. We need to parse this HTML and append it to the PDF document being generated in `Code.js`.

### 3.1. Modify `_addComponentSection` in `Code.js`

The `_createStyledPdfDocument` function and its helpers in `Code.js` build the PDF programmatically. We will add a new helper function to parse and append the HTML notes.

**File:** `Code.js`
**Function:** `_addComponentSection`

**Change:** Add a call to a new function, `_addNotesSection`, after adding evidence.

```javascript
// ... inside _addComponentSection, after the evidence section
const notes = observation.observationNotes ? observation.observationNotes[component.componentId] : null;
if (notes) {
    _addNotesSection(body, notes);
}
// ...
```

### 3.2. Create `_addNotesSection` Helper Function in `Code.js`

**File:** `Code.js`

**Change:** Add the new helper function. This function will parse the simple HTML from the rich text editor and append it to the document body. `DocumentApp` does not support direct HTML insertion, so we must parse it manually.

```javascript
/**
 * Adds an observation notes section.
 * @param {Body} body The document body
 * @param {string} notesHtml The HTML content of the notes
 */
function _addNotesSection(body, notesHtml) {
    const notesHeader = body.appendParagraph('Observation Notes:');
    notesHeader.getChild(0).asText().setFontSize(10).setBold(true).setForegroundColor('#4a5568');
    notesHeader.setSpacingBefore(5).setSpacingAfter(2);
    notesHeader.setBackgroundColor('#f8fafc');

    // Basic HTML to DocumentApp parser
    // This is a simplified parser. It handles p, strong, em, ul, ol, li.
    // A more robust solution would require a proper HTML parsing library.
    try {
        // Replace <p> with newlines for spacing
        notesHtml = notesHtml.replace(/<p>/g, '').replace(/<\/p>/g, '\n');
        
        const listItems = notesHtml.match(/<li>(.*?)<\/li>/g) || [];
        if (listItems.length > 0) {
            listItems.forEach(item => {
                const text = item.replace(/<\/?li>/g, '');
                const listItem = body.appendListItem('• ' + stripHtml(text));
                // Apply basic styling from tags like <strong>
                styleTextFromHtml(listItem.getChild(0).asText(), text);
            });
        } else {
            // Handle non-list content
            const paragraph = body.appendParagraph(stripHtml(notesHtml));
            styleTextFromHtml(paragraph.getChild(0).asText(), notesHtml);
        }
    } catch (e) {
        // Fallback for parsing errors
        body.appendParagraph(stripHtml(notesHtml));
    }
}

function stripHtml(html) {
    return html.replace(/<[^>]*>?/gm, '');
}

function styleTextFromHtml(textElement, html) {
    if (html.includes('<strong>')) {
        textElement.setBold(true);
    }
    if (html.includes('<em>')) {
        textElement.setItalic(true);
    }
    if (html.includes('<u>')) {
        textElement.setUnderline(true);
    }
}
```

This plan provides a comprehensive, step-by-step guide to implementing the rich text observation notes feature, from UI to data storage to final PDF output.
