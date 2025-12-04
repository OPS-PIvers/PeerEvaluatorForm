/**
 * ObservationSecurityService.js
 * Access control and security for observation operations
 *
 * SECURITY IMPLEMENTATION: Critical Priority
 * - Enforces authorization for observation access
 * - Prevents horizontal privilege escalation
 * - Audit logs all access attempts
 * - Rate limits observation operations
 */

/**
 * Checks if a user can access a specific observation
 * SECURITY: This is the central authorization check for all observation operations
 *
 * @param {Object} observation - The observation object to check access for
 * @param {string} requestingEmail - Email of user requesting access
 * @returns {boolean} True if user can access the observation
 */
function canAccessObservation(observation, requestingEmail) {
  if (!observation || !requestingEmail) {
    return false;
  }

  try {
    const userContext = createUserContext(requestingEmail);

    // 1. CREATOR ACCESS: Observer can always access their own observations
    if (observation.observerEmail === requestingEmail) {
      debugLog('Observation access granted: Creator', {
        observationId: observation.observationId,
        requester: requestingEmail
      });
      return true;
    }

    // 2. OBSERVED PERSON ACCESS: Can view FINALIZED observations only
    if (observation.observedEmail === requestingEmail) {
      if (observation.status === OBSERVATION_STATUS.FINALIZED) {
        debugLog('Observation access granted: Observed staff (finalized)', {
          observationId: observation.observationId,
          requester: requestingEmail
        });
        return true;
      } else {
        debugLog('Observation access denied: Not finalized', {
          observationId: observation.observationId,
          requester: requestingEmail,
          status: observation.status
        });
        return false;
      }
    }

    // 3. ADMINISTRATOR ACCESS: Can view all observations (with audit log)
    if (userContext.role === SPECIAL_ROLES.ADMINISTRATOR) {
      if (typeof auditLog === 'function') {
        auditLog(AUDIT_ACTIONS.ADMIN_OBSERVATION_ACCESS, {
          observationId: observation.observationId,
          adminEmail: requestingEmail,
          observerEmail: observation.observerEmail,
          observedEmail: observation.observedEmail,
          status: observation.status
        });
      } else {
        console.warn('auditLog not available - admin observation access not logged');
      }
      debugLog('Observation access granted: Administrator', {
        observationId: observation.observationId,
        adminEmail: requestingEmail
      });
      return true;
    }

    // 4. FULL ACCESS ROLE: Can view all observations (with audit log)
    if (userContext.role === SPECIAL_ROLES.FULL_ACCESS) {
      if (typeof auditLog === 'function') {
        auditLog(AUDIT_ACTIONS.FULL_ACCESS_OBSERVATION_VIEW, {
          observationId: observation.observationId,
          accessorEmail: requestingEmail,
          observerEmail: observation.observerEmail,
          observedEmail: observation.observedEmail,
          status: observation.status
        });
      } else {
        console.warn('auditLog not available - full access observation view not logged');
      }
      debugLog('Observation access granted: Full Access role', {
        observationId: observation.observationId,
        accessorEmail: requestingEmail
      });
      return true;
    }

    // 5. DENY ALL OTHERS
    if (typeof auditLog === 'function') {
      auditLog(AUDIT_ACTIONS.UNAUTHORIZED_ACCESS_ATTEMPT, {
        resource: 'observation',
        observationId: observation.observationId,
        attemptedBy: requestingEmail,
        observerEmail: observation.observerEmail,
        observedEmail: observation.observedEmail,
        userRole: userContext.role
      });
    } else {
      console.warn('auditLog not available - unauthorized access attempt not logged');
    }

    debugLog('Observation access denied: No authorization', {
      observationId: observation.observationId,
      requester: requestingEmail,
      userRole: userContext.role
    });

    return false;

  } catch (error) {
    console.error('Error in canAccessObservation:', error.message);
    // Fail closed - deny access on error
    return false;
  }
}

