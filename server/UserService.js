/**
 * UserService.js
 * User management and authentication for the Danielson Framework Multi-Role System
 */

/**
 * Gets the current user from the Apps Script session
 * @return {Object|null} User object with email and session info, or null if not available
 */
function getUserFromSession() {
  try {
    const user = Session.getActiveUser();
    const email = user.getEmail();
    
    if (!email || !isValidEmail(email)) {
      debugLog('No valid user email found in session');
      return null;
    }
    
    debugLog('User retrieved from session', { email: email });
    
    return {
      email: email,
      sessionUser: user,
      retrievedAt: new Date().toISOString()
    };
  } catch (error) {
    console.warn('Error getting user from session:', error.message);
    return null;
  }
}

/**
 * Gets user information by email from the Staff sheet
 * REPLACE THIS FUNCTION in UserService.js
 * Enhanced getUserByEmail function with cache versioning
 */
function getUserByEmail(email) {
  if (!email || !isValidEmail(email)) {
    debugLog('Invalid email provided to getUserByEmail', { email: email });
    return null;
  }
  
  try {
    // Use enhanced cache with role-specific key
    const cacheParams = { email: email.toLowerCase().trim() };
    const cachedUser = getCachedDataEnhanced('user', cacheParams);

    if (cachedUser && cachedUser.data) {
      debugLog('User data retrieved from enhanced cache', { email: email });
      return cachedUser.data;
    }
    
    debugLog('Loading fresh user data', { email: email });

    const staffData = getStaffData();
    if (!staffData || !staffData.users) {
      debugLog('No staff data available');
      return null;
    }
    
    // Find user by email (case-insensitive)
    const normalizedEmail = email.toLowerCase().trim();
    const user = staffData.users.find(u => {
      const userEmail = u.email ? u.email.toLowerCase().trim() : '';
      return userEmail === normalizedEmail;
    });
    
    if (!user) {
      debugLog('User not found in staff data', {
        email: email,
        searchedEmail: normalizedEmail,
        availableEmails: staffData.users.map(u => u.email).slice(0, 5) // First 5 for debugging
      });
      return null;
    }
    
    // Cache with enhanced system
    setCachedDataEnhanced('user', cacheParams, user, CACHE_SETTINGS.USER_DATA_TTL);
    
    debugLog('User found and cached', {
      email: user.email, 
      role: user.role, 
      year: user.year 
    });
    
    return user;
  } catch (error) {
    console.error('Error in getUserByEmail:', formatErrorMessage(error, 'getUserByEmail'));
    return null;
  }
}

/**
 * Gets the role for a specific user
 * @param {string} email - User's email address
 * @return {string} User's role or default role if not found
 */
function getUserRole(email) {
  const user = getUserByEmail(email);
  if (user && user.role && AVAILABLE_ROLES.includes(user.role)) {
    debugLog('User role determined', { email: email, role: user.role });
    return user.role;
  }
  
  debugLog('Using default role for user', { email: email, defaultRole: 'Teacher' });
  return 'Teacher';
}

/**
 * Gets the observation year for a specific user
 * @param {string} email - User's email address
 * @return {number} User's observation year (1, 2, or 3) or 1 if not found
 */
function getUserYear(email) {
  const user = getUserByEmail(email);
  if (user && user.year && OBSERVATION_YEARS.includes(parseInt(user.year))) {
    const year = parseInt(user.year);
    debugLog('User year determined', { email: email, year: year });
    return year;
  }
  
  debugLog('Using default year for user', { email: email, defaultYear: 1 });
  return 1; // Default to year 1
}

/**
 * REPLACE THIS FUNCTION in UserService.js
 * Enhanced validateUserAccess function with comprehensive validation
 */
