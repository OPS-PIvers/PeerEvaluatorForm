/**
 * SheetService.js
 * Data access layer for the Danielson Framework Multi-Role System
 */

/**
 * Gets the Sheet ID from Script Properties
 * @return {string} The spreadsheet ID
 * @throws {Error} If SHEET_ID is not configured
 */
function getSheetId() {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!sheetId) {
    throw new Error(ERROR_MESSAGES.SHEET_ID_MISSING);
  }
  
  return sheetId.trim();
}

/**
 * Gets a sheet by name from the spreadsheet
 * @param {Spreadsheet} spreadsheet - The spreadsheet object
 * @param {string} sheetName - Name of the sheet to retrieve
 * @return {Sheet|null} The sheet object or null if not found
 */
function getSheetByName(spreadsheet, sheetName) {
  try {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      debugLog(`Sheet "${sheetName}" not found`, {
        availableSheets: spreadsheet.getSheets().map(s => s.getName())
      });
      return null;
    }
    return sheet;
  } catch (error) {
    console.error(`Error accessing sheet "${sheetName}":`, formatErrorMessage(error, 'getSheetByName'));
    return null;
  }
}

/**
 * Opens the main spreadsheet
 * @return {Spreadsheet} The spreadsheet object
 * @throws {Error} If spreadsheet cannot be opened
 */
function openSpreadsheet() {
  try {
    const sheetId = getSheetId();
    const spreadsheet = SpreadsheetApp.openById(sheetId);
    
    debugLog('Spreadsheet opened successfully', {
      name: spreadsheet.getName(),
      sheetCount: spreadsheet.getSheets().length
    });
    
    return spreadsheet;
  } catch (error) {
    throw new Error(`Failed to open spreadsheet: ${error.message}`);
  }
}

/**
 * Validates that a sheet exists and has the expected structure
 * @param {string} sheetName - Name of the sheet to validate
 * @param {Array<string>} expectedHeaders - Expected column headers (optional)
 * @return {Object} Validation result
 */
function validateSheetExists(sheetName, expectedHeaders = []) {
  try {
    const spreadsheet = openSpreadsheet();
    const sheet = getSheetByName(spreadsheet, sheetName);
    
    const result = {
      exists: !!sheet,
      name: sheetName,
      rowCount: 0,
      columnCount: 0,
      hasExpectedHeaders: false,
      errors: []
    };
    
    if (!sheet) {
      result.errors.push(`Sheet "${sheetName}" not found`);
      return result;
    }
    
    result.rowCount = sheet.getLastRow();
    result.columnCount = sheet.getLastColumn();
    
    // Check headers if provided
    if (expectedHeaders.length > 0 && result.rowCount > 0) {
      try {
        const headers = sheet.getRange(1, 1, 1, expectedHeaders.length).getValues()[0];
        result.hasExpectedHeaders = expectedHeaders.every((expected, index) => 
          headers[index] && headers[index].toString().trim().toLowerCase() === expected.toLowerCase()
        );
        
        if (!result.hasExpectedHeaders) {
          result.errors.push(`Headers don't match expected format`);
        }
      } catch (headerError) {
        result.errors.push(`Error reading headers: ${headerError.message}`);
      }
    }
    
    debugLog('Sheet validation completed', result);
    return result;
    
  } catch (error) {
    return {
      exists: false,
      name: sheetName,
      rowCount: 0,
      columnCount: 0,
      hasExpectedHeaders: false,
      errors: [error.message]
    };
  }
}

/**
 * REPLACE THIS FUNCTION in SheetService.js
 * Enhanced getStaffData function with change detection
 */
function getStaffData() {
  try {
    // Check enhanced cache first
    const cachedData = getCachedDataEnhanced('staff_data');
    if (cachedData && cachedData.data) {
      debugLog('Staff data retrieved from enhanced cache');
      return cachedData.data;
    }
    
    const startTime = Date.now();
    const spreadsheet = openSpreadsheet();
    const sheet = getSheetByName(spreadsheet, SHEET_NAMES.STAFF);
    
    if (!sheet) {
      console.warn(ERROR_MESSAGES.STAFF_SHEET_MISSING);
      return null;
    }
    
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      debugLog('Staff sheet has no data rows');
      return { users: [], lastUpdated: new Date().toISOString() };
    }
    
    // Read all data
    const range = sheet.getRange(2, 1, lastRow - 1, 4);
    const values = range.getValues();
    
    // Check if data has changed
    const dataChanged = hasSheetDataChanged('Staff', values);
    if (dataChanged) { // Check if dataChanged is true first
      if (typeof invalidateDependentCaches === 'function') {
        debugLog('Staff sheet data change detected - invalidating related caches');
        // staff_data change implies potential user changes.
        // invalidateDependentCaches will handle its dependencies,
        // incrementing master version for wildcards like 'user_*'.
        invalidateDependentCaches('staff_data');
      } else {
        console.warn('invalidateDependentCaches is not a function, skipping cache invalidation for Staff data change.');
        debugLog('invalidateDependentCaches not found, cannot invalidate for Staff data change.');
      }
    }

    const users = [];
    values.forEach((row, index) => {
      const rowNumber = index + 2;
      
      // Skip empty rows
      if (!row[STAFF_COLUMNS.NAME] && !row[STAFF_COLUMNS.EMAIL]) {
        return;
      }
      
      const user = {
        name: sanitizeText(row[STAFF_COLUMNS.NAME]),
        email: sanitizeText(row[STAFF_COLUMNS.EMAIL]),
        role: sanitizeText(row[STAFF_COLUMNS.ROLE]),
        // year is set below
        rowNumber: rowNumber
      };
      
      const yearValue = row[STAFF_COLUMNS.YEAR];

      // Use the new helper function to parse year values
      const parsedYear = parseYearValue(yearValue);

      if (parsedYear !== null && OBSERVATION_YEARS.includes(parsedYear)) {
        user.year = parsedYear;
      } else {
        // Default to 1 if parsing fails or year is not in the allowed OBSERVATION_YEARS list
        user.year = 1;
        
        // Log warning for debugging if original value was not empty
        if (yearValue && yearValue.toString().trim() !== '') {
          console.warn(`Invalid year value in Staff sheet row ${rowNumber}: "${yearValue}". Using default year 1.`);
        }
      }
      
      // Validate required fields
      if (!user.email || !isValidEmail(user.email)) {
        console.warn(`Invalid email in Staff sheet row ${rowNumber}:`, user.email);
        return;
      }
      
      if (!user.role || !AVAILABLE_ROLES.includes(user.role)) {
        console.warn(`Invalid role in Staff sheet row ${rowNumber}:`, user.role);
        user.role = 'Teacher'; // Set default role
      }
      
      if (!OBSERVATION_YEARS.includes(user.year)) {
        console.warn(`Invalid year in Staff sheet row ${rowNumber}:`, user.year);
        user.year = 1; // Set default year
      }
      
      users.push(user);
    });
    
    const staffData = {
      users: users,
      lastUpdated: new Date().toISOString(),
      rowCount: lastRow - 1,
      validUsers: users.length,
      dataHash: generateDataHash(values) // Add hash for verification
    };
    
    // Cache with enhanced system
    setCachedDataEnhanced('staff_data', {}, staffData, CACHE_SETTINGS.SHEET_DATA_TTL);
    
    const executionTime = Date.now() - startTime;
    logPerformanceMetrics('getStaffData', executionTime, {
      userCount: users.length,
      rowsProcessed: lastRow - 1,
      dataChanged: dataChanged
    });
    
    debugLog('Staff data loaded successfully', {
      userCount: users.length,
      validUsers: users.length,
      dataChanged: dataChanged
    });
    
    return staffData;
    
  } catch (error) {
    console.error('Error reading Staff sheet:', formatErrorMessage(error, 'getStaffData'));
    return null;
  }
}

