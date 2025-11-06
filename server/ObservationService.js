/**
 * ObservationService.js
 * Manages observation data for the Peer Evaluator role.
 * This service manages observation records, which are stored as rows in the "Observation_Data" Google Sheet.
 */

// JSON serialized fields in the observation database
const JSON_SERIALIZED_FIELDS = ['observationData', 'evidenceLinks', 'observationNotes', 'scriptContent', 'componentTags'];


/**
 * Retrieves the entire observations database from the Google Sheet.
 * @returns {Array<Object>} The array of all observation objects.
 * @private
 */
function _getObservationsDb() {
  try {
    const spreadsheet = openSpreadsheet();
    const sheet = getSheetByName(spreadsheet, SHEET_NAMES.OBSERVATION_DATA);
    if (!sheet || sheet.getLastRow() < 2) {
      return []; // No headers or no data
    }

    const range = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn());
    const values = range.getValues();

    const headers = values[0].map(h => h.toString().trim());
    const dataRows = values.slice(1);

    return dataRows.map(row => {
      const observation = {};
      headers.forEach((header, index) => {
        let value = row[index];
        // Safely parse JSON fields
        if (JSON_SERIALIZED_FIELDS.includes(header) && typeof value === 'string' && value) {
          try {
            value = JSON.parse(value);
          } catch (e) {
            console.warn(`Could not parse JSON for ${header} in observation. Defaulting to empty object. Data: ${value}`);
            value = {};
          }
        }
        observation[header] = value;
      });
      return observation;
    });
  } catch (error) {
    console.error('Error getting observations DB from Sheet:', error);
    return []; // Return empty DB on error
  }
}

/**
 * Saves a look-for selection for a specific component in an observation.
 * @param {string} observationId The ID of the observation to update.
 * @param {string} componentId The ID of the component (e.g., "1a:").
 * @param {string} lookForText The text content of the look-for.
 * @param {boolean} isChecked The state of the checkbox.
 * @returns {Object} A response object with success status.
 */
function _saveLookForSelection(observationId, componentId, lookForText, isChecked) {
  if (!observationId || !componentId || !lookForText) {
    return { success: false, error: 'Observation ID, component ID, and look-for text are required.' };
  }

  return _updateObservationJsonData(observationId, 'observationData', (currentData) => {
    // Ensure the data structure for the component exists
    if (!currentData[componentId]) {
      currentData[componentId] = { lookfors: [], proficiency: '', notes: '' };
    } else if (!currentData[componentId].lookfors) {
      currentData[componentId].lookfors = [];
    }

    // Use a Set for efficient add/delete operations
    const lookForsSet = new Set(currentData[componentId].lookfors);
    if (isChecked) {
      lookForsSet.add(lookForText);
    } else {
      lookForsSet.delete(lookForText);
    }
    currentData[componentId].lookfors = Array.from(lookForsSet);

    return currentData;
  });
}

/**
 * Saves the entire observations database to the Google Sheet.
 * @param {Array<Object>} db The array of all observation objects to save.
 * @private
 */
/**
 * Appends a new observation record directly to the Google Sheet.
 * @param {Object} observation The observation object to append.
 * @private
 */
function _appendObservationToSheet(observation) {
  try {
    const spreadsheet = openSpreadsheet();
    const sheet = getSheetByName(spreadsheet, SHEET_NAMES.OBSERVATION_DATA);
    if (!sheet) {
      throw new Error(`Sheet "${SHEET_NAMES.OBSERVATION_DATA}" not found.`);
    }

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const rowData = headers.map(header => {
      let value = observation[header];
      if (JSON_SERIALIZED_FIELDS.includes(header) && typeof value === 'object') {
        return JSON.stringify(value, null, 2);
      }
      return value;
    });

    sheet.appendRow(rowData);
    SpreadsheetApp.flush(); // Ensure the data is written immediately
    debugLog(`Appended new observation ${observation.observationId} to the sheet.`);

  } catch (error) {
    console.error('Error appending observation to Sheet:', error);
    throw error; // Re-throw to be handled by the calling function
  }
}

/**
 * Retrieves a single observation by its unique ID.
 * @param {string} observationId The ID of the observation to retrieve.
 * @returns {Object|null} The observation object or null if not found.
 */
function getObservationById(observationId) {
    if (!observationId) return null;
    try {
        const db = _getObservationsDb();
        return db.find(obs => obs.observationId === observationId) || null;
    } catch (error) {
        console.error(`Error in getObservationById for ${observationId}:`, error);
        return null;
    }
}

/**
 * A centralized and locked function to update the JSON data within an observation row.
 * This prevents race conditions from multiple simultaneous client-side auto-saves.
 * @param {string} observationId The ID of the observation to update.
 * @param {string} dataColumnName The name of the column containing the JSON to update (e.g., 'observationData').
 * @param {function(Object): Object} updateFn A function that receives the current data object and returns the updated object.
 * @returns {Object} A response object with success status.
 * @private
 */
function _updateObservationJsonData(observationId, dataColumnName, updateFn) {
  if (!observationId || !dataColumnName || typeof updateFn !== 'function') {
    return { success: false, error: 'Invalid arguments for updating observation JSON data.' };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000); // Wait up to 30 seconds

  try {
    const spreadsheet = openSpreadsheet();
    const sheet = getSheetByName(spreadsheet, SHEET_NAMES.OBSERVATION_DATA);
    if (!sheet) throw new Error(`Sheet "${SHEET_NAMES.OBSERVATION_DATA}" not found.`);

    const row = _findObservationRow(sheet, observationId);
    if (row === -1) return { success: false, error: 'Observation not found.' };

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const dataCol = headers.indexOf(dataColumnName) + 1;
    const lastModifiedCol = headers.indexOf('lastModifiedAt') + 1;

    if (dataCol === 0) {
      return { success: false, error: `Column "${dataColumnName}" not found in the sheet.` };
    }

    const dataCell = sheet.getRange(row, dataCol);
    const currentDataString = dataCell.getValue();
    let currentData = {};
    try {
      if (currentDataString) {
        currentData = JSON.parse(currentDataString);
      }
    } catch (e) {
      console.warn(`Could not parse ${dataColumnName} for ${observationId}. Starting fresh. Data: ${currentDataString}`);
    }

    // Apply the update function to the data
    const updatedData = updateFn(currentData);

    // Save the updated object back to the cell
    dataCell.setValue(JSON.stringify(updatedData, null, 2));
    if (lastModifiedCol > 0) {
      sheet.getRange(row, lastModifiedCol).setValue(new Date().toISOString());
    }
    SpreadsheetApp.flush();

    debugLog(`${dataColumnName} updated`, { observationId, column: dataColumnName });
    return { success: true };
  } catch (error) {
    console.error(`Error updating ${dataColumnName} for observation ${observationId}:`, error);
    return { success: false, error: 'An unexpected error occurred during data update.' };
  } finally {
    lock.releaseLock();
  }
}


/**
 * Retrieves all observations for a given staff member.
 * @param {string} observedEmail The email of the staff member being observed.
 * @param {string|null} status Optional. Filter observations by status (e.g., "Draft", "Finalized").
 * @returns {Array<Object>} An array of matching observation objects.
 */
function getObservationsForUser(observedEmail, status = null) {
  if (!observedEmail) return [];

  try {
    const db = _getObservationsDb();
    let userObservations = db.filter(obs => obs.observedEmail === observedEmail);

    if (status) {
      userObservations = userObservations.filter(obs => obs.status === status);
    }

    // Sort by creation date, newest first
    userObservations.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Ensure essential fields for the UI are present
    return userObservations.map(obs => {
      // Look up the observer's name from the Staff sheet
      let observerName = 'Unknown';
      if (obs.observerEmail) {
        const observer = getUserByEmail(obs.observerEmail);
        if (observer && observer.name) {
          observerName = observer.name;
        } else {
          // Fallback to email if observer not found in Staff sheet
          observerName = obs.observerEmail;
        }
      }

      return {
        observationId: obs.observationId,
        observedName: obs.observedName,
        createdAt: obs.createdAt,
        status: obs.status,
        type: obs.Type || 'Standard',
        observationName: obs.observationName || null,
        observationDate: obs.observationDate || null,
        pdfUrl: obs.pdfUrl || null,
        pdfStatus: obs.pdfStatus || null,
        folderUrl: obs.folderUrl || null,
        observerEmail: obs.observerEmail || null,
        observerName: observerName
      };
    });
  } catch (error) {
    console.error(`Error in getObservationsForUser for ${observedEmail}:`, error);
    return [];
  }
}

/**
 * Creates a new, empty observation record in a "Draft" state.
 * @param {string} observerEmail The email of the Peer Evaluator creating the observation.
 * @param {string} observedEmail The email of the staff member being observed.
 * @returns {Object|null} The newly created observation object or null on error.
 */
function createNewObservation(observerEmail, observedEmail, observationType = 'Standard') {
  if (!observerEmail || !observedEmail) {
    console.error('Observer and Observed emails are required to create an observation.');
    return null;
  }

  try {
    const observedUser = getUserByEmail(observedEmail);
    if (!observedUser) {
      console.error(`Could not create observation: Observed user ${observedEmail} not found.`);
      return null;
    }

    const observationId = generateUniqueId('obs');

    const newObservation = {
      observationId: observationId,
      observerEmail: observerEmail,
      observedEmail: observedEmail,
      observedName: observedUser.name,
      observedRole: observedUser.role,
      observedYear: observedUser.year,
      status: OBSERVATION_STATUS.DRAFT,
      createdAt: new Date().toISOString(),
      lastModifiedAt: new Date().toISOString(),
      finalizedAt: null,
      pdfUrl: null, // To store the link to the generated PDF
      pdfStatus: null, // Track PDF generation status: null, 'generated', 'failed'
      folderUrl: null, // To store the link to the Google Drive folder
      observationName: null,
      observationDate: null,
      observationData: {}, // e.g., { "1a:": "proficient", "1b:": "basic" }
      evidenceLinks: {}, // e.g., { "1a:": [{url: "...", name: "...", uploadedAt: "..."}, ...] }
      observationNotes: {},
      Type: observationType
    };

    _appendObservationToSheet(newObservation);

    debugLog('New observation draft created and saved', newObservation);
    return newObservation;

  } catch (error) {
    console.error(`Error in createNewObservation for ${observedEmail}:`, error);
    return null;
  }
}

/**
 * Saves a proficiency level selection for a specific component in an observation.
 * @param {string} observationId The ID of the observation to update.
 * @param {string} componentId The rubric component ID (e.g., "1a:").
 * @param {string} proficiency The selected proficiency level (e.g., "proficient").
 * @returns {Object} A response object with success status.
 */
/**
 * Finds the row number for a given observation ID in the sheet.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet The observation data sheet.
 * @param {string} observationId The ID of the observation to find.
 * @returns {number} The 1-based row number, or -1 if not found.
 * @private
 */
function _findObservationRow(sheet, observationId) {
  const idColumn = 1; // Assuming observationId is in column A
  const ids = sheet.getRange(2, idColumn, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === observationId) {
      return i + 2; // +2 because data starts at row 2 and i is 0-indexed
    }
  }
  return -1;
}

/**
 * Saves a proficiency level selection for a specific component in an observation.
 * @param {string} observationId The ID of the observation to update.
 * @param {string} componentId The rubric component ID (e.g., "1a:").
 * @param {string} proficiency The selected proficiency level (e.g., "proficient").
 * @returns {Object} A response object with success status.
 */
function _saveProficiencySelection(observationId, componentId, proficiency) {
  if (!observationId || !componentId) {
    return { success: false, error: 'Observation ID and component ID are required.' };
  }

  return _updateObservationJsonData(observationId, 'observationData', (currentData) => {
    // Ensure the component object exists, preserving other properties
    if (!currentData[componentId]) {
      currentData[componentId] = { lookfors: [], notes: '' };
    }

    // Update or clear the proficiency
    if (proficiency) {
      // Set the proficiency if a value is provided
      currentData[componentId].proficiency = proficiency;
    } else {
      // Clear the proficiency if null/empty (deselection)
      delete currentData[componentId].proficiency;
    }

    return currentData;
  });
}

/**
 * Retrieves or creates the specific Google Drive folder for a given observation ID.
 * @param {string} observationId The observation ID.
 * @returns {GoogleAppsScript.Drive.Folder} The Google Drive folder for the observation.
 */
function getOrCreateObservationFolder(observationId) {
  const observation = getObservationById(observationId);
  if (!observation) {
    throw new Error(`Observation not found for ID: ${observationId}`);
  }
  return _getObservationFolder(observation);
}

/**
 * Retrieves an existing observation folder WITHOUT creating new folders.
 * This function searches for existing folders in the peer evaluator's Drive.
 * @param {string} observationId The observation ID.
 * @returns {GoogleAppsScript.Drive.Folder|null} The existing folder or null if not found.
 */
function getExistingObservationFolder(observationId) {
  const observation = getObservationById(observationId);
  if (!observation) {
    return null;
  }
  return _findExistingObservationFolder(observation);
}

/**
 * Retrieves or creates a folder within a given parent folder.
 * This function encapsulates the logic to retrieve the first folder found with a given name,
 * or create it if no folder with that name exists. It simplifies the get-or-create pattern.
 * @param {GoogleAppsScript.Drive.Folder} parentFolder The parent folder.
 * @param {string} folderName The name of the folder to get or create.
 * @returns {GoogleAppsScript.Drive.Folder} The folder object.
 * @private
 */
