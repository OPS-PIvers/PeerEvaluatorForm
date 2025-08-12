Your proposed plan to unify the data structure is the **correct long-term solution**. Storing all data related to a specific rubric component under a single key (`observationData[componentId]`) is the right way to ensure data integrity and simplify the application logic.

Let's combine your architectural strategy with the code cleanup from my analysis. This will create a truly robust and maintainable solution.

Here is an integrated implementation plan that leverages your architectural insight.

-----

### \#\# Integrated Implementation Plan: Fix the Data Structure & Streamline the Code

This plan will implement your proposed architectural change while also removing the duplicate code I identified.

#### **Phase 1: Centralize and Correct Backend Data Operations (`ObservationService.js`)**

We'll start by modifying the functions in `ObservationService.js` to use your proposed unified data structure. This makes it the single source of truth for all observation data logic.

**File to Edit**: `ObservationService.js`

**Actions**:

1.  **Modify `saveProficiencySelection`**: This function must now read the entire `observationData` object, update the `.proficiency` value for the specified `componentId`, and then write the entire object back.

    ```javascript
    // In ObservationService.js
    function saveProficiencySelection(observationId, componentId, proficiency) {
      // ... (existing code to find the sheet and row)
      const dataCell = sheet.getRange(row, observationDataCol);
      let observationData = JSON.parse(dataCell.getValue() || '{}');

      // Create object for the component if it doesn't exist
      if (!observationData[componentId]) {
        observationData[componentId] = {};
      }

      // Update the proficiency
      observationData[componentId].proficiency = proficiency;

      // Write the unified object back
      dataCell.setValue(JSON.stringify(observationData));
      // ... (update last modified timestamp)
      return { success: true };
    }
    ```

2.  **Modify `saveLookForSelection`**: This function must now modify the `observationData` object to add or remove items from the `observationData[componentId].lookfors` array.

    ```javascript
    // In ObservationService.js
    function saveLookForSelection(observationId, componentId, lookForText, isChecked) {
      // ... (existing code to find the sheet and row)
      const dataCell = sheet.getRange(row, observationDataCol);
      let observationData = JSON.parse(dataCell.getValue() || '{}');

      if (!observationData[componentId]) {
        observationData[componentId] = { lookfors: [] };
      } else if (!observationData[componentId].lookfors) {
        observationData[componentId].lookfors = [];
      }

      const lookfors = new Set(observationData[componentId].lookfors);
      if (isChecked) {
        lookfors.add(lookForText);
      } else {
        lookfors.delete(lookForText);
      }
      observationData[componentId].lookfors = Array.from(lookfors);

      dataCell.setValue(JSON.stringify(observationData));
      // ... (update last modified timestamp)
      return { success: true };
    }
    ```

3.  **Modify `saveObservationNotes`**: This function must now update the `observationData[componentId].notes` field.

    ```javascript
    // In ObservationService.js
    function saveObservationNotes(observationId, componentId, notesContent) {
      // ... (existing code to find the sheet and row)
      const dataCell = sheet.getRange(row, observationDataCol);
      let observationData = JSON.parse(dataCell.getValue() || '{}');

      if (!observationData[componentId]) {
        observationData[componentId] = {};
      }

      observationData[componentId].notes = sanitizeHtml(notesContent); // Always sanitize

      dataCell.setValue(JSON.stringify(observationData));
      // ... (update last modified timestamp)
      return { success: true };
    }
    ```

#### **Phase 2: Eliminate Duplicate Backend Logic (`Code.js`)**

Now we will ensure `Code.js` only calls `ObservationService.js`, eliminating the redundant logic.

**File to Edit**: `Code.js`

**Actions**:

1.  **Completely remove the existing versions** of `saveProficiencySelection`, `saveLookForSelection`, and `saveObservationNotes` from `Code.js`.

2.  Replace them with **simple wrapper functions** that call directly to the `ObservationService`. This ensures you have only one source of logic.

    ```javascript
    // In Code.js, use these wrappers
    function saveProficiencySelection(observationId, componentId, proficiency) {
      return ObservationService.saveProficiencySelection(observationId, componentId, proficiency);
    }

    function saveLookForSelection(observationId, componentId, lookForText, isChecked) {
      return ObservationService.saveLookForSelection(observationId, componentId, lookForText, isChecked);
    }

    function saveObservationNotes(observationId, componentId, notesContent) {
      return ObservationService.saveObservationNotes(observationId, componentId, notesContent);
    }
    ```

#### **Phase 3: Update the Client-Side UI to Use the Unified Data Model (`rubric.html`)**

Finally, we'll update the client-side JavaScript to read and write data from the new, unified data structure.

**File to Edit**: `rubric.html`

**Actions**:

1.  **Update the JavaScript to parse the observation data**. The UI now needs to look for nested properties like `observation.observationData[componentId].proficiency` and `observation.observationData[componentId].lookfors`.

    ```html
    <div class="level-content <?= proficiency === 'developing' ? 'selected' : '' ?>">
        </div>

    <?
      var componentData = data.observation.observationData[component.componentId] || {};
      var checkedLookFors = componentData.lookfors || [];
      var isChecked = checkedLookFors.includes(practiceText);
    ?>
    <input type="checkbox" ... <?= isChecked ? 'checked' : '' ?>>
    ```

2.  **Modify the `toggleEvidenceSection` function** to initialize the Quill editor with the correct notes from the `observationData`.

    ```javascript
    // In rubric.html JavaScript
    function toggleEvidenceSection(contentId) {
      // ... (existing toggle logic)
      const componentId = contentId.replace('evidence-content-', '');

      if (isExpanded && !quillInstances[componentId]) {
        // ... (existing code to create Quill editor)

        // Load notes from the unified structure
        const componentData = observationNotes[componentId] || {};
        if (componentData.notes) {
          editor.root.innerHTML = componentData.notes;
        }

        // ... (debounce and saving logic)
      }
    }

    // Ensure the `observationNotes` variable is initialized from `observationData`
    let observationNotes = <?= data.observation ? JSON.stringify(data.observation.observationData || {}) : '{}' ?>;
    ```

#### **Phase 4: Data Migration and Cleanup**

Your plan for a phased rollout is excellent.

1.  **Backwards Compatibility**: The updated logic in the `save...` functions will automatically migrate data from the old format to the new one as each component is saved.
2.  **Column Cleanup**: Once you've confirmed that all active observations are using the new unified format, you can **safely delete** the now-redundant `checkedLookFors` and `observationNotes` columns from the `Observation_Data` sheet.

This integrated plan implements your superior architectural approach, eliminates code redundancy, and makes your application more robust and maintainable for future development.