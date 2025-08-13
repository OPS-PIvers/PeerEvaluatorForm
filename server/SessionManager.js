/**
 * SessionManager.js - Session state management and role change detection
 * This file handles user session tracking, role change detection, and state persistence
 */

/**
 * Session state constants
 */
const SESSION_CONSTANTS = {
  SESSION_DURATION: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  STATE_CHECK_INTERVAL: 5 * 60 * 1000,   // 5 minutes in milliseconds
  SESSION_KEY_PREFIX: 'session_',
  USER_STATE_PREFIX: 'user_state_',
  ROLE_HISTORY_PREFIX: 'role_history_'
};

/**
 * Create or retrieve user session information
 * @param {string} userEmail - User's email address
 * @return {Object} Session information
 */
function createUserSession(userEmail) {
  if (!userEmail) {
    return null;
  }

  try {
    const sessionId = generateUniqueId('session');
    const timestamp = Date.now();

    const session = {
      sessionId: sessionId,
      userEmail: userEmail,
      createdAt: timestamp,
      lastAccessedAt: timestamp,
      expiresAt: timestamp + SESSION_CONSTANTS.SESSION_DURATION,
      isActive: true,
      accessCount: 1,
      userAgent: getUserAgent(),
      version: getMasterCacheVersion()
    };

    // Store session in Properties
    const properties = PropertiesService.getUserProperties();
    const sessionKey = SESSION_CONSTANTS.SESSION_KEY_PREFIX + userEmail;
    properties.setProperty(sessionKey, JSON.stringify(session));

    debugLog('User session created', {
      sessionId: sessionId,
      userEmail: userEmail,
      expiresAt: new Date(session.expiresAt).toISOString()
    });

    return session;

  } catch (error) {
    console.error('Error creating user session:', error);
    return null;
  }
}

/**
 * Get existing user session or create new one
 * @param {string} userEmail - User's email address
 * @return {Object|null} Session information
 */
function getUserSession(userEmail) {
  if (!userEmail) {
    return null;
  }

  try {
    const properties = PropertiesService.getUserProperties();
    const sessionKey = SESSION_CONSTANTS.SESSION_KEY_PREFIX + userEmail;
    const sessionData = properties.getProperty(sessionKey);

    if (!sessionData) {
      debugLog('No existing session found, creating new one', { userEmail });
      return createUserSession(userEmail);
    }

    const session = JSON.parse(sessionData);
    const now = Date.now();

    // Check if session has expired
    if (now > session.expiresAt) {
      debugLog('Session expired, creating new one', {
        userEmail,
        expiredAt: new Date(session.expiresAt).toISOString()
      });
      properties.deleteProperty(sessionKey);
      return createUserSession(userEmail);
    }

    // Update last accessed time and access count
    session.lastAccessedAt = now;
    session.accessCount = (session.accessCount || 0) + 1;

    // Save updated session
    properties.setProperty(sessionKey, JSON.stringify(session));

    debugLog('Existing session retrieved and updated', {
      sessionId: session.sessionId,
      userEmail: userEmail,
      accessCount: session.accessCount
    });

    return session;

  } catch (error) {
    console.error('Error getting user session:', error);
    return createUserSession(userEmail);
  }
}

/**
 * Store user state for change detection
 * @param {string} userEmail - User's email address
 * @param {Object} userState - Current user state
 */
function storeUserState(userEmail, userState) {
  if (!userEmail || !userState) {
    return;
  }

  try {
    const properties = PropertiesService.getUserProperties();
    const stateKey = SESSION_CONSTANTS.USER_STATE_PREFIX + userEmail;

    const stateEntry = {
      userEmail: userEmail,
      role: userState.role,
      year: userState.year,
      name: userState.name,
      timestamp: Date.now(),
      cacheVersion: getMasterCacheVersion(),
      sessionId: userState.sessionId || 'unknown'
    };

    properties.setProperty(stateKey, JSON.stringify(stateEntry));

    debugLog('User state stored', {
      userEmail: userEmail,
      role: userState.role,
      year: userState.year,
      timestamp: stateEntry.timestamp
    });

  } catch (error) {
    console.error('Error storing user state:', error);
  }
}

/**
 * Get stored user state
 * @param {string} userEmail - User's email address
 * @return {Object|null} Previously stored user state
 */
function getStoredUserState(userEmail) {
  if (!userEmail) {
    return null;
  }

  try {
    const properties = PropertiesService.getUserProperties();
    const stateKey = SESSION_CONSTANTS.USER_STATE_PREFIX + userEmail;
    const stateData = properties.getProperty(stateKey);

    if (!stateData) {
      debugLog('No stored user state found', { userEmail });
      return null;
    }

    const state = JSON.parse(stateData);
    debugLog('Retrieved stored user state', {
      userEmail: userEmail,
      role: state.role,
      year: state.year,
      timestamp: state.timestamp
    });

    return state;

  } catch (error) {
    console.error('Error getting stored user state:', error);
    return null;
  }
}

/**
 * Detect if user state has changed
 * @param {string} userEmail - User's email address
 * @param {Object} currentState - Current user state
 * @return {Object} Change detection result
 */