/**
 * Reads data from the Settings sheet with 4-row role pattern
 * @return {Object|null} Settings data with role-year mappings
 */
function getSettingsData() {
  const cacheKey = 'settings_data';
  
  try {
    // Check cache first
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
      debugLog('Settings data retrieved from cache');
      return cachedData;
    }
    
    const startTime = Date.now();
    const spreadsheet = openSpreadsheet();
    const sheet = getSheetByName(spreadsheet, SHEET_NAMES.SETTINGS);
    
    if (!sheet) {
      console.warn(ERROR_MESSAGES.SETTINGS_SHEET_MISSING);
      return null;
    }
    
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      debugLog('Settings sheet has no data rows');
      return { roleYearMappings: {}, lastUpdated: new Date().toISOString() };
    }
    
    // Read all data (assuming row 1 has headers)
    const range = sheet.getRange(2, 1, lastRow - 1, 4); // Rows 2 to end, columns A-D
    const values = range.getValues();
    
    const roleYearMappings = {};
    
    // Process data from the Settings sheet.
    // The sheet is expected to have a role name in the first column (defined by SETTINGS_COLUMNS.ROLE).
    // The row containing the role name is the first of 4 consecutive rows used for data; this role row contains data for Domain 1.
    // The next three rows contain data for Domains 2, 3, and 4, respectively.
    // Columns B, C, D (defined by SETTINGS_COLUMNS.YEAR_1, YEAR_2, YEAR_3) in these 4 data rows
    // contain the specific items/subdomains for that Domain for Year 1, Year 2, and Year 3 respectively.
    // The parser actively looks for role names and processes these 4 rows (the role name row plus the next three).
    // Blank rows between role definitions are skipped.
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      // Potential start of a role definition
      const roleName = sanitizeText(row[SETTINGS_COLUMNS.ROLE]); // Column A
      
      // Skip empty rows
      if (!roleName) {
        continue;
      }
      
      // Check if this is a valid role
      if (!AVAILABLE_ROLES.includes(roleName)) {
        console.warn(`Unknown role in Settings sheet row ${i + 2}:`, roleName);
        continue;
      }
      
      // Ensure there are enough rows for a complete 4-domain definition for this role.
      if (i + 3 >= values.length) {
        console.warn(`Incomplete data for role ${roleName} starting at settings sheet row ${i + 2}. Expected 4 data rows, found fewer.`);
        continue; // Skip to the next row to find a new role
      }

      roleYearMappings[roleName] = {
        year1: [
          sanitizeText(values[i][SETTINGS_COLUMNS.YEAR_1]),    // Domain 1, Year 1 data from current role row
          sanitizeText(values[i+1][SETTINGS_COLUMNS.YEAR_1]),  // Domain 2, Year 1 data from next row
          sanitizeText(values[i+2][SETTINGS_COLUMNS.YEAR_1]),  // Domain 3, Year 1 data from row after next
          sanitizeText(values[i+3][SETTINGS_COLUMNS.YEAR_1])   // Domain 4, Year 1 data from row 3 after role row
        ],
        year2: [
          sanitizeText(values[i][SETTINGS_COLUMNS.YEAR_2]),    // Domain 1, Year 2
          sanitizeText(values[i+1][SETTINGS_COLUMNS.YEAR_2]),  // Domain 2, Year 2
          sanitizeText(values[i+2][SETTINGS_COLUMNS.YEAR_2]),  // Domain 3, Year 2
          sanitizeText(values[i+3][SETTINGS_COLUMNS.YEAR_2])   // Domain 4, Year 2
        ],
        year3: [
          sanitizeText(values[i][SETTINGS_COLUMNS.YEAR_3]),    // Domain 1, Year 3
          sanitizeText(values[i+1][SETTINGS_COLUMNS.YEAR_3]),  // Domain 2, Year 3
          sanitizeText(values[i+2][SETTINGS_COLUMNS.YEAR_3]),  // Domain 3, Year 3
          sanitizeText(values[i+3][SETTINGS_COLUMNS.YEAR_3])   // Domain 4, Year 3
        ],
        startRow: i + 2 // For debugging, refers to the 1-based sheet row number for the roleName
      };
      
      debugLog(`Settings loaded for role: ${roleName}`, {
        year1Domains: roleYearMappings[roleName].year1,
        year2Domains: roleYearMappings[roleName].year2,
        year3Domains: roleYearMappings[roleName].year3
      });
      // Advance the index by 3 to account for the 3 additional rows just processed for the current role.
      // The loop's i++ will then move to the next row, effectively skipping the 4 processed data rows.
      i += 3; // Advance index past the 3 additional data rows just processed. Loop's i++ handles the first.
    }
    
    const settingsData = {
      roleYearMappings: roleYearMappings,
      lastUpdated: new Date().toISOString(),
      rolesConfigured: Object.keys(roleYearMappings).length
    };
    
    // Cache the data
    setCachedData(cacheKey, settingsData, CACHE_SETTINGS.SHEET_DATA_TTL);
    
    const executionTime = Date.now() - startTime;
    logPerformanceMetrics('getSettingsData', executionTime, {
      rolesConfigured: Object.keys(roleYearMappings).length
    });
    
    debugLog('Settings data loaded successfully', {
      rolesConfigured: Object.keys(roleYearMappings).length
    });
    
    return settingsData;
    
  } catch (error) {
    console.error('Error reading Settings sheet:', formatErrorMessage(error, 'getSettingsData'));
    return null;
  }
}