function validateUserAccess(email) {
  const validationId = generateUniqueId('user_access_validation');
  
  try {
    const result = {
      validationId: validationId,
      hasAccess: false,
      email: email,
      role: null,
      year: null,
      isDefaultUser: false,
      message: '',
      validation: {
        emailValid: false,
        userFound: false,
        roleValid: false,
        sheetExists: false
      },
      issues: [],
      recommendedActions: []
    };

    debugLog('Enhanced user access validation started', {
      email: email,
      validationId: validationId
    });

    // Email validation
    // SECURITY FIX: Deny access for invalid email instead of granting default access
    if (!email || !isValidEmail(email)) {
      result.issues.push({
        type: VALIDATION_ERROR_TYPES.INVALID_EMAIL,
        message: 'Invalid or missing email address',
        severity: VALIDATION_SEVERITY.CRITICAL
      });
      result.hasAccess = false;  // ✅ SECURITY: Deny access
      result.message = 'Access denied: Invalid or missing email address';
      result.recommendedActions.push('Provide valid email address');

      // Log unauthorized access attempt
      if (typeof auditLog === 'function') {
        auditLog(AUDIT_ACTIONS.ACCESS_DENIED, {
          reason: 'invalid_email',
          email: email,
          validationId: validationId
        });
      } else {
        console.warn('auditLog not available - access denied (invalid email) not logged');
      }

      return result;
    }

    result.validation.emailValid = true;

    // User lookup with validation
    const user = getUserByEmail(email);

    // SECURITY FIX: Deny access for users not in Staff sheet
    if (!user) {
      result.issues.push({
        type: VALIDATION_ERROR_TYPES.MISSING_USER,
        message: 'User not found in Staff sheet',
        severity: VALIDATION_SEVERITY.CRITICAL
      });
      result.hasAccess = false;  // ✅ SECURITY: Deny access
      result.message = 'Access denied: User not authorized for this application';
      result.recommendedActions.push('Contact your administrator to be added to the Staff sheet');

      // Log unauthorized access attempt
      if (typeof auditLog === 'function') {
        auditLog(AUDIT_ACTIONS.ACCESS_DENIED, {
          reason: 'user_not_found',
          email: email,
          validationId: validationId
        });
      } else {
        console.warn('auditLog not available - access denied (user not found) not logged');
      }

      debugLog('User not found - access denied', {
        email: email,
        validationId: validationId
      });

      return result;
    }

    result.validation.userFound = true;

    // Validate user data
    const userValidation = validateUserData(user);

    if (!userValidation.isValid) {
      result.issues.push(...userValidation.issues);
      result.recommendedActions.push(...userValidation.recommendedActions);

      if (userValidation.severity === VALIDATION_SEVERITY.CRITICAL) {
        result.hasAccess = false;
        result.message = 'Critical user data issues prevent access';
        return result;
      }

      // Use sanitized user data if available
      const userData = userValidation.sanitizedUser || user;
      result.role = userData.role;
      result.year = userData.year;
    } else {
      result.role = user.role || 'Teacher';
      result.year = (user.year !== null && user.year !== undefined) ? user.year : 1;
    }

    result.validation.roleValid = AVAILABLE_ROLES.includes(result.role);

    // Validate role and role sheet
    const roleValidation = validateRole(result.role);

    if (!roleValidation.isValid) {
      result.issues.push(...roleValidation.issues);
      result.recommendedActions.push(...roleValidation.recommendedActions);

      // Use fallback role if available
      if (roleValidation.fallbackRole) {
        const originalRole = result.role;
        result.role = roleValidation.fallbackRole;
        result.message = `Role "${originalRole}" not available, using "${result.role}"`;

        debugLog('Using fallback role', {
          email: email,
          originalRole: originalRole,
          fallbackRole: result.role,
          validationId: validationId
        });
      }
    }

    result.validation.sheetExists = roleValidation.sheetExists;

    // Final access decision
    result.hasAccess = true;
    result.isDefaultUser = false;

    if (result.issues.length === 0) {
      result.message = 'User access validated successfully';
    } else {
      const criticalIssues = result.issues.filter(issue =>
        issue.severity === VALIDATION_SEVERITY.CRITICAL
      ).length;

      if (criticalIssues > 0) {
        result.hasAccess = false;
        result.message = 'Critical validation issues prevent access';
      } else {
        result.message = `Access granted with ${result.issues.length} validation warnings`;
      }
    }

    debugLog('Enhanced user access validation completed', {
      email: email,
      hasAccess: result.hasAccess,
      role: result.role,
      issueCount: result.issues.length,
      validationId: validationId
    });

    return result;

  } catch (error) {
    console.error('Error in enhanced user access validation:', formatErrorMessage(error, 'validateUserAccess'));

    // SECURITY FIX: Deny access on error instead of granting default access
    // Log the error attempt
    if (typeof auditLog === 'function') {
      auditLog(AUDIT_ACTIONS.ACCESS_DENIED, {
        reason: 'validation_error',
        email: email,
        error: error.message,
        validationId: validationId
      });
    } else {
      console.warn('auditLog not available - access denied (validation error) not logged');
    }

    return {
      validationId: validationId,
      hasAccess: false,  // ✅ SECURITY: Deny access on error
      email: email,
      role: null,
      year: null,
      isDefaultUser: false,
      message: 'Access denied: System error during validation. Please try again or contact support.',
      validation: {
        emailValid: false,
        userFound: false,
        roleValid: false,
        sheetExists: false
      },
      issues: [{
        type: VALIDATION_ERROR_TYPES.CONFIGURATION_ERROR,
        message: 'User access validation error: ' + error.message,
        severity: VALIDATION_SEVERITY.CRITICAL
      }],
      error: error.message
    };
  }
}

