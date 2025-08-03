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

    // Handle AJAX API requests
    if (params.getStaffList === 'true') {
      const staffResponse = handleStaffListRequest(e);
      return ContentService.createTextOutput(JSON.stringify(staffResponse))
        .setMimeType(ContentService.MimeType.JSON);
    }

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

    // Enhanced filter logic for role-only vs role+year scenarios
    let effectiveRole = userContext.role;  // Default to user's actual role
    let effectiveYear = userContext.year;  // Default to user's actual year
    let shouldShowFullRubric = false;
    let shouldShowAssignedAreas = false;

    // Handle special role filtering scenarios
    if (userContext.hasSpecialAccess) {
        if (filterRole && filterRole !== '' && AVAILABLE_ROLES.includes(filterRole)) {
            // Role filter is applied
            effectiveRole = filterRole;
            
            if (filterYear && filterYear !== '') {
                // Both role and year filters applied - show assigned areas
                effectiveYear = parseInt(filterYear) || filterYear; // Handle 'Probationary' string
                shouldShowAssignedAreas = true;
                
                debugLog('Special role filtering: Role + Year mode', {
                    filterRole: filterRole,
                    filterYear: filterYear,
                    effectiveRole: effectiveRole,
                    effectiveYear: effectiveYear
                });
            } else {
                // Only role filter applied - show full rubric for that role
                shouldShowFullRubric = true;
                
                debugLog('Special role filtering: Role-only mode', {
                    filterRole: filterRole,
                    effectiveRole: effectiveRole
                });
            }
        }
    }

    // Handle special role filtering
    let finalUserContext = userContext;

    if (userContext.hasSpecialAccess) {
        if (filterStaff && isValidEmail(filterStaff)) {
            // Staff-specific filtering (existing behavior)
            const filteredContext = createFilteredUserContext(filterStaff, userContext.role);
            if (filteredContext) {
                finalUserContext = filteredContext;
                debugLog('Using filtered user context for staff member', {
                    originalRole: userContext.role,
                    viewingAs: filteredContext.filterInfo.viewingAs,
                    viewingRole: filteredContext.filterInfo.viewingRole
                });
            }
        } else if (shouldShowFullRubric || shouldShowAssignedAreas) {
            // Role or Role+Year filtering - create synthetic context
            finalUserContext = createSyntheticUserContext(effectiveRole, effectiveYear, userContext, {
                isRoleFiltered: true,
                showFullRubric: shouldShowFullRubric,
                showAssignedAreas: shouldShowAssignedAreas,
                originalRole: userContext.role
            });
            
            debugLog('Using synthetic user context for role filtering', {
                originalRole: userContext.role,
                effectiveRole: effectiveRole,
                effectiveYear: effectiveYear,
                showFullRubric: shouldShowFullRubric,
                showAssignedAreas: shouldShowAssignedAreas
            });
        }
    }

    // Set view mode (URL parameter can override filter logic)
    if (viewMode && (viewMode === 'full' || viewMode === 'assigned')) {
        finalUserContext.viewMode = viewMode;
    } else if (!finalUserContext.isSynthetic) {
        // Only set default view mode if not already set by synthetic context
        finalUserContext.viewMode = 'full';
    }

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
    
    // Fallback check
    // If we tried to show filter interface but it failed, continue with normal flow
    if (userContext.hasSpecialAccess && !hasActiveFilters(params)) {
        console.log('⚠️ Filter interface should have been shown but continuing with normal flow');
    }
    // Get role-specific rubric data
    const rubricData = getAllDomainsData(
      finalUserContext.role,
      finalUserContext.year,
      finalUserContext.viewMode,      // Pass viewMode
      finalUserContext.assignedSubdomains // Pass assignedSubdomains
    );

    // Add special role data if needed
    if (finalUserContext.hasSpecialAccess) {
      rubricData.specialRoleData = {
        availableRoles: AVAILABLE_ROLES.filter(role => role !== finalUserContext.role),
        availableYears: OBSERVATION_YEARS,
        probationaryStaff: finalUserContext.specialRoleType === 'administrator' ?
          getProbationaryStaff() : null,
        accessValidation: validateSpecialRoleAccess(finalUserContext.role, 'general_access')
      };
    }
    
    // Generate enhanced response metadata
    const responseMetadata = generateResponseMetadata(finalUserContext, requestId, debugMode);

    // *** ADDING DEBUG LOG ***
    console.log('Server-side userContext:', JSON.stringify(finalUserContext, null, 2));

    // Add comprehensive user context to the data for the HTML template
    rubricData.userContext = {
      // Basic user info
      email: finalUserContext.email,
      role: finalUserContext.role,
      year: finalUserContext.year,
      isAuthenticated: finalUserContext.isAuthenticated,
      displayName: finalUserContext.email ? finalUserContext.email.split('@')[0] : 'Guest',

      // Enhanced view mode and assignment properties
      viewMode: finalUserContext.viewMode,
      assignedSubdomains: finalUserContext.assignedSubdomains,
      hasSpecialAccess: finalUserContext.hasSpecialAccess,
      canFilter: finalUserContext.canFilter,
      specialRoleType: finalUserContext.specialRoleType,
      activeFilters: finalUserContext.activeFilters,
      isFiltered: finalUserContext.isFiltered || false,
      filterInfo: finalUserContext.filterInfo || null,

      // Special role data
      availableRoles: rubricData.specialRoleData?.availableRoles || [],
      availableYears: rubricData.specialRoleData?.availableYears || [],
      probationaryStaff: rubricData.specialRoleData?.probationaryStaff || [],

      // Assignment metadata
      assignmentMetadata: rubricData.assignmentMetadata || null,

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
 * Handle AJAX requests for staff data (used by special role filters)
 * @param {Object} e - Event object from doGet
 * @return {Object} JSON response with staff data
 */
function handleStaffListRequest(e) {
  try {
    const params = e.parameter || {};
    const requestingRole = params.requestingRole;
    const filterRole = params.filterRole;
    const filterYear = params.filterYear;
    let yearArgument = filterYear;

    // Validate requestingRole
    if (typeof requestingRole !== 'string' || !AVAILABLE_ROLES.includes(requestingRole)) {
      return {
        success: false,
        error: 'Invalid input',
        message: 'requestingRole must be a string and a valid role.'
      };
    }

    // Validate filterRole if provided
    if (filterRole && (typeof filterRole !== 'string' || !AVAILABLE_ROLES.includes(filterRole))) {
      return {
        success: false,
        error: 'Invalid input',
        message: 'filterRole must be a string and a valid role.'
      };
    }

    // Validate filterYear if provided
    if (filterYear) {
      const parsedFilterYear = parseInt(filterYear);
      if (isNaN(parsedFilterYear) || !OBSERVATION_YEARS.includes(parsedFilterYear)) {
        return {
          success: false,
          error: 'Invalid input',
          message: 'filterYear must be a number and a valid observation year.'
        };
      }
      yearArgument = parsedFilterYear;
    }

    // Validate requesting user has permission
    const accessValidation = validateSpecialRoleAccess(requestingRole, 'view_any');
    if (!accessValidation.hasAccess) {
      return {
        success: false,
        error: 'Access denied',
        message: accessValidation.message
      };
    }

    // Get filtered staff list
    const staffList = getStaffByRoleAndYear(filterRole, yearArgument);

    return {
      success: true,
      staffList: staffList,
      filterRole: filterRole,
      filterYear: filterYear,
      count: staffList.length
    };

  } catch (error) {
    console.error('Error handling staff list request:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get filtered staff list for special roles
 * @param {string} filterType - Type of filter to apply
 * @param {string} role - Specific role filter (optional)
 * @param {string|number} year - Specific year filter (optional)
 * @return {Array} Filtered staff array
 */
function getFilteredStaffList(filterType = 'all', role = null, year = null) {
  try {
    const staffData = getStaffData();
    if (!staffData || !staffData.users) {
      debugLog('No staff data available for filtering');
      return [];
    }

    let filteredUsers = [...staffData.users];

    // Apply type-based filtering
    switch (filterType) {
      case 'probationary':
        filteredUsers = filteredUsers.filter(user => user.year === PROBATIONARY_OBSERVATION_YEAR);
        break;

      case 'by_role':
        if (role && AVAILABLE_ROLES.includes(role)) {
          filteredUsers = filteredUsers.filter(user => user.role === role);
        }
        break;

      case 'by_year':
        if (year) {
          filteredUsers = filteredUsers.filter(user => _isUserYearMatching(user.year, year));
        }
        break;

      case 'combined':
        if (role && AVAILABLE_ROLES.includes(role)) {
          filteredUsers = filteredUsers.filter(user => user.role === role);
        }
        if (year) {
          filteredUsers = filteredUsers.filter(user => _isUserYearMatching(user.year, year));
        }
        break;

      default:
        // 'all' - no additional filtering
        break;
    }

    // Format for frontend use
    const formattedUsers = filteredUsers.map(user => ({
      name: user.name || 'Unknown Name',
      email: user.email,
      role: user.role || 'Unknown Role',
      year: user.year || null,
      displayName: `${user.name || 'Unknown'} (${user.role || 'Unknown'}, Year ${user.year ? user.year : 'N/A'})`
    }));

    debugLog('Staff list filtered', {
      filterType: filterType,
      role: role,
      year: year,
      originalCount: staffData.users.length,
      filteredCount: formattedUsers.length
    });

    return formattedUsers;

  } catch (error) {
    console.error('Error filtering staff list:', formatErrorMessage(error, 'getFilteredStaffList'));
    return [];
  }
}

/**
 * Get probationary staff only (for Administrator role)
 * @return {Array} Array of probationary staff
 */
function getProbationaryStaff() {
  return getFilteredStaffList('probationary');
}

/**
 * Get staff by role and year (for Peer Evaluator and Full Access)
 * @param {string} role - Role to filter by
 * @param {string|number} year - Year to filter by
 * @return {Array} Filtered staff array
 */
function getStaffByRoleAndYear(role, year) {
  return getFilteredStaffList('combined', role, year);
}

/**
 * Validate special role access permissions
 * @param {string} requestingRole - Role of the person making the request
 * @param {string} requestType - Type of request ('view_probationary', 'view_any', etc.)
 * @return {Object} Validation result
 */
function validateSpecialRoleAccess(requestingRole, requestType) {
  const validation = {
    hasAccess: false,
    role: requestingRole,
    requestType: requestType,
    allowedActions: [],
    message: 'Access denied'
  };

  try {
    switch (requestingRole) {
      case SPECIAL_ROLES.ADMINISTRATOR:
        validation.hasAccess = true;
        validation.allowedActions = [SPECIAL_ACTIONS.VIEW_PROBATIONARY, SPECIAL_ACTIONS.VIEW_OWN_STAFF];
        validation.message = 'Administrator access granted';
        break;

      case SPECIAL_ROLES.PEER_EVALUATOR:
        validation.hasAccess = true;
        validation.allowedActions = [SPECIAL_ACTIONS.VIEW_ANY, SPECIAL_ACTIONS.FILTER_BY_ROLE, SPECIAL_ACTIONS.FILTER_BY_YEAR, SPECIAL_ACTIONS.FILTER_BY_STAFF];
        validation.message = 'Peer Evaluator access granted';
        break;

      case SPECIAL_ROLES.FULL_ACCESS:
        validation.hasAccess = true;
        validation.allowedActions = [SPECIAL_ACTIONS.VIEW_ANY, SPECIAL_ACTIONS.FILTER_BY_ROLE, SPECIAL_ACTIONS.FILTER_BY_YEAR, SPECIAL_ACTIONS.FILTER_BY_STAFF, SPECIAL_ACTIONS.ADMIN_FUNCTIONS];
        validation.message = 'Full Access granted';
        break;

      default:
        validation.message = `Role "${requestingRole}" does not have special access privileges`;
        break;
    }

    // Check if specific request type is allowed
    if (validation.hasAccess && requestType && !validation.allowedActions.includes(requestType)) {
      validation.hasAccess = false;
      validation.message = `Role "${requestingRole}" cannot perform action "${requestType}"`;
    }

    debugLog('Special role access validation', validation);
    return validation;

  } catch (error) {
    console.error('Error validating special role access:', error);
    validation.message = 'Validation error: ' + error.message;
    return validation;
  }
}

/**
 * Extracts the component ID (e.g., "1a:") from a component title string.
 * @param {string} componentTitle The title of the component.
 * @return {string|null} The extracted component ID, or null if not found.
 */
function extractComponentId(componentTitle) {
  if (!componentTitle || typeof componentTitle !== 'string') {
    return null;
  }
  const match = componentTitle.match(/^([1-4][a-fA-F]:)/);
  return match ? match[1] : null;
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

    // Enhanced input validation
    if (!role || typeof role !== 'string' || role.trim() === '') {
      debugLog('Invalid role provided to getStaffListForDropdown', { role: role });
      return [];
    }

    if (!year || typeof year !== 'string' || year.trim() === '') {
      debugLog('Invalid year provided to getStaffListForDropdown', { year: year });
      return [];
    }

    const staffData = getStaffData();

    if (!staffData || !staffData.users || staffData.users.length === 0) {
      debugLog('No staff data available in getStaffListForDropdown.');
      return [];
    }

    let filteredStaff = staffData.users;

    // Filter by role (handle "Any" specially)
    if (role.toLowerCase() !== 'any') {
      const targetRole = role.trim();
      
      // Validate that the role exists in AVAILABLE_ROLES
      if (!AVAILABLE_ROLES.includes(targetRole)) {
        debugLog(`Invalid role provided: ${targetRole}. Valid roles are:`, AVAILABLE_ROLES);
        return [];
      }
      
      filteredStaff = filteredStaff.filter(user => {
        return user.role && user.role.trim() === targetRole;
      });
      
      debugLog(`After role filter (${targetRole}):`, filteredStaff.length, 'staff members');
    }

    // Filter by year (handle "Any" specially)
    if (year.toLowerCase() !== 'any') {
      const targetYear = year.trim();
      
      filteredStaff = filteredStaff.filter(user => {
        return _isUserYearMatching(user.year, targetYear);
      });
      
      debugLog(`After year filter (${targetYear}):`, filteredStaff.length, 'staff members');
    }

    // Format results for dropdown
    const result = filteredStaff.map(user => ({
      name: user.name || 'Unknown Name',
      email: user.email || '',
      role: user.role || 'Unknown Role',
      year: user.year || 'Unknown Year',
      displayText: `${user.name || 'Unknown'} (${user.role || 'Unknown'}, Year ${user.year || 'N/A'})`
    }));

    // Sort by name for better user experience
    result.sort((a, b) => {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      return nameA.localeCompare(nameB);
    });

    debugLog(`Found ${result.length} staff members for role '${role}' and year '${year}'.`);
    
    return result;

  } catch (error) {
    console.error('Error in getStaffListForDropdown:', error.toString(), error.stack);
    debugLog(`Error in getStaffListForDropdown: ${error.toString()} Stack: ${error.stack || 'N/A'}`);
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
 * Enhance domains with assignment information
 * @param {Array} domains - Array of domain objects
 * @param {Object} assignedSubdomains - Object with assigned subdomains by domain
 * @param {string} viewMode - 'full' or 'assigned'
 * @return {Array} Enhanced domains array
 */
function enhanceDomainsWithAssignments(domains, assignedSubdomains, viewMode = 'full') {
  // Validate domains
  if (!Array.isArray(domains)) {
    const errorMessage = 'enhanceDomainsWithAssignments: domains must be an array.';
    console.error(errorMessage);
    throw new Error(errorMessage); // Throw an error to be caught by the caller
  }

  // Validate assignedSubdomains if provided
  if (assignedSubdomains && typeof assignedSubdomains !== 'object') {
    const errorMessage = 'enhanceDomainsWithAssignments: assignedSubdomains must be an object if provided.';
    console.error(errorMessage);
    throw new Error(errorMessage); // Throw an error to be caught by the caller
  }

  // If assignedSubdomains is not provided, no enhancement is needed.
  if (!assignedSubdomains) {
    return domains;
  }

  try {
    return domains.map((domain, domainIndex) => {
      const domainKey = `domain${domainIndex + 1}`;
      let assignedList = assignedSubdomains[domainKey];

      // Ensure assignedList is an array before using .includes()
      if (!Array.isArray(assignedList)) {
        assignedList = []; // Treat as empty if not an array
      }

      // Process each component in the domain
      const enhancedComponents = domain.components ? domain.components.map(component => {
        // Extract component ID from title
        const componentId = extractComponentId(component.title);
        // Check if componentId is valid before calling .includes() on assignedList (which is guaranteed to be an array)
        const isAssigned = componentId && assignedList.includes(componentId);

        return {
          ...component,
          isAssigned: isAssigned,
          componentId: componentId,
          assignmentStatus: isAssigned ? 'assigned' : 'not_assigned'
        };
      }) : [];

      // Filter components based on view mode
      let filteredComponents = enhancedComponents;
      if (viewMode === 'assigned') {
        filteredComponents = enhancedComponents.filter(comp => comp.isAssigned);
      }

      const assignedCount = enhancedComponents.filter(comp => comp.isAssigned).length;

      return {
        ...domain,
        components: filteredComponents,
        assignmentInfo: {
          totalComponents: enhancedComponents.length,
          assignedComponents: assignedCount,
          assignedList: assignedList,
          hasAssignments: assignedCount > 0,
          assignmentPercentage: enhancedComponents.length > 0 ?
            Math.round((assignedCount / enhancedComponents.length) * 100) : 0
        }
      };
    });

  } catch (error) {
    console.error('Error enhancing domains with assignments:', error);
    throw error; // Re-throw the error
  }
}

/**
 * Calculate overall assignment metadata
 * @param {Array} domains - Enhanced domains array
 * @param {Object} assignedSubdomains - Assigned subdomains object
 * @return {Object} Assignment metadata
 */
function calculateAssignmentMetadata(domains, assignedSubdomains) {
  try {
    const metadata = {
      hasAssignments: !!assignedSubdomains,
      totalAssigned: 0,
      totalComponents: 0,
      assignmentsByDomain: {},
      overallPercentage: 0
    };

    domains.forEach((domain, index) => {
      const domainKey = `domain${index + 1}`;
      const domainInfo = domain.assignmentInfo || {};

      metadata.totalComponents += domainInfo.totalComponents || 0;
      metadata.totalAssigned += domainInfo.assignedComponents || 0;

      metadata.assignmentsByDomain[domainKey] = {
        name: domain.name,
        assigned: domainInfo.assignedComponents || 0,
        total: domainInfo.totalComponents || 0,
        percentage: domainInfo.assignmentPercentage || 0
      };
    });

    if (metadata.totalComponents > 0) {
      metadata.overallPercentage = Math.round((metadata.totalAssigned / metadata.totalComponents) * 100);
    }

    debugLog('Assignment metadata calculated', metadata);
    return metadata;

  } catch (error) {
    console.error('Error calculating assignment metadata:', error);
    return {
      hasAssignments: false,
      totalAssigned: 0,
      totalComponents: 0,
      assignmentsByDomain: {},
      overallPercentage: 0
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
    // Viewport and mobile optimization is the only safe meta tag to set here.
    htmlOutput.addMetaTag('viewport', 'width=device-width, initial-scale=1.0');

    debugLog('Cache-busting headers (meta tags) skipped to prevent errors. Viewport set.', {
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
 * Enhanced function to get all domains data with view mode and assignment support
 */
function getAllDomainsData(role = null, year = null, viewMode = 'full', assignedSubdomains = null) {
  const startTime = Date.now();
  let userRole = 'Teacher'; // Default role
  let userYear = null;
  let effectiveViewMode = VIEW_MODES.FULL;
  let effectiveAssignedSubdomains = null;

  // Validate role
  if (role) {
    if (typeof role === 'string' && AVAILABLE_ROLES.includes(role)) {
      userRole = role;
    } else {
      console.error(`Invalid role: ${role}. Returning error structure.`);
      return {
        title: "Error Loading Data",
        subtitle: `Invalid role specified: ${role}. Please select a valid role.`,
        role: role,
        year: year,
        viewMode: viewMode,
        domains: [],
        isError: true,
        errorMessage: `Invalid role: ${role}. Valid roles are: ${AVAILABLE_ROLES.join(', ')}.`
      };
    }
  }

  // Validate year
  if (year !== null && year !== undefined) {
    const observationYear = parseInt(year);
    if (isNaN(observationYear) || !OBSERVATION_YEARS.includes(observationYear)) {
      console.error(`Invalid year: ${year}. Returning error structure.`);
      return {
        title: "Error Loading Data",
        subtitle: `Invalid year specified: ${year}. Please select a valid year.`,
      role: role,
        year: year,     // original invalid year
      viewMode: viewMode,
        domains: [],
        isError: true,
      errorMessage: `Invalid year: ${year}. Valid years are: ${OBSERVATION_YEARS.join(', ')}`
      };
    } else {
      userYear = observationYear;
    }
  }

  // Validate viewMode
  if (viewMode && typeof viewMode === 'string') {
    const lowerViewMode = viewMode.toLowerCase();
    if (Object.values(VIEW_MODES).includes(lowerViewMode)) {
      effectiveViewMode = lowerViewMode;
    } else {
      console.warn(`Invalid viewMode: ${viewMode}. Defaulting to 'full'.`);
      // effectiveViewMode is already VIEW_MODES.FULL
    }
  }

  // Validate assignedSubdomains
  if (assignedSubdomains) {
    if (typeof assignedSubdomains === 'object' && !Array.isArray(assignedSubdomains)) {
      effectiveAssignedSubdomains = assignedSubdomains;
    } else {
      console.warn(`Invalid assignedSubdomains: not an object. Proceeding as if no assignments were provided.`);
      // effectiveAssignedSubdomains remains null
    }
  }
  
  try {
    debugLog('Loading domains data with validated parameters', {
      role: userRole,
      year: userYear,
      viewMode: effectiveViewMode,
      hasAssignedSubdomains: !!effectiveAssignedSubdomains
    });
    
    // Get role-specific sheet data
    const roleSheetData = getRoleSheetData(userRole);
    if (!roleSheetData) {
      // This case should ideally be handled by role validation, but as a fallback:
      throw new Error(`Unable to load data for role: ${userRole}`);
    }
    
    // Build result structure
    const result = {
      title: roleSheetData.title || `${userRole} Framework`,
      subtitle: roleSheetData.subtitle || "Professional practices and standards",
      role: userRole,
      year: userYear,
      viewMode: effectiveViewMode,
      domains: [],
      assignmentMetadata: {
        hasAssignments: !!effectiveAssignedSubdomains,
        totalAssigned: 0,
        totalComponents: 0,
        assignmentsByDomain: {}
      }
    };
    
    // For Teacher role, use legacy processing for backward compatibility
    if (userRole === 'Teacher') {
      result.domains = processLegacyTeacherDomains(roleSheetData.data);
    } else {
      // Use dynamic processing for other roles
      result.domains = processRoleDomains(roleSheetData, userRole, userYear);
    }
    
    // Apply assignment metadata and filtering
    if (effectiveAssignedSubdomains) {
      result.domains = enhanceDomainsWithAssignments(result.domains, effectiveAssignedSubdomains, effectiveViewMode);
      result.assignmentMetadata = calculateAssignmentMetadata(result.domains, effectiveAssignedSubdomains);
    }

    // Apply year-based filtering if specified
    if (userYear !== null) { // Check against null explicitly
      result.domains = applyYearFiltering(result.domains, userRole, userYear);
    }
    
    const executionTime = Date.now() - startTime;
    logPerformanceMetrics('getAllDomainsData', executionTime, {
      role: userRole,
      year: userYear,
      viewMode: effectiveViewMode,
      domainCount: result.domains.length,
      totalComponents: result.assignmentMetadata.totalComponents,
      assignedComponents: result.assignmentMetadata.totalAssigned
    });
    
    debugLog('Enhanced domains data loaded successfully', {
      role: userRole,
      domainCount: result.domains.length,
      totalComponents: result.assignmentMetadata.totalComponents,
      assignedComponents: result.assignmentMetadata.totalAssigned,
      viewMode: viewMode
    });
    
    return result;
    
  } catch (error) {
    console.error('Error reading sheet data:', formatErrorMessage(error, 'getAllDomainsData'));
    
    return {
      title: "Error Loading Data",
      subtitle: `An error occurred. Please see details below.`, // Subtitle can be generic
      role: role || 'Teacher', // Keep role if available
      year: year, // Keep year if available
      viewMode: viewMode || 'full', // Keep viewMode if available
      domains: [],
      isError: true,
      errorMessage: `An unexpected error occurred while loading data for role '${role || 'default'}'. Error details: ${error.message}. Please try again later or contact support if the issue persists.`,
      assignmentMetadata: { // Keep this structure for consistency if the UI expects it
        hasAssignments: false,
        totalAssigned: 0,
        totalComponents: 0,
        assignmentsByDomain: {}
      }
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
 * Process role-specific domains dynamically from the sheet data.
 * This function is designed to work for any role, not just 'Teacher'.
 * @param {object} roleSheetData - The object containing the sheet data for the role.
 * @param {string} role - The name of the role being processed.
 * @param {number} year - The observation year.
 * @return {Array} An array of domain objects.
 */
function processRoleDomains(roleSheetData, role, year) {
  debugLog(`Processing domains for role "${role}" using dynamic processor.`);
  const domains = [];
  let currentDomain = null;

  // Assuming the sheet format is:
  // - Domain headers are in column A (e.g., "Domain 1: ...")
  // - Component IDs are in column A (e.g., "1a:", "2b:")
  // - Performance levels are in columns B, C, D, E
  
  const sheetData = roleSheetData.data;

  for (let i = 0; i < sheetData.length; i++) {
    const row = sheetData[i];
    const firstCell = row[0] ? row[0].toString().trim() : '';

    // Check for a new domain header
    if (firstCell.toLowerCase().startsWith('domain')) {
      const domainNumberMatch = firstCell.match(/(\d+)/);
      if (domainNumberMatch) {
        currentDomain = {
          number: parseInt(domainNumberMatch[1], 10),
          name: firstCell,
          components: []
        };
        domains.push(currentDomain);
        debugLog(`Found ${currentDomain.name}`);
      }
    }
    // Check for a component ID
    else if (VALIDATION_PATTERNS.COMPONENT_ID.test(firstCell)) {
      if (currentDomain) {
        const component = {
          title: firstCell,
          developing: sanitizeText(row[1]),
          basic: sanitizeText(row[2]),
          proficient: sanitizeText(row[3]),
          distinguished: sanitizeText(row[4]),
          bestPractices: [] // Note: Best practices are not handled by this generic processor yet.
        };
        currentDomain.components.push(component);
      } else {
        debugLog(`Found component "${firstCell}" but no current domain is set. Skipping.`);
      }
    }
  }
  
  debugLog(`Finished processing for role "${role}". Found ${domains.length} domains.`);
  domains.forEach(d => {
    debugLog(`- ${d.name}: Found ${d.components.length} components.`);
  });

  return domains;
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

/**
 * Create synthetic user context for role/year filtering by special access users
 * ENHANCED VERSION - Fixes blank screen issue
 */
function createSyntheticUserContext(targetRole, targetYear, originalContext, filterOptions = {}) {
    try {
        debugLog('Creating synthetic user context - Enhanced Version', {
            targetRole: targetRole,
            targetYear: targetYear,
            filterOptions: filterOptions,
            originalRole: originalContext?.role
        });

        // VALIDATION: Check if targetRole is valid
        if (!targetRole || typeof targetRole !== 'string') {
            console.error('Invalid targetRole provided:', targetRole);
            return {
                ...originalContext,
                error: 'Invalid role specified',
                isError: true
            };
        }

        if (!AVAILABLE_ROLES.includes(targetRole)) {
            console.error('Role not in AVAILABLE_ROLES:', targetRole, 'Available:', AVAILABLE_ROLES);
            return {
                ...originalContext,
                error: `Role "${targetRole}" is not available. Available roles: ${AVAILABLE_ROLES.join(', ')}`,
                isError: true
            };
        }

        // VALIDATION: Check if originalContext exists
        if (!originalContext) {
            console.error('No original context provided');
            return {
                role: targetRole,
                year: targetYear || 1,
                isFiltered: true,
                isSynthetic: true,
                error: 'Missing user context',
                isError: true
            };
        }

        // Create a safe copy of the original context
        const syntheticContext = {
            // Copy all original properties first
            ...originalContext,
            
            // Override with synthetic values
            role: targetRole,
            year: targetYear || originalContext.year || 1,
            isFiltered: true,
            isSynthetic: true,
            isError: false,
            
            // Set view mode based on filter type
            viewMode: filterOptions.showAssignedAreas ? 'assigned' : 'full',
            
            // Get assigned subdomains if needed
            assignedSubdomains: null,
            
            // Enhanced filter info
            filterInfo: {
                filterType: filterOptions.showFullRubric ? 'role_only' : 'role_and_year',
                viewingRole: targetRole,
                viewingYear: targetYear,
                requestedBy: originalContext.role || 'Unknown',
                showFullRubric: !!filterOptions.showFullRubric,
                showAssignedAreas: !!filterOptions.showAssignedAreas,
                originalRole: originalContext.role || 'Unknown'
            },
            
            // Maintain special access from original context
            hasSpecialAccess: originalContext.hasSpecialAccess || false,
            canFilter: originalContext.canFilter || false,
            specialRoleType: originalContext.specialRoleType || null
        };

        // Get assigned subdomains if showing assigned areas
        if (filterOptions.showAssignedAreas && targetYear) {
            try {
                syntheticContext.assignedSubdomains = getAssignedSubdomainsForRoleYear(targetRole, targetYear);
                debugLog('Assigned subdomains loaded for synthetic context', {
                    role: targetRole,
                    year: targetYear,
                    subdomains: syntheticContext.assignedSubdomains
                });
            } catch (subdomainError) {
                console.warn('Error loading assigned subdomains:', subdomainError);
                // Continue without assigned subdomains rather than failing
                syntheticContext.assignedSubdomains = null;
            }
        }

        debugLog('Synthetic user context created successfully - Enhanced Version', {
            role: syntheticContext.role,
            year: syntheticContext.year,
            viewMode: syntheticContext.viewMode,
            hasAssignedSubdomains: !!syntheticContext.assignedSubdomains,
            filterType: syntheticContext.filterInfo?.filterType
        });

        return syntheticContext;

    } catch (error) {
        console.error('Error creating synthetic user context - Enhanced Version:', error);
        
        // Return a safe fallback context instead of throwing
        return {
            ...originalContext,
            role: originalContext?.role || 'Teacher', // Safe fallback
            year: originalContext?.year || 1,
            isFiltered: true,
            isSynthetic: true,
            isError: true,
            error: `Error creating filtered view: ${error.message}`,
            filterInfo: {
                error: error.message,
                requestedRole: targetRole,
                fallbackUsed: true
            }
        };
    }
}

/**
 * Create enhanced error page with cache busting and debug info
 * Add this function to the end of your Code.js file, before the final closing brace
 */
function createEnhancedErrorPage(error, requestId, userContext, userAgent) {
  try {
    const errorDetails = {
      message: error instanceof Error ? error.message : error.toString(),
      timestamp: new Date().toISOString(),
      requestId: requestId || generateUniqueId('error'),
      userAgent: userAgent || 'Unknown',
      stack: error.stack || 'No stack trace available'
    };

    // Create simple HTML content directly instead of using template
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="cache-control" content="no-cache, no-store, must-revalidate, max-age=0">
    <meta http-equiv="pragma" content="no-cache">
    <meta http-equiv="expires" content="0">
    <title>System Error - Danielson Framework</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #f8f9fa;
            margin: 0;
            padding: 20px;
            color: #333;
        }
        .error-container {
            max-width: 600px;
            margin: 50px auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            padding: 40px;
            text-align: center;
        }
        .error-icon {
            font-size: 4rem;
            color: #dc3545;
            margin-bottom: 20px;
        }
        .error-title {
            color: #dc3545;
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 15px;
        }
        .error-message {
            color: #666;
            font-size: 1rem;
            line-height: 1.6;
            margin-bottom: 30px;
        }
        .error-actions {
            display: flex;
            gap: 15px;
            justify-content: center;
            flex-wrap: wrap;
        }
        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            font-size: 0.9rem;
            font-weight: 500;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            transition: all 0.3s ease;
        }
        .btn-primary {
            background: #007bff;
            color: white;
        }
        .btn-primary:hover {
            background: #0056b3;
        }
        .btn-secondary {
            background: #6c757d;
            color: white;
        }
        .btn-secondary:hover {
            background: #545b62;
        }
        .error-details {
            margin-top: 30px;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 6px;
            font-family: monospace;
            font-size: 0.8rem;
            color: #666;
            text-align: left;
            max-height: 200px;
            overflow-y: auto;
        }
        @media (max-width: 768px) {
            .error-container {
                margin: 20px auto;
                padding: 20px;
            }
            .btn {
                width: 100%;
                margin-bottom: 10px;
            }
        }
    </style>
</head>
<body>
    <div class="error-container">
        <div class="error-icon">⚠️</div>
        <h1 class="error-title">System Error</h1>
        <div class="error-message">
            <p>We encountered an error while loading the Danielson Framework.</p>
            <p>This is usually temporary. Please try refreshing the page or contact your administrator if the problem persists.</p>
        </div>
        
        <div class="error-actions">
            <button class="btn btn-primary" onclick="window.location.reload()">
                🔄 Refresh Page
            </button>
            <button class="btn btn-secondary" onclick="forceRefresh()">
                💨 Force Refresh
            </button>
        </div>

        <div class="error-details">
            <strong>Error Details:</strong><br>
            Time: ${errorDetails.timestamp}<br>
            Request ID: ${errorDetails.requestId}<br>
            Message: ${errorDetails.message}<br>
        </div>
    </div>

    <script>
        function forceRefresh() {
            const url = new URL(window.location);
            url.searchParams.set('refresh', 'true');
            url.searchParams.set('nocache', 'true');
            url.searchParams.set('t', Date.now());
            window.location.href = url.toString();
        }

        // Auto-refresh after 30 seconds
        setTimeout(function() {
            forceRefresh();
        }, 30000);

        console.error('System Error Details:', ${JSON.stringify(errorDetails)});
    </script>
</body>
</html>`;

    const htmlOutput = HtmlService.createHtmlOutput(htmlContent)
      .setTitle('System Error - Danielson Framework')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

    console.error('Enhanced error page created:', {
      requestId: errorDetails.requestId,
      error: errorDetails.message,
      timestamp: errorDetails.timestamp
    });

    return htmlOutput;

  } catch (createErrorPageError) {
    console.error('Error creating enhanced error page:', createErrorPageError);
    
    // Fallback to basic error response
    return HtmlService.createHtmlOutput(`
      <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
        <h2 style="color: #dc3545;">System Error</h2>
        <p>An error occurred while loading the application.</p>
        <p>Please refresh the page or contact your administrator.</p>
        <button onclick="window.location.reload()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Refresh Page</button>
      </div>
    `).setTitle('System Error');
  }
}

/**
 * Check if there are active filter parameters
 */
function hasActiveFilters(params) {
    const hasFilters = !!(
        params.filterRole || 
        params.filterYear || 
        params.filterStaff || 
        params.filterType === 'probationary' ||
        params.view ||
        params.role  // URL role override
    );
    
    debugLog('Checking for active filters', {
        params: params,
        hasFilters: hasFilters
    });
    
    return hasFilters;
}

/**
 * Create filter selection interface for special access users
 */
function createFilterSelectionInterface(userContext, requestId) {
    try {
        debugLog('Creating filter selection interface', {
            role: userContext.role,
            specialRoleType: userContext.specialRoleType,
            requestId: requestId
        });

        // Create the HTML template using the new filter-interface.html file
        const htmlTemplate = HtmlService.createTemplateFromFile('filter-interface');
        
        // Pass data to the template
        htmlTemplate.userContext = userContext;
        htmlTemplate.userContext.probationaryYearValue = PROBATIONARY_OBSERVATION_YEAR;
        htmlTemplate.availableRoles = AVAILABLE_ROLES;
        htmlTemplate.availableYears = OBSERVATION_YEARS;

        // Generate the HTML output
        const htmlOutput = htmlTemplate.evaluate()
            .setTitle(`${userContext.role} - Select Rubric View`)
            .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

        // Add cache-busting headers (reuse existing function)
        const responseMetadata = generateResponseMetadata(userContext, requestId, false);
        addCacheBustingHeaders(htmlOutput, responseMetadata);

        console.log(`✅ FILTER INTERFACE LOADED: ${userContext.role} (${userContext.specialRoleType}) - Request ID: ${requestId}`);
        
        debugLog('Filter selection interface created successfully', { requestId });
        return htmlOutput;

    } catch (error) {
        console.error('Error creating filter selection interface:', error);
        
        // Fallback to the original rubric if the filter interface fails
        console.log('⚠️ FILTER INTERFACE FAILED - Falling back to regular rubric');
        return null; // This will cause the function to continue with normal rubric loading
    }
}

/**
 * Server-side function for AJAX rubric loading - Phase 4
 * This function is called from the filter interface via google.script.run
 */
function loadRubricData(filterParams) {
    try {
        debugLog('Loading rubric data via AJAX', { filterParams });

        const { role, year, viewType, filterType, staff } = filterParams;

        // Handle probationary staff filter (Administrator feature)
        if (filterType === 'probationary') {
            const probationaryStaff = getProbationaryStaff();
            return {
                success: true,
                data: {
                    title: "📋 Probationary Staff Overview",
                    subtitle: "All staff members in probationary status",
                    isProbationaryView: true,
                    staff: probationaryStaff,
                    domains: [], // No rubric domains for this view
                    viewType: 'probationary'
                },
                filterParams: filterParams
            };
        }

        // Handle staff member specific view
        if (staff && isValidEmail(staff)) {
            // Get the specific staff member's context
            const staffUser = getUserByEmail(staff);
            if (!staffUser) {
                return { 
                    success: false, 
                    error: `Staff member not found: ${staff}` 
                };
            }

            // Load rubric data for this specific staff member
            const rubricData = getAllDomainsData(
                staffUser.role,
                staffUser.year,
                'assigned', // Always show assigned areas for staff members
                getAssignedSubdomainsForRoleYear(staffUser.role, staffUser.year)
            );

            rubricData.filterContext = {
                isStaffView: true,
                staffName: staffUser.name,
                staffEmail: staffUser.email,
                staffRole: staffUser.role,
                staffYear: staffUser.year
            };

            return { 
                success: true, 
                data: rubricData,
                filterParams: filterParams
            };
        }

        // Validate role if provided
        if (role && !AVAILABLE_ROLES.includes(role)) {
            return { 
                success: false, 
                error: `Invalid role: ${role}. Valid roles are: ${AVAILABLE_ROLES.join(', ')}` 
            };
        }

        // Determine effective parameters
        let effectiveRole = role || 'Teacher';
        let effectiveYear = year ? (parseInt(year) || year) : null;
        let effectiveViewMode = viewType === 'assigned' ? 'assigned' : 'full';
        let assignedSubdomains = null;

        // Get assigned subdomains if needed
        if (effectiveViewMode === 'assigned' && effectiveYear) {
            assignedSubdomains = getAssignedSubdomainsForRoleYear(effectiveRole, effectiveYear);
        }

        // Get rubric data
        const rubricData = getAllDomainsData(
            effectiveRole,
            effectiveYear,
            effectiveViewMode,
            assignedSubdomains
        );

        // Add filter context for the UI
        rubricData.filterContext = {
            role: effectiveRole,
            year: effectiveYear,
            viewType: effectiveViewMode,
            isFiltered: true,
            hasAssignedAreas: !!assignedSubdomains
        };

        console.log(`✅ AJAX RUBRIC LOADED: ${effectiveRole} (${effectiveViewMode}) - Year: ${effectiveYear || 'Any'}`);

        return { 
            success: true, 
            data: rubricData,
            filterParams: filterParams
        };

    } catch (error) {
        console.error('Error loading rubric data via AJAX:', error);
        return { 
            success: false, 
            error: error.message || 'An error occurred while loading rubric data'
        };
    }
}

/**
 * Server-side function for getting staff data for filters - Phase 4
 */
function getStaffForFilters(role, year) {
    try {
        debugLog('Getting staff for filters via AJAX', { role, year });

        if (!role || !AVAILABLE_ROLES.includes(role)) {
            return { 
                success: false, 
                error: 'Valid role is required' 
            };
        }

        // Get staff list for this role/year combination
        const staff = getStaffByRoleAndYear(role, year);
        
        console.log(`✅ AJAX STAFF LOADED: ${staff.length} staff members for ${role}, Year ${year || 'Any'}`);

        return {
            success: true,
            staff: staff,
            role: role,
            year: year,
            count: staff.length
        };

    } catch (error) {
        console.error('Error getting staff for filters via AJAX:', error);
        return { 
            success: false, 
            error: error.message || 'An error occurred while loading staff data'
        };
    }
}

/**
 * Get current user's own rubric data - Phase 4
 */
function getMyOwnRubricData() {
    try {
        debugLog('Getting current user own rubric data');
        
        const userContext = createUserContext();
        if (!userContext || !userContext.email) {
            return {
                success: false,
                error: 'User not authenticated'
            };
        }

        const rubricData = getAllDomainsData(
            userContext.role,
            userContext.year,
            'assigned',
            userContext.assignedSubdomains
        );

        rubricData.filterContext = {
            isOwnView: true,
            role: userContext.role,
            year: userContext.year,
            viewType: 'assigned'
        };

        console.log(`✅ AJAX OWN RUBRIC LOADED: ${userContext.role}, Year ${userContext.year}`);

        return {
            success: true,
            data: rubricData,
            userContext: userContext
        };

    } catch (error) {
        console.error('Error getting own rubric data:', error);
        return {
            success: false,
            error: error.message || 'Error loading your rubric data'
        };
    }
}