/**
 * REPLACE THIS FUNCTION in SheetService.js
 * Enhanced getRoleSheetData function with comprehensive validation and fallback
 */
function getRoleSheetData(roleName) {
  const operationId = generateUniqueId('get_role_sheet');
  
  try {
    debugLog('Getting role sheet data with enhanced validation', {
      roleName: roleName,
      operationId: operationId
    });

    // Validate role first
    const roleValidation = validateRole(roleName);

    if (!roleValidation.isValid) {
      console.warn('Role validation failed', {
        roleName: roleName,
        issues: roleValidation.issues,
        severity: roleValidation.severity,
        operationId: operationId
      });

      // Handle different failure scenarios
      if (roleValidation.severity === VALIDATION_SEVERITY.CRITICAL) {
        // Critical failure - try fallback role
        const fallbackRole = roleValidation.fallbackRole || 'Teacher';

        debugLog('Attempting fallback to role', {
          originalRole: roleName,
          fallbackRole: fallbackRole,
          operationId: operationId
        });

        // Recursive call with fallback role (prevent infinite recursion)
        if (fallbackRole === 'Teacher' && roleName !== 'Teacher') {
          return getRoleSheetData(fallbackRole);
        } else {
          // Can't fallback - return error data
          return createErrorRoleSheetData(roleName, roleValidation, operationId);
        }
      }
    }

    // Check enhanced cache with role-specific parameters
    const cacheParams = { role: roleName };
    const cachedData = getCachedDataEnhanced('role_sheet', cacheParams);

    if (cachedData && cachedData.data) {
      debugLog(`Role sheet data for ${roleName} retrieved from enhanced cache`, {
        operationId: operationId
      });

      // Validate cached data integrity
      const dataValidation = validateRoleSheetData(cachedData.data);
      if (dataValidation.isValid) {
        return cachedData.data;
      } else {
        debugLog('Cached data validation failed - reloading', {
          roleName: roleName,
          issues: dataValidation.issues,
          operationId: operationId
        });
        // Clear invalid cached data
        CacheService.getScriptCache().remove(generateCacheKey('role_sheet', cacheParams));
      }
    }
    
    const startTime = Date.now();

    // Enhanced spreadsheet access with error handling
    let spreadsheet, sheet;
    try {
      spreadsheet = openSpreadsheet();
      sheet = getSheetByName(spreadsheet, roleName);
    } catch (accessError) {
      console.error('Spreadsheet access error', {
        error: accessError.message,
        roleName: roleName,
        operationId: operationId
      });

      return createErrorRoleSheetData(roleName, {
        issues: [{
          type: VALIDATION_ERROR_TYPES.PERMISSION_ERROR,
          message: 'Cannot access spreadsheet: ' + accessError.message,
          severity: VALIDATION_SEVERITY.CRITICAL
        }]
      }, operationId);
    }
    
    if (!sheet) {
      console.warn(`Role sheet "${roleName}" not found`, { operationId: operationId });

      // Try fallback to Teacher sheet if this isn't already Teacher
      if (roleName !== 'Teacher') {
        debugLog(`Falling back to Teacher sheet for role: ${roleName}`, {
          operationId: operationId
        });
        return getRoleSheetData('Teacher');
      }

      // No fallback available
      return createErrorRoleSheetData(roleName, {
        issues: [{
          type: VALIDATION_ERROR_TYPES.MISSING_SHEET,
          message: `Sheet "${roleName}" does not exist`,
          severity: VALIDATION_SEVERITY.CRITICAL
        }]
      }, operationId);
    }
    
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    
    if (lastRow < 1 || lastColumn < 1) {
      console.warn(`Role sheet "${roleName}" appears to be empty`, {
        rowCount: lastRow,
        columnCount: lastColumn,
        operationId: operationId
      });

      return createErrorRoleSheetData(roleName, {
        issues: [{
          type: VALIDATION_ERROR_TYPES.DATA_CORRUPTION,
          message: `Sheet "${roleName}" is empty`,
          severity: VALIDATION_SEVERITY.ERROR
        }]
      }, operationId);
    }
    
    // Read all sheet data with error handling
    let values;
    try {
      const range = sheet.getRange(1, 1, lastRow, lastColumn);
      values = range.getValues();
    } catch (readError) {
      console.error('Error reading sheet data', {
        error: readError.message,
        roleName: roleName,
        operationId: operationId
      });

      return createErrorRoleSheetData(roleName, {
        issues: [{
          type: VALIDATION_ERROR_TYPES.PERMISSION_ERROR,
          message: 'Cannot read sheet data: ' + readError.message,
          severity: VALIDATION_SEVERITY.CRITICAL
        }]
      }, operationId);
    }
    
    // Check if data has changed
    const dataChanged = hasSheetDataChanged(roleName, values);
    if (dataChanged) {
      debugLog(`Role sheet data change detected for ${roleName}. Performing direct invalidation and then handling dependencies.`, {
        operationId: operationId,
        roleName: roleName
      });
      // Directly remove the specific cache for this role sheet first.
      const specificRoleKey = generateCacheKey('role_sheet', { role: roleName });
      CacheService.getScriptCache().remove(specificRoleKey);
      debugLog('Cleared specific cache for changed role sheet', { roleName: roleName, key: specificRoleKey, operationId: operationId });

      // Now, call invalidateDependentCaches for 'role_sheet_*'.
      // Since CACHE_DEPENDENCIES['role_sheet_*'] is [], this currently does nothing.
      // If dependencies were added later, it would handle them (likely by incrementing master version).
      invalidateDependentCaches('role_sheet_*');
    }

    const roleSheetData = {
      roleName: roleName,
      sheetName: sheet.getName(),
      data: values,
      rowCount: lastRow,
      columnCount: lastColumn,
      lastUpdated: new Date().toISOString(),
      title: values[0] ? sanitizeText(values[0][0]) : '',
      subtitle: values[1] ? sanitizeText(values[1][0]) : '',
      dataHash: generateDataHash(values),
      operationId: operationId,
      validation: {
        isValid: true,
        issues: [],
        loadedSuccessfully: true
      }
    };
    
    // Validate the loaded data
    const dataValidation = validateRoleSheetData(roleSheetData);
    roleSheetData.validation = dataValidation;

    if (!dataValidation.isValid) {
      console.warn('Loaded role sheet data has validation issues', {
        roleName: roleName,
        issues: dataValidation.issues,
        operationId: operationId
      });

      // Still cache and return the data, but with validation warnings
    }

    // Cache with enhanced system
    setCachedDataEnhanced('role_sheet', cacheParams, roleSheetData, CACHE_SETTINGS.SHEET_DATA_TTL);
    
    const executionTime = Date.now() - startTime;
    logPerformanceMetrics('getRoleSheetData', executionTime, {
      roleName: roleName,
      rowCount: lastRow,
      columnCount: lastColumn,
      dataChanged: dataChanged,
      validationPassed: dataValidation.isValid,
      operationId: operationId
    });
    
    debugLog(`Role sheet data loaded for ${roleName}`, {
      rowCount: lastRow,
      columnCount: lastColumn,
      dataChanged: dataChanged,
      validationIssues: dataValidation.issues.length,
      operationId: operationId
    });
    
    return roleSheetData;
    
  } catch (error) {
    console.error(`Critical error reading role sheet "${roleName}":`, formatErrorMessage(error, 'getRoleSheetData'));
    
    // Try fallback to Teacher sheet if this isn't already Teacher
    if (roleName !== 'Teacher') {
      debugLog(`Attempting Teacher fallback due to critical error`, {
        originalRole: roleName,
        error: error.message,
        operationId: operationId
      });
      return getRoleSheetData('Teacher');
    }
    
    // Return error data if Teacher sheet also fails
    return createErrorRoleSheetData(roleName, {
      issues: [{
        type: VALIDATION_ERROR_TYPES.CONFIGURATION_ERROR,
        message: 'Critical system error: ' + error.message,
        severity: VALIDATION_SEVERITY.CRITICAL
      }]
    }, operationId);
  }
}

