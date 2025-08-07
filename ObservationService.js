/**
 * ObservationService.js
 * Manages observation data for the Peer Evaluator role.
 * This uses PropertiesService as a simple database.
 */

const OBSERVATIONS_DB_KEY = 'OBSERVATIONS_DATABASE';

/**
 * Retrieves the entire observations database from PropertiesService.
 * @returns {Array<Object>} The array of all observation objects.
 * @private
 */
function _getObservationsDb() {
  try {
    const properties = PropertiesService.getScriptProperties();
    const dbString = properties.getProperty(OBSERVATIONS_DB_KEY);
    return dbString ? JSON.parse(dbString) : [];
  } catch (error) {
    console.error('Error getting observations DB:', error);
    return []; // Return empty DB on error
  }
}

/**
 * Saves the entire observations database to PropertiesService.
 * @param {Array<Object>} db The array of all observation objects to save.
 * @private
 */
function _saveObservationsDb(db) {
  try {
    const properties = PropertiesService.getScriptProperties();
    properties.setProperty(OBSERVATIONS_DB_KEY, JSON.stringify(db));
  } catch (error) {
    console.error('Error saving observations DB:', error);
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

    return userObservations;
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

    const db = _getObservationsDb();
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
      observationData: {}, // e.g., { "1a:": "proficient", "1b:": "basic" }
      evidenceLinks: {} // e.g., { "1a:": [{url: "...", name: "...", uploadedAt: "..."}, ...] }
    };

    db.push(newObservation);
    _saveObservationsDb(db);

    debugLog('New observation draft created', newObservation);
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
function saveProficiencySelection(observationId, componentId, proficiency) {
  if (!observationId || !componentId || !proficiency) {
    return { success: false, error: 'Observation ID, component ID, and proficiency level are required.' };
  }

  try {
    const db = _getObservationsDb();
    const observationIndex = db.findIndex(obs => obs.observationId === observationId);

    if (observationIndex === -1) {
      return { success: false, error: 'Observation not found.' };
    }

    // Update the observation data
    db[observationIndex].observationData[componentId] = proficiency;
    db[observationIndex].lastModifiedAt = new Date().toISOString();

    _saveObservationsDb(db);

    debugLog('Proficiency selection saved', { observationId, componentId, proficiency });
    return { success: true };
  } catch (error) {
    console.error(`Error saving proficiency for observation ${observationId}:`, error);
    return { success: false, error: 'An unexpected error occurred.' };
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
    const db = _getObservationsDb();
    const observationIndex = db.findIndex(obs => obs.observationId === observationId);
    if (observationIndex === -1) {
      return { success: false, error: 'Observation not found.' };
    }
    const observation = db[observationIndex];

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
    
    // Decode base64 and create a blob
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
    
    // Create the file in the observation folder
    const file = obsFolder.createFile(blob);
    const fileUrl = file.getUrl();
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); // Make it viewable

    // Update the observation record with the evidence link
    if (!observation.evidenceLinks[componentId]) {
      observation.evidenceLinks[componentId] = [];
    }
    observation.evidenceLinks[componentId].push({
        url: fileUrl,
        name: fileName,
        uploadedAt: new Date().toISOString()
    });
    observation.lastModifiedAt = new Date().toISOString();

    _saveObservationsDb(db);

    debugLog('Media evidence uploaded and linked', { observationId, componentId, fileUrl });
    return { success: true, fileUrl: fileUrl, fileName: fileName };

  } catch (error) {
    console.error('Error in uploadMediaEvidence:', error);
    return { success: false, error: 'Failed to upload media: ' + error.message };
  }
}

/**
 * Deletes an observation record.
 * @param {string} observationId The ID of the observation to delete.
 * @param {string} requestingUserEmail The email of the user requesting deletion.
 * @returns {Object} A response object with success status.
 */
function deleteObservationRecord(observationId, requestingUserEmail) {
    if (!observationId || !requestingUserEmail) {
        return { success: false, error: 'Observation ID and requesting user email are required.' };
    }
    try {
        const db = _getObservationsDb();
        const observationIndex = db.findIndex(obs => obs.observationId === observationId);
        if (observationIndex === -1) {
            return { success: false, error: 'Observation not found.' };
        }
        const observation = db[observationIndex];

        // Permission check: only the observer who created it can delete.
        if (observation.observerEmail !== requestingUserEmail) {
            return { success: false, error: 'Permission denied. You did not create this observation.' };
        }

        // Only drafts can be deleted.
        if (observation.status !== OBSERVATION_STATUS.DRAFT) {
            return { success: false, error: 'Only draft observations can be deleted.' };
        }

        db.splice(observationIndex, 1);
        _saveObservationsDb(db);

        debugLog('Observation deleted', { observationId, requestingUserEmail });
        return { success: true };
    } catch (error) {
        console.error(`Error deleting observation ${observationId}:`, error);
        return { success: false, error: 'An unexpected error occurred during deletion.' };
    }
}

