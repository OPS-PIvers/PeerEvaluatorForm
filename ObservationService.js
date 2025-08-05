/**
 * ObservationService.js
 * Manages observation data for the Peer Evaluator role.
 * For Phase 1, this uses PropertiesService as a mock database.
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
    userObservations.sort((a, b) => b.createdAt - a.createdAt);

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
      createdAt: Date.now(),
      finalizedAt: null,
      observationData: {}, // e.g., { "1a:": "proficient", "1b:": "basic" }
      evidenceLinks: {} // e.g., { "1a:": ["http://drive.link1", "http://drive.link2"] }
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
