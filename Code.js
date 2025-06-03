/**
 * Code.js - Main Orchestrator (Clean Production Version)
 * Google Apps Script Web App for Danielson Framework - Multi-Role Rubric System
 * 
 * This file orchestrates the modular services and maintains backward compatibility
 * while adding support for multiple roles and automatic cache management.
 */

/**
 * Legacy DOMAIN_CONFIGS for backward compatibility
 * Kept in Code.js to avoid cross-file dependency issues
 * @deprecated Use ConfigurationService.loadRoleConfiguration() instead
 */
const DOMAIN_CONFIGS = {
  1: {
    name: 'Domain 1: Planning and Preparation',
    startRow: 3,   // 1-indexed - Domain 1 starts at row 3
    endRow: 22,    // 1-indexed - estimated end row (adjust as needed)
    subdomains: ['1a:', '1b:', '1c:', '1d:', '1e:', '1f:']
  },
  2: {
    name: 'Domain 2: The Classroom Environment',
    startRow: 23,  // 1-indexed - Domain 2 starts at row 23
    endRow: 39,    // 1-indexed - estimated end row (adjust as needed)
    subdomains: ['2a:', '2b:', '2c:', '2d:', '2e:']
  },
  3: {
    name: 'Domain 3: Instruction',
    startRow: 40,  // 1-indexed - Domain 3 starts at row 40
    endRow: 56,    // 1-indexed - estimated end row (adjust as needed)
    subdomains: ['3a:', '3b:', '3c:', '3d:', '3e:']
  },
  4: {
    name: 'Domain 4: Professional Responsibilities',
    startRow: 57,  // 1-indexed - Domain 4 starts at row 57
    endRow: 76,    // 1-indexed - estimated end row (adjust as needed)
    subdomains: ['4a:', '4b:', '4c:', '4d:', '4e:', '4f:']
  }
};

/**
 * Enhanced doGet function with proactive role change detection
 */
function doGet(e) {
  const startTime = Date.now();
  const requestId = generateUniqueId('request');
  
  try {
    // Clean up expired sessions periodically (10% chance)
    if (Math.random() < 0.1) {
      cleanupExpiredSessions();
    }

    // Parse URL parameters for cache control
    const params = e.parameter || {};
    const forceRefresh = params.refresh === 'true' || params.nocache === 'true';
    const debugMode = params.debug === 'true';
    const urlTimestamp = params.t || null;
    const urlRole = params.role || null;
    const proactiveCheck = params.proactive !== 'false'; // Default to true

    // ADD THESE NEW PARAMETERS:
    const viewMode = params.view || 'full';
    const filterRole = params.filterRole || null;
    const filterYear = params.filterYear || null;
    const filterStaff = params.filterStaff || null;
    const filterType = params.filterType || 'all';

    debugLog('Enhanced web app request received', {
      requestId: requestId,
      forceRefresh: forceRefresh,
      debugMode: debugMode,
      urlTimestamp: urlTimestamp,
      urlRole: urlRole,
      proactiveCheck: proactiveCheck,
      userAgent: e.userAgent || 'Unknown'
    });

    // Handle force refresh - clear all relevant caches
    if (forceRefresh) {
      debugLog('Force refresh requested - clearing caches', { requestId });

      const sessionUser = getUserFromSession();
      if (sessionUser && sessionUser.email) {
        clearUserCaches(sessionUser.email);
      } else {
        forceCleanAllCaches();
      }
    }

    // Create enhanced user context with proactive role change detection
    const userContext = createUserContext();

    // Handle special role filtering
    let finalUserContext = userContext;

    if (userContext.hasSpecialAccess && filterStaff && isValidEmail(filterStaff)) {
      // Special role user is viewing as another staff member
      const filteredContext = createFilteredUserContext(filterStaff, userContext.role);
      if (filteredContext) {
        finalUserContext = filteredContext;
        debugLog('Using filtered user context', {
          originalRole: userContext.role,
          viewingAs: filteredContext.filterInfo.viewingAs,
          viewingRole: filteredContext.filterInfo.viewingRole
        });
      }
    }

    // Set view mode
    finalUserContext.viewMode = viewMode;

    // Add filter parameters to context
    finalUserContext.activeFilters = {
      role: filterRole,
      year: filterYear,
      staff: filterStaff,
      type: filterType
    };
    
    // Override role if specified in URL (for testing)
    if (urlRole && AVAILABLE_ROLES.includes(urlRole)) {
      debugLog('URL role override detected', {
        originalRole: userContext.role,
        urlRole: urlRole,
        requestId
      });
      userContext.role = urlRole;
      userContext.isRoleOverride = true;
    }

    // Warm cache for the current role if role change was detected
    if (userContext.roleChangeDetected && userContext.email) {
      warmCacheForRoleChange(userContext.email, userContext.role);
    }

    debugLog('Enhanced user context created', {
      email: userContext.email,
      role: userContext.role,
      year: userContext.year,
      isDefaultUser: userContext.isDefaultUser,
      roleChangeDetected: userContext.roleChangeDetected,
      stateChanges: userContext.stateChanges.length,
      isRoleOverride: userContext.isRoleOverride || false,
      sessionId: userContext.metadata.sessionId,
      requestId: requestId
    });
    
    // Get role-specific rubric data
    const rubricData = getAllDomainsData(finalUserContext.role, finalUserContext.year);
    
    // Generate enhanced response metadata
    const responseMetadata = generateResponseMetadata(finalUserContext, requestId, debugMode);

    // Add comprehensive user context to the data for the HTML template
    rubricData.userContext = {
      // Basic user info
      email: finalUserContext.email,
      role: finalUserContext.role,
      year: finalUserContext.year,
      isAuthenticated: finalUserContext.isAuthenticated,
      displayName: finalUserContext.email ? finalUserContext.email.split('@')[0] : 'Guest',

      // NEW VIEW MODE PROPERTIES:
      viewMode: finalUserContext.viewMode,
      assignedSubdomains: finalUserContext.assignedSubdomains,
      hasSpecialAccess: finalUserContext.hasSpecialAccess,
      canFilter: finalUserContext.canFilter,
      specialRoleType: finalUserContext.specialRoleType,
      activeFilters: finalUserContext.activeFilters,
      isFiltered: finalUserContext.isFiltered || false,
      filterInfo: finalUserContext.filterInfo || null,

      // Request context
      requestId: requestId,
      timestamp: Date.now(),
      forceRefresh: forceRefresh,
      debugMode: debugMode,
      isRoleOverride: userContext.isRoleOverride || false,

      // State tracking
      roleChangeDetected: userContext.roleChangeDetected,
      stateChanges: userContext.stateChanges,
      isNewUser: userContext.isNewUser,
      previousRole: userContext.previousState?.role || null,

      // Session info
      sessionId: userContext.metadata.sessionId,
      sessionActive: userContext.sessionInfo?.isActive || false,

      // Cache info
      cacheVersion: userContext.metadata.cacheVersion,
      responseMetadata: responseMetadata,

      // Enhanced metadata
      contextVersion: userContext.metadata.contextVersion,
      hasStaffRecord: userContext.hasStaffRecord
    };
    
    // Create and configure the HTML template
    const htmlTemplate = HtmlService.createTemplateFromFile('rubric');
    htmlTemplate.data = rubricData;
    
    // Generate the HTML output
    const htmlOutput = htmlTemplate.evaluate()
      .setTitle(getPageTitle(userContext.role))
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

    // Add comprehensive cache-busting headers
    addCacheBustingHeaders(htmlOutput, responseMetadata);

    // Add enhanced debug headers if requested
    if (debugMode) {
      addDebugHeaders(htmlOutput, userContext, responseMetadata);
      addStateTrackingHeaders(htmlOutput, userContext);
    }
    
    const executionTime = Date.now() - startTime;
    logPerformanceMetrics('doGet', executionTime, {
      role: userContext.role,
      year: userContext.year,
      domainCount: rubricData.domains ? rubricData.domains.length : 0,
      isDefaultUser: userContext.isDefaultUser,
      forceRefresh: forceRefresh,
      roleChangeDetected: userContext.roleChangeDetected,
      stateChanges: userContext.stateChanges.length,
      requestId: requestId
    });
    
    debugLog('Enhanced web app request completed successfully', {
      role: userContext.role,
      executionTime: executionTime,
      requestId: requestId,
      responseETag: responseMetadata.etag,
      roleChangeDetected: userContext.roleChangeDetected
    });
    
    return htmlOutput;
    
  } catch (error) {
    console.error('Error in enhanced doGet:', formatErrorMessage(error, 'doGet'));
    
    // Return enhanced error page with cache busting
    return createEnhancedErrorPage(error, requestId, null, e.userAgent);
  }
}