function _getOrCreateFolder(parentFolder, folderName) {
  const folders = parentFolder.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return parentFolder.createFolder(folderName);
  }
}

/**
 * Retrieves or creates the specific Google Drive folder for a given observation.
 * @param {Object} observation The observation object.
 * @returns {GoogleAppsScript.Drive.Folder} The Google Drive folder for the observation.
 * @private
 */
function _getObservationFolder(observation) {
    // Get the root folder for all observations, creating it if it doesn't exist.
    const rootFolder = _getOrCreateFolder(DriveApp.getRootFolder(), DRIVE_FOLDER_INFO.ROOT_FOLDER_NAME);

    // Get or create a folder for the observed user, using their email to ensure uniqueness.
    // Handle cases where observedName might be null/undefined
    const observedName = observation.observedName || 'Unknown User';
    const userFolderName = `${observedName} (${observation.observedEmail})`;
    const userFolder = _getOrCreateFolder(rootFolder, userFolderName);

    // Get or create a folder for this specific observation.
    const obsFolderName = `Observation - ${observation.observationId}`;
    const obsFolder = _getOrCreateFolder(userFolder, obsFolderName);

    return obsFolder;
}

/**
 * Searches for an existing observation folder WITHOUT creating new folders.
 * This function looks for folders shared with the current user (staff member).
 * @param {Object} observation The observation object.
 * @returns {GoogleAppsScript.Drive.Folder|null} The existing folder or null if not found.
 * @private
 */
function _findExistingObservationFolder(observation) {
    try {
        // Search through all folders accessible to the current user (including shared folders)
        const obsFolderName = `Observation - ${observation.observationId}`;
        const allFolders = DriveApp.getFoldersByName(obsFolderName);
        
        while (allFolders.hasNext()) {
            const folder = allFolders.next();
            
            // Verify this folder has the expected parent structure and contains files
            try {
                const parentFolders = folder.getParents();
                if (parentFolders.hasNext()) {
                    const userFolder = parentFolders.next();
                    const observedName = observation.observedName || 'Unknown User';
                    const expectedUserFolderName = `${observedName} (${observation.observedEmail})`;
                    
                    if (userFolder.getName() === expectedUserFolderName) {
                        // Check if this folder has files (not empty)
                        const files = folder.getFiles();
                        if (files.hasNext()) {
                            debugLog(`Found existing observation folder with files`, {
                                observationId: observation.observationId,
                                folderId: folder.getId(),
                                folderName: folder.getName()
                            });
                            return folder;
                        }
                    }
                }
            } catch (parentError) {
                // Skip folders we can't access parent info for
                continue;
            }
        }
        
        return null; // No existing folder with files found
        
    } catch (error) {
        console.warn(`Error searching for existing observation folder for ${observation.observationId}:`, error);
        return null;
    }
}

/**
 * Shares the entire observation folder with the observed staff member as view-only
 * and ensures the peer evaluator has editor access.
 * @param {Object} observation The finalized observation object.
 * @returns {string|null} The folder URL if sharing succeeds, null if it fails.
 * @private
 */
function _shareObservationFolder(observation) {
  try {
    const obsFolder = _getObservationFolder(observation);
    
    // Check current permissions to avoid redundant sharing notifications
    const editors = obsFolder.getEditors();
    const viewers = obsFolder.getViewers();
    
    const observerHasEditor = editors.some(editor => editor.getEmail() === observation.observerEmail);
    const observedHasViewer = viewers.some(viewer => viewer.getEmail() === observation.observedEmail) ||
                             editors.some(editor => editor.getEmail() === observation.observedEmail);
    
    // Add the observed staff member as viewer if they don't already have access
    if (!observedHasViewer) {
      obsFolder.addViewer(observation.observedEmail);
      debugLog(`Added viewer access for observed staff member`, { 
        observationId: observation.observationId,
        sharedWith: observation.observedEmail
      });
    } else {
      debugLog(`Observed staff member already has access`, { 
        observationId: observation.observationId,
        email: observation.observedEmail
      });
    }
    
    // Ensure the peer evaluator has editor access only if they don't already have it
    if (!observerHasEditor) {
      obsFolder.addEditor(observation.observerEmail);
      debugLog(`Added editor access for peer evaluator`, { 
        observationId: observation.observationId,
        editorAccess: observation.observerEmail
      });
    } else {
      debugLog(`Peer evaluator already has editor access`, { 
        observationId: observation.observationId,
        email: observation.observerEmail
      });
    }
    
    const folderUrl = obsFolder.getUrl();
    debugLog(`Observation folder sharing completed`, { 
      observationId: observation.observationId,
      folderId: obsFolder.getId(),
      folderUrl: folderUrl,
      observedEmail: observation.observedEmail,
      observerEmail: observation.observerEmail
    });

    return folderUrl;

  } catch (error) {
    console.error(`Failed to share observation folder for ${observation.observationId}:`, error);
    // Do not block the finalization process if folder sharing fails, just log the error
    return null;
  }
}

/**
 * Sends a notification email to the observed staff member when an observation is finalized.
 * @param {Object} observation The finalized observation object.
 * @private
 */
function _sendFinalizedEmail(observation) {
  try {
    const recipientEmail = observation.observedEmail;
    const staffName = observation.observedName;
    const subject = "Your Observation has been Finalized";

    // Get the observation folder and its URL
    const folder = _getObservationFolder(observation);
    const folderUrl = folder.getUrl();

    // Create the HTML content from the template
    const template = HtmlService.createTemplateFromFile('finalized-observation-email');
    template.staffName = staffName;
    template.folderUrl = folderUrl;
    const htmlBody = template.evaluate().getContent();

    // Send the email using GmailApp
    GmailApp.sendEmail(recipientEmail, subject, "", {
      htmlBody: htmlBody,
      from: Session.getActiveUser().getEmail(), // Send from the person who finalized it
      name: 'Danielson Framework System'
    });

    debugLog(`Finalized observation email sent to ${recipientEmail}`, { observationId: observation.observationId });

  } catch (error) {
    console.error(`Failed to send finalized observation email for ${observation.observationId}:`, error);
    // Do not block the finalization process if the email fails, just log the error.
  }
}

/**
 * Uploads media evidence to Google Drive and links it to an observation component.
 * @param {string} observationId The ID of the observation.
 * @param {string} componentId The ID of the rubric component (e.g., "1a:").
 * @param {string} base64Data The base64 encoded file data.
 * @param {string} fileName The original file name.
 * @param {string} mimeType The MIME type of the file.
 * @returns {Object} A response object with success status and the file URL.
 */
function uploadMediaEvidence(observationId, componentId, base64Data, fileName, mimeType) {
  if (!observationId || !componentId || !base64Data || !fileName || !mimeType) {
    return { success: false, error: 'Missing required parameters for upload.' };
  }

  try {
    const spreadsheet = openSpreadsheet();
    const sheet = getSheetByName(spreadsheet, SHEET_NAMES.OBSERVATION_DATA);
    if (!sheet) {
      throw new Error(`Sheet "${SHEET_NAMES.OBSERVATION_DATA}" not found.`);
    }

    const row = _findObservationRow(sheet, observationId);
    if (row === -1) {
      return { success: false, error: 'Observation not found.' };
    }

    // Get the current observation data from the sheet
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const evidenceLinksCol = headers.indexOf('evidenceLinks') + 1;
    const lastModifiedCol = headers.indexOf('lastModifiedAt') + 1;
    const observedNameCol = headers.indexOf('observedName') + 1;
    const observedEmailCol = headers.indexOf('observedEmail') + 1;

    if (evidenceLinksCol === 0) {
      return { success: false, error: 'evidenceLinks column not found in the sheet.' };
    }

    // Get observation data for folder creation
    const rowData = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
    const observation = {
      observationId: rowData[headers.indexOf('observationId')],
      observedName: rowData[observedNameCol - 1],
      observedEmail: rowData[observedEmailCol - 1]
    };

    const obsFolder = _getObservationFolder(observation);
    
    // Decode base64 and create a blob
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
    
    // Create the file in the observation folder
    const file = obsFolder.createFile(blob);
    const fileUrl = file.getUrl();
    // File remains private until observation is finalized

    // Get current evidence links from the sheet
    const evidenceLinksCell = sheet.getRange(row, evidenceLinksCol);
    const currentLinksString = evidenceLinksCell.getValue();
    let currentLinks = {};
    try {
      if (currentLinksString) {
        currentLinks = JSON.parse(currentLinksString);
      }
    } catch (e) {
      console.warn(`Could not parse evidenceLinks for ${observationId}. Starting fresh. Data: ${currentLinksString}`);
    }

    // Add the new evidence link
    if (!currentLinks[componentId]) {
      currentLinks[componentId] = [];
    }
    currentLinks[componentId].push({
      url: fileUrl,
      name: fileName,
      uploadedAt: new Date().toISOString()
    });

    // Update the sheet with the new evidence links and timestamp
    evidenceLinksCell.setValue(JSON.stringify(currentLinks, null, 2));
    if (lastModifiedCol > 0) {
      sheet.getRange(row, lastModifiedCol).setValue(new Date().toISOString());
    }
    SpreadsheetApp.flush(); // Ensure the data is written immediately

    debugLog('Media evidence uploaded and linked', { observationId, componentId, fileUrl });
    return { success: true, fileUrl: fileUrl, fileName: fileName };

  } catch (error) {
    console.error('Error in uploadMediaEvidence:', error);
    return { success: false, error: 'Failed to upload media: ' + error.message };
  }
}

/**
 * Deletes an observation record and its associated Google Drive folder.
 * This is a private helper function to consolidate deletion logic for both Draft and Finalized observations.
 * @param {string} observationId The ID of the observation to delete.
 * @param {string} requestingUserEmail The email of the user requesting deletion.
 * @param {string} allowedStatus The status the observation must have to be deleted (e.g., "Draft" or "Finalized").
 * @returns {Object} A response object with success status.
 */
function _deleteRecordAndFolder(observationId, requestingUserEmail, allowedStatus) {
    if (!observationId || !requestingUserEmail) {
        return { success: false, error: 'Observation ID and requesting user email are required.' };
    }
    try {
        const spreadsheet = openSpreadsheet();
        const sheet = getSheetByName(spreadsheet, SHEET_NAMES.OBSERVATION_DATA);
        if (!sheet) {
            throw new Error(`Sheet "${SHEET_NAMES.OBSERVATION_DATA}" not found.`);
        }

        const row = _findObservationRow(sheet, observationId);
        if (row === -1) {
            // If the row is not found, it might have been deleted already.
            // We can't reliably find and delete the corresponding folder without
            // the `observedName` and `observedEmail` from the sheet row.
            // Returning success as the primary goal (deleting the sheet record) is complete.
            debugLog(`Observation ${observationId} already deleted from sheet or never existed.`, { observationId, requestingUserEmail });
            return { success: true, message: 'Observation record not found; assumed already deleted.' };
        }

        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        const rowData = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];

        const observerEmailCol = headers.indexOf('observerEmail');
        const statusCol = headers.indexOf('status');
        const observedNameCol = headers.indexOf('observedName');
        const observedEmailCol = headers.indexOf('observedEmail');

        if ([observerEmailCol, statusCol, observedNameCol, observedEmailCol].includes(-1)) {
            return { success: false, error: 'Required data columns (observer, status, name, email) not found in the sheet.' };
        }

        const observerEmail = rowData[observerEmailCol];
        const status = rowData[statusCol];

        if (observerEmail !== requestingUserEmail) {
            return { success: false, error: 'Permission denied. You did not create this observation.' };
        }

        if (status !== allowedStatus) {
            return { success: false, error: `Action denied. Only ${allowedStatus} observations can be deleted with this function, but this observation has status "${status}".` };
        }

        // First, attempt to delete the associated Drive folder.
        try {
            const observationForFolder = {
                observationId: observationId,
                observedName: rowData[observedNameCol],
                observedEmail: rowData[observedEmailCol]
            };
            const obsFolder = getExistingObservationFolder(observationId);
            if (obsFolder) {
                obsFolder.setTrashed(true);
                debugLog('Observation Drive folder moved to trash', { observationId: observationId, folderId: obsFolder.getId() });
            }
        } catch (driveError) {
            console.error(`Could not delete Drive folder for observation ${observationId}. Deletion of sheet record will continue. Error:`, driveError);
            // Log the error, but do not block the sheet record deletion.
        }

        // Finally, delete the row from the sheet.
        sheet.deleteRow(row);
        SpreadsheetApp.flush();

        debugLog(`${allowedStatus} observation DELETED successfully`, { observationId, requestingUserEmail });
        return { success: true };

    } catch (error) {
        console.error(`Error deleting ${allowedStatus} observation ${observationId}:`, error);
        return { success: false, error: `An unexpected error occurred during the deletion of the ${allowedStatus} observation.` };
    }
}


/**
 * Deletes a DRAFT observation record and its associated Google Drive folder.
 * @param {string} observationId The ID of the observation to delete.
 * @param {string} requestingUserEmail The email of the user requesting deletion.
 * @returns {Object} A response object with success status.
 */
function deleteObservationRecord(observationId, requestingUserEmail) {
    return _deleteRecordAndFolder(observationId, requestingUserEmail, OBSERVATION_STATUS.DRAFT);
}