function detectUserStateChanges(userEmail, currentState) {
  if (!userEmail || !currentState) {
    return { hasChanged: false, changes: [], reason: 'Invalid parameters' };
  }

  try {
    const storedState = getStoredUserState(userEmail);

    if (!storedState) {
      debugLog('No previous state to compare - treating as new user', { userEmail });
      return {
        hasChanged: true,
        changes: ['new_user'],
        reason: 'No previous state found',
        isNewUser: true
      };
    }

    const changes = [];
    let hasChanged = false;

    // Check role change
    if (storedState.role !== currentState.role) {
      changes.push({
        field: 'role',
        oldValue: storedState.role,
        newValue: currentState.role
      });
      hasChanged = true;
    }

    // Check year change
    if (storedState.year !== currentState.year) {
      changes.push({
        field: 'year',
        oldValue: storedState.year,
        newValue: currentState.year
      });
      hasChanged = true;
    }

    // Check name change (less critical)
    if (storedState.name !== currentState.name) {
      changes.push({
        field: 'name',
        oldValue: storedState.name,
        newValue: currentState.name
      });
      // Name change doesn't trigger cache clearing
    }

    const result = {
      hasChanged: hasChanged,
      changes: changes,
      reason: hasChanged ? 'State differences detected' : 'No changes detected',
      storedState: storedState,
      currentState: currentState,
      isNewUser: false
    };

    if (hasChanged) {
      debugLog('User state changes detected', {
        userEmail: userEmail,
        changeCount: changes.length,
        changes: changes
      });
    }

    return result;

  } catch (error) {
    console.error('Error detecting user state changes:', error);
    return {
      hasChanged: true,
      changes: [],
      reason: 'Error during detection: ' + error.message,
      error: error.message
    };
  }
}

/**
 * Add role change to history
 * @param {string} userEmail - User's email address
 * @param {string} oldRole - Previous role
 * @param {string} newRole - New role
 */
function addRoleChangeToHistory(userEmail, oldRole, newRole) {
  if (!userEmail || !newRole) {
    return;
  }

  try {
    const properties = PropertiesService.getUserProperties();
    const historyKey = SESSION_CONSTANTS.ROLE_HISTORY_PREFIX + userEmail;

    // Get existing history
    let history = [];
    const existingHistory = properties.getProperty(historyKey);
    if (existingHistory) {
      history = JSON.parse(existingHistory);
    }

    // Add new entry
    const entry = {
      timestamp: Date.now(),
      oldRole: oldRole,
      newRole: newRole,
      sessionId: generateUniqueId('role_change'),
      cacheVersion: getMasterCacheVersion()
    };

    history.unshift(entry); // Add to beginning

    // Keep only last 10 entries
    if (history.length > 10) {
      history = history.slice(0, 10);
    }

    properties.setProperty(historyKey, JSON.stringify(history));

    debugLog('Role change added to history', {
      userEmail: userEmail,
      oldRole: oldRole,
      newRole: newRole,
      historyLength: history.length
    });

  } catch (error) {
    console.error('Error adding role change to history:', error);
  }
}

/**
 * Get role change history for user
 * @param {string} userEmail - User's email address
 * @return {Array} Role change history
 */
function getRoleChangeHistory(userEmail) {
  if (!userEmail) {
    return [];
  }

  try {
    const properties = PropertiesService.getUserProperties();
    const historyKey = SESSION_CONSTANTS.ROLE_HISTORY_PREFIX + userEmail;
    const historyData = properties.getProperty(historyKey);

    if (!historyData) {
      return [];
    }

    return JSON.parse(historyData);

  } catch (error) {
    console.error('Error getting role change history:', error);
    return [];
  }
}

/**
 * Clean up expired sessions and old data
 */
function cleanupExpiredSessions() {
  try {
    const properties = PropertiesService.getUserProperties();
    const allProperties = properties.getProperties();
    const now = Date.now();
    let cleanedCount = 0;

    Object.keys(allProperties).forEach(key => {
      try {
        // Clean up expired sessions
        if (key.startsWith(SESSION_CONSTANTS.SESSION_KEY_PREFIX)) {
          const sessionData = JSON.parse(allProperties[key]);
          if (sessionData.expiresAt && now > sessionData.expiresAt) {
            properties.deleteProperty(key);
            cleanedCount++;
            debugLog('Cleaned up expired session', { key });
          }
        }

        // Clean up old user states (older than 7 days)
        if (key.startsWith(SESSION_CONSTANTS.USER_STATE_PREFIX)) {
          const stateData = JSON.parse(allProperties[key]);
          const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
          if (stateData.timestamp && stateData.timestamp < sevenDaysAgo) {
            properties.deleteProperty(key);
            cleanedCount++;
            debugLog('Cleaned up old user state', { key });
          }
        }

        // Clean up old role history (older than 30 days)
        if (key.startsWith(SESSION_CONSTANTS.ROLE_HISTORY_PREFIX)) {
          const historyData = JSON.parse(allProperties[key]);
          if (Array.isArray(historyData)) {
            const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
            const filteredHistory = historyData.filter(entry =>
              entry.timestamp && entry.timestamp > thirtyDaysAgo
            );

            if (filteredHistory.length !== historyData.length) {
              if (filteredHistory.length > 0) {
                properties.setProperty(key, JSON.stringify(filteredHistory));
              } else {
                properties.deleteProperty(key);
              }
              cleanedCount++;
              debugLog('Cleaned up old role history', { key });
            }
          }
        }

      } catch (itemError) {
        console.warn('Error cleaning up property:', key, itemError);
      }
    });

    debugLog('Session cleanup completed', { cleanedCount });
    return cleanedCount;

  } catch (error) {
    console.error('Error during session cleanup:', error);
    return 0;
  }
}