/**
 * Helper function to determine if a user's year matches a target filter year.
 * @param {string|number} userYear The year from the user's record (e.g., 1, 2, "Probationary").
 * @param {string} targetYear The year from the filter (e.g., "1", "Probationary").
 * @return {boolean} True if the years match according to the defined logic.
 * @private
 */
function _isUserYearMatching(userYear, targetYear) {
  const standardizedUserYear = userYear ? userYear.toString().toLowerCase() : null;
  const standardizedTargetYear = targetYear ? targetYear.toString().toLowerCase() : null;

  if (!standardizedUserYear || !standardizedTargetYear) {
    // If either is null/empty after standardization, they don't match unless both are.
    // However, typically a filter targetYear wouldn't be null if filtering is active.
    // And a userYear being null might mean it's not set and shouldn't match specific year filters.
    return standardizedUserYear === standardizedTargetYear;
  }

  if (standardizedTargetYear === 'probationary') {
    return standardizedUserYear === 'probationary';
  } else {
    const numericTargetYear = parseInt(standardizedTargetYear);
    // If targetYear is not 'probationary' and not a parsable number, it's an invalid filter for numeric matching.
    if (isNaN(numericTargetYear)) {
      debugLog(`_isUserYearMatching: Invalid non-numeric, non-probationary targetYear: ${targetYear}`);
      return false;
    }
    // If userYear is 'probationary', it cannot match a numeric targetYear.
    if (standardizedUserYear === 'probationary') {
      return false;
    }
    const numericUserYear = parseInt(standardizedUserYear);
    return !isNaN(numericUserYear) && numericUserYear === numericTargetYear;
  }
}

/**
 * Enhanced onEdit trigger function that handles both role changes and rubric content changes
 */
function onEditTrigger(e) {
  const startTime = Date.now();
  const triggerId = generateUniqueId('trigger');

  try {
    // Validate event object
    if (!e || !e.range) {
      debugLog('Invalid edit event received', { triggerId });
      return;
    }

    const range = e.range;
    const sheet = range.getSheet();
    const sheetName = sheet.getName();
    const editedRow = range.getRow();
    const editedColumn = range.getColumn();
    const newValue = e.value;
    const oldValue = e.oldValue;

    debugLog('Edit trigger fired', {
      triggerId: triggerId,
      sheetName: sheetName,
      row: editedRow,
      column: editedColumn,
      newValue: newValue,
      oldValue: oldValue
    });

    // Handle Staff sheet edits (existing functionality)
    if (sheetName === SHEET_NAMES.STAFF) {
      // Only process edits to the Role column (Column C = index 3)
      if (editedColumn !== STAFF_COLUMNS.ROLE + 1) { // +1 because columns are 1-indexed in triggers
        debugLog('Edit not in Role column - ignoring', {
          column: editedColumn,
          expectedColumn: STAFF_COLUMNS.ROLE + 1,
          triggerId: triggerId
        });
        return;
      }

      // Skip header row
      if (editedRow === 1) {
        debugLog('Edit in header row - ignoring', { triggerId: triggerId });
        return;
      }

      // Use existing role change processing function
      processRoleChangeFromTrigger(sheet, editedRow, newValue, oldValue, triggerId);
      return;
    }

    // Handle role-specific sheet edits (rubric content changes)
    if (AVAILABLE_ROLES.includes(sheetName)) {
      // Skip if no actual content change
      if (oldValue === newValue) {
        debugLog('No content change detected - ignoring', { triggerId: triggerId });
        return;
      }

      // Process the rubric content change
      processRubricContentChange(sheetName, editedRow, editedColumn, newValue, oldValue, triggerId);
      return;
    }

    // Ignore edits to other sheets
    debugLog('Edit not in monitored sheet - ignoring', {
      sheetName: sheetName,
      triggerId: triggerId
    });

    const executionTime = Date.now() - startTime;
    logPerformanceMetrics('onEditTrigger', executionTime, {
      triggerId: triggerId,
      sheetName: sheetName,
      row: editedRow,
      column: editedColumn
    });

  } catch (error) {
    console.error('Error in onEditTrigger:', formatErrorMessage(error, 'onEditTrigger'));

    // Log error but don't throw - triggers should be resilient
    debugLog('Trigger error handled gracefully', {
      triggerId: triggerId || 'unknown',
      error: error.message
    });
  }
}