/**
 * Deletes a FINALIZED observation record and its associated Google Drive folder.
 * @param {string} observationId The ID of the observation to delete.
 * @param {string} requestingUserEmail The email of the user requesting deletion.
 * @returns {Object} A response object with success status.
 */
function deleteFinalizedObservationRecord(observationId, requestingUserEmail) {
    return _deleteRecordAndFolder(observationId, requestingUserEmail, OBSERVATION_STATUS.FINALIZED);
}

/**
 * Updates the status of an observation (e.g., to "Finalized").
 * @param {string} observationId The ID of the observation to update.
 * @param {string} newStatus The new status to set.
 * @param {string} requestingUserEmail The email of the user requesting the status change.
 * @returns {Object} A response object with success status.
 */
function updateObservationStatus(observationId, newStatus, requestingUserEmail) {
    if (!observationId || !newStatus || !requestingUserEmail) {
        return { success: false, error: 'Observation ID, new status, and requesting user email are required.' };
    }

    try {
        const spreadsheet = openSpreadsheet();
        const sheet = getSheetByName(spreadsheet, SHEET_NAMES.OBSERVATION_DATA);
        if (!sheet) {
            throw new Error(`Sheet "${SHEET_NAMES.OBSERVATION_DATA}" not found.`);
        }

        const row = _findObservationRow(sheet, observationId);
        if (row === -1) {
            return { success: false, error: 'Observation not found.' };
        }

        // Get the observation data to check permissions
        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        const rowData = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
        const observerEmailCol = headers.indexOf('observerEmail');
        const statusCol = headers.indexOf('status');
        const lastModifiedCol = headers.indexOf('lastModifiedAt');
        const finalizedAtCol = headers.indexOf('finalizedAt');
        
        if (observerEmailCol === -1 || statusCol === -1) {
            return { success: false, error: 'Required columns not found in the sheet.' };
        }

        const observerEmail = rowData[observerEmailCol];
        if (observerEmail !== requestingUserEmail) {
            return { success: false, error: 'Permission denied. You did not create this observation.' };
        }

        // Update status and timestamps
        const now = new Date().toISOString();
        sheet.getRange(row, statusCol + 1).setValue(newStatus);
        if (lastModifiedCol !== -1) {
            sheet.getRange(row, lastModifiedCol + 1).setValue(now);
        }
        if (newStatus === OBSERVATION_STATUS.FINALIZED && finalizedAtCol !== -1) {
            sheet.getRange(row, finalizedAtCol + 1).setValue(now);
            
            // Send email notification - get the full observation data for the email
            const updatedObservation = getObservationById(observationId);
            if (updatedObservation) {
                // Share the observation folder with the observed staff member and get the folder URL
                const folderUrl = _shareObservationFolder(updatedObservation);
                
                // Store the folder URL in the observation record
                if (folderUrl) {
                    updateObservationFolderUrl(observationId, folderUrl);
                    debugLog('Folder URL stored in observation record', { observationId, folderUrl });
                } else {
                    console.warn(`Failed to get folder URL for observation ${observationId} during finalization`);
                }
                
                // Send email notification
                _sendFinalizedEmail(updatedObservation);
            }
        }
        
        SpreadsheetApp.flush();

        // Get the updated observation to return
        const observation = getObservationById(observationId);
        debugLog('Observation status updated', { observationId, newStatus });
        return { success: true, observation: observation };

    } catch (error) {
        console.error(`Error updating status for observation ${observationId}:`, error);
        return { success: false, error: 'An unexpected error occurred while updating status.' };
    }
}

/**
 * Updates the PDF URL for a given observation in the sheet.
 * This function is called after a PDF has been generated and is used by the `finalizeObservation` flow.
 * @param {string} observationId The ID of the observation to update.
 * @param {string} pdfUrl The new URL of the generated PDF.
 * @returns {{success: boolean, error?: string}} A response object.
 */
function updateObservationPdfUrl(observationId, pdfUrl) {
  if (!observationId || !pdfUrl) {
    return { success: false, error: 'Observation ID and PDF URL are required.' };
  }

  try {
    const spreadsheet = openSpreadsheet();
    const sheet = getSheetByName(spreadsheet, SHEET_NAMES.OBSERVATION_DATA);
    if (!sheet) {
      throw new Error(`Sheet "${SHEET_NAMES.OBSERVATION_DATA}" not found.`);
    }

    const row = _findObservationRow(sheet, observationId);
    if (row === -1) {
      // Log this as a warning instead of returning an error that might break the UI flow.
      // The calling function might not handle the error gracefully.
      console.warn(`Observation with ID "${observationId}" not found in sheet. Cannot update PDF URL.`);
      return { success: false, error: 'Observation not found.' };
    }

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const pdfUrlCol = headers.indexOf('pdfUrl') + 1;
    const lastModifiedCol = headers.indexOf('lastModifiedAt') + 1;

    if (pdfUrlCol === 0) {
      // This is a configuration error, so throwing an error is appropriate.
      throw new Error('The "pdfUrl" column was not found in the Observations sheet.');
    }

    // Update the PDF URL and timestamp
    sheet.getRange(row, pdfUrlCol).setValue(pdfUrl);
    if (lastModifiedCol > 0) {
      sheet.getRange(row, lastModifiedCol).setValue(new Date().toISOString());
    }

    SpreadsheetApp.flush();

    debugLog('Observation PDF URL updated', { observationId, pdfUrl });
    return { success: true };

  } catch (error) {
    console.error(`Error updating PDF URL for observation ${observationId}:`, error);
    // Return a structured error response
    return { success: false, error: `An unexpected error occurred while updating the PDF URL: ${error.message}` };
  }
}

/**
 * Updates the folder URL for a specific observation.
 * @param {string} observationId The ID of the observation to update.
 * @param {string} folderUrl The URL of the shared Google Drive folder.
 * @returns {Object} A response object with success status.
 */
function updateObservationFolderUrl(observationId, folderUrl) {
  if (!observationId || !folderUrl) {
    return { success: false, error: 'Observation ID and folder URL are required.' };
  }
  try {
    const spreadsheet = openSpreadsheet();
    const sheet = getSheetByName(spreadsheet, SHEET_NAMES.OBSERVATION_DATA);
    if (!sheet) {
      throw new Error(`Sheet "${SHEET_NAMES.OBSERVATION_DATA}" not found.`);
    }
    const row = _findObservationRow(sheet, observationId);
    if (row === -1) {
      console.warn(`Observation with ID "${observationId}" not found in sheet. Cannot update folder URL.`);
      return { success: false, error: 'Observation not found.' };
    }
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const folderUrlCol = headers.indexOf('folderUrl') + 1;
    const lastModifiedCol = headers.indexOf('lastModifiedAt') + 1;
    if (folderUrlCol === 0) {
      throw new Error('The "folderUrl" column was not found in the Observations sheet.');
    }
    // Update the folder URL and timestamp
    sheet.getRange(row, folderUrlCol).setValue(folderUrl);
    if (lastModifiedCol > 0) {
      sheet.getRange(row, lastModifiedCol).setValue(new Date().toISOString());
    }

    SpreadsheetApp.flush();

    debugLog('Observation folder URL updated', { observationId, folderUrl });
    return { success: true };

  } catch (error) {
    console.error(`Error updating folder URL for observation ${observationId}:`, error);
    return { success: false, error: `An unexpected error occurred while updating the folder URL: ${error.message}` };
  }
}

/**
 * Updates the script PDF URL for a specific observation.
 * @param {string} observationId The ID of the observation to update.
 * @param {string} scriptPdfUrl The URL of the generated script PDF.
 * @returns {Object} A response object with success status.
 */
function updateObservationScriptUrl(observationId, scriptPdfUrl) {
  if (!observationId || !scriptPdfUrl) {
    return { success: false, error: 'Observation ID and script PDF URL are required.' };
  }
  try {
    const spreadsheet = openSpreadsheet();
    const sheet = getSheetByName(spreadsheet, SHEET_NAMES.OBSERVATION_DATA);
    if (!sheet) {
      throw new Error(`Sheet "${SHEET_NAMES.OBSERVATION_DATA}" not found.`);
    }
    const row = _findObservationRow(sheet, observationId);
    if (row === -1) {
      // Log this as a warning instead of returning an error that might break the UI flow.
      // The calling function might not handle the error gracefully.
      console.warn(`Observation with ID "${observationId}" not found in sheet. Cannot update script PDF URL.`);
      return { success: false, error: 'Observation not found.' };
    }
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const scriptPdfUrlCol = headers.indexOf('scriptPdfUrl') + 1;
    const lastModifiedCol = headers.indexOf('lastModifiedAt') + 1;
    if (scriptPdfUrlCol === 0) {
      // This is a configuration error, so throwing an error is appropriate.
      throw new Error('The "scriptPdfUrl" column was not found in the Observations sheet.');
    }
    // Update the script PDF URL and timestamp
    sheet.getRange(row, scriptPdfUrlCol).setValue(scriptPdfUrl);
    if (lastModifiedCol > 0) {
      sheet.getRange(row, lastModifiedCol).setValue(new Date().toISOString());
    }

    SpreadsheetApp.flush();

    debugLog('Observation script PDF URL updated', { observationId, scriptPdfUrl });
    return { success: true };

  } catch (error) {
    console.error(`Error updating script PDF URL for observation ${observationId}:`, error);
    // Return a structured error response
    return { success: false, error: `An unexpected error occurred while updating the script PDF URL: ${error.message}` };
  }
}


function _saveObservationNotes(observationId, componentId, notesContent) {
  if (!observationId || !componentId) {
    return { success: false, error: 'Observation ID and component ID are required.' };
  }

  return _updateObservationJsonData(observationId, 'observationData', (currentData) => {
    // Ensure the component object exists, preserving other properties
    if (!currentData[componentId]) {
      currentData[componentId] = { lookfors: [], proficiency: '', notes: '' };
    }
    
    // Sanitize and update the notes
    currentData[componentId].notes = sanitizeHtml(notesContent);

    return currentData;
  });
}

// Add a simple HTML sanitizer to prevent script injection
function sanitizeHtml(html) {
    // This is a very basic sanitizer. For a real-world application,
    // a more robust library would be recommended if available.
    // It allows simple formatting tags.
    return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
               .replace(/>/g, '&gt;').replace(/</g, '&lt;')
               .replace(/&lt;(\/?(p|strong|em|u|ol|ul|li|br|h1|h2))&gt;/g, '<$1>');
}

/**
 * Updates an entire observation record in the Google Sheet.
 * This is a generic function that can update any fields in the observation object.
 * @param {Object} observation The complete observation object with updated data.
 * @returns {{success: boolean, error?: string}} A response object.
 */
function updateObservationInSheet(observation) {
    if (!observation || !observation.observationId) {
        return { success: false, error: 'Valid observation object with observationId is required.' };
    }

    try {
        const spreadsheet = openSpreadsheet();
        const sheet = getSheetByName(spreadsheet, SHEET_NAMES.OBSERVATION_DATA);
        if (!sheet) {
            throw new Error(`Sheet "${SHEET_NAMES.OBSERVATION_DATA}" not found.`);
        }

        const row = _findObservationRow(sheet, observation.observationId);
        if (row === -1) {
            return { success: false, error: 'Observation not found in sheet.' };
        }

        // Get headers to map observation fields to columns
        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        
        // Update lastModifiedAt timestamp
        observation.lastModifiedAt = new Date().toISOString();

        // Prepare row data by mapping observation fields to header columns
        const rowData = headers.map(header => {
            let value = observation[header];
            
            // Convert objects to JSON strings for storage
            if (JSON_SERIALIZED_FIELDS.includes(header) && typeof value === 'object') {
                return JSON.stringify(value, null, 2);
            }
            
            // Return the value as is, or empty string if undefined
            return value !== undefined ? value : '';
        });

        // Update the entire row with new data
        sheet.getRange(row, 1, 1, rowData.length).setValues([rowData]);
        SpreadsheetApp.flush(); // Ensure the data is written immediately

        debugLog('Updated observation in sheet', { 
            observationId: observation.observationId, 
            row: row 
        });
        
        return { success: true };

    } catch (error) {
        console.error(`Error updating observation ${observation.observationId} in sheet:`, error);
        return { success: false, error: 'An unexpected error occurred while updating observation.' };
    }
}

/**
 * A test function to clear all observations from the properties service.
 * USE WITH CAUTION.
 */
