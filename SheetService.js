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
    if (dataChanged) {
      debugLog('Staff sheet data change detected - invalidating related caches');
      invalidateDependentCaches('staff_data');
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
        year: parseInt(row[STAFF_COLUMNS.YEAR]) || 1,
        rowNumber: rowNumber
      };
      
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
 * Reads data from the Settings sheet
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
    
    values.forEach((row, index) => {
      const rowNumber = index + 2;
      const role = sanitizeText(row[SETTINGS_COLUMNS.ROLE]);
      
      if (!role) {
        return; // Skip empty rows
      }
      
      if (!AVAILABLE_ROLES.includes(role)) {
        console.warn(`Unknown role in Settings sheet row ${rowNumber}:`, role);
        return;
      }
      
      roleYearMappings[role] = {
        year1: parseMultilineCell(row[SETTINGS_COLUMNS.YEAR_1]),
        year2: parseMultilineCell(row[SETTINGS_COLUMNS.YEAR_2]),
        year3: parseMultilineCell(row[SETTINGS_COLUMNS.YEAR_3]),
        rowNumber: rowNumber
      };
      
      debugLog(`Settings loaded for role: ${role}`, {
        year1Count: roleYearMappings[role].year1.length,
        year2Count: roleYearMappings[role].year2.length,
        year3Count: roleYearMappings[role].year3.length
      });
    });
    
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
        if (fallbackRole !== roleName && fallbackRole === 'Teacher') {
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
        clearCachedData(generateCacheKey('role_sheet', cacheParams));
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
      debugLog(`Role sheet data change detected for ${roleName} - invalidating related caches`, {
        operationId: operationId
      });
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
    const criticalSheets = [SHEET_NAMES.STAFF, SHEET_NAMES.SETTINGS, SHEET_NAMES.TEACHER];
    
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