/**
 * ADD THESE HELPER FUNCTIONS to SheetService.js
 * Helper functions for error handling and validation
 */

/**
 * Create error role sheet data for graceful degradation
 * @param {string} roleName - Role name that failed
 * @param {Object} validationResult - Validation result with issues
 * @param {string} operationId - Operation identifier
 * @return {Object} Error role sheet data structure
 */
function createErrorRoleSheetData(roleName, validationResult, operationId) {
  return {
    roleName: roleName,
    sheetName: 'ERROR',
    data: createErrorSheetContent(roleName, validationResult),
    rowCount: 3,
    columnCount: 5,
    lastUpdated: new Date().toISOString(),
    title: `Error: ${roleName} Framework Not Available`,
    subtitle: `Please contact your administrator to set up the ${roleName} rubric`,
    dataHash: 'error',
    operationId: operationId,
    validation: {
      isValid: false,
      issues: validationResult.issues || [],
      loadedSuccessfully: false,
      isErrorData: true
    },
    error: {
      type: 'ROLE_SHEET_ERROR',
      issues: validationResult.issues || [],
      recommendedActions: validationResult.recommendedActions || [],
      fallbackUsed: false
    }
  };
}

/**
 * Create error sheet content for display
 * @param {string} roleName - Role name that failed
 * @param {Object} validationResult - Validation result
 * @return {Array<Array>} Error sheet content
 */
function createErrorSheetContent(roleName, validationResult) {
  const issues = validationResult.issues || [];
  const primaryIssue = issues.length > 0 ? issues[0] : { message: 'Unknown error' };

  return [
    [`Error: ${roleName} Framework Not Available`],
    [`The ${roleName} rubric is not properly configured`],
    [
      'Error Details',
      primaryIssue.message,
      'Please contact your system administrator',
      'to set up the role-specific rubric.',
      'Teacher rubric will be used as fallback.'
    ]
  ];
}

/**
 * Validate role sheet data integrity
 * @param {Object} roleSheetData - Role sheet data to validate
 * @return {Object} Validation result
 */