function deleteAllObservations_DANGEROUS() {
    try {
        const spreadsheet = openSpreadsheet();
        const sheet = getSheetByName(spreadsheet, SHEET_NAMES.OBSERVATION_DATA);
        if (sheet && sheet.getLastRow() > 1) {
            sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
        }
        console.log('DELETED ALL OBSERVATIONS from Sheet.');
        return { success: true, message: 'All observations deleted from sheet.' };
    } catch (error) {
        console.error('Error deleting all observations from sheet:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Retrieves all finalized observations for the currently logged-in staff member.
 * This function is intended to be called from the client-side for the staff landing page.
 * @returns {Array<Object>} An array of finalized observation objects.
 */
function getFinalizedObservationsForUser() {
  try {
    const currentUserEmail = Session.getActiveUser().getEmail();
    if (!currentUserEmail) {
      // This case should ideally not be reached if the user is logged in
      console.warn('Could not retrieve finalized observations: user email is not available.');
      return [];
    }

    // Use the existing function to get finalized observations for the current user
    const finalizedObservations = getObservationsForUser(currentUserEmail, OBSERVATION_STATUS.FINALIZED);

    debugLog(`Retrieved ${finalizedObservations.length} finalized observations for user ${currentUserEmail}.`);

    return finalizedObservations;

  } catch (error) {
    console.error('Error in getFinalizedObservationsForUser:', error);
    // In case of an error, return an empty array to prevent breaking the client UI
    return [];
  }
}

/**
 * Creates a new Work Product observation.
 * @param {string} observerEmail The email of the Peer Evaluator creating the observation.
 * @param {string} observedEmail The email of the staff member being observed.
 * @returns {Object|null} The newly created work product observation object or null on error.
 */
function createWorkProductObservation(observerEmail, observedEmail) {
  const result = createNewObservation(observerEmail, observedEmail, 'Work Product');
  if (result) {
    incrementMasterCacheVersion();
  }
  return result;
}

/**
 * Creates a new Instructional Round observation.
 * @param {string} observerEmail The email of the Peer Evaluator creating the observation.
 * @param {string} observedEmail The email of the staff member being observed.
 * @returns {Object|null} The newly created instructional round observation object or null on error.
 */
function createInstructionalRoundObservation(observerEmail, observedEmail) {
  const result = createNewObservation(observerEmail, observedEmail, 'Instructional Round');
  if (result) {
    incrementMasterCacheVersion();
  }
  return result;
}

/**
 * Gets the observation type for a specific observation.
 * @param {string} observationId The ID of the observation.
 * @returns {string} The observation type ('Standard' or 'Work Product').
 */
function getObservationType(observationId) {
  try {
    const observations = _getObservationsDb();
    const observation = observations.find(obs => obs.observationId === observationId);
    return observation ? (observation.Type || 'Standard') : 'Standard';
  } catch (error) {
    console.error('Error getting observation type:', error);
    return 'Standard';
  }
}

/**
 * Gets all work product questions from the WorkProductQuestions sheet.
 * Only returns questions with IDs starting with 'WPQ'.
 * @returns {Array<Object>} Array of question objects with questionId, questionText, and order.
 */
function getWorkProductQuestions() {
  try {
    const cacheKey = 'work_product_questions';
    const cached = getCachedDataEnhanced(cacheKey);
    if (cached) return cached;

    const spreadsheet = openSpreadsheet();
    const sheet = getSheetByName(spreadsheet, SHEET_NAMES.WORK_PRODUCT_QUESTIONS);
    if (!sheet || sheet.getLastRow() < 2) return [];

    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
    const questions = values
      .filter(row => row[0] && row[0].toString().startsWith('WPQ')) // Filter for WPQ prefix only
      .map(row => ({
        questionId: row[0],
        questionText: row[1],
        order: row[2] || 0
      }))
      .sort((a, b) => a.order - b.order);

    setCachedDataEnhanced(cacheKey, questions);
    return questions;
  } catch (error) {
    console.error('Error getting work product questions:', error);
    return [];
  }
}

/**
 * Gets all standard observation questions from the WorkProductQuestions sheet.
 * Only returns questions with IDs starting with 'OBSQ'.
 * @returns {Array<Object>} Array of question objects with questionId, questionText, and order.
 */
function getStandardObservationQuestions() {
  try {
    const cacheKey = 'standard_observation_questions';
    const cached = getCachedDataEnhanced(cacheKey);
    if (cached) return cached;

    const spreadsheet = openSpreadsheet();
    const sheet = getSheetByName(spreadsheet, SHEET_NAMES.WORK_PRODUCT_QUESTIONS);
    if (!sheet || sheet.getLastRow() < 2) return [];

    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
    const questions = values
      .filter(row => row[0] && row[0].toString().startsWith('OBSQ')) // Filter for OBSQ prefix only
      .map(row => ({
        questionId: row[0],
        questionText: row[1],
        order: row[2] || 0
      }))
      .sort((a, b) => a.order - b.order);

    setCachedDataEnhanced(cacheKey, questions);
    return questions;
  } catch (error) {
    console.error('Error getting standard observation questions:', error);
    return [];
  }
}

/**
 * Saves or updates a work product answer.
 * @param {string} observationId The ID of the observation.
 * @param {string} questionId The ID of the question.
 * @param {string} answerText The answer text.
 * @returns {boolean} True if saved successfully, false otherwise.
 */
function saveWorkProductAnswer(observationId, questionId, answerText) {
  try {
    const spreadsheet = openSpreadsheet();
    const sheet = getSheetByName(spreadsheet, SHEET_NAMES.WORK_PRODUCT_ANSWERS);
    if (!sheet) {
      console.error('WorkProductAnswers sheet not found');
      return false;
    }

    // Find existing answer
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const dataRows = values.slice(1);

    const existingRowIndex = dataRows.findIndex(row =>
      row[1] === observationId && row[2] === questionId
    );

    if (existingRowIndex !== -1) {
      // Update existing answer
      sheet.getRange(existingRowIndex + 2, 4).setValue(answerText);
    } else {
      // Create new answer
      const newRow = [
        Utilities.getUuid(),
        observationId,
        questionId,
        answerText
      ];
      sheet.appendRow(newRow);
    }

    // Invalidate the cache for this observation's answers
    const cacheParams = { observationId: observationId };
    setCachedDataEnhanced('workProductAnswers', cacheParams, null, 0); // Setting TTL to 0 invalidates the cache

    return true;
  } catch (error) {
    console.error('Error saving work product answer:', error);
    return false;
  }
}

/**
 * Gets work product answers for a specific observation.
 * @param {string} observationId The ID of the observation.
 * @returns {Array<Object>} Array of answer objects with questionId and answerText.
 */
function getWorkProductAnswers(observationId) {
  try {
    // Use enhanced cache with observation-specific key
    const cacheParams = { observationId: observationId };
    const cachedAnswers = getCachedDataEnhanced('workProductAnswers', cacheParams);

    if (cachedAnswers && cachedAnswers.data) {
      debugLog('Work product answers retrieved from cache', { observationId: observationId });
      return cachedAnswers.data;
    }

    debugLog('Loading fresh work product answers', { observationId: observationId });

    const spreadsheet = openSpreadsheet();
    const sheet = getSheetByName(spreadsheet, SHEET_NAMES.WORK_PRODUCT_ANSWERS);
    if (!sheet || sheet.getLastRow() < 2) return [];

    const values = sheet.getDataRange().getValues();
    const dataRows = values.slice(1);

    const answers = dataRows
      .filter(row => row[1] === observationId) // Filter by ObservationID
      .map(row => ({
        questionId: row[2],
        answerText: row[3] || ''
      }));

    // Cache the results with shorter TTL since answers may change frequently
    setCachedDataEnhanced('workProductAnswers', cacheParams, answers, CACHE_SETTINGS.ROLE_CONFIG_TTL);

    return answers;
  } catch (error) {
    console.error('Error getting work product answers:', error);
    return [];
  }
}

/**
 * Checks if a user has a work product observation.
 * @param {string} userEmail The email of the user.
 * @returns {boolean} True if user has a work product observation, false otherwise.
 */
function checkUserHasWorkProductObservation(userEmail) {
  try {
    const observations = _getObservationsDb();
    return observations.some(obs =>
      obs.observedEmail === userEmail &&
      obs.Type === 'Work Product' &&
      obs.status === 'Draft'
    );
  } catch (error) {
    console.error('Error checking work product observation:', error);
    return false;
  }
}

/**
 * Checks if user has a Standard observation created by a Peer Evaluator.
 * Standard observations are read-only for staff members, so this should always return false.
 * @param {string} userEmail The email of the user.
 * @returns {boolean} Always returns false (Standard observations have no staff interaction buttons).
 * @deprecated Standard observations are fully read-only. This function kept for backward compatibility.
 */
function checkUserHasStandardObservationFromPeerEvaluator(userEmail) {
  // Standard observations are fully read-only - no buttons for staff members
  return false;
}

/**
 * Checks if user has an Instructional Round observation created by a Peer Evaluator.
 * @param {string} userEmail The email of the user.
 * @returns {boolean} True if user has Instructional Round observation from Peer Evaluator, false otherwise.
 */
function checkUserHasInstructionalRoundFromPeerEvaluator(userEmail) {
  try {
    const observations = _getObservationsDb();
    return observations.some(obs => {
      if (obs.observedEmail !== userEmail) return false;
      if (obs.Type !== 'Instructional Round') return false;
      if (obs.status !== 'Draft') return false;

      // Check if observer is Peer Evaluator
      const observer = getUserByEmail(obs.observerEmail);
      return observer && observer.role === 'Peer Evaluator';
    });
  } catch (error) {
    console.error('Error checking instructional round observation from peer evaluator:', error);
    return false;
  }
}

/**
 * Gets a summary of staff observations.
 * @param {string} userEmail The email of the user.
 * @returns {Object} Object with hasFinalized and count properties.
 */
function getStaffObservationSummary(userEmail) {
  try {
    const observations = _getObservationsDb();
    const userObservations = observations.filter(obs =>
      obs.observedEmail === userEmail && obs.status === 'Finalized'
    );

    return {
      hasFinalized: userObservations.length > 0,
      count: userObservations.length
    };
  } catch (error) {
    console.error('Error getting staff observation summary:', error);
    return { hasFinalized: false, count: 0 };
  }
}

/**
 * Gets the work product progress state for a user.
 * @param {string} userEmail The email of the user.
 * @returns {string} Progress state: 'not-started', 'in-progress', or 'submitted'.
 */
function getWorkProductProgressState(userEmail) {
  try {
    const observations = _getObservationsDb();
    const workProductObs = observations.find(obs =>
      obs.observedEmail === userEmail && obs.Type === 'Work Product'
    );

    if (!workProductObs) return 'not-started';

    // Check if any answers exist in Google Doc
    const answers = getWorkProductAnswersFromDoc(workProductObs.observationId);
    const hasAnswers = answers && answers.some(answer =>
      answer.answerText && answer.answerText.trim().length > 0
    );

    if (workProductObs.status === 'Finalized') return 'submitted';
    if (hasAnswers) return 'in-progress';
    return 'not-started';
  } catch (error) {
    console.error('Error getting work product progress state:', error);
    return 'not-started';
  }
}

/**
 * Gets the standard observation progress state for a user.
 * Only considers Standard observations created by Peer Evaluators.
 * @param {string} userEmail The email of the user.
 * @returns {string} Progress state: 'not-started', 'in-progress', or 'submitted'.
 */
function getStandardObservationProgressState(userEmail) {
  try {
    const observations = _getObservationsDb();
    const standardObs = observations.find(obs => {
      if (obs.observedEmail !== userEmail) return false;
      if ((obs.Type || 'Standard') !== 'Standard') return false;

      // Check if observer is Peer Evaluator
      const observer = getUserByEmail(obs.observerEmail);
      return observer && observer.role === 'Peer Evaluator';
    });

    if (!standardObs) return 'not-started';

    // Check if any answers exist in Google Doc
    const answers = getStandardObservationAnswersFromDoc(standardObs.observationId);
    const hasAnswers = answers && answers.some(answer =>
      answer.answerText && answer.answerText.trim().length > 0
    );

    if (standardObs.status === 'Finalized') return 'submitted';
    if (hasAnswers) return 'in-progress';
    return 'not-started';
  } catch (error) {
    console.error('Error getting standard observation progress state:', error);
    return 'not-started';
  }
}

/**
 * Finds a work product response document using Drive search with caching and error handling.
 * @param {string} observationId The ID of the observation.
 * @param {string} staffEmail The email of the staff member who owns the doc.
 * @param {string} currentUserEmail The email of the current user requesting access.
 * @returns {Object|null} Object with docId and docUrl, or null if not found.
 */
function findWorkProductResponseDoc(observationId, staffEmail, currentUserEmail) {
  try {
    const searchName = `Work Product Responses - ${observationId}`;

    // Add basic caching to avoid repeated Drive searches for the same observation
    // Use observation-based cache key since document is same regardless of who accesses it
    const cacheKey = `work_product_doc_${observationId}`;
    const cached = getCachedDataEnhanced(cacheKey);
    if (cached) {
      debugLog('Work product doc found in cache', {
        observationId: observationId,
        staffEmail: staffEmail,
        currentUserEmail: currentUserEmail
      });
      return cached;
    }

    debugLog('Searching for work product response doc', {
      observationId: observationId,
      staffEmail: staffEmail,
      currentUserEmail: currentUserEmail
    });

    let docResult = null;

    if (currentUserEmail === staffEmail) {
      // Staff member searches their own drive
      try {
        const files = DriveApp.searchFiles(`title = "${searchName}" and trashed = false`);
        if (files.hasNext()) {
          const file = files.next();
          docResult = {
            docId: file.getId(),
            docUrl: file.getUrl()
          };
          debugLog('Found work product doc in staff drive', { docId: docResult.docId });
        }
      } catch (driveError) {
        console.error('Error searching staff drive for work product doc:', driveError);
        return null;
      }
    } else {
      // Peer evaluator searches for shared documents
      try {
        const files = DriveApp.searchFiles(`title = "${searchName}" and trashed = false`);
        let searchCount = 0;
        const maxSearchAttempts = 5; // Reduced from 10 for better performance

        debugLog('Peer evaluator searching for shared work product docs', {
          observationId: observationId,
          currentUserEmail: currentUserEmail
        });

        while (files.hasNext() && searchCount < maxSearchAttempts) {
          searchCount++;
          const file = files.next();
          const fileId = file.getId();

          try {
            // Test access by trying to open the document
            const testDoc = DocumentApp.openById(fileId);
            // If we can access it, it's shared with us
            docResult = {
              docId: fileId,
              docUrl: file.getUrl()
            };
            debugLog('Successfully found accessible shared work product doc', {
              docId: docResult.docId,
              observationId: observationId,
              searchAttempt: searchCount
            });
            break;
          } catch (accessError) {
            // File not accessible to current user, continue searching
            debugLog('Work product doc not accessible to peer evaluator, continuing search', {
              fileId: fileId,
              observationId: observationId,
              searchAttempt: searchCount,
              error: accessError.message
            });
            continue;
          }
        }

        if (searchCount >= maxSearchAttempts && !docResult) {
          console.warn('Reached max search attempts for work product doc without finding accessible document:', {
            observationId: observationId,
            currentUserEmail: currentUserEmail,
            staffEmail: staffEmail,
            maxAttempts: maxSearchAttempts
          });
        }
      } catch (driveError) {
        console.error('Error searching for shared work product doc:', driveError, {
          observationId: observationId,
          currentUserEmail: currentUserEmail,
          staffEmail: staffEmail
        });
        return null;
      }
    }

    // Cache the result for a short time to improve performance
    if (docResult) {
      setCachedDataEnhanced(cacheKey, docResult, 300); // 5 minute cache
    }

    return docResult;
  } catch (error) {
    console.error('Critical error in findWorkProductResponseDoc:', error, {
      observationId: observationId,
      staffEmail: staffEmail,
      currentUserEmail: currentUserEmail,
      searchName: searchName,
      operation: 'findWorkProductResponseDoc'
    });
    return null;
  }
}

/**
 * Creates or gets a work product response document for staff member responses.
 * @param {string} observationId The ID of the observation.
 * @param {string} staffEmail The email of the staff member.
 * @param {string} peerEvaluatorEmail The email of the peer evaluator.
 * @returns {Object|null} Object with docId and docUrl, or null on error.
 */
function createOrGetWorkProductResponseDoc(observationId, staffEmail, peerEvaluatorEmail) {
  try {
    const userContext = createUserContext();

    // Check if doc already exists using Drive search
    const existingDoc = findWorkProductResponseDoc(observationId, staffEmail, userContext.email);
    if (existingDoc) {
      console.log(`Found existing work product response doc: ${existingDoc.docId}`);
      return existingDoc;
    }

    // Only staff members can create new response documents
    // Peer evaluators should only access existing documents through findWorkProductResponseDoc
    if (userContext.email !== staffEmail) {
      debugLog('Non-staff member attempted to create work product response doc - this is expected for view-only access:', {
        currentUser: userContext.email,
        staffEmail: staffEmail,
        observationId: observationId,
        userRole: userContext.role
      });
      return null;
    }

    // Create new Google Doc in staff member's Drive
    const docName = `Work Product Responses - ${observationId}`;
    let doc, docId;

    try {
      doc = DocumentApp.create(docName);
      docId = doc.getId();
      console.log(`Created new work product response doc: ${docId}`);
    } catch (docError) {
      console.error('Error creating Google Doc:', docError);
      return null;
    }

    // Set up document content
    try {
      const body = doc.getBody();
      body.clear();

      // Add header
      const header = body.appendParagraph('Work Product Reflection Responses');
      header.setHeading(DocumentApp.ParagraphHeading.HEADING1);
      header.editAsText().setBold(true);

      body.appendParagraph(`Observation ID: ${observationId}`);
      body.appendParagraph(`Staff Member: ${staffEmail}`);
      body.appendParagraph(`Peer Evaluator: ${peerEvaluatorEmail}`);
      body.appendParagraph('Generated: ' + new Date().toLocaleString());
      body.appendHorizontalRule();
      body.appendParagraph(''); // Empty line

      console.log('Successfully set up work product response doc content');
    } catch (contentError) {
      console.error('Error setting up document content:', contentError);
      // Continue even if content setup fails - the document still exists
    }

    // Share with peer evaluator (silent notification)
    let file = null;
    try {
      file = DriveApp.getFileById(docId);
      file.addEditor(peerEvaluatorEmail);
      console.log(`Work product response doc shared with peer evaluator: ${peerEvaluatorEmail}`);
    } catch (shareError) {
      console.error('Error sharing response doc with peer evaluator:', shareError);
      // Don't fail the entire operation if sharing fails - peer evaluator can be given access later
    }

    // Move the document to the observation folder now that peer evaluator has access
    if (file) {
      try {
        const observation = getObservationById(observationId);
        if (observation) {
          const obsFolder = _getObservationFolder(observation);
          file.moveTo(obsFolder);
          console.log(`Work product response doc moved to observation folder: ${obsFolder.getName()}`);
        }
      } catch (moveError) {
        console.error('Error moving response doc to observation folder:', moveError);
        // Don't fail the entire operation if move fails - document is still accessible
      }
    }

    // No need to store doc ID - we use Drive search to find it

    console.log(`Created work product response doc: ${docId} for observation: ${observationId}`);

    return {
      docId: docId,
      docUrl: doc.getUrl()
    };

  } catch (error) {
    console.error('Critical error creating work product response doc:', error, {
      observationId: observationId,
      staffEmail: staffEmail,
      peerEvaluatorEmail: peerEvaluatorEmail,
      currentUserEmail: userContext ? userContext.email : 'unknown',
      operation: 'createOrGetWorkProductResponseDoc'
    });
    return null;
  }
}

/**
 * Saves a work product answer to the response Google Doc.
 * @param {string} observationId The ID of the observation.
 * @param {string} questionId The ID of the question.
 * @param {string} answerText The answer text.
 * @returns {boolean} True if saved successfully, false otherwise.
 */
function saveWorkProductAnswerToDoc(observationId, questionId, answerText) {
  try {
    // Get the observation to find staff email
    const observations = _getObservationsDb();
    const observation = observations.find(obs => obs.observationId === observationId);

    if (!observation) {
      console.error('Observation not found:', observationId);
      return false;
    }

    const userContext = createUserContext();

    // Find or create the response document using Drive search
    let docResult = findWorkProductResponseDoc(observationId, observation.observedEmail, userContext.email);

    // If document not found and user is staff member, create it
    if (!docResult && userContext.email === observation.observedEmail) {
      console.log('No response document found, creating new one for staff member:', observationId);
      const newDocResult = createOrGetWorkProductResponseDoc(observationId, observation.observedEmail, observation.observerEmail);
      if (!newDocResult) {
        console.error('Failed to create work product response doc for observation:', observationId);
        return false;
      }
      docResult = newDocResult;
    }

    // If still no document found (peer evaluator or creation failed)
    if (!docResult) {
      console.error('No response document found and unable to create for observation:', observationId, {
        currentUserEmail: userContext.email,
        observedEmail: observation.observedEmail,
        isStaffMember: userContext.email === observation.observedEmail
      });
      return false;
    }

    let doc;
    try {
      doc = DocumentApp.openById(docResult.docId);
    } catch (docError) {
      console.error('Error opening work product response doc:', docError);
      return false;
    }
    let body;
    try {
      body = doc.getBody();
    } catch (bodyError) {
      console.error('Error accessing document body:', bodyError);
      return false;
    }

    try {
      // Get the question text from the questions sheet
      const questions = getWorkProductQuestions();
      const question = questions.find(q => q.questionId === questionId);
      const questionText = question ? question.questionText : '';

      // Search for existing answer section
      const searchPattern = `Question ${questionId}:`;
      const searchResult = body.findText(searchPattern);

      if (searchResult) {
        // Update existing answer
        const element = searchResult.getElement();
        const paragraph = element.getParent();

        // Check if there's a question text paragraph after the question ID
        let currentSibling = paragraph.getNextSibling();
        let questionTextParagraph = null;
        let answerParagraph = null;

        // Look for the question text and answer paragraphs
        if (currentSibling && currentSibling.getType() === DocumentApp.ElementType.PARAGRAPH) {
          const siblingText = currentSibling.asParagraph().getText();
          // If it's italic, it's the question text
          if (currentSibling.asParagraph().editAsText().isItalic()) {
            questionTextParagraph = currentSibling.asParagraph();
            currentSibling = currentSibling.getNextSibling();
          }
        }

        // The next paragraph should be the answer
        if (currentSibling && currentSibling.getType() === DocumentApp.ElementType.PARAGRAPH) {
          answerParagraph = currentSibling.asParagraph();
          answerParagraph.setText(answerText || '(No response provided)');
        } else {
          // Insert answer paragraph
          const insertIndex = questionTextParagraph
            ? body.getChildIndex(questionTextParagraph) + 1
            : body.getChildIndex(paragraph) + 1;
          answerParagraph = body.insertParagraph(insertIndex, answerText || '(No response provided)');
          answerParagraph.setIndentFirstLine(20);
        }

        // Update question text if it exists and is different
        if (questionText && questionTextParagraph) {
          questionTextParagraph.setText(questionText);
        } else if (questionText && !questionTextParagraph) {
          // Insert question text paragraph after question ID
          const insertIndex = body.getChildIndex(paragraph) + 1;
          const newQuestionTextPara = body.insertParagraph(insertIndex, questionText);
          newQuestionTextPara.setIndentFirstLine(20);
          newQuestionTextPara.editAsText().setItalic(true);
          newQuestionTextPara.editAsText().setForegroundColor('#6b7280');
        }
      } else {
        // Add new question and answer at the end
        body.appendParagraph(''); // Empty line
        const questionParagraph = body.appendParagraph(`Question ${questionId}:`);
        questionParagraph.editAsText().setBold(true);

        // Add question text if available
        if (questionText) {
          const questionTextParagraph = body.appendParagraph(questionText);
          questionTextParagraph.setIndentFirstLine(20);
          questionTextParagraph.editAsText().setItalic(true);
          questionTextParagraph.editAsText().setForegroundColor('#6b7280');
        }

        const answerParagraph = body.appendParagraph(answerText || '(No response provided)');
        answerParagraph.setIndentFirstLine(20);
      }

      // Update or add timestamp
      const timestampPattern = 'Last updated:';
      const timestampSearch = body.findText(timestampPattern);

      if (timestampSearch) {
        // Update existing timestamp
        const element = timestampSearch.getElement();
        const paragraph = element.getParent();
        paragraph.asParagraph().setText(`Last updated: ${new Date().toLocaleString()}`);
      } else {
        // Add new timestamp
        body.appendParagraph('');
        body.appendParagraph(`Last updated: ${new Date().toLocaleString()}`);
      }
    } catch (editError) {
      console.error('Error editing work product response doc content:', editError);
      return false;
    }

    console.log(`Saved work product answer to doc for question ${questionId}`);
    return true;

  } catch (error) {
    console.error('Critical error saving work product answer to doc:', error, {
      observationId: observationId,
      questionId: questionId,
      currentUserEmail: userContext ? userContext.email : 'unknown',
      observedEmail: observation ? observation.observedEmail : 'unknown',
      operation: 'saveWorkProductAnswerToDoc',
      answerLength: answerText ? answerText.length : 0
    });
    return false;
  }
}

/**
 * Gets work product answers from the response Google Doc.
 * @param {string} observationId The ID of the observation.
 * @returns {Array<Object>} Array of answer objects with questionId and answerText.
 */
function getWorkProductAnswersFromDoc(observationId) {
  try {
    // Get the observation to find staff email
    const observations = _getObservationsDb();
    const observation = observations.find(obs => obs.observationId === observationId);

    if (!observation) {
      console.log('Observation not found:', observationId);
      return [];
    }

    const userContext = createUserContext();

    // Find the response document using Drive search
    const docResult = findWorkProductResponseDoc(observationId, observation.observedEmail, userContext.email);
    if (!docResult) {
      console.log('No response document found for observation:', observationId);
      return [];
    }

    let doc;
    try {
      doc = DocumentApp.openById(docResult.docId);
    } catch (docError) {
      console.error('Error opening work product response doc for reading:', docError);
      return [];
    }
    const body = doc.getBody();
    const text = body.getText();

    // Parse questions and answers
    const answers = [];
    const lines = text.split('\n');
    let currentQuestionId = null;
    let currentAnswer = '';
    let collectingAnswer = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check if this is a question line
      const questionMatch = line.match(/^Question\s+([^:]+):\s*$/);
      if (questionMatch) {
        // Save previous answer if we have one
        if (currentQuestionId && currentAnswer.trim() && currentAnswer.trim() !== '(No response provided)') {
          answers.push({
            questionId: currentQuestionId,
            answerText: currentAnswer.trim()
          });
        }

        // Start new question
        currentQuestionId = questionMatch[1].trim();
        currentAnswer = '';
        collectingAnswer = true;
        continue;
      }

      // Skip metadata lines and horizontal rules
      if (line.startsWith('Last updated:') || line.startsWith('Observation ID:') ||
          line.startsWith('Staff Member:') || line.startsWith('Peer Evaluator:') ||
          line.startsWith('Generated:') || line === '' ||
          line === 'Work Product Reflection Responses' ||
          line.includes('---') || line.includes('___')) {
        continue;
      }

      // Collect answer text
      if (collectingAnswer && currentQuestionId) {
        if (currentAnswer) currentAnswer += '\n';
        currentAnswer += line;
      }
    }

    // Save the last answer
    if (currentQuestionId && currentAnswer.trim() && currentAnswer.trim() !== '(No response provided)') {
      answers.push({
        questionId: currentQuestionId,
        answerText: currentAnswer.trim()
      });
    }

    console.log(`Retrieved ${answers.length} work product answers from doc`);
    return answers;

  } catch (error) {
    console.error('Critical error getting work product answers from doc:', error, {
      observationId: observationId,
      currentUserEmail: userContext ? userContext.email : 'unknown',
      observedEmail: observation ? observation.observedEmail : 'unknown',
      operation: 'getWorkProductAnswersFromDoc'
    });
    return [];
  }
}

/**
 * Finds a standard observation response document using Drive search.
 * @param {string} observationId The ID of the observation.
 * @param {string} staffEmail The email of the staff member who owns the doc.
 * @param {string} currentUserEmail The email of the current user requesting access.
 * @returns {Object|null} Object with docId and docUrl, or null if not found.
 */
function findStandardObservationResponseDoc(observationId, staffEmail, currentUserEmail) {
  try {
    const searchName = `Standard Observation Responses - ${observationId}`;

    // Add basic caching to avoid repeated Drive searches
    const cacheKey = `standard_obs_doc_${observationId}`;
    const cached = getCachedDataEnhanced(cacheKey);
    if (cached) {
      debugLog('Standard observation doc found in cache', {
        observationId: observationId,
        staffEmail: staffEmail,
        currentUserEmail: currentUserEmail
      });
      return cached;
    }

    debugLog('Searching for standard observation response doc', {
      observationId: observationId,
      staffEmail: staffEmail,
      currentUserEmail: currentUserEmail
    });

    let docResult = null;

    if (currentUserEmail === staffEmail) {
      // Staff member searches their own drive
      try {
        const files = DriveApp.searchFiles(`title = "${searchName}" and trashed = false`);
        if (files.hasNext()) {
          const file = files.next();
          docResult = {
            docId: file.getId(),
            docUrl: file.getUrl()
          };
          debugLog('Found standard observation doc in staff drive', { docId: docResult.docId });
        }
      } catch (driveError) {
        console.error('Error searching staff drive for standard observation doc:', driveError);
        return null;
      }
    } else {
      // Peer evaluator searches for shared documents
      try {
        const files = DriveApp.searchFiles(`title = "${searchName}" and trashed = false`);
        let searchCount = 0;
        const maxSearchAttempts = 5;

        debugLog('Peer evaluator searching for shared standard observation docs', {
          observationId: observationId,
          currentUserEmail: currentUserEmail
        });

        while (files.hasNext() && searchCount < maxSearchAttempts) {
          searchCount++;
          const file = files.next();
          const fileId = file.getId();

          try {
            const testDoc = DocumentApp.openById(fileId);
            docResult = {
              docId: fileId,
              docUrl: file.getUrl()
            };
            debugLog('Successfully found accessible shared standard observation doc', {
              docId: docResult.docId,
              observationId: observationId,
              searchAttempt: searchCount
            });
            break;
          } catch (accessError) {
            debugLog('Standard observation doc not accessible to peer evaluator, continuing search', {
              fileId: fileId,
              observationId: observationId,
              searchAttempt: searchCount,
              error: accessError.message
            });
            continue;
          }
        }

        if (searchCount >= maxSearchAttempts && !docResult) {
          console.warn('Reached max search attempts for standard observation doc without finding accessible document:', {
            observationId: observationId,
            currentUserEmail: currentUserEmail,
            staffEmail: staffEmail,
            maxAttempts: maxSearchAttempts
          });
        }
      } catch (driveError) {
        console.error('Error searching for shared standard observation doc:', driveError, {
          observationId: observationId,
          currentUserEmail: currentUserEmail,
          staffEmail: staffEmail
        });
        return null;
      }
    }

    // Cache the result for a short time
    if (docResult) {
      setCachedDataEnhanced(cacheKey, docResult, 300); // 5 minute cache
    }

    return docResult;
  } catch (error) {
    console.error('Critical error in findStandardObservationResponseDoc:', error, {
      observationId: observationId,
      staffEmail: staffEmail,
      currentUserEmail: currentUserEmail,
      searchName: `Standard Observation Responses - ${observationId}`,
      operation: 'findStandardObservationResponseDoc'
    });
    return null;
  }
}

/**
 * Saves a standard observation answer to the response Google Doc.
 * @param {string} observationId The ID of the observation.
 * @param {string} questionId The ID of the question.
 * @param {string} answerText The answer text.
 * @returns {boolean} True if saved successfully, false otherwise.
 */
function saveStandardObservationAnswerToDoc(observationId, questionId, answerText) {
  try {
    const observations = _getObservationsDb();
    const observation = observations.find(obs => obs.observationId === observationId);

    if (!observation) {
      console.error('Observation not found:', observationId);
      return false;
    }

    const userContext = createUserContext();

    // Find or create the response document
    let docResult = findStandardObservationResponseDoc(observationId, observation.observedEmail, userContext.email);

    // If document not found and user is staff member, create it
    if (!docResult && userContext.email === observation.observedEmail) {
      console.log('No response document found, creating new one for staff member:', observationId);
      const newDocResult = createOrGetStandardObservationResponseDoc(observationId, observation.observedEmail, observation.observerEmail);
      if (!newDocResult) {
        console.error('Failed to create standard observation response doc for observation:', observationId);
        return false;
      }
      docResult = newDocResult;
    }

    if (!docResult) {
      console.error('No response document found and unable to create for observation:', observationId, {
        currentUserEmail: userContext.email,
        observedEmail: observation.observedEmail,
        isStaffMember: userContext.email === observation.observedEmail
      });
      return false;
    }

    let doc;
    try {
      doc = DocumentApp.openById(docResult.docId);
    } catch (docError) {
      console.error('Error opening standard observation response doc:', docError);
      return false;
    }

    let body;
    try {
      body = doc.getBody();
    } catch (bodyError) {
      console.error('Error accessing document body:', bodyError);
      return false;
    }

    try {
      // Search for existing answer section
      const searchPattern = `Question ${questionId}:`;
      const searchResult = body.findText(searchPattern);

      if (searchResult) {
        // Update existing answer
        const element = searchResult.getElement();
        const paragraph = element.getParent();
        const nextParagraph = paragraph.getNextSibling();

        if (nextParagraph && nextParagraph.getType() === DocumentApp.ElementType.PARAGRAPH) {
          nextParagraph.asParagraph().setText(answerText || '(No response provided)');
        } else {
          const answerParagraph = body.insertParagraph(body.getChildIndex(paragraph) + 1, answerText || '(No response provided)');
          answerParagraph.setIndentFirstLine(20);
        }
      } else {
        // Add new question and answer at the end
        body.appendParagraph('');
        const questionParagraph = body.appendParagraph(`Question ${questionId}:`);
        questionParagraph.editAsText().setBold(true);

        const answerParagraph = body.appendParagraph(answerText || '(No response provided)');
        answerParagraph.setIndentFirstLine(20);
      }

      // Update or add timestamp
      const timestampPattern = 'Last updated:';
      const timestampSearch = body.findText(timestampPattern);

      if (timestampSearch) {
        const element = timestampSearch.getElement();
        const paragraph = element.getParent();
        paragraph.asParagraph().setText(`Last updated: ${new Date().toLocaleString()}`);
      } else {
        body.appendParagraph('');
        body.appendParagraph(`Last updated: ${new Date().toLocaleString()}`);
      }
    } catch (editError) {
      console.error('Error editing standard observation response doc content:', editError);
      return false;
    }

    console.log(`Saved standard observation answer to doc for question ${questionId}`);
    return true;

  } catch (error) {
    console.error('Critical error saving standard observation answer to doc:', error, {
      observationId: observationId,
      questionId: questionId,
      currentUserEmail: userContext ? userContext.email : 'unknown',
      observedEmail: observation ? observation.observedEmail : 'unknown',
      operation: 'saveStandardObservationAnswerToDoc',
      answerLength: answerText ? answerText.length : 0
    });
    return false;
  }
}

/**
 * Creates or gets a standard observation response document for staff member responses.
 * @param {string} observationId The ID of the observation.
 * @param {string} staffEmail The email of the staff member.
 * @param {string} peerEvaluatorEmail The email of the peer evaluator.
 * @returns {Object|null} Object with docId and docUrl, or null on error.
 */
function createOrGetStandardObservationResponseDoc(observationId, staffEmail, peerEvaluatorEmail) {
  try {
    const userContext = createUserContext();

    // Check if doc already exists
    const existingDoc = findStandardObservationResponseDoc(observationId, staffEmail, userContext.email);
    if (existingDoc) {
      console.log(`Found existing standard observation response doc: ${existingDoc.docId}`);
      return existingDoc;
    }

    // Only staff members can create new response documents
    if (userContext.email !== staffEmail) {
      debugLog('Non-staff member attempted to create standard observation response doc - this is expected for view-only access:', {
        currentUser: userContext.email,
        staffEmail: staffEmail,
        observationId: observationId,
        userRole: userContext.role
      });
      return null;
    }

    // Create new Google Doc
    const docName = `Standard Observation Responses - ${observationId}`;
    let doc, docId;

    try {
      doc = DocumentApp.create(docName);
      docId = doc.getId();
      console.log(`Created new standard observation response doc: ${docId}`);
    } catch (docError) {
      console.error('Error creating Google Doc:', docError);
      return null;
    }

    // Set up document content
    try {
      const body = doc.getBody();
      body.clear();

      const header = body.appendParagraph('Standard Observation Reflection Responses');
      header.setHeading(DocumentApp.ParagraphHeading.HEADING1);
      header.editAsText().setBold(true);

      body.appendParagraph(`Observation ID: ${observationId}`);
      body.appendParagraph(`Staff Member: ${staffEmail}`);
      body.appendParagraph(`Peer Evaluator: ${peerEvaluatorEmail}`);
      body.appendParagraph('Generated: ' + new Date().toLocaleString());
      body.appendHorizontalRule();
      body.appendParagraph('');

      console.log('Successfully set up standard observation response doc content');
    } catch (contentError) {
      console.error('Error setting up document content:', contentError);
    }

    // Share with peer evaluator
    let file = null;
    try {
      file = DriveApp.getFileById(docId);
      file.addEditor(peerEvaluatorEmail);
      console.log(`Standard observation response doc shared with peer evaluator: ${peerEvaluatorEmail}`);
    } catch (shareError) {
      console.error('Error sharing response doc with peer evaluator:', shareError);
    }

    // Move the document to the observation folder now that peer evaluator has access
    if (file) {
      try {
        const observation = getObservationById(observationId);
        if (observation) {
          const obsFolder = _getObservationFolder(observation);
          file.moveTo(obsFolder);
          console.log(`Standard observation response doc moved to observation folder: ${obsFolder.getName()}`);
        }
      } catch (moveError) {
        console.error('Error moving response doc to observation folder:', moveError);
        // Don't fail the entire operation if move fails - document is still accessible
      }
    }

    console.log(`Created standard observation response doc: ${docId} for observation: ${observationId}`);

    return {
      docId: docId,
      docUrl: doc.getUrl()
    };

  } catch (error) {
    console.error('Critical error creating standard observation response doc:', error, {
      observationId: observationId,
      staffEmail: staffEmail,
      peerEvaluatorEmail: peerEvaluatorEmail,
      currentUserEmail: userContext ? userContext.email : 'unknown',
      operation: 'createOrGetStandardObservationResponseDoc'
    });
    return null;
  }
}

/**
 * Gets standard observation answers from the response Google Doc.
 * @param {string} observationId The ID of the observation.
 * @returns {Array<Object>} Array of answer objects with questionId and answerText.
 */
function getStandardObservationAnswersFromDoc(observationId) {
  try {
    const observations = _getObservationsDb();
    const observation = observations.find(obs => obs.observationId === observationId);

    if (!observation) {
      console.log('Observation not found:', observationId);
      return [];
    }

    const userContext = createUserContext();

    // Find the response document
    const docResult = findStandardObservationResponseDoc(observationId, observation.observedEmail, userContext.email);
    if (!docResult) {
      console.log('No response document found for observation:', observationId);
      return [];
    }

    let doc;
    try {
      doc = DocumentApp.openById(docResult.docId);
    } catch (docError) {
      console.error('Error opening standard observation response doc for reading:', docError);
      return [];
    }

    const body = doc.getBody();
    const text = body.getText();

    // Parse questions and answers
    const answers = [];
    const lines = text.split('\n');
    let currentQuestionId = null;
    let currentAnswer = '';
    let collectingAnswer = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check if this is a question line
      const questionMatch = line.match(/^Question\s+([^:]+):\s*$/);
      if (questionMatch) {
        // Save previous answer if we have one
        if (currentQuestionId && currentAnswer.trim() && currentAnswer.trim() !== '(No response provided)') {
          answers.push({
            questionId: currentQuestionId,
            answerText: currentAnswer.trim()
          });
        }

        // Start new question
        currentQuestionId = questionMatch[1].trim();
        currentAnswer = '';
        collectingAnswer = true;
        continue;
      }

      // Skip metadata lines and horizontal rules
      if (line.startsWith('Last updated:') || line.startsWith('Observation ID:') ||
          line.startsWith('Staff Member:') || line.startsWith('Peer Evaluator:') ||
          line.startsWith('Generated:') || line === '' ||
          line === 'Standard Observation Reflection Responses' ||
          line.includes('---') || line.includes('___')) {
        continue;
      }

      // Collect answer text
      if (collectingAnswer && currentQuestionId) {
        if (currentAnswer) currentAnswer += '\n';
        currentAnswer += line;
      }
    }

    // Save the last answer
    if (currentQuestionId && currentAnswer.trim() && currentAnswer.trim() !== '(No response provided)') {
      answers.push({
        questionId: currentQuestionId,
        answerText: currentAnswer.trim()
      });
    }

    console.log(`Retrieved ${answers.length} standard observation answers from doc`);
    return answers;

  } catch (error) {
    console.error('Critical error getting standard observation answers from doc:', error, {
      observationId: observationId,
      currentUserEmail: userContext ? userContext.email : 'unknown',
      observedEmail: observation ? observation.observedEmail : 'unknown',
      operation: 'getStandardObservationAnswersFromDoc'
    });
    return [];
  }
}

/**
 * Finds an instructional round response document using Drive search.
 * @param {string} observationId The ID of the observation.
 * @param {string} staffEmail The email of the staff member who owns the doc.
 * @param {string} currentUserEmail The email of the current user requesting access.
 * @returns {Object|null} Object with docId and docUrl, or null if not found.
 */
function findInstructionalRoundResponseDoc(observationId, staffEmail, currentUserEmail) {
  try {
    const searchName = `Instructional Round Responses - ${observationId}`;

    // Add basic caching to avoid repeated Drive searches
    const cacheKey = `instructional_round_doc_${observationId}`;
    const cached = getCachedDataEnhanced(cacheKey);
    if (cached) {
      debugLog('Instructional round doc found in cache', {
        observationId: observationId,
        staffEmail: staffEmail,
        currentUserEmail: currentUserEmail
      });
      return cached;
    }

    debugLog('Searching for instructional round response doc', {
      observationId: observationId,
      staffEmail: staffEmail,
      currentUserEmail: currentUserEmail
    });

    let docResult = null;

    if (currentUserEmail === staffEmail) {
      // Staff member searches their own drive
      try {
        const files = DriveApp.searchFiles(`title = "${searchName}" and trashed = false`);
        if (files.hasNext()) {
          const file = files.next();
          docResult = {
            docId: file.getId(),
            docUrl: file.getUrl()
          };
          debugLog('Found instructional round doc in staff drive', { docId: docResult.docId });
        }
      } catch (driveError) {
        console.error('Error searching staff drive for instructional round doc:', driveError);
        return null;
      }
    } else {
      // Peer evaluator searches for shared documents
      try {
        const files = DriveApp.searchFiles(`title = "${searchName}" and trashed = false`);
        let searchCount = 0;
        const maxSearchAttempts = 5;

        debugLog('Peer evaluator searching for shared instructional round docs', {
          observationId: observationId,
          currentUserEmail: currentUserEmail
        });

        while (files.hasNext() && searchCount < maxSearchAttempts) {
          searchCount++;
          const file = files.next();
          const fileId = file.getId();

          try {
            const testDoc = DocumentApp.openById(fileId);
            docResult = {
              docId: fileId,
              docUrl: file.getUrl()
            };
            debugLog('Successfully found accessible shared instructional round doc', {
              docId: docResult.docId,
              observationId: observationId,
              searchAttempt: searchCount
            });
            break;
          } catch (accessError) {
            debugLog('Instructional round doc not accessible to peer evaluator, continuing search', {
              fileId: fileId,
              observationId: observationId,
              searchAttempt: searchCount,
              error: accessError.message
            });
            continue;
          }
        }

        if (searchCount >= maxSearchAttempts && !docResult) {
          console.warn('Reached max search attempts for instructional round doc without finding accessible document:', {
            observationId: observationId,
            currentUserEmail: currentUserEmail,
            staffEmail: staffEmail,
            maxAttempts: maxSearchAttempts
          });
        }
      } catch (driveError) {
        console.error('Error searching for shared instructional round doc:', driveError, {
          observationId: observationId,
          currentUserEmail: currentUserEmail,
          staffEmail: staffEmail
        });
        return null;
      }
    }

    // Cache the result for a short time
    if (docResult) {
      setCachedDataEnhanced(cacheKey, docResult, 300); // 5 minute cache
    }

    return docResult;
  } catch (error) {
    console.error('Critical error in findInstructionalRoundResponseDoc:', error, {
      observationId: observationId,
      staffEmail: staffEmail,
      currentUserEmail: currentUserEmail,
      searchName: `Instructional Round Responses - ${observationId}`,
      operation: 'findInstructionalRoundResponseDoc'
    });
    return null;
  }
}

/**
 * Creates or gets an instructional round response document for staff member responses.
 * @param {string} observationId The ID of the observation.
 * @param {string} staffEmail The email of the staff member.
 * @param {string} peerEvaluatorEmail The email of the peer evaluator.
 * @returns {Object|null} Object with docId and docUrl, or null on error.
 */
function createOrGetInstructionalRoundResponseDoc(observationId, staffEmail, peerEvaluatorEmail) {
  try {
    const userContext = createUserContext();

    // Check if doc already exists
    const existingDoc = findInstructionalRoundResponseDoc(observationId, staffEmail, userContext.email);
    if (existingDoc) {
      console.log(`Found existing instructional round response doc: ${existingDoc.docId}`);
      return existingDoc;
    }

    // Only staff members can create new response documents
    if (userContext.email !== staffEmail) {
      debugLog('Non-staff member attempted to create instructional round response doc - this is expected for view-only access:', {
        currentUser: userContext.email,
        staffEmail: staffEmail,
        observationId: observationId,
        userRole: userContext.role
      });
      return null;
    }

    // Create new Google Doc
    const docName = `Instructional Round Responses - ${observationId}`;
    let doc, docId;

    try {
      doc = DocumentApp.create(docName);
      docId = doc.getId();
      console.log(`Created new instructional round response doc: ${docId}`);
    } catch (docError) {
      console.error('Error creating Google Doc:', docError);
      return null;
    }

    // Set up document content
    try {
      const body = doc.getBody();
      body.clear();

      const header = body.appendParagraph('Instructional Round Reflection Responses');
      header.setHeading(DocumentApp.ParagraphHeading.HEADING1);
      header.editAsText().setBold(true);

      body.appendParagraph(`Observation ID: ${observationId}`);
      body.appendParagraph(`Staff Member: ${staffEmail}`);
      body.appendParagraph(`Peer Evaluator: ${peerEvaluatorEmail}`);
      body.appendParagraph('Generated: ' + new Date().toLocaleString());
      body.appendHorizontalRule();
      body.appendParagraph('');

      console.log('Successfully set up instructional round response doc content');
    } catch (contentError) {
      console.error('Error setting up document content:', contentError);
    }

    // Share with peer evaluator
    let file = null;
    try {
      file = DriveApp.getFileById(docId);
      file.addEditor(peerEvaluatorEmail);
      console.log(`Instructional round response doc shared with peer evaluator: ${peerEvaluatorEmail}`);
    } catch (shareError) {
      console.error('Error sharing response doc with peer evaluator:', shareError);
    }

    // Move the document to the observation folder now that peer evaluator has access
    if (file) {
      try {
        const observation = getObservationById(observationId);
        if (observation) {
          const obsFolder = _getObservationFolder(observation);
          file.moveTo(obsFolder);
          console.log(`Instructional round response doc moved to observation folder: ${obsFolder.getName()}`);
        }
      } catch (moveError) {
        console.error('Error moving response doc to observation folder:', moveError);
        // Don't fail the entire operation if move fails - document is still accessible
      }
    }

    console.log(`Created instructional round response doc: ${docId} for observation: ${observationId}`);

    return {
      docId: docId,
      docUrl: doc.getUrl()
    };

  } catch (error) {
    console.error('Critical error creating instructional round response doc:', error, {
      observationId: observationId,
      staffEmail: staffEmail,
      peerEvaluatorEmail: peerEvaluatorEmail,
      currentUserEmail: userContext ? userContext.email : 'unknown',
      operation: 'createOrGetInstructionalRoundResponseDoc'
    });
    return null;
  }
}

/**
 * Saves an instructional round answer to the response Google Doc.
 * @param {string} observationId The ID of the observation.
 * @param {string} questionId The ID of the question.
 * @param {string} answerText The answer text.
 * @returns {boolean} True if saved successfully, false otherwise.
 */
function saveInstructionalRoundAnswerToDoc(observationId, questionId, answerText) {
  try {
    const observations = _getObservationsDb();
    const observation = observations.find(obs => obs.observationId === observationId);

    if (!observation) {
      console.error('Observation not found:', observationId);
      return false;
    }

    const userContext = createUserContext();

    // Find or create the response document
    let docResult = findInstructionalRoundResponseDoc(observationId, observation.observedEmail, userContext.email);

    // If document not found and user is staff member, create it
    if (!docResult && userContext.email === observation.observedEmail) {
      console.log('No response document found, creating new one for staff member:', observationId);
      const newDocResult = createOrGetInstructionalRoundResponseDoc(observationId, observation.observedEmail, observation.observerEmail);
      if (!newDocResult) {
        console.error('Failed to create instructional round response doc for observation:', observationId);
        return false;
      }
      docResult = newDocResult;
    }

    if (!docResult) {
      console.error('No response document found and unable to create for observation:', observationId, {
        currentUserEmail: userContext.email,
        observedEmail: observation.observedEmail,
        isStaffMember: userContext.email === observation.observedEmail
      });
      return false;
    }

    let doc;
    try {
      doc = DocumentApp.openById(docResult.docId);
    } catch (docError) {
      console.error('Error opening instructional round response doc:', docError);
      return false;
    }

    let body;
    try {
      body = doc.getBody();
    } catch (bodyError) {
      console.error('Error accessing document body:', bodyError);
      return false;
    }

    try {
      // Get the question text from the questions sheet
      const questions = getStandardObservationQuestions();
      const question = questions.find(q => q.questionId === questionId);
      const questionText = question ? question.questionText : '';

      // Search for existing answer section
      const searchPattern = `Question ${questionId}:`;
      const searchResult = body.findText(searchPattern);

      if (searchResult) {
        // Update existing answer
        const element = searchResult.getElement();
        const paragraph = element.getParent();

        // Check if there's a question text paragraph after the question ID
        let currentSibling = paragraph.getNextSibling();
        let questionTextParagraph = null;
        let answerParagraph = null;

        // Look for the question text and answer paragraphs
        if (currentSibling && currentSibling.getType() === DocumentApp.ElementType.PARAGRAPH) {
          const siblingText = currentSibling.asParagraph().getText();
          // If it's italic, it's the question text
          if (currentSibling.asParagraph().editAsText().isItalic()) {
            questionTextParagraph = currentSibling.asParagraph();
            currentSibling = currentSibling.getNextSibling();
          }
        }

        // The next paragraph should be the answer
        if (currentSibling && currentSibling.getType() === DocumentApp.ElementType.PARAGRAPH) {
          answerParagraph = currentSibling.asParagraph();
          answerParagraph.setText(answerText || '(No response provided)');
        } else {
          // Insert answer paragraph
          const insertIndex = questionTextParagraph
            ? body.getChildIndex(questionTextParagraph) + 1
            : body.getChildIndex(paragraph) + 1;
          answerParagraph = body.insertParagraph(insertIndex, answerText || '(No response provided)');
          answerParagraph.setIndentFirstLine(20);
        }

        // Update question text if it exists and is different
        if (questionText && questionTextParagraph) {
          questionTextParagraph.setText(questionText);
        } else if (questionText && !questionTextParagraph) {
          // Insert question text paragraph after question ID
          const insertIndex = body.getChildIndex(paragraph) + 1;
          const newQuestionTextPara = body.insertParagraph(insertIndex, questionText);
          newQuestionTextPara.setIndentFirstLine(20);
          newQuestionTextPara.editAsText().setItalic(true);
          newQuestionTextPara.editAsText().setForegroundColor('#6b7280');
        }
      } else {
        // Add new question and answer at the end
        body.appendParagraph('');
        const questionParagraph = body.appendParagraph(`Question ${questionId}:`);
        questionParagraph.editAsText().setBold(true);

        // Add question text if available
        if (questionText) {
          const questionTextParagraph = body.appendParagraph(questionText);
          questionTextParagraph.setIndentFirstLine(20);
          questionTextParagraph.editAsText().setItalic(true);
          questionTextParagraph.editAsText().setForegroundColor('#6b7280');
        }

        const answerParagraph = body.appendParagraph(answerText || '(No response provided)');
        answerParagraph.setIndentFirstLine(20);
      }

      // Update or add timestamp
      const timestampPattern = 'Last updated:';
      const timestampSearch = body.findText(timestampPattern);

      if (timestampSearch) {
        const element = timestampSearch.getElement();
        const paragraph = element.getParent();
        paragraph.asParagraph().setText(`Last updated: ${new Date().toLocaleString()}`);
      } else {
        body.appendParagraph('');
        body.appendParagraph(`Last updated: ${new Date().toLocaleString()}`);
      }
    } catch (editError) {
      console.error('Error editing instructional round response doc content:', editError);
      return false;
    }

    console.log(`Saved instructional round answer to doc for question ${questionId}`);
    return true;

  } catch (error) {
    console.error('Critical error saving instructional round answer to doc:', error, {
      observationId: observationId,
      questionId: questionId,
      currentUserEmail: userContext ? userContext.email : 'unknown',
      observedEmail: observation ? observation.observedEmail : 'unknown',
      operation: 'saveInstructionalRoundAnswerToDoc',
      answerLength: answerText ? answerText.length : 0
    });
    return false;
  }
}

/**
 * Gets instructional round answers from the response Google Doc.
 * @param {string} observationId The ID of the observation.
 * @returns {Array<Object>} Array of answer objects with questionId and answerText.
 */
function getInstructionalRoundAnswersFromDoc(observationId) {
  try {
    const observations = _getObservationsDb();
    const observation = observations.find(obs => obs.observationId === observationId);

    if (!observation) {
      console.log('Observation not found:', observationId);
      return [];
    }

    const userContext = createUserContext();

    // Find the response document
    const docResult = findInstructionalRoundResponseDoc(observationId, observation.observedEmail, userContext.email);
    if (!docResult) {
      console.log('No response document found for observation:', observationId);
      return [];
    }

    let doc;
    try {
      doc = DocumentApp.openById(docResult.docId);
    } catch (docError) {
      console.error('Error opening instructional round response doc for reading:', docError);
      return [];
    }

    const body = doc.getBody();
    const text = body.getText();

    // Parse questions and answers
    const answers = [];
    const lines = text.split('\n');
    let currentQuestionId = null;
    let currentAnswer = '';
    let collectingAnswer = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check if this is a question line
      const questionMatch = line.match(/^Question\s+([^:]+):\s*$/);
      if (questionMatch) {
        // Save previous answer if we have one
        if (currentQuestionId && currentAnswer.trim() && currentAnswer.trim() !== '(No response provided)') {
          answers.push({
            questionId: currentQuestionId,
            answerText: currentAnswer.trim()
          });
        }

        // Start new question
        currentQuestionId = questionMatch[1].trim();
        currentAnswer = '';
        collectingAnswer = true;
        continue;
      }

      // Skip metadata lines and horizontal rules
      if (line.startsWith('Last updated:') || line.startsWith('Observation ID:') ||
          line.startsWith('Staff Member:') || line.startsWith('Peer Evaluator:') ||
          line.startsWith('Generated:') || line === '' ||
          line === 'Instructional Round Reflection Responses' ||
          line.includes('---') || line.includes('___')) {
        continue;
      }

      // Collect answer text
      if (collectingAnswer && currentQuestionId) {
        if (currentAnswer) currentAnswer += '\n';
        currentAnswer += line;
      }
    }

    // Save the last answer
    if (currentQuestionId && currentAnswer.trim() && currentAnswer.trim() !== '(No response provided)') {
      answers.push({
        questionId: currentQuestionId,
        answerText: currentAnswer.trim()
      });
    }

    console.log(`Retrieved ${answers.length} instructional round answers from doc`);
    return answers;

  } catch (error) {
    console.error('Critical error getting instructional round answers from doc:', error, {
      observationId: observationId,
      currentUserEmail: userContext ? userContext.email : 'unknown',
      observedEmail: observation ? observation.observedEmail : 'unknown',
      operation: 'getInstructionalRoundAnswersFromDoc'
    });
    return [];
  }
}