/**
 * Process rubric content changes and clear relevant caches
 */
function processRubricContentChange(roleName, editedRow, editedColumn, newValue, oldValue, triggerId) {
  try {
    debugLog('Processing rubric content change', {
      triggerId: triggerId,
      roleName: roleName,
      row: editedRow,
      column: editedColumn,
      changeType: determineRubricChangeType(editedRow, editedColumn)
    });

    // Clear role sheet cache for this specific role
    const cache = CacheService.getScriptCache();
    const roleSheetKey = generateCacheKey('role_sheet', { role: roleName });
    cache.remove(roleSheetKey);
    debugLog('Cleared role sheet cache', { key: roleSheetKey, roleName: roleName, triggerId: triggerId });

    // Force update the stored hash for change detection
    const properties = PropertiesService.getScriptProperties();
    properties.deleteProperty(`SHEET_HASH_${roleName}`);
    debugLog('Cleared sheet hash for change detection', { roleName: roleName, triggerId: triggerId });

    // Get all users with this role and clear their caches
    const staffData = getStaffData();
    if (staffData && staffData.users) {
      const usersWithRole = staffData.users.filter(user => user.role === roleName);
      
      if (usersWithRole.length > 0) {
        debugLog(`Found ${usersWithRole.length} users with role ${roleName}`, {
          userEmails: usersWithRole.map(u => u.email),
          triggerId: triggerId
        });

        let clearedCount = 0;
        usersWithRole.forEach(user => {
          try {
            // Use existing cache clearing function for consistency
            clearCachesForSpecificUser(user.email, user.role, user.role, triggerId);
            clearedCount++;
          } catch (userError) {
            console.warn('Error clearing cache for user:', {
              userEmail: user.email,
              error: userError.message,
              triggerId: triggerId
            });
          }
        });

        console.log(`✅ AUTOMATIC RUBRIC UPDATE PROCESSED: ${roleName} rubric changed - cleared cache for ${clearedCount} users`);
      } else {
        console.log(`✅ AUTOMATIC RUBRIC UPDATE PROCESSED: ${roleName} rubric changed - no users currently have this role`);
      }
    }

    // Warm cache for the updated role sheet if we have users
    if (typeof warmCacheForRoleChange === 'function' && staffData && staffData.users) {
      const sampleUser = staffData.users.find(user => user.role === roleName);
      if (sampleUser) {
        setTimeout(() => {
          warmCacheForRoleChange(sampleUser.email, roleName);
          debugLog('Cache warmed for updated role sheet', {
            roleName: roleName,
            sampleUserEmail: sampleUser.email,
            triggerId: triggerId
          });
        }, 100); // Small delay to let cache clearing complete
      }
    }

  } catch (error) {
    console.error('Error processing rubric content change:', {
      error: formatErrorMessage(error, 'processRubricContentChange'),
      triggerId: triggerId,
      roleName: roleName,
      row: editedRow,
      column: editedColumn
    });
  }
}

/**
 * Determine the type of rubric change for logging
 */
function determineRubricChangeType(editedRow, editedColumn) {
  // Row 1-2 are typically title/subtitle
  if (editedRow <= 2) {
    return 'title_or_subtitle';
  }

  // Column A (index 1 in 1-indexed) typically contains component identifiers
  if (editedColumn === 1) {
    return 'component_identifier';
  }

  // Columns B-E typically contain performance level descriptions
  if (editedColumn >= 2 && editedColumn <= 5) {
    const levels = ['developing', 'basic', 'proficient', 'distinguished'];
    return `performance_level_${levels[editedColumn - 2] || 'unknown'}`;
  }

  // Other columns might contain best practices or other content
  return 'other_content';
}

/**
 * Process a role change detected by the trigger
 */
function processRoleChangeFromTrigger(sheet, editedRow, newRole, oldRole, triggerId) {
  try {
    debugLog('Processing role change from trigger', {
      triggerId: triggerId,
      row: editedRow,
      newRole: newRole,
      oldRole: oldRole
    });

    // Get user email from the same row
    const emailCell = sheet.getRange(editedRow, STAFF_COLUMNS.EMAIL + 1); // +1 for 1-indexed
    const userEmail = emailCell.getValue();

    if (!userEmail || !isValidEmail(userEmail)) {
      console.warn('Invalid email found in row during trigger processing:', {
        row: editedRow,
        email: userEmail,
        triggerId: triggerId
      });
      return;
    }

    // Get user name for logging
    const nameCell = sheet.getRange(editedRow, STAFF_COLUMNS.NAME + 1);
    const userName = nameCell.getValue() || 'Unknown';

    // Validate new role
    if (newRole && !AVAILABLE_ROLES.includes(newRole)) {
      console.warn('Invalid new role detected in trigger:', {
        userEmail: userEmail,
        newRole: newRole,
        availableRoles: AVAILABLE_ROLES,
        triggerId: triggerId
      });
      // Don't return - still clear caches in case of role correction
    }

    debugLog('Role change details extracted', {
      triggerId: triggerId,
      userEmail: userEmail,
      userName: userName,
      oldRole: oldRole,
      newRole: newRole
    });

    // Clear caches for this specific user
    clearCachesForSpecificUser(userEmail, oldRole, newRole, triggerId);

    // Add to role change history if we have the session manager
    if (typeof addRoleChangeToHistory === 'function') {
      addRoleChangeToHistory(userEmail, oldRole, newRole);
      debugLog('Role change added to history', {
        userEmail: userEmail,
        triggerId: triggerId
      });
    }

    // Warm cache for new role if valid
    if (newRole && AVAILABLE_ROLES.includes(newRole)) {
      if (typeof warmCacheForRoleChange === 'function') {
        warmCacheForRoleChange(userEmail, newRole);
        debugLog('Cache warmed for new role', {
          userEmail: userEmail,
          newRole: newRole,
          triggerId: triggerId
        });
      }
    }

    // Log successful processing
    console.log(`✅ AUTOMATIC ROLE CHANGE PROCESSED: ${userName} (${userEmail}) changed from "${oldRole}" to "${newRole}"`);

  } catch (error) {
    console.error('Error processing role change from trigger:', {
      error: formatErrorMessage(error, 'processRoleChangeFromTrigger'),
      triggerId: triggerId,
      row: editedRow,
      newRole: newRole,
      oldRole: oldRole
    });
  }
}