function validateRoleSheetData(roleSheetData) {
  const validationId = generateUniqueId('role_sheet_validation');

  try {
    const result = {
      validationId: validationId,
      isValid: false,
      issues: [],
      severity: VALIDATION_SEVERITY.INFO,
      componentCount: 0,
      hasTitle: false,
      hasComponents: false
    };

    if (!roleSheetData || !roleSheetData.data) {
      result.issues.push({
        type: VALIDATION_ERROR_TYPES.DATA_CORRUPTION,
        message: 'Role sheet data is null or missing',
        severity: VALIDATION_SEVERITY.CRITICAL
      });
      result.severity = VALIDATION_SEVERITY.CRITICAL;
      return result;
    }

    const data = roleSheetData.data;

    // Check if data is an array
    if (!Array.isArray(data)) {
      result.issues.push({
        type: VALIDATION_ERROR_TYPES.DATA_CORRUPTION,
        message: 'Role sheet data is not in expected array format',
        severity: VALIDATION_SEVERITY.CRITICAL
      });
      result.severity = VALIDATION_SEVERITY.CRITICAL;
      return result;
    }

    // Check if has content
    if (data.length < 3) {
      result.issues.push({
        type: VALIDATION_ERROR_TYPES.DATA_CORRUPTION,
        message: 'Role sheet has insufficient content (less than 3 rows)',
        severity: VALIDATION_SEVERITY.ERROR
      });
      result.severity = VALIDATION_SEVERITY.ERROR;
    }

    // Check title
    if (data.length > 0 && data[0][0]) {
      result.hasTitle = true;
    } else {
      result.issues.push({
        type: VALIDATION_ERROR_TYPES.DATA_CORRUPTION,
        message: 'Role sheet missing title',
        severity: VALIDATION_SEVERITY.WARNING
      });
      result.severity = Math.max(result.severity, VALIDATION_SEVERITY.WARNING);
    }

    // Count components (cells that match component pattern)
    let componentCount = 0;
    for (let i = 0; i < data.length; i++) {
      const cellValue = data[i][0];
      if (cellValue && VALIDATION_PATTERNS.COMPONENT_ID.test(cellValue.toString())) {
        componentCount++;
      }
    }

    result.componentCount = componentCount;
    result.hasComponents = componentCount > 0;

    if (componentCount === 0) {
      result.issues.push({
        type: VALIDATION_ERROR_TYPES.DATA_CORRUPTION,
        message: 'Role sheet contains no valid components (no cells matching pattern like "1a:", "2b:", etc.)',
        severity: VALIDATION_SEVERITY.ERROR
      });
      result.severity = Math.max(result.severity, VALIDATION_SEVERITY.ERROR);
    } else if (componentCount < 10) {
      result.issues.push({
        type: VALIDATION_ERROR_TYPES.DATA_CORRUPTION,
        message: `Role sheet has only ${componentCount} components (expected 15-25 for complete rubric)`,
        severity: VALIDATION_SEVERITY.WARNING
      });
      result.severity = Math.max(result.severity, VALIDATION_SEVERITY.WARNING);
    }

    // Overall validation
    result.isValid = result.severity !== VALIDATION_SEVERITY.CRITICAL;

    debugLog('Role sheet data validation completed', {
      validationId: validationId,
      roleName: roleSheetData.roleName,
      isValid: result.isValid,
      componentCount: componentCount,
      issueCount: result.issues.length,
      severity: result.severity
    });

    return result;

  } catch (error) {
    console.error('Error validating role sheet data:', error);
    return {
      validationId: validationId,
      isValid: false,
      issues: [{
        type: VALIDATION_ERROR_TYPES.CONFIGURATION_ERROR,
        message: 'Validation error: ' + error.message,
        severity: VALIDATION_SEVERITY.CRITICAL
      }],
      severity: VALIDATION_SEVERITY.CRITICAL,
      error: error.message
    };
  }
}

/**
 * Reads a specific range from a sheet
 * @param {string} sheetName - Name of the sheet
 * @param {string} a1Notation - A1 notation for the range (e.g., "A1:D10")
 * @return {Array<Array>|null} 2D array of values or null on error
 */
function readSheetRange(sheetName, a1Notation) {
  try {
    const spreadsheet = openSpreadsheet();
    const sheet = getSheetByName(spreadsheet, sheetName);
    
    if (!sheet) {
      return null;
    }
    
    const range = sheet.getRange(a1Notation);
    return range.getValues();
    
  } catch (error) {
    console.error(`Error reading range ${a1Notation} from sheet ${sheetName}:`, 
      formatErrorMessage(error, 'readSheetRange'));
    return null;
  }
}

/**
 * Gets information about all sheets in the spreadsheet
 * @return {Array<Object>} Array of sheet information objects
 */
function getAllSheetsInfo() {
  try {
    const spreadsheet = openSpreadsheet();
    const sheets = spreadsheet.getSheets();
    
    return sheets.map(sheet => ({
      name: sheet.getName(),
      rowCount: sheet.getLastRow(),
      columnCount: sheet.getLastColumn(),
      isHidden: sheet.isSheetHidden(),
      index: sheet.getIndex(),
      tabColor: sheet.getTabColor()
    }));
    
  } catch (error) {
    console.error('Error getting sheets info:', formatErrorMessage(error, 'getAllSheetsInfo'));
    return [];
  }
}

/**
 * Detects available role sheets in the spreadsheet
 * @return {Array<string>} Array of role names that have corresponding sheets
 */
function detectAvailableRoleSheets() {
  try {
    const allSheets = getAllSheetsInfo();
    const sheetNames = allSheets.map(sheet => sheet.name);
    
    const availableRoles = AVAILABLE_ROLES.filter(role => 
      sheetNames.includes(role)
    );
    
    debugLog('Available role sheets detected', {
      allSheets: sheetNames,
      availableRoles: availableRoles
    });
    
    return availableRoles;
    
  } catch (error) {
    console.error('Error detecting available role sheets:', formatErrorMessage(error, 'detectAvailableRoleSheets'));
    return ['Teacher']; // Return at least the default role
  }
}

/**
 * Clears all cached sheet data
 */