/**
 * Deletes a FINALIZED observation record and its associated Google Drive folder.
 * @param {string} observationId The ID of the observation to delete.
 * @param {string} requestingUserEmail The email of the user requesting deletion.
 * @returns {Object} A response object with success status.
 */
function deleteFinalizedObservationRecord(observationId, requestingUserEmail) {
    if (!observationId || !requestingUserEmail) {
        return { success: false, error: 'Observation ID and requesting user email are required.' };
    }
    try {
        const db = _getObservationsDb();
        const observationIndex = db.findIndex(obs => obs.observationId === observationId);
        if (observationIndex === -1) {
            return { success: false, error: 'Observation not found.' };
        }
        const observation = db[observationIndex];

        // Permission check: only the observer who created it can delete.
        if (observation.observerEmail !== requestingUserEmail) {
            return { success: false, error: 'Permission denied. You did not create this observation.' };
        }

        // Only FINALIZED observations can be deleted by this function.
        if (observation.status !== OBSERVATION_STATUS.FINALIZED) {
            return { success: false, error: 'This function can only delete finalized observations.' };
        }

        // Move associated Drive folder to trash
        try {
            const rootFolderIterator = DriveApp.getFoldersByName(DRIVE_FOLDER_INFO.ROOT_FOLDER_NAME);
            if (rootFolderIterator.hasNext()) {
                const rootFolder = rootFolderIterator.next();
                const userFolderName = `${observation.observedName} (${observation.observedEmail})`;
                const userFolderIterator = rootFolder.getFoldersByName(userFolderName);
                if (userFolderIterator.hasNext()) {
                    const userFolder = userFolderIterator.next();
                    const obsFolderName = `Observation - ${observation.observationId}`;
                    const obsFolderIterator = userFolder.getFoldersByName(obsFolderName);
                    if (obsFolderIterator.hasNext()) {
                        const obsFolder = obsFolderIterator.next();
                        obsFolder.setTrashed(true);
                        debugLog('Observation Drive folder moved to trash', { observationId: observationId, folderId: obsFolder.getId() });
                    }
                }
            }
        } catch (driveError) {
            console.error(`Could not delete Drive folder for observation ${observationId}:`, driveError);
            // Do not block deletion if Drive operation fails, just log it.
        }

        db.splice(observationIndex, 1);
        _saveObservationsDb(db);

        debugLog('Finalized observation DELETED', { observationId, requestingUserEmail });
        return { success: true };
    } catch (error) {
        console.error(`Error deleting finalized observation ${observationId}:`, error);
        return { success: false, error: 'An unexpected error occurred during deletion.' };
    }
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
        const db = _getObservationsDb();
        const observationIndex = db.findIndex(obs => obs.observationId === observationId);
        if (observationIndex === -1) {
            return { success: false, error: 'Observation not found.' };
        }

        const observation = db[observationIndex];
        if (observation.observerEmail !== requestingUserEmail) {
            return { success: false, error: 'Permission denied. You did not create this observation.' };
        }

        // Update status and timestamps
        observation.status = newStatus;
        observation.lastModifiedAt = new Date().toISOString();
        if (newStatus === OBSERVATION_STATUS.FINALIZED) {
            observation.finalizedAt = new Date().toISOString();
        }

        _saveObservationsDb(db);
        debugLog('Observation status updated', { observationId, newStatus });
        return { success: true, observation: observation };

    } catch (error) {
        console.error(`Error updating status for observation ${observationId}:`, error);
        return { success: false, error: 'An unexpected error occurred while updating status.' };
    }
}


/**
 * A test function to clear all observations from the properties service.
 * USE WITH CAUTION.
 */
function deleteAllObservations_DANGEROUS() {
    try {
        const properties = PropertiesService.getScriptProperties();
        properties.deleteProperty(OBSERVATIONS_DB_KEY);
        console.log('DELETED ALL OBSERVATIONS from PropertiesService.');
        return { success: true, message: 'All observations deleted.' };
    } catch (error) {
        console.error('Error deleting observations:', error);
        return { success: false, error: error.message };
    }
}