/**
 * REPLACE THIS FUNCTION in UserService.js
 * Enhanced createUserContext function with proactive role change detection
 */
function createUserContext(email = null) {
  const startTime = Date.now();
  
  try {
    // Get email from parameter or session
    let userEmail = email;
    if (!userEmail) {
      const sessionUser = getUserFromSession();
      userEmail = sessionUser ? sessionUser.email : null;
    }
    
    debugLog('Creating enhanced user context', { userEmail: userEmail });

    // Create base context object
    const context = {
      email: userEmail,
      role: null,
      year: null,
      isAuthenticated: false,
      isDefaultUser: false,
      hasStaffRecord: false,
      sessionInfo: null,
      roleChangeDetected: false,
      stateChanges: [],
      previousState: null,
      permissions: {
        canAccessRubric: false,
        canSeeAllDomains: false
      },
      viewMode: 'full', // 'full' or 'assigned'
      assignedSubdomains: null,
      hasSpecialAccess: false,
      canFilter: false,
      specialRoleType: null, // 'administrator', 'peer_evaluator', 'full_access'
      metadata: {
        createdAt: new Date().toISOString(),
        sessionId: generateUniqueId('context'),
        userAgent: getUserAgent(),
        cacheVersion: getMasterCacheVersion(),
        contextVersion: '3.0'
      }
    };
    
    // Handle anonymous users
    if (!userEmail) {
      debugLog('No email available - using default context');
      context.role = 'Teacher';
      context.year = 1;
      context.isDefaultUser = true;
      context.isEvaluator = false; // Default users are not evaluators
      context.permissions.canAccessRubric = true;
      context.permissions.canSeeAllDomains = true;
      
      return context;
    }
    
    // Get or create user session
    const session = getUserSession(userEmail);
    context.sessionInfo = session;
    context.metadata.sessionId = session ? session.sessionId : context.metadata.sessionId;

    // Get current user data from Staff sheet
    const currentUser = getUserByEmail(userEmail);

    if (!currentUser) {
      debugLog('User not found in Staff sheet - using default settings', { userEmail });
      context.role = 'Teacher';
      context.year = 1;
      context.isDefaultUser = true;
      context.isEvaluator = false; // Default fallback users are not evaluators
      context.hasStaffRecord = false;
      context.permissions.canAccessRubric = true;
      context.permissions.canSeeAllDomains = true;

      return context;
    }

    // Set user data
    context.isAuthenticated = true;
    context.role = currentUser.role || 'Teacher';
    context.year = (currentUser.year !== null && currentUser.year !== undefined) ? currentUser.year : 1;
    context.building = currentUser.building || null;
    context.hasStaffRecord = true;
    context.isDefaultUser = false;
    context.permissions.canAccessRubric = true;
    context.permissions.canSeeAllDomains = false; // Authenticated users see role-specific content

    // Determine special access levels
    const specialRolesArray = Object.values(SPECIAL_ROLES);
    context.hasSpecialAccess = specialRolesArray.includes(context.role);
    context.canFilter = context.hasSpecialAccess;

    // Set special role type for different filtering behaviors
    const roleToSpecialTypeMap = {
      'Administrator': SPECIAL_ROLE_TYPES.ADMINISTRATOR,
      'Peer Evaluator': SPECIAL_ROLE_TYPES.PEER_EVALUATOR,
      'Full Access': SPECIAL_ROLE_TYPES.FULL_ACCESS
      // Add other roles and their types here if they grant specialRoleType
    };

    if (roleToSpecialTypeMap[context.role]) {
      context.specialRoleType = roleToSpecialTypeMap[context.role];
    }

    // Set isEvaluator flag for Peer Evaluators (CRITICAL FIX)
    // This enables look-fors checkboxes and notes functionality in rubric.html
    context.isEvaluator = (context.role === SPECIAL_ROLES.PEER_EVALUATOR);

    // Set assignedSubdomains and viewMode based on year
    // ALL users now have assigned subdomains, including probationary years (P1, P2, P3)
    context.assignedSubdomains = getAssignedSubdomainsForRoleYear(context.role, context.year);

    // Set view mode: ASSIGNED for regular users, FULL for special access (unless overridden by specific filters later)
    context.viewMode = context.hasSpecialAccess ? VIEW_MODES.FULL : VIEW_MODES.ASSIGNED;

    debugLog('User context subdomain assignment complete', {
      role: context.role,
      year: context.year,
      viewMode: context.viewMode,
      hasSpecialAccess: context.hasSpecialAccess,
      isProbationary: [PROB_YEAR_1, PROB_YEAR_2, PROB_YEAR_3].includes(context.year),
      hasAssignedSubdomains: !!context.assignedSubdomains
    });

    // Detect state changes
    const changeDetection = detectUserStateChanges(userEmail, {
      role: context.role,
      year: context.year,
      name: currentUser.name,
      email: userEmail,
      sessionId: context.metadata.sessionId
    });

    context.roleChangeDetected = changeDetection.hasChanged;
    context.stateChanges = changeDetection.changes;
    context.previousState = changeDetection.storedState;
    context.isNewUser = changeDetection.isNewUser || false;
    
    // Handle role changes
    if (changeDetection.hasChanged && !changeDetection.isNewUser) {
      debugLog('Role/state change detected - triggering cache invalidation', {
        userEmail: userEmail,
        changes: changeDetection.changes
      });

      // Find role changes specifically
      const roleChange = changeDetection.changes.find(change => change.field === 'role');
      if (roleChange) {
        // Add to role change history
        addRoleChangeToHistory(userEmail, roleChange.oldValue, roleChange.newValue);

        // Use the more comprehensive cache clearing function
        clearCachesForSpecificUser(userEmail, roleChange.oldValue, roleChange.newValue, context.metadata.sessionId);

        debugLog('Role change processed', {
          userEmail: userEmail,
          oldRole: roleChange.oldValue,
          newRole: roleChange.newValue
        });
      }
    }

    // Store current state for future comparisons
    storeUserState(userEmail, {
      role: context.role,
      year: context.year,
      name: currentUser.name,
      email: userEmail,
      sessionId: context.metadata.sessionId
    });
    
    const executionTime = Date.now() - startTime;
    logPerformanceMetrics('createUserContext', executionTime, {
      email: userEmail,
      role: context.role,
      roleChangeDetected: context.roleChangeDetected,
      isNewUser: context.isNewUser,
      stateChangeCount: context.stateChanges.length
    });

    debugLog('Enhanced user context created successfully', {
      email: userEmail,
      role: context.role,
      year: context.year,
      roleChangeDetected: context.roleChangeDetected,
      stateChanges: context.stateChanges.length,
      sessionId: context.metadata.sessionId
    });
    
    return context;
    
  } catch (error) {
    console.error('Error creating enhanced user context:', formatErrorMessage(error, 'createUserContext'));
    
    // Return safe default context on error
    return {
      email: email,
      role: 'Teacher',
      year: 1,
      isAuthenticated: false,
      isDefaultUser: true,
      isEvaluator: false, // Error fallback users are not evaluators
      hasStaffRecord: false,
      roleChangeDetected: false,
      stateChanges: [],
      permissions: {
        canAccessRubric: true,
        canSeeAllDomains: true
      },
      metadata: {
        createdAt: new Date().toISOString(),
        sessionId: generateUniqueId('error_context'),
        error: error.message,
        contextVersion: '3.0'
      }
    };
  }
}