/**
 * Enhanced cache clearing for specific user triggered by sheet edit
 */
function clearCachesForSpecificUser(userEmail, oldRole, newRole, triggerId) {
  try {
    debugLog('Clearing versioned caches for specific user via trigger', {
      userEmail: userEmail,
      oldRole: oldRole,
      newRole: newRole,
      triggerId: triggerId
    });

    const cache = CacheService.getScriptCache();
    const trimmedEmail = userEmail.toLowerCase().trim();

    // Clear versioned user-specific cache
    const userKey = generateCacheKey('user', { email: trimmedEmail });
    cache.remove(userKey);
    debugLog('Cleared versioned user cache key', { key: userKey, triggerId: triggerId });

    const userContextKey = generateCacheKey('user_context', { email: trimmedEmail });
    cache.remove(userContextKey);
    debugLog('Cleared versioned user_context cache key', { key: userContextKey, triggerId: triggerId });

    // Clear versioned role sheet caches for both old and new roles
    const rolesToClear = [oldRole, newRole].filter(role =>
      role && AVAILABLE_ROLES.includes(role)
    );

    rolesToClear.forEach(role => {
      const versionedRoleKey = generateCacheKey('role_sheet', { role: role });
      cache.remove(versionedRoleKey);
      debugLog('Cleared versioned role_sheet cache key', { key: versionedRoleKey, role: role, triggerId: triggerId });
    });

    // Clear versioned staff data cache to ensure fresh user data
    const staffDataKey = generateCacheKey('staff_data');
    cache.remove(staffDataKey);
    debugLog('Cleared versioned staff_data cache key', { key: staffDataKey, triggerId: triggerId });

    debugLog('Versioned cache clearing completed for user', {
      userEmail: userEmail,
      rolesCleared: rolesToClear,
      triggerId: triggerId
    });

  } catch (error) {
    console.error('Error clearing caches for specific user:', {
      error: formatErrorMessage(error, 'clearCachesForSpecificUser'),
      userEmail: userEmail,
      triggerId: triggerId
    });
  }
}

/**
 * Convenience function for clearing user caches
 */
function clearUserCaches(userEmail = null) {
  console.log('=== CLEARING USER CACHES (Simple) ===');

  try {
    // Get user email if not provided
    if (!userEmail) {
      const sessionUser = getUserFromSession();
      userEmail = sessionUser ? sessionUser.email : null;
    }

    if (!userEmail) {
      console.log('No user email available - performing global cache clear');
      forceCleanAllCaches();
      return;
    }

    // Validate email
    if (!isValidEmail(userEmail)) {
      console.warn('Invalid email provided:', userEmail);
      return;
    }

    // Get current user role for comprehensive clearing
    const currentUser = getUserByEmail(userEmail);
    const userRole = currentUser ? currentUser.role : 'Teacher';

    // Use the comprehensive function
    clearCachesForSpecificUser(userEmail, userRole, userRole, generateUniqueId('manual_clear'));

    console.log(`✅ Cache cleared for user: ${userEmail} (role: ${userRole})`);

  } catch (error) {
    console.error('Error clearing user caches:', error);
    forceCleanAllCaches();
  }
}

/**
 * Check for role changes across all active users
 */
function checkAllUsersForRoleChanges() {
  console.log('=== CHECKING ALL USERS FOR ROLE CHANGES ===');

  try {
    const startTime = Date.now();
    const staffData = getStaffData();

    if (!staffData || !staffData.users) {
      debugLog('No staff data available for role change checking');
      return { error: 'No staff data available' };
    }

    const results = {
      totalUsers: staffData.users.length,
      usersChecked: 0,
      changesDetected: 0,
      roleChanges: [],
      errors: []
    };

    staffData.users.forEach(user => {
      try {
        if (!user.email || !isValidEmail(user.email)) {
          return;
        }

        results.usersChecked++;

        const changeDetection = detectUserStateChanges(user.email, {
          role: user.role,
          year: user.year,
          name: user.name,
          email: user.email
        });

        if (changeDetection.hasChanged && !changeDetection.isNewUser) {
          results.changesDetected++;

          const roleChange = changeDetection.changes.find(change => change.field === 'role');
          if (roleChange) {
            results.roleChanges.push({
              email: user.email,
              name: user.name,
              oldRole: roleChange.oldValue,
              newRole: roleChange.newValue,
              timestamp: Date.now()
            });

            // Proactively clear caches for this user
            clearUserCaches(user.email);

            debugLog('Proactive role change detected and processed', {
              email: user.email,
              oldRole: roleChange.oldValue,
              newRole: roleChange.newValue
            });
          }
        }

      } catch (userError) {
        results.errors.push({
          email: user.email,
          error: userError.message
        });
      }
    });

    const executionTime = Date.now() - startTime;

    logPerformanceMetrics('checkAllUsersForRoleChanges', executionTime, {
      totalUsers: results.totalUsers,
      usersChecked: results.usersChecked,
      changesDetected: results.changesDetected,
      roleChanges: results.roleChanges.length
    });

    if (results.roleChanges.length > 0) {
      console.log(`✅ Detected and processed ${results.roleChanges.length} role changes:`);
      results.roleChanges.forEach(change => {
        console.log(`  - ${change.email}: ${change.oldRole} → ${change.newRole}`);
      });
    } else {
      console.log('✅ No role changes detected');
    }

    debugLog('Role change check completed', results);
    return results;

  } catch (error) {
    console.error('Error checking users for role changes:', error);
    return { error: error.message };
  }
}