/**
 * TEMPORARY: Diagnostic function to debug Standard Observation button visibility.
 * Run this function from Apps Script Editor while logged in as the staff member.
 * Remove this function once issue is resolved.
 */
function debugStandardObservationButton() {
  const userEmail = Session.getActiveUser().getEmail();
  console.log('Current user:', userEmail);

  const observations = _getObservationsDb();
  console.log('Total observations:', observations.length);

  const userDrafts = observations.filter(obs => obs.observedEmail === userEmail && obs.status === 'Draft');
  console.log('User draft observations:', userDrafts.length);

  userDrafts.forEach(obs => {
    console.log('Observation:', {
      id: obs.observationId,
      type: obs.Type,
      observer: obs.observerEmail,
      status: obs.status
    });

    const observer = getUserByEmail(obs.observerEmail);
    console.log('Observer details:', observer);
  });

  const result = checkUserHasStandardObservationFromPeerEvaluator(userEmail);
  console.log('Check result:', result);
}

/**
 * ============================================================================
 * SCRIPT CONTENT OVERFLOW STORAGE - Google Doc Storage for Large Scripts
 * ============================================================================
 * When script content exceeds safe sheet storage limits (~45K characters),
 * it's automatically saved to a Google Doc instead.
 */

/**
 * Constants for script storage management.
 */