function clearAllSheetCache() {
  try {
    // Clear specific caches
    clearCachedData('staff_data');
    clearCachedData('settings_data');
    
    // Clear role sheet caches
    AVAILABLE_ROLES.forEach(role => {
      clearCachedData(`role_sheet_${role}`);
    });
    
    debugLog('All sheet cache cleared');
  } catch (error) {
    console.error('Error clearing sheet cache:', formatErrorMessage(error, 'clearAllSheetCache'));
  }
}

/**
 * Tests connectivity to all critical sheets
 * @return {Object} Test results for all sheets
 */
function testSheetConnectivity() {
  const results = {
    spreadsheet: { accessible: false, error: null },
    sheets: {},
    summary: { total: 0, accessible: 0, errors: [] }
  };
  
  try {
    // Test spreadsheet access
    const spreadsheet = openSpreadsheet();
    results.spreadsheet.accessible = true;
    results.spreadsheet.name = spreadsheet.getName();
    
    // Test critical sheets
    const criticalSheets = [SHEET_NAMES.STAFF, SHEET_NAMES.SETTINGS, SHEET_NAMES.TEACHER, SHEET_NAMES.OBSERVATIONS, SHEET_NAMES.RATINGS];
    
    criticalSheets.forEach(sheetName => {
      results.summary.total++;
      
      try {
        const validation = validateSheetExists(sheetName);
        results.sheets[sheetName] = validation;
        
        if (validation.exists) {
          results.summary.accessible++;
        } else {
          results.summary.errors.push(`${sheetName}: ${validation.errors.join(', ')}`);
        }
      } catch (error) {
        results.sheets[sheetName] = {
          exists: false,
          error: error.message
        };
        results.summary.errors.push(`${sheetName}: ${error.message}`);
      }
    });
    
    // Test available role sheets
    const availableRoles = detectAvailableRoleSheets();
    availableRoles.forEach(role => {
      if (!criticalSheets.includes(role)) {
        results.summary.total++;
        const validation = validateSheetExists(role);
        results.sheets[role] = validation;
        
        if (validation.exists) {
          results.summary.accessible++;
        } else {
          results.summary.errors.push(`${role}: ${validation.errors.join(', ')}`);
        }
      }
    });
    
  } catch (error) {
    results.spreadsheet.error = error.message;
    results.summary.errors.push(`Spreadsheet: ${error.message}`);
  }
  
  debugLog('Sheet connectivity test completed', results);
  return results;
}

/**
 * Creates a new observation.
 * @param {string} observeeEmail The email of the user being observed.
 * @param {string} observationName The name of the observation.
 * @return {string} The ID of the new observation.
 */
function createObservation(observeeEmail, observationName) {
  if (!isPeerEvaluator()) {
    throw new Error('Only Peer Evaluators can perform this action.');
  }
  try {
    const evaluatorEmail = Session.getActiveUser().getEmail();
    if (!evaluatorEmail) {
      throw new Error('Could not identify the evaluator.');
    }
    const spreadsheet = openSpreadsheet();
    let sheet = getSheetByName(spreadsheet, SHEET_NAMES.OBSERVATIONS);

    if (!sheet) {
      sheet = spreadsheet.insertSheet(SHEET_NAMES.OBSERVATIONS);
      sheet.appendRow(['Observation ID', 'Observee Email', 'Evaluator Email', 'Observation Name', 'Start Time', 'End Time', 'Status', 'Folder ID', 'Notes Doc ID']);
    }

    const observee = getUserByEmail(observeeEmail);
    const observeeName = observee ? observee.name : 'Unknown User';
    const currentYear = new Date().getFullYear();
    const folderName = `${observeeName} - ${currentYear} ${observationName}`;

    const folder = DriveApp.createFolder(folderName);
    const notesDoc = DocumentApp.create(`${observationName} Notes`);
    DriveApp.getFileById(notesDoc.getId()).moveTo(folder);

    const observationId = generateUniqueId('obs');
    const startTime = new Date();

    sheet.appendRow([observationId, observeeEmail, evaluatorEmail, observationName, startTime, '', OBSERVATION_STATUS.IN_PROGRESS, folder.getId(), notesDoc.getId()]);

    debugLog('Observation created successfully', { observationId, observeeEmail, evaluatorEmail, observationName });
    return observationId;
  } catch (error) {
    console.error('Error creating observation:', formatErrorMessage(error, 'createObservation'));
    return null;
  }
}

/**
 * Finalizes an observation.
 * @param {string} observationId The ID of the observation to finalize.
 */
function finalizeObservation(observationId) {
  if (!isPeerEvaluator()) {
    throw new Error('Only Peer Evaluators can perform this action.');
  }
  try {
    const spreadsheet = openSpreadsheet();
    const sheet = getSheetByName(spreadsheet, SHEET_NAMES.OBSERVATIONS);
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === observationId) {
        sheet.getRange(i + 1, 7).setValue(OBSERVATION_STATUS.FINALIZED);
        sheet.getRange(i + 1, 6).setValue(new Date());
        debugLog('Observation finalized successfully', { observationId });
        return;
      }
    }
  } catch (error) {
    console.error('Error finalizing observation:', formatErrorMessage(error, 'finalizeObservation'));
  }
}

/**
 * Saves a note for a specific component and observation.
 * @param {string} observationId The ID of the observation.
 * @param {string} componentId The ID of the component (e.g., "1a:").
 * @param {string} noteContent The content of the note.
 */
