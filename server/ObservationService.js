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
      pdfUrl: obs.pdfUrl || null,
      pdfStatus: obs.pdfStatus || null
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
function createNewObservation(observerEmail, observedEmail) {
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
      observationName: null,
      observationDate: null,
      observationData: {}, // e.g., { "1a:": "proficient", "1b:": "basic" }
      evidenceLinks: {}, // e.g., { "1a:": [{url: "...", name: "...", uploadedAt: "..."}, ...] }
      observationNotes: {}
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
 * Retrieves or creates the specific Google Drive folder for a given observation.
 * @param {Object} observation The observation object.
 * @returns {GoogleAppsScript.Drive.Folder} The Google Drive folder for the observation.
 * @private
 */
function _getObservationFolder(observation) {
  // Get the root folder for all observations
  let rootFolderIterator = DriveApp.getFoldersByName(DRIVE_FOLDER_INFO.ROOT_FOLDER_NAME);
  let rootFolder = rootFolderIterator.hasNext() ? rootFolderIterator.next() : DriveApp.createFolder(DRIVE_FOLDER_INFO.ROOT_FOLDER_NAME);

  // Get or create a folder for the observed user
  const userFolderName = `${observation.observedName} (${observation.observedEmail})`;
  let userFolderIterator = rootFolder.getFoldersByName(userFolderName);
  let userFolder = userFolderIterator.hasNext() ? userFolderIterator.next() : rootFolder.createFolder(userFolderName);

  // Get or create a folder for this specific observation
  const obsFolderName = `Observation - ${observation.observationId}`;
  let obsFolderIterator = userFolder.getFoldersByName(obsFolderName);
  let obsFolder = obsFolderIterator.hasNext() ? obsFolderIterator.next() : userFolder.createFolder(obsFolderName);

  return obsFolder;
}

/**
 * Shares the entire observation folder with the observed staff member as view-only
 * and ensures the peer evaluator has editor access.
 * @param {Object} observation The finalized observation object.
 * @private
 */
function _shareObservationFolder(observation) {
  try {
    const obsFolder = _getObservationFolder(observation);
    
    // Add the observed staff member as viewer so they can access all materials
    obsFolder.addViewer(observation.observedEmail);
    
    // Ensure the peer evaluator has editor access for regeneration capabilities
    obsFolder.addEditor(observation.observerEmail);
    
    debugLog(`Observation folder shared with observed staff member`, { 
      observationId: observation.observationId,
      folderId: obsFolder.getId(),
      sharedWith: observation.observedEmail,
      editorAccess: observation.observerEmail
    });

  } catch (error) {
    console.error(`Failed to share observation folder for ${observation.observationId}:`, error);
    // Do not block the finalization process if folder sharing fails, just log the error
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
            const obsFolder = _getObservationFolder(observationForFolder);
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
                // Share the observation folder with the observed staff member
                _shareObservationFolder(updatedObservation);
                
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