const SCRIPT_STORAGE = {
  SHEET_SIZE_LIMIT: 45000,  // Safe limit before switching to doc storage
  WARNING_THRESHOLD: 40000,  // Warn user when approaching limit
  DOC_NAME_PREFIX: 'Script Content - '
};

/**
 * Finds a script content document using Drive search with caching.
 * @param {string} observationId The ID of the observation.
 * @returns {Object|null} Object with docId and docUrl, or null if not found.
 */
function findScriptDoc(observationId) {
  try {
    const searchName = `${SCRIPT_STORAGE.DOC_NAME_PREFIX}${observationId}`;

    // Cache to avoid repeated Drive searches
    const cacheKey = `script_doc_${observationId}`;
    const cached = getCachedDataEnhanced(cacheKey);
    if (cached) {
      debugLog('Script doc found in cache', { observationId });
      return cached;
    }

    debugLog('Searching for script doc', { observationId, searchName });

    // Search in all accessible files
    const files = DriveApp.getFilesByName(searchName);

    let docResult = null;
    while (files.hasNext()) {
      const file = files.next();
      try {
        // Verify we can access this doc
        const doc = DocumentApp.openById(file.getId());
        docResult = {
          docId: file.getId(),
          docUrl: file.getUrl()
        };
        debugLog('Found script doc', { docId: docResult.docId, observationId });
        break;
      } catch (accessError) {
        debugLog('Script doc not accessible, continuing search', {
          fileId: file.getId(),
          error: accessError.message
        });
      }
    }

    if (docResult) {
      // Cache the result for 15 minutes
      setCachedDataEnhanced(cacheKey, docResult, CACHE_DURATIONS.SHEET_DATA);
    }

    return docResult;

  } catch (error) {
    console.error('Error in findScriptDoc:', error, { observationId });
    return null;
  }
}