/**
 * Gets the user agent string for analytics and debugging
 * @return {string} User agent string or 'Unknown' if not available
 */
function getUserAgent() {
  try {
    // In Apps Script web apps, this might not be available
    // This is more for future compatibility and debugging
    return 'Google Apps Script Web App';
  } catch (error) {
    return 'Unknown';
  }
}

/**
 * Refreshes user data from the source (bypasses cache)
 * @param {string} email - User's email address
 * @return {Object|null} Fresh user data or null if not found
 */
function refreshUserData(email) {
  if (!email || !isValidEmail(email)) {
    return null;
  }
  
  try {
    // Clear cached data
    const cacheKey = `user_${email}`;
    clearCachedData(cacheKey);
    
    // Get fresh data
    const user = getUserByEmail(email);
    
    debugLog('User data refreshed', { email: email, found: !!user });
    return user;
  } catch (error) {
    console.error('Error refreshing user data:', formatErrorMessage(error, 'refreshUserData'));
    return null;
  }
}

/**
 * Gets all available roles in the system
 * @return {Array<string>} Array of available role names
 */
function getAvailableRoles() {
  return [...AVAILABLE_ROLES]; // Return a copy to prevent modification
}

/**
 * Checks if a role is valid
 * @param {string} role - Role name to validate
 * @return {boolean} True if role is valid
 */