/**
 * Retrieves a list of staff members filtered by role and year, formatted for a dropdown.
 * This function is intended to be called from client-side JavaScript via google.script.run.
 *
 * @param {string} role The role to filter by (e.g., "Teacher", "Counselor").
 * @param {string} year The year to filter by (e.g., "1", "2", "Probationary").
 * @return {Array<{name: string, email: string}>} An array of staff objects, or an empty array if none found or on error.
 */
function getStaffListForDropdown(role, year) {
  try {
    debugLog(`getStaffListForDropdown called with role: ${role}, year: ${year}`);

    // Ensure SheetService.getStaffData is available or use a global alias if necessary
    const staffData = typeof getStaffData === 'function' ? getStaffData() : SheetService.getStaffData();

    if (!staffData || !staffData.users || staffData.users.length === 0) {
      debugLog('No staff data available in getStaffListForDropdown.');
      return [];
    }

    let filteredStaff = staffData.users;

    // Filter by role (case-insensitive)
    if (role) {
      const lowerCaseRole = role.toLowerCase();
      filteredStaff = filteredStaff.filter(user => user.role && user.role.toLowerCase() === lowerCaseRole);
    }

    // Filter by year
    if (year) {
      filteredStaff = filteredStaff.filter(user => _isUserYearMatching(user.year, year));
    }

    const result = filteredStaff.map(user => ({
      name: user.name,
      email: user.email
    }));

    debugLog(`Found ${result.length} staff members for role '${role}' and year '${year}'.`);
    return result;

  } catch (error) {
    console.error('Error in getStaffListForDropdown:', error.toString(), error.stack);
    debugLog(`Error in getStaffListForDropdown: ${error.toString()} Stack: ${error.stack ? error.stack : 'N/A'}`);
    return []; // Return empty array on error
  }
}

/**
 * Proactive cache warming for role changes
 */
function warmCacheForRoleChange(userEmail, newRole) {
  if (!userEmail || !newRole) {
    return;
  }

  try {
    debugLog('Warming cache for role change', { userEmail, newRole });

    // Validate role exists
    if (!AVAILABLE_ROLES.includes(newRole)) {
      console.warn(`Cannot warm cache for invalid role: ${newRole}`);
      return;
    }

    // Pre-load role sheet data
    const roleSheetData = getRoleSheetData(newRole);
    if (roleSheetData) {
      debugLog('Role sheet data warmed', { role: newRole, title: roleSheetData.title });
    }

    // Pre-load user data with new role context
    const userContext = createUserContext(userEmail);
    if (userContext) {
      debugLog('User context warmed', {
        email: userEmail,
        role: userContext.role
      });
    }

    debugLog('Cache warming completed', { userEmail, newRole });

  } catch (error) {
    console.error('Error warming cache for role change:', error);
  }
}

/**
 * Enhanced user validation with state tracking
 */
function validateUserWithStateTracking(userEmail) {
  if (!userEmail) {
    return { valid: false, reason: 'No email provided' };
  }

  try {
    debugLog('Validating user with state tracking', { userEmail });

    // Basic validation
    const basicValidation = validateUserAccess(userEmail);

    // Get session info
    const session = getUserSession(userEmail);

    // Get stored state
    const storedState = getStoredUserState(userEmail);

    // Get role change history
    const roleHistory = getRoleChangeHistory(userEmail);

    const validation = {
      ...basicValidation,
      sessionInfo: session,
      storedState: storedState,
      roleHistory: roleHistory,
      lastRoleChange: roleHistory.length > 0 ? roleHistory[0] : null,
      totalRoleChanges: roleHistory.length,
      sessionActive: session && session.isActive,
      sessionExpiry: session ? new Date(session.expiresAt).toISOString() : null
    };

    debugLog('Enhanced user validation completed', {
      userEmail: userEmail,
      valid: validation.hasAccess,
      role: validation.role,
      sessionActive: validation.sessionActive,
      roleChanges: validation.totalRoleChanges
    });

    return validation;

  } catch (error) {
    console.error('Error in enhanced user validation:', error);
    return {
      valid: false,
      reason: 'Validation error: ' + error.message,
      error: error.message
    };
  }
}

/**
 * Auto-trigger management functions
 */
function installRoleChangeAutoTrigger(forceReinstall = false) {
  console.log('=== INSTALLING ROLE CHANGE AUTO-TRIGGER ===');

  try {
    const spreadsheet = openSpreadsheet();

    // Check for existing triggers
    const existingTriggers = ScriptApp.getProjectTriggers();
    const editTriggers = existingTriggers.filter(trigger =>
      trigger.getEventType() === ScriptApp.EventType.ON_EDIT &&
      trigger.getTriggerSource() === ScriptApp.TriggerSource.SPREADSHEETS
    );

    console.log(`Found ${editTriggers.length} existing edit triggers`);

    if (editTriggers.length > 0 && !forceReinstall) {
      console.log('✅ Edit trigger already installed');
      return {
        success: true,
        message: 'Trigger already exists',
        existingTriggers: editTriggers.length,
        reinstalled: false
      };
    }

    // Remove existing triggers if force reinstall
    if (forceReinstall && editTriggers.length > 0) {
      console.log(`Removing ${editTriggers.length} existing edit triggers...`);
      editTriggers.forEach(trigger => {
        if (trigger.getHandlerFunction() === 'onEditTrigger') {
          ScriptApp.deleteTrigger(trigger);
        }
      });
      console.log('✓ Existing triggers removed');
    }

    // Create new trigger
    console.log('Creating new edit trigger...');
    const trigger = ScriptApp.newTrigger('onEditTrigger')
      .forSpreadsheet(spreadsheet)
      .onEdit()
      .create();

    const triggerId = trigger.getUniqueId();

    // Store trigger info in properties for monitoring
    const properties = PropertiesService.getScriptProperties();
    const triggerInfo = {
      triggerId: triggerId,
      installedAt: Date.now(),
      installedBy: 'installRoleChangeAutoTrigger',
      version: '2.0',
      spreadsheetId: spreadsheet.getId()
    };

    properties.setProperty('AUTO_TRIGGER_INFO', JSON.stringify(triggerInfo));

    console.log('✅ ROLE CHANGE AUTO-TRIGGER INSTALLED SUCCESSFULLY');
    console.log(`Trigger ID: ${triggerId}`);
    console.log('The system will now automatically clear caches when:');
    console.log('- Roles are changed in the Staff sheet');
    console.log('- Rubric content is changed in any role sheet');

    debugLog('Auto-trigger installed', triggerInfo);

    return {
      success: true,
      message: 'Trigger installed successfully',
      triggerId: triggerId,
      installedAt: new Date(triggerInfo.installedAt).toISOString(),
      reinstalled: forceReinstall
    };

  } catch (error) {
    console.error('Error installing auto-trigger:', formatErrorMessage(error, 'installRoleChangeAutoTrigger'));
    return {
      success: false,
      error: error.message
    };
  }
}