/**
 * Checks if a user can edit a specific observation
 * SECURITY: Only creator can edit, and only if not finalized
 *
 * @param {Object} observation - The observation object to check
 * @param {string} requestingEmail - Email of user requesting to edit
 * @returns {boolean} True if user can edit the observation
 */
function canEditObservation(observation, requestingEmail) {
  if (!observation || !requestingEmail) {
    return false;
  }

  // Only creator can edit
  if (observation.observerEmail !== requestingEmail) {
    debugLog('Edit denied: Not creator', {
      observationId: observation.observationId,
      requester: requestingEmail,
      creator: observation.observerEmail
    });
    return false;
  }

  // Cannot edit finalized observations
  if (observation.status === OBSERVATION_STATUS.FINALIZED) {
    debugLog('Edit denied: Observation finalized', {
      observationId: observation.observationId,
      requester: requestingEmail
    });
    return false;
  }

  return true;
}

/**
 * Checks if a user can finalize a specific observation
 * SECURITY: Only creator can finalize
 *
 * @param {Object} observation - The observation object to check
 * @param {string} requestingEmail - Email of user requesting to finalize
 * @returns {boolean} True if user can finalize the observation
 */
function canFinalizeObservation(observation, requestingEmail) {
  if (!observation || !requestingEmail) {
    return false;
  }

  // Only creator can finalize
  if (observation.observerEmail !== requestingEmail) {
    debugLog('Finalize denied: Not creator', {
      observationId: observation.observationId,
      requester: requestingEmail,
      creator: observation.observerEmail
    });
    return false;
  }

  // Cannot finalize if already finalized
  if (observation.status === OBSERVATION_STATUS.FINALIZED) {
    debugLog('Finalize denied: Already finalized', {
      observationId: observation.observationId,
      requester: requestingEmail
    });
    return false;
  }

  return true;
}

/**
 * Checks if a user can delete a specific observation
 * SECURITY: Only creator can delete, and only if not finalized
 *
 * @param {Object} observation - The observation object to check
 * @param {string} requestingEmail - Email of user requesting to delete
 * @returns {boolean} True if user can delete the observation
 */
function canDeleteObservation(observation, requestingEmail) {
  if (!observation || !requestingEmail) {
    return false;
  }

  // Only creator can delete
  if (observation.observerEmail !== requestingEmail) {
    debugLog('Delete denied: Not creator', {
      observationId: observation.observationId,
      requester: requestingEmail,
      creator: observation.observerEmail
    });
    return false;
  }

  // Cannot delete finalized observations (business rule)
  if (observation.status === OBSERVATION_STATUS.FINALIZED) {
    debugLog('Delete denied: Observation finalized', {
      observationId: observation.observationId,
      requester: requestingEmail
    });
    return false;
  }

  return true;
}

/**
 * Securely retrieves an observation with authorization check
 * SECURITY WRAPPER: Use this instead of direct getObservationById
 *
 * DEPENDENCY NOTE: This function calls getObservationById() from ObservationService.js
 * This wraps the public function with authorization checks and audit logging.
 * The security service adds access control on top of the data access layer.
 *
 * @param {string} observationId - The observation ID to retrieve
 * @param {string} requestingEmail - Optional email of requesting user (uses session if not provided)
 * @returns {Object|null} The observation if authorized, null otherwise
 * @throws {Error} If access is denied
 */
function getObservationSecure(observationId, requestingEmail = null) {
  // Get requesting user email
  const userEmail = requestingEmail || Session.getActiveUser().getEmail();

  if (!userEmail) {
    throw new Error('Authentication required');
  }

  // Apply rate limiting
  checkRateLimit('getObservation', userEmail);

  // Get the observation (function from ObservationService.js - no security checks)
  // NOTE: This is the public function - we add security layer on top
  const observation = getObservationById(observationId);

  if (!observation) {
    return null;
  }

  // Check authorization
  if (!canAccessObservation(observation, userEmail)) {
    if (typeof auditLog === 'function') {
      auditLog(AUDIT_ACTIONS.UNAUTHORIZED_ACCESS_ATTEMPT, {
        resource: 'observation',
        observationId: observationId,
        attemptedBy: userEmail,
        observerEmail: observation.observerEmail
      });
    } else {
      console.warn('auditLog not available - unauthorized observation access attempt not logged');
    }
    throw new Error('Access denied: You do not have permission to view this observation');
  }

  // Log successful access
  if (typeof auditLog === 'function') {
    auditLog(AUDIT_ACTIONS.OBSERVATION_VIEWED, {
      observationId: observationId,
      viewedBy: userEmail,
      observerEmail: observation.observerEmail,
      observedEmail: observation.observedEmail
    });
  } else {
    console.warn('auditLog not available - observation view not logged');
  }

  return observation;
}