/**
 * Creates or retrieves a script content document for overflow storage.
 * Document is created in the observation's folder.
 * @param {string} observationId The ID of the observation.
 * @returns {Object|null} Object with docId and docUrl, or null on error.
 */
function createOrGetScriptDoc(observationId) {
  try {
    // Check if doc already exists
    const existingDoc = findScriptDoc(observationId);
    if (existingDoc) {
      debugLog('Found existing script doc', { observationId, docId: existingDoc.docId });
      return existingDoc;
    }

    // Get observation to find its folder
    const observation = getObservationById(observationId);
    if (!observation) {
      console.error('Observation not found for script doc creation:', observationId);
      return null;
    }

    // Create new document
    const docName = `${SCRIPT_STORAGE.DOC_NAME_PREFIX}${observationId}`;
    const doc = DocumentApp.create(docName);
    const docId = doc.getId();
    const file = DriveApp.getFileById(docId);

    debugLog('Created new script doc', { observationId, docId });

    // Add header to document
    const body = doc.getBody();
    body.clear();
    const header = body.appendParagraph('Observation Script Content');
    header.setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(`Observation ID: ${observationId}`);
    body.appendParagraph(`Created: ${new Date().toLocaleString()}`);
    body.appendHorizontalRule();
    body.appendParagraph(''); // Blank line before content

    // Move to observation folder if it exists
    if (observation.folderUrl) {
      try {
        const folderId = observation.folderUrl.split('/folders/')[1];
        if (folderId) {
          const obsFolder = DriveApp.getFolderById(folderId);
          file.moveTo(obsFolder);
          debugLog('Script doc moved to observation folder', { observationId, docId });
        }
      } catch (moveError) {
        console.error('Error moving script doc to observation folder:', moveError);
        // Continue anyway - document is still accessible
      }
    }

    const result = {
      docId: docId,
      docUrl: doc.getUrl()
    };

    // Cache the result
    const cacheKey = `script_doc_${observationId}`;
    setCachedDataEnhanced(cacheKey, result, CACHE_DURATIONS.SHEET_DATA);

    return result;

  } catch (error) {
    console.error('Critical error creating script doc:', error, { observationId });
    return null;
  }
}

