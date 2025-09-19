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
    return userObservations.map(obs => ({
      observationId: obs.observationId,
      observedName: obs.observedName,
      createdAt: obs.createdAt,
      status: obs.status,
      type: obs.Type || 'Standard',
      observationName: obs.observationName || null,
      observationDate: obs.observationDate || null,
      pdfUrl: obs.pdfUrl || null,
      pdfStatus: obs.pdfStatus || null,
      folderUrl: obs.folderUrl || null
    }));
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
  if (!observationId || !componentId || !proficiency) {
    return { success: false, error: 'Observation ID, component ID, and proficiency level are required.' };
  }

  return _updateObservationJsonData(observationId, 'observationData', (currentData) => {
    // Ensure the component object exists, preserving other properties
    if (!currentData[componentId]) {
      currentData[componentId] = { lookfors: [], notes: '' };
    }
    
    // Update the proficiency
    currentData[componentId].proficiency = proficiency;

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
    const userFolderName = `${observation.observedName} (${observation.observedEmail})`;
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
                    const expectedUserFolderName = `${observation.observedName} (${observation.observedEmail})`;
                    
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
      .filter(row => row[0]) // Filter out empty rows
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

    // Check if any answers exist
    const answers = getWorkProductAnswers(workProductObs.observationId);
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