function checkAutoTriggerStatus() {
  console.log('=== CHECKING AUTO-TRIGGER STATUS ===');

  try {
    const existingTriggers = ScriptApp.getProjectTriggers();
    const editTriggers = existingTriggers.filter(trigger =>
      trigger.getEventType() === ScriptApp.EventType.ON_EDIT &&
      trigger.getTriggerSource() === ScriptApp.TriggerSource.SPREADSHEETS &&
      trigger.getHandlerFunction() === 'onEditTrigger'
    );

    const properties = PropertiesService.getScriptProperties();
    const triggerInfoString = properties.getProperty('AUTO_TRIGGER_INFO');
    let triggerInfo = null;

    if (triggerInfoString) {
      try {
        triggerInfo = JSON.parse(triggerInfoString);
      } catch (e) {
        console.warn('Could not parse AUTO_TRIGGER_INFO from properties', e);
        triggerInfo = {};
      }
    } else {
        triggerInfo = {};
    }

    const status = {
      isInstalled: editTriggers.length > 0,
      triggerCount: editTriggers.length,
      installedAt: triggerInfo?.installedAt ? new Date(triggerInfo.installedAt).toISOString() : null,
      triggerIdStored: triggerInfo?.triggerId || null,
      spreadsheetIdStored: triggerInfo?.spreadsheetId || null,
      triggers: editTriggers.map(trigger => ({
        id: trigger.getUniqueId(),
        handlerFunction: trigger.getHandlerFunction(),
        enabled: trigger.isDisabled ? !trigger.isDisabled() : true
      }))
    };

    console.log('Trigger Status:', {
      installed: status.isInstalled,
      count: status.triggerCount,
      installedAt: status.installedAt,
      storedId: status.triggerIdStored
    });

    if (status.isInstalled) {
      console.log('✅ Auto-trigger is active and monitoring:');
      console.log('- Staff sheet for role changes');
      console.log('- All role sheets for rubric content changes');
    } else {
      console.log('❌ Auto-trigger for onEditTrigger is not installed');
      console.log('Run: installRoleChangeAutoTrigger()');
    }

    return status;

  } catch (error) {
    console.error('Error checking auto-trigger status:', formatErrorMessage(error, 'checkAutoTriggerStatus'));
    return {
      isInstalled: false,
      error: error.message
    };
  }
}