/**
 * Saves script content to a Google Doc (for overflow storage).
 * Converts Quill Delta format to DocumentApp formatted text.
 * @param {string} observationId The ID of the observation.
 * @param {Object} scriptContent The Quill Delta object.
 * @returns {Object} Result with success status and optional docUrl.
 */
function saveScriptContentToDoc(observationId, scriptContent) {
  try {
    if (!scriptContent || !scriptContent.ops) {
      return { success: false, error: 'Invalid script content format' };
    }

    // Get or create the script doc
    const docResult = createOrGetScriptDoc(observationId);
    if (!docResult) {
      return { success: false, error: 'Failed to create or find script document' };
    }

    // Open the document
    const doc = DocumentApp.openById(docResult.docId);
    const body = doc.getBody();

    // Clear existing content after the header
    const paragraphs = body.getParagraphs();
    // Keep first 4 paragraphs (title, observation ID, created date, horizontal rule)
    for (let i = paragraphs.length - 1; i >= 4; i--) {
      paragraphs[i].removeFromParent();
    }

    // Add script content from Quill Delta
    scriptContent.ops.forEach(op => {
      if (op.insert && typeof op.insert === 'string') {
        const text = op.insert;
        if (text.trim() || text === '\n') {
          const p = body.appendParagraph(text);

          // Apply formatting from Quill attributes
          if (op.attributes) {
            const style = {};
            if (op.attributes.bold) style[DocumentApp.Attribute.BOLD] = true;
            if (op.attributes.italic) style[DocumentApp.Attribute.ITALIC] = true;
            if (op.attributes.underline) style[DocumentApp.Attribute.UNDERLINE] = true;
            if (op.attributes.background) {
              // Convert hex color to RGB for Google Docs
              // Note: Google Docs has limited color support
              style[DocumentApp.Attribute.BACKGROUND_COLOR] = op.attributes.background;
            }
            if (Object.keys(style).length > 0) {
              p.setAttributes(style);
            }

            // Handle headers
            if (op.attributes.header === 1) p.setHeading(DocumentApp.ParagraphHeading.HEADING2);
            if (op.attributes.header === 2) p.setHeading(DocumentApp.ParagraphHeading.HEADING3);
          }
        }
      }
    });

    // Add timestamp footer
    body.appendHorizontalRule();
    const footer = body.appendParagraph(`Last updated: ${new Date().toLocaleString()}`);
    footer.setItalic(true);
    footer.setFontSize(9);

    debugLog('Script content saved to doc', {
      observationId,
      docId: docResult.docId,
      opsCount: scriptContent.ops.length
    });

    return {
      success: true,
      docUrl: docResult.docUrl,
      docId: docResult.docId
    };

  } catch (error) {
    console.error('Error saving script content to doc:', error, { observationId });
    return { success: false, error: error.message };
  }
}

/**
 * Retrieves script content from a Google Doc.
 * Converts DocumentApp content back to basic Quill Delta format.
 * @param {string} observationId The ID of the observation.
 * @returns {Object|null} Quill Delta object or null if not found.
 */
function getScriptContentFromDoc(observationId) {
  try {
    // Find the script doc
    const docResult = findScriptDoc(observationId);
    if (!docResult) {
      debugLog('No script doc found', { observationId });
      return null;
    }

    // Open and read the document
    const doc = DocumentApp.openById(docResult.docId);
    const body = doc.getBody();
    const paragraphs = body.getParagraphs();

    // Convert paragraphs to Quill Delta ops
    // Skip first 4 paragraphs (header content)
    const ops = [];
    for (let i = 4; i < paragraphs.length; i++) {
      const para = paragraphs[i];
      const text = para.getText();

      // Skip the footer (last 2 paragraphs: horizontal rule + timestamp)
      if (i >= paragraphs.length - 2) break;

      if (text) {
        const attributes = {};

        // Extract basic formatting
        if (para.isBold()) attributes.bold = true;
        if (para.isItalic()) attributes.italic = true;
        if (para.isUnderline()) attributes.underline = true;

        const heading = para.getHeading();
        if (heading === DocumentApp.ParagraphHeading.HEADING2) attributes.header = 1;
        if (heading === DocumentApp.ParagraphHeading.HEADING3) attributes.header = 2;

        ops.push({
          insert: text + '\n',
          attributes: Object.keys(attributes).length > 0 ? attributes : undefined
        });
      } else {
        ops.push({ insert: '\n' });
      }
    }

    debugLog('Script content retrieved from doc', {
      observationId,
      docId: docResult.docId,
      opsCount: ops.length
    });

    return { ops: ops };

  } catch (error) {
    console.error('Error retrieving script content from doc:', error, { observationId });
    return null;
  }
}