function saveNote(observationId, componentId, noteContent) {
  if (!isPeerEvaluator()) {
    throw new Error('Only Peer Evaluators can perform this action.');
  }
  try {
    const spreadsheet = openSpreadsheet();
    const sheet = getSheetByName(spreadsheet, SHEET_NAMES.OBSERVATIONS);
    const data = sheet.getDataRange().getValues();

    let notesDocId = null;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === observationId) {
        notesDocId = data[i][8];
        break;
      }
    }

    if (notesDocId) {
      const doc = DocumentApp.openById(notesDocId);
      const body = doc.getBody();
      let section = body.findText(`## ${componentId}`);

      if (section) {
        // Clear existing content for this section
        let nextSection = body.findText('## ', section.getElement());
        let startElement = section.getElement().getParent();
        let endElement = nextSection ? nextSection.getElement().getParent() : null;
        let currentElement = startElement.getNextSibling();

        while (currentElement && currentElement !== endElement) {
          let toRemove = currentElement;
          currentElement = currentElement.getNextSibling();
          toRemove.removeFromParent();
        }

        body.insertParagraph(body.getChildIndex(startElement) + 1, noteContent);
      } else {
        body.appendParagraph(`## ${componentId}`).setHeading(DocumentApp.ParagraphHeading.HEADING2);
        body.appendParagraph(noteContent);
      }
      doc.saveAndClose();
      debugLog('Note saved successfully to Google Doc', { observationId, componentId });
    }
  } catch (error) {
    console.error('Error saving note:', formatErrorMessage(error, 'saveNote'));
  }
}

/**
 * Retrieves all notes for a specific observation.
 * @param {string} observationId The ID of the observation.
 * @return {Object} An object mapping component IDs to note content.
 */
function getNotes(observationId) {
  try {
    const spreadsheet = openSpreadsheet();
    const sheet = getSheetByName(spreadsheet, SHEET_NAMES.OBSERVATIONS);
    const data = sheet.getDataRange().getValues();

    let notesDocId = null;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === observationId) {
        notesDocId = data[i][8];
        break;
      }
    }

    if (notesDocId) {
      const doc = DocumentApp.openById(notesDocId);
      const body = doc.getBody();
      const text = body.getText();
      const notes = {};
      const sections = text.split('## ');

      for (let i = 1; i < sections.length; i++) {
        let section = sections[i];
        let lines = section.split('\n');
        let componentId = lines.shift();
        let content = lines.join('\n');
        notes[componentId] = content;
      }
      debugLog('Notes retrieved successfully from Google Doc', { observationId, noteCount: Object.keys(notes).length });
      return notes;
    }
    return {};
  } catch (error) {
    console.error('Error retrieving notes:', formatErrorMessage(error, 'getNotes'));
    return {};
  }
}

/**
 * Saves a rating for a specific component and observation.
 * @param {string} observationId The ID of the observation.
 * @param {string} componentId The ID of the component (e.g., "1a:").
 * @param {string} rating The rating (e.g., "Developing", "Basic").
 */
function saveRating(observationId, componentId, rating) {
  if (!isPeerEvaluator()) {
    throw new Error('Only Peer Evaluators can perform this action.');
  }
  try {
    const spreadsheet = openSpreadsheet();
    let sheet = getSheetByName(spreadsheet, SHEET_NAMES.RATINGS);

    if (!sheet) {
      sheet = spreadsheet.insertSheet(SHEET_NAMES.RATINGS);
      sheet.appendRow(['Observation ID', 'Component ID', 'Rating', 'Last Updated']);
    }

    const data = sheet.getDataRange().getValues();
    let ratingFound = false;

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === observationId && data[i][1] === componentId) {
        sheet.getRange(i + 1, 3).setValue(rating);
        sheet.getRange(i + 1, 4).setValue(new Date());
        ratingFound = true;
        break;
      }
    }

    if (!ratingFound) {
      sheet.appendRow([observationId, componentId, rating, new Date()]);
    }

    debugLog('Rating saved successfully', { observationId, componentId, rating });
  } catch (error) {
    console.error('Error saving rating:', formatErrorMessage(error, 'saveRating'));
  }
}

/**
 * Uploads a media file to the observation folder.
 * @param {string} observationId The ID of the observation.
 * @param {string} componentId The ID of the component (e.g., "1a:").
 * @param {string} fileData The base64 encoded file data.
 * @param {string} fileName The name of the file.
 * @param {string} mimeType The MIME type of the file.
 */
function uploadMedia(observationId, componentId, fileData, fileName, mimeType) {
  if (!isPeerEvaluator()) {
    throw new Error('Only Peer Evaluators can perform this action.');
  }
  try {
    const spreadsheet = openSpreadsheet();
    const sheet = getSheetByName(spreadsheet, SHEET_NAMES.OBSERVATIONS);
    const data = sheet.getDataRange().getValues();

    let folderId = null;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === observationId) {
        folderId = data[i][7];
        break;
      }
    }

    if (folderId) {
      const folder = DriveApp.getFolderById(folderId);
      const decodedData = Utilities.base64Decode(fileData);
      const blob = Utilities.newBlob(decodedData, mimeType, fileName);
      folder.createFile(blob);
      debugLog('Media uploaded successfully', { observationId, componentId, fileName });
    }
  } catch (error) {
    console.error('Error uploading media:', formatErrorMessage(error, 'uploadMedia'));
  }
}

/**
 * Retrieves observations based on user role and filters.
 * - Peer Evaluators can see all observations for a given observee.
 * - Other users can only see their own 'Finalized' observations.
 * @param {string} observeeEmail The email of the user being observed.
 * @param {string|null} status - Optional status to filter by (e.g., "In Progress", "Finalized").
 * @return {Array} An array of observation objects.
 */