function isValidRole(role) {
  return role && AVAILABLE_ROLES.includes(role);
}

/**
 * Gets user statistics for administrative purposes
 * @return {Object} Statistics about users in the system
 */
function getUserStatistics() {
  try {
    const staffData = getStaffData();
    if (!staffData || !staffData.users) {
      return {
        totalUsers: 0,
        roleDistribution: {},
        yearDistribution: {},
        error: 'No staff data available'
      };
    }
    
    const stats = {
      totalUsers: staffData.users.length,
      roleDistribution: {},
      yearDistribution: {},
      lastUpdated: new Date().toISOString()
    };
    
    // Calculate role distribution
    staffData.users.forEach(user => {
      const role = user.role || 'Unknown';
      stats.roleDistribution[role] = (stats.roleDistribution[role] || 0) + 1;
      
      const year = user.year || 'Unknown';
      stats.yearDistribution[year] = (stats.yearDistribution[year] || 0) + 1;
    });
    
    debugLog('User statistics calculated', stats);
    return stats;
  } catch (error) {
    console.error('Error calculating user statistics:', formatErrorMessage(error, 'getUserStatistics'));
    return {
      totalUsers: 0,
      roleDistribution: {},
      yearDistribution: {},
      error: error.message
    };
  }
}

// Cache-related functions (these will be implemented in CacheService.js later)
// For now, we'll create simple implementations

/**
 * Gets data from cache (placeholder implementation)
 * @param {string} key - Cache key
 * @return {*} Cached data or null
 */
function getCachedData(key) {
  try {
    const cache = CacheService.getScriptCache();
    const cachedString = cache.get(key);
    return cachedString ? JSON.parse(cachedString) : null;
  } catch (error) {
    debugLog('Cache get error', { key: key, error: error.message });
    return null;
  }
}

/**
 * Sets data in cache (placeholder implementation)
 * @param {string} key - Cache key
 * @param {*} data - Data to cache
 * @param {number} ttl - Time to live in seconds
 */
function setCachedData(key, data, ttl = CACHE_SETTINGS.DEFAULT_TTL) {
  try {
    const cache = CacheService.getScriptCache();
    cache.put(key, JSON.stringify(data), ttl);
  } catch (error) {
    debugLog('Cache set error', { key: key, error: error.message });
  }
}

/**
 * Clears data from cache (placeholder implementation)
 * @param {string} key - Cache key to clear
 */
function clearCachedData(key) {
  try {
    const cache = CacheService.getScriptCache();
    cache.remove(key);
  } catch (error) {
    debugLog('Cache clear error', { key: key, error: error.message });
  }
}

/**
 * Check if a component should be visible based on assigned subdomains
 * @param {string} componentId - Component ID like "1a:", "2b:", etc.
 * @param {Object} assignedSubdomains - Object with domain1, domain2, domain3, domain4 arrays
 * @return {boolean} True if component should be visible
 */
function isComponentAssigned(componentId, assignedSubdomains) {
  if (!componentId || !assignedSubdomains) {
    return false;
  }

  // Determine which domain this component belongs to
  const domainNumber = componentId.charAt(0);
  const domainKey = `domain${domainNumber}`;

  if (!assignedSubdomains[domainKey]) {
    return false;
  }

  return assignedSubdomains[domainKey].includes(componentId);
}


/**
 * Create user context for special role filtering (when viewing as another user)
 * @param {string} targetEmail - Email of user to view as
 * @param {string} requestingRole - Role of person making the request
 * @return {Object} Modified user context
 */
