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
 * Validates if a user has access to the system
 * @param {string} email - User's email address
 * @return {Object} Validation result with access status and details
 */
function validateUserAccess(email) {
  const result = {
    hasAccess: false,
    email: email,
    role: null,
    year: null,
    isDefaultUser: false,
    message: ''
  };
  
  if (!email || !isValidEmail(email)) {
    result.message = ERROR_MESSAGES.INVALID_EMAIL;
    return result;
  }
  
  const user = getUserByEmail(email);
  
  if (!user) {
    // User not found, but we'll allow access with default settings
    result.hasAccess = true;
    result.role = 'Teacher';
    result.year = 1;
    result.isDefaultUser = true;
    result.message = ERROR_MESSAGES.USER_NOT_FOUND;
  } else {
    result.hasAccess = true;
    result.role = user.role || 'Teacher';
    result.year = user.year || 1;
    result.isDefaultUser = false;
    result.message = 'User access validated successfully';
  }
  
  debugLog('User access validation completed', result);
  return result;
}

/**
 * Creates a comprehensive user context object for the current session
 * @param {string} email - User's email address (optional, will try to get from session)
 * @return {Object} Complete user context with all relevant information
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
    
    // Create context object
    const context = {
      email: userEmail,
      role: null,
      year: null,
      isAuthenticated: false,
      isDefaultUser: false,
      hasStaffRecord: false,
      permissions: {
        canAccessRubric: false,
        canSeeAllDomains: false
      },
      metadata: {
        createdAt: new Date().toISOString(),
        sessionId: generateUniqueId('session'),
        userAgent: getUserAgent()
      }
    };
    
    if (!userEmail) {
      context.role = 'Teacher';
      context.year = 1;
      context.isDefaultUser = true;
      context.permissions.canAccessRubric = true;
      context.permissions.canSeeAllDomains = true;
      
      debugLog('User context created for anonymous user', context);
      return context;
    }
    
    // Validate user access
    const validation = validateUserAccess(userEmail);
    context.isAuthenticated = validation.hasAccess;
    context.role = validation.role;
    context.year = validation.year;
    context.isDefaultUser = validation.isDefaultUser;
    context.hasStaffRecord = !validation.isDefaultUser;
    
    // Set permissions
    context.permissions.canAccessRubric = validation.hasAccess;
    context.permissions.canSeeAllDomains = validation.isDefaultUser; // Default users see all domains
    
    const executionTime = Date.now() - startTime;
    logPerformanceMetrics('createUserContext', executionTime, {
      email: userEmail,
      role: context.role,
      isDefaultUser: context.isDefaultUser
    });
    
    debugLog('User context created successfully', context);
    return context;
    
  } catch (error) {
    console.error('Error creating user context:', formatErrorMessage(error, 'createUserContext'));
    
    // Return default context on error
    return {
      email: email,
      role: 'Teacher',
      year: 1,
      isAuthenticated: false,
      isDefaultUser: true,
      hasStaffRecord: false,
      permissions: {
        canAccessRubric: true,
        canSeeAllDomains: true
      },
      metadata: {
        createdAt: new Date().toISOString(),
        sessionId: generateUniqueId('session'),
        error: error.message
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