function removeAutoTrigger() {
  console.log('=== REMOVING AUTO-TRIGGER ===');

  try {
    const existingTriggers = ScriptApp.getProjectTriggers();
    const editTriggers = existingTriggers.filter(trigger =>
      trigger.getEventType() === ScriptApp.EventType.ON_EDIT &&
      trigger.getTriggerSource() === ScriptApp.TriggerSource.SPREADSHEETS
    );

    if (editTriggers.length === 0) {
      console.log('No edit triggers found to remove');
      return {
        success: true,
        message: 'No edit triggers to remove',
        removed: 0
      };
    }

    let removedCount = 0;
    console.log(`Found ${editTriggers.length} edit triggers. Filtering for 'onEditTrigger' handler...`);
    editTriggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'onEditTrigger') {
        ScriptApp.deleteTrigger(trigger);
        removedCount++;
      }
    });
    console.log(`Removed ${removedCount} 'onEditTrigger' triggers.`);

    // Clear stored trigger info
    const properties = PropertiesService.getScriptProperties();
    properties.deleteProperty('AUTO_TRIGGER_INFO');

    console.log(`✅ Auto-trigger(s) for 'onEditTrigger' removed successfully. Total checked: ${editTriggers.length}, removed: ${removedCount}`);
    console.log('Role and rubric changes will no longer automatically clear caches');

    return {
      success: true,
      message: `Auto-trigger(s) for 'onEditTrigger' removed successfully. Checked ${editTriggers.length}, removed ${removedCount}.`,
      removed: removedCount
    };

  } catch (error) {
    console.error('Error removing auto-trigger:', formatErrorMessage(error, 'removeAutoTrigger'));
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Helper functions for response enhancement
 */
function generateResponseMetadata(userContext, requestId, debugMode = false) {
  try {
    const timestamp = Date.now();
    const cacheVersion = getMasterCacheVersion();

    // Generate ETag based on user state and data version
    const etagData = {
      role: userContext.role,
      year: userContext.year,
      email: userContext.email,
      cacheVersion: cacheVersion,
      timestamp: Math.floor(timestamp / 60000) // Round to minute for some caching
    };

    const etag = Utilities.base64Encode(
      Utilities.computeDigest(
        Utilities.DigestAlgorithm.MD5,
        JSON.stringify(etagData)
      )
    ).substring(0, 16);

    const metadata = {
      requestId: requestId,
      timestamp: timestamp,
      cacheVersion: cacheVersion,
      etag: etag,
      role: userContext.role,
      year: userContext.year,
      debugMode: debugMode,
      lastModified: new Date().toUTCString(),
      maxAge: 0,
      mustRevalidate: true
    };

    debugLog('Response metadata generated', metadata);
    return metadata;

  } catch (error) {
    console.error('Error generating response metadata:', error);
    return {
      requestId: requestId,
      timestamp: Date.now(),
      etag: 'error-' + Date.now(),
      error: error.message
    };
  }
}

function addStateTrackingHeaders(htmlOutput, userContext) {
  try {
    if (userContext.roleChangeDetected) {
      htmlOutput.addMetaTag('x-role-change-detected', 'true');
      htmlOutput.addMetaTag('x-previous-role', userContext.previousState?.role || 'unknown');
      htmlOutput.addMetaTag('x-state-changes', userContext.stateChanges.length.toString());
    }

    if (userContext.isNewUser) {
      htmlOutput.addMetaTag('x-new-user', 'true');
    }

    htmlOutput.addMetaTag('x-session-id', userContext.metadata.sessionId);
    htmlOutput.addMetaTag('x-context-version', userContext.metadata.contextVersion);
    htmlOutput.addMetaTag('x-has-staff-record', userContext.hasStaffRecord.toString());

    debugLog('State tracking headers added', {
      roleChangeDetected: userContext.roleChangeDetected,
      sessionId: userContext.metadata.sessionId
    });

  } catch (error) {
    console.error('Error adding state tracking headers:', error);
  }
}

function addCacheBustingHeaders(htmlOutput, metadata) {
  try {
    // Primary cache control headers
    htmlOutput
      .addMetaTag('cache-control', 'no-cache, no-store, must-revalidate, max-age=0')
      .addMetaTag('pragma', 'no-cache')
      .addMetaTag('expires', '0')
      .addMetaTag('last-modified', metadata.lastModified)
      .addMetaTag('etag', metadata.etag);

    // Custom headers for debugging and version tracking
    htmlOutput
      .addMetaTag('x-app-version', SYSTEM_INFO.VERSION)
      .addMetaTag('x-cache-version', metadata.cacheVersion)
      .addMetaTag('x-request-id', metadata.requestId)
      .addMetaTag('x-timestamp', metadata.timestamp.toString())
      .addMetaTag('x-role', metadata.role)
      .addMetaTag('x-year', metadata.year.toString());

    // Viewport and mobile optimization
    htmlOutput.addMetaTag('viewport', 'width=device-width, initial-scale=1.0');

    debugLog('Cache-busting headers added', {
      etag: metadata.etag,
      requestId: metadata.requestId
    });

  } catch (error) {
    console.error('Error adding cache-busting headers:', error);
  }
}

function addDebugHeaders(htmlOutput, userContext, metadata) {
  try {
    htmlOutput
      .addMetaTag('x-debug-mode', 'true')
      .addMetaTag('x-user-email', userContext.email || 'anonymous')
      .addMetaTag('x-user-authenticated', userContext.isAuthenticated.toString())
      .addMetaTag('x-user-default', userContext.isDefaultUser.toString())
      .addMetaTag('x-role-override', (userContext.isRoleOverride || false).toString())
      .addMetaTag('x-execution-time', (Date.now() - metadata.timestamp).toString());

    debugLog('Debug headers added', { requestId: metadata.requestId });

  } catch (error) {
    console.error('Error adding debug headers:', error);
  }
}

/**
 * Enhanced function to get all domains data with role and year support
 */
function getAllDomainsData(role = null, year = null) {
  const startTime = Date.now();
  
  try {
    // Use default role if none provided (backward compatibility)
    const userRole = role || 'Teacher';
    const userYear = year;
    
    debugLog('Loading domains data', { role: userRole, year: userYear });
    
    // Get role-specific sheet data
    const roleSheetData = getRoleSheetData(userRole);
    if (!roleSheetData) {
      throw new Error(`Unable to load data for role: ${userRole}`);
    }
    
    // Build result structure
    const result = {
      title: roleSheetData.title || `${userRole} Framework`,
      subtitle: roleSheetData.subtitle || "Professional practices and standards",
      role: userRole,
      year: userYear,
      domains: []
    };
    
    // For Teacher role, use legacy processing for backward compatibility
    if (userRole === 'Teacher') {
      result.domains = processLegacyTeacherDomains(roleSheetData.data);
    } else {
      // Use dynamic processing for other roles
      result.domains = processRoleDomains(roleSheetData, userRole, userYear);
    }
    
    // Apply year-based filtering if specified
    if (userYear && userYear !== null) {
      result.domains = applyYearFiltering(result.domains, userRole, userYear);
    }
    
    const executionTime = Date.now() - startTime;
    logPerformanceMetrics('getAllDomainsData', executionTime, {
      role: userRole,
      year: userYear,
      domainCount: result.domains.length
    });
    
    debugLog('Domains data loaded successfully', {
      role: userRole,
      domainCount: result.domains.length,
      totalComponents: result.domains.reduce((total, domain) => total + domain.components.length, 0)
    });
    
    return result;
    
  } catch (error) {
    console.error('Error reading sheet data:', formatErrorMessage(error, 'getAllDomainsData'));
    
    return {
      title: "Error Loading Data",
      subtitle: `Please check the configuration for role: ${role || 'default'}. Error: ${error.message}`,
      role: role || 'Teacher',
      year: year,
      domains: []
    };
  }
}

/**
 * Legacy function to process Teacher domain data
 */
function processLegacyTeacherDomains(sheetData) {
  const domains = [];
  
  // Process each domain using the original logic
  Object.keys(DOMAIN_CONFIGS).forEach(domainNum => {
    const config = DOMAIN_CONFIGS[domainNum];
    debugLog(`Processing ${config.name} from rows ${config.startRow} to ${config.endRow}`);
    
    const domainData = processDomainData(sheetData, parseInt(domainNum), config);
    domains.push(domainData);
    debugLog(`Successfully processed ${config.name}`);
  });
  
  return domains;
}

/**
 * Process data for a specific domain from the sheet data
 */
function processDomainData(sheetData, domainNumber, config) {
  const domain = {
    number: domainNumber,
    name: config.name,
    components: []
  };
  
  // Create best practices mapping for this domain
  const bestPracticesMap = createBestPracticesMap(domainNumber, config);
  
  // Convert 1-indexed row numbers to 0-indexed for array access
  const startIdx = config.startRow - 1;
  const endIdx = config.endRow - 1;
  
  // Look for components within the domain range
  for (let i = startIdx; i <= endIdx && i < sheetData.length; i++) {
    const row = sheetData[i];
    
    // Check if this row contains a component for this domain
    if (row[0] && row[0].toString().match(new RegExp(`^${domainNumber}[a-f]:`))) {
      const componentTitle = row[0].toString().trim();
      debugLog(`Processing component: ${componentTitle} at row ${i + 1}`);
      
      const component = {
        title: componentTitle,
        developing: sanitizeText(row[1]),
        basic: sanitizeText(row[2]),
        proficient: sanitizeText(row[3]),
        distinguished: sanitizeText(row[4]),
        bestPractices: []
      };
      
      // Extract component identifier (e.g., "1a:", "2b:", etc.)
      const componentId = componentTitle.substring(0, 3);
      debugLog(`Component ID extracted: "${componentId}"`);
      
      // Look up best practices for this component
      const practicesLocation = bestPracticesMap[componentId];
      if (practicesLocation && practicesLocation.row < sheetData.length) {
        const practicesText = sheetData[practicesLocation.row][practicesLocation.col];
        debugLog(`Looking for best practices at row ${practicesLocation.row + 1}, column ${practicesLocation.col + 1}`);
        
        if (practicesText && practicesText.toString().trim()) {
          const practices = parseMultilineCell(practicesText.toString());
          component.bestPractices = practices;
          debugLog(`Found ${component.bestPractices.length} practices for ${componentId}`);
        }
      }
      
      domain.components.push(component);
    }
  }
  
  debugLog(`Domain ${domainNumber}: Found ${domain.components.length} components`);
  return domain;
}

/**
 * Create best practices mapping for a specific domain
 */
function createBestPracticesMap(domainNumber, config) {
  const map = {};
  const startRowIdx = config.startRow - 1; // Convert to 0-indexed
  
  // Calculate component positions based on domain structure
  let componentRowIdx = startRowIdx;
  
  config.subdomains.forEach((subdomain, index) => {
    // Best practices are 4 rows after the component row
    const bestPracticesRowIdx = componentRowIdx + LEGACY_BEST_PRACTICES_OFFSET.ROW_OFFSET;
    
    map[subdomain] = {
      row: bestPracticesRowIdx,
      col: LEGACY_BEST_PRACTICES_OFFSET.COLUMN
    };
    
    debugLog(`Mapping ${subdomain} -> row ${bestPracticesRowIdx + 1}, col B`);
    
    // Move to next component (typically 3 rows apart)
    componentRowIdx += LEGACY_BEST_PRACTICES_OFFSET.ROW_SPACING;
  });
  
  return map;
}

/**
 * Process role-specific domains (placeholder for future implementation)
 */
function processRoleDomains(roleSheetData, role, year) {
  // For now, fall back to legacy processing
  debugLog(`Processing role domains for ${role} - falling back to legacy processing`);
  return processLegacyTeacherDomains(roleSheetData.data);
}

/**
 * Apply year-based filtering to domains (placeholder for future implementation)
 */
function applyYearFiltering(domains, role, year) {
  // For now, return all domains (no filtering)
  debugLog(`Year filtering not yet implemented - returning all domains for ${role}, year ${year}`);
  return domains;
}

/**
 * Get appropriate page title based on role
 */
function getPageTitle(role) {
  if (role === 'Teacher') {
    return HTML_SETTINGS.DEFAULT_TITLE;
  }
  return `${role} Framework - Professional Standards`;
}

/**
 * Generate cache-busted web app URL
 */
function generateCacheBustedUrl(options = {}) {
  try {
    const scriptId = ScriptApp.getScriptId();
    const baseUrl = `https://script.google.com/macros/s/${scriptId}/exec`;

    const params = new URLSearchParams();

    // Always add cache busting
    params.set('refresh', 'true');
    params.set('nocache', 'true');
    params.set('t', Date.now().toString());
    params.set('r', Math.random().toString(36).substr(2, 9));

    // Add optional parameters
    if (options.role) params.set('role', options.role);
    if (options.debug) params.set('debug', 'true');
    if (options.year) params.set('year', options.year.toString());
    if (options.mobile) params.set('mobile', 'true');

    // Add cache version for tracking
    params.set('cv', getMasterCacheVersion());

    const fullUrl = `${baseUrl}?${params.toString()}`;

    debugLog('Generated cache-busted URL', {
      baseUrl: baseUrl,
      options: options,
      fullUrl: fullUrl
    });

    return fullUrl;

  } catch (error) {
    console.error('Error generating cache-busted URL:', error);
    return 'https://script.google.com/macros/s/ERROR/exec';
  }
}

/**
 * Generate multiple URL variations for different use cases
 */
function generateAllUrlVariations(userContext = null) {
  try {
    const baseOptions = {};
    if (userContext) {
      baseOptions.role = userContext.role;
      baseOptions.year = userContext.year;
    }

    const urls = {
      standard: generateCacheBustedUrl(baseOptions),
      debug: generateCacheBustedUrl({ ...baseOptions, debug: true }),
      mobile: generateCacheBustedUrl({ ...baseOptions, mobile: true }),
      teacherOverride: generateCacheBustedUrl({ ...baseOptions, role: 'Teacher' }),
      forceRefresh: generateCacheBustedUrl({ ...baseOptions, refresh: 'true', nocache: 'true' })
    };

    // Add role-specific URLs for all available roles
    urls.roleSpecific = {};
    AVAILABLE_ROLES.forEach(role => {
      urls.roleSpecific[role] = generateCacheBustedUrl({
        ...baseOptions,
        role: role
      });
    });

    console.log('=== WEB APP URLS ===');
    console.log('📌 STANDARD URL (with your current role):');
    console.log(urls.standard);
    console.log('');
    console.log('🧪 DEBUG URL (shows debug info):');
    console.log(urls.debug);
    console.log('');
    console.log('📱 MOBILE-OPTIMIZED URL:');
    console.log(urls.mobile);

    return urls;

  } catch (error) {
    console.error('Error generating URL variations:', error);
    return { error: error.message };
  }
}