function createFilteredUserContext(targetEmail, requestingRole) {
  try {
    // Verify requesting user has permission
    const specialRolesArray = Object.values(SPECIAL_ROLES);
    if (!specialRolesArray.includes(requestingRole)) {
      console.warn('Unauthorized filter request from role:', requestingRole);
      return null;
    }

    // Get target user data
    const targetUser = getUserByEmail(targetEmail);
    if (!targetUser) {
      console.warn('Target user not found for filtering:', targetEmail);
      return null;
    }

    // Create context as if we're the target user
    const context = createUserContext(targetEmail);

    // --- PERMISSION OVERRIDE LOGIC ---
    // If the requesting user is a Peer Evaluator, enable editable observation mode
    if (requestingRole === SPECIAL_ROLES.PEER_EVALUATOR) {
      // Default to assigned view for better performance and UX - evaluators can toggle to full view if needed
      // All users (including probationary) now have assigned subdomains
      if (targetUser) {
        context.viewMode = VIEW_MODES.ASSIGNED;
        context.assignedSubdomains = getAssignedSubdomainsForRoleYear(targetUser.role, targetUser.year);
      } else {
        context.viewMode = VIEW_MODES.FULL; // Fallback
        context.assignedSubdomains = null;
      }
      context.isObservationMode = true; // Flag for the UI to enable editing
      context.isEvaluator = true; // Explicitly set evaluator status
      debugLog('Peer Evaluator observation mode enabled with assigned view default.', {
        targetEmail: targetEmail,
        requestingRole: requestingRole,
        viewMode: context.viewMode,
        targetYear: targetUser ? targetUser.year : 'N/A',
        isProbationary: targetUser ? [PROB_YEAR_1, PROB_YEAR_2, PROB_YEAR_3].includes(targetUser.year) : false,
        hasAssignedSubdomains: context.assignedSubdomains ? Object.keys(context.assignedSubdomains).reduce((sum, key) => sum + (context.assignedSubdomains[key]?.length || 0), 0) : 0
      });
    } else if (requestingRole === SPECIAL_ROLES.ADMINISTRATOR) {
      // Administrator observation logic - Populate assignedSubdomains for toggle functionality
      // while defaulting to full rubric view
      if (targetUser) {
        context.viewMode = VIEW_MODES.FULL;
        context.assignedSubdomains = getAssignedSubdomainsForRoleYear(targetUser.role, targetUser.year);
      } else {
        context.viewMode = VIEW_MODES.FULL; // Fallback
        context.assignedSubdomains = null;
      }
      context.isObservationMode = true; // Flag for the UI to enable editing
      context.isEvaluator = true; // Explicitly set evaluator status
      debugLog('Administrator observation mode enabled with full view default (toggle to assigned subdomains available).', {
        targetEmail: targetEmail,
        requestingRole: requestingRole,
        viewMode: context.viewMode,
        targetYear: targetUser ? targetUser.year : 'N/A',
        isProbationary: targetUser ? [PROB_YEAR_1, PROB_YEAR_2, PROB_YEAR_3].includes(targetUser.year) : false,
        hasAssignedSubdomains: context.assignedSubdomains ? Object.keys(context.assignedSubdomains).reduce((sum, key) => sum + (context.assignedSubdomains[key]?.length || 0), 0) : 0
      });
    } else {
      // Logic for other special roles (Full Access, etc.)
      // All users now have assigned subdomains
      if (targetUser) {
        context.assignedSubdomains = getAssignedSubdomainsForRoleYear(targetUser.role, targetUser.year);
        context.viewMode = VIEW_MODES.ASSIGNED;
        debugLog('Filtered context created with assigned subdomains', {
          targetEmail: targetEmail,
          requestingRole: requestingRole,
          targetYear: targetUser.year,
          isProbationary: [PROB_YEAR_1, PROB_YEAR_2, PROB_YEAR_3].includes(targetUser.year)
        });
      } else {
        context.assignedSubdomains = null;
        context.viewMode = VIEW_MODES.FULL;
      }

      // Set isEvaluator based on whether this is for observation creation/editing
      if (requestingRole === SPECIAL_ROLES.FULL_ACCESS) {
        context.isEvaluator = true; // Enable editing capabilities for Full Access role
        context.isObservationMode = true; // Flag for the UI to enable editing
        debugLog('Full Access observation mode enabled', { requestingRole: requestingRole });
      } else {
        context.isEvaluator = false; // Ensure this is false for other roles
      }
    }

    // Add metadata about the filtering
    context.isFiltered = true;
    context.originalRequestingRole = requestingRole;
    context.filterInfo = {
      viewingAs: targetUser ? targetUser.name : 'Unknown',
      viewingRole: targetUser ? targetUser.role : 'Unknown',
      viewingYear: targetUser ? targetUser.year : 'Unknown',
      requestedBy: requestingRole
    };

    debugLog('Filtered user context created and adjusted', {
      targetEmail: targetEmail,
      targetRole: context.role,
      targetYear: context.year,
      viewMode: context.viewMode,
      isEvaluator: context.isEvaluator,
      isObservationMode: context.isObservationMode || false,
      requestingRole: requestingRole
    });

    return context;

  } catch (error) {
    console.error('Error creating filtered user context:', error);
    return null;
  }
}