function getObservations(observeeEmail, status = null) {
  try {
    const userContext = createUserContext(); // Gets current user's role and email
    const isPeerEvaluator = userContext.role === 'Peer Evaluator';
    let targetEmail = observeeEmail;

    // Security Enforcement: If not a peer evaluator, user can only see their own finalized observations.
    if (!isPeerEvaluator) {
      targetEmail = userContext.email;
      status = OBSERVATION_STATUS.FINALIZED; // Force status to Finalized
      debugLog('Non-evaluator access: fetching own finalized observations.', { user: targetEmail });
    }

    if (!targetEmail) {
        debugLog('getObservations called with no target email.', { isPeerEvaluator });
        return [];
    }

    const spreadsheet = openSpreadsheet();
    const sheet = getSheetByName(spreadsheet, SHEET_NAMES.OBSERVATIONS);

    if (!sheet) {
      return [];
    }

    const data = sheet.getDataRange().getValues();
    const observations = [];
    // Loop from row 1 to skip header
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const obsObserveeEmail = row[1];
      const obsStatus = row[6];

      // Match email and optionally status
      if (obsObserveeEmail === targetEmail && (!status || obsStatus === status)) {
        observations.push({
          id: row[0],
          observeeEmail: row[1],
          evaluatorEmail: row[2],
          name: row[3],
          startTime: row[4],
          endTime: row[5],
          status: row[6],
          folderId: row[7],
          notesDocId: row[8]
        });
      }
    }

    debugLog('Observations retrieved successfully', { 
        requestedFor: observeeEmail,
        retrievedFor: targetEmail,
        filterStatus: status,
        observationCount: observations.length 
    });
    return observations;
  } catch (error) {
    console.error('Error retrieving observations:', formatErrorMessage(error, 'getObservations'));
    return [];
  }
}

/**
 * Retrieves all details for a single observation, including ratings and notes.
 * @param {string} observationId The ID of the observation.
 * @return {Object|null} A comprehensive observation object or null if not found.
 */
function getObservationDetails(observationId) {
    try {
        const spreadsheet = openSpreadsheet();
        const obsSheet = getSheetByName(spreadsheet, SHEET_NAMES.OBSERVATIONS);
        if (!obsSheet) return null;

        const obsData = obsSheet.getDataRange().getValues();
        let observation = null;

        // Find the observation
        for (let i = 1; i < obsData.length; i++) {
            if (obsData[i][0] === observationId) {
                observation = {
                    id: obsData[i][0],
                    observeeEmail: obsData[i][1],
                    evaluatorEmail: obsData[i][2],
                    name: obsData[i][3],
                    startTime: obsData[i][4],
                    endTime: obsData[i][5],
                    status: obsData[i][6],
                    folderId: obsData[i][7],
                    notesDocId: obsData[i][8],
                    ratings: {},
                    notes: {}
                };
                break;
            }
        }

        if (!observation) {
            debugLog('Observation not found', { observationId });
            return null;
        }

        // Get all ratings for this observation
        const ratingsSheet = getSheetByName(spreadsheet, SHEET_NAMES.RATINGS);
        if (ratingsSheet) {
            const ratingsData = ratingsSheet.getDataRange().getValues();
            for (let i = 1; i < ratingsData.length; i++) {
                if (ratingsData[i][0] === observationId) {
                    const componentId = ratingsData[i][1];
                    const rating = ratingsData[i][2];
                    observation.ratings[componentId] = rating;
                }
            }
        }

        // Get all notes for this observation
        if (observation.notesDocId) {
            observation.notes = getNotes(observationId);
        }
        
        debugLog('Observation details retrieved successfully', { observationId });
        return observation;

    } catch (error) {
        console.error('Error retrieving observation details:', formatErrorMessage(error, 'getObservationDetails'));
        return null;
    }
}

/**
 * Renames an observation.
 * @param {string} observationId The ID of the observation to rename.
 * @param {string} newName The new name for the observation.
 */
function renameObservation(observationId, newName) {
  if (!isPeerEvaluator()) {
    throw new Error('Only Peer Evaluators can perform this action.');
  }
  try {
    const spreadsheet = openSpreadsheet();
    const sheet = getSheetByName(spreadsheet, SHEET_NAMES.OBSERVATIONS);
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === observationId) {
        sheet.getRange(i + 1, 4).setValue(newName);
        debugLog('Observation renamed successfully', { observationId, newName });
        return;
      }
    }
  } catch (error) {
    console.error('Error renaming observation:', formatErrorMessage(error, 'renameObservation'));
  }
}

/**
 * Deletes an observation and its associated data.
 * @param {string} observationId The ID of the observation to delete.
 */
function deleteObservation(observationId) {
  if (!isPeerEvaluator()) {
    throw new Error('Only Peer Evaluators can perform this action.');
  }
  try {
    const spreadsheet = openSpreadsheet();
    const sheet = getSheetByName(spreadsheet, SHEET_NAMES.OBSERVATIONS);
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === observationId) {
        const folderId = data[i][7];
        const notesDocId = data[i][8];

        if (folderId) {
          DriveApp.getFolderById(folderId).setTrashed(true);
        }
        if (notesDocId) {
          DriveApp.getFileById(notesDocId).setTrashed(true);
        }

        sheet.deleteRow(i + 1);
        debugLog('Observation deleted successfully', { observationId });
        return;
      }
    }
  } catch (error) {
    console.error('Error deleting observation:', formatErrorMessage(error, 'deleteObservation'));
  }
}

/**
 * Exports an observation rubric to PDF.
 * @param {string} observationId The ID of the observation to export.
 * @return {string} The URL of the generated PDF file.
 */
function exportToPdf(observationId) {
  if (!isPeerEvaluator()) {
    throw new Error('Only Peer Evaluators can perform this action.');
  }
  try {
    const spreadsheet = openSpreadsheet();
    const sheet = getSheetByName(spreadsheet, SHEET_NAMES.OBSERVATIONS);
    const data = sheet.getDataRange().getValues();

    let folderId = null;
    let observationName = null;

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === observationId) {
        folderId = data[i][7];
        observationName = data[i][3];
        break;
      }
    }

    if (folderId && observationName) {
      const folder = DriveApp.getFolderById(folderId);
      const html = HtmlService.createTemplateFromFile('rubric-pdf').evaluate().getContent();
      const pdf = Utilities.newBlob(html, 'text/html', `${observationName}.html`).getAs('application/pdf');
      const pdfFile = folder.createFile(pdf).setName(`${observationName}.pdf`);
      return pdfFile.getUrl();
    }

    return null;
  } catch (error) {
    console.error('Error exporting to PDF:', formatErrorMessage(error, 'exportToPdf'));
    return null;
  }
}