/**
 * Validates email recipient for observation emails
 * SECURITY: Only observed staff can receive observation emails
 *
 * @param {Object} observation - The observation to email
 * @param {string} recipientEmail - Proposed recipient email
 * @returns {boolean} True if recipient is valid
 * @throws {Error} If recipient is not authorized
 */
function validateObservationEmailRecipient(observation, recipientEmail) {
  if (!observation || !recipientEmail) {
    throw new Error('Observation and recipient email are required');
  }

  // SECURITY: Only observed staff can receive the email
  if (recipientEmail !== observation.observedEmail) {
    if (typeof auditLog === 'function') {
      auditLog(AUDIT_ACTIONS.EMAIL_BLOCKED, {
        observationId: observation.observationId,
        attemptedRecipient: recipientEmail,
        allowedRecipient: observation.observedEmail,
        blockedBy: Session.getActiveUser().getEmail()
      });
    } else {
      console.warn('auditLog not available - email block attempt not logged');
    }
    throw new Error('Observation emails can only be sent to the observed staff member');
  }

  // SECURITY: Only finalized observations can be emailed
  if (observation.status !== OBSERVATION_STATUS.FINALIZED) {
    throw new Error('Only finalized observations can be emailed');
  }

  return true;
}

/**
 * Filters observations list to only those the user can access
 * SECURITY: Use this to filter observation lists for display
 *
 * @param {Array<Object>} observations - Array of observations to filter
 * @param {string} requestingEmail - Optional email of requesting user
 * @returns {Array<Object>} Filtered observations the user can access
 */
function filterObservationsByAccess(observations, requestingEmail = null) {
  if (!observations || !Array.isArray(observations)) {
    return [];
  }

  const userEmail = requestingEmail || Session.getActiveUser().getEmail();

  if (!userEmail) {
    return [];
  }

  return observations.filter(observation => {
    return canAccessObservation(observation, userEmail);
  });
}

/**
 * Gets observations for the current user with proper access control
 * SECURITY: Returns only observations the user is authorized to see
 *
 * DEPENDENCY NOTE: This function calls _getObservationsDb() from ObservationService.js
 * This is an intentional cross-module dependency for security layer separation.
 * The security service wraps the data access layer to enforce authorization.
 *
 * @param {string} requestingEmail - Optional email of requesting user
 * @returns {Array<Object>} Observations accessible to the user
 */
function getObservationsForUserSecure(requestingEmail = null) {
  const userEmail = requestingEmail || Session.getActiveUser().getEmail();

  if (!userEmail) {
    throw new Error('Authentication required');
  }

  // Apply rate limiting
  checkRateLimit('loadObservations', userEmail);

  // Get all observations (internal function from ObservationService.js)
  // NOTE: Direct access to private function is intentional for security layer
  const allObservations = _getObservationsDb();

  // Filter by access rights
  const accessibleObservations = filterObservationsByAccess(allObservations, userEmail);

  // Log the access
  if (typeof auditLog === 'function') {
    auditLog(AUDIT_ACTIONS.OBSERVATION_VIEWED, {
      action: 'list_observations',
      userEmail: userEmail,
      observationCount: accessibleObservations.length
    });
  } else {
    console.warn('auditLog not available - observation list access not logged');
  }

  return accessibleObservations;
}
