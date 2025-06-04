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
    // Each role name should be followed by 4 consecutive rows, where each row represents a Domain (1-4).
    // Columns B, C, D (defined by SETTINGS_COLUMNS.YEAR_1, YEAR_2, YEAR_3) in these 4 rows
    // contain the specific items/subdomains for that Domain for Year 1, Year 2, and Year 3 respectively.
    // The parser actively looks for role names and processes the subsequent 4 rows.
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

      // Get the 4 rows of domain data for this role
      // Expecting 4 rows of data for Domain1, Domain2, Domain3, Domain4 for the current role
      // Each of these rows has 3 columns for Year1, Year2, Year3
      // The current row values[i] is the role name, so data starts from values[i] for Domain1, values[i+1] for Domain2 etc.
      // This seems to be an error in the original code logic. It should be values[i] for role, values[i+1] for D1, values[i+2] for D2 etc.
      // However, the prompt asks to keep the logic for reading domain data the same, which implies reading from values[i] through values[i+3] for domains.
      // This means the roleName row itself is also treated as the first data row (Domain1).
      // Let's stick to the prompt's requirement to keep the reading logic for values[i] to values[i+3] for domains.
      // This implies the roleName is in values[i][0], Domain1/Year1 is values[i][1], Domain1/Year2 is values[i][2], etc.
      // And Domain2/Year1 is values[i+1][1]
      // This is confusing and likely an error in the original sheet structure or interpretation.
      // The prompt states "The logic for reading domain1Year1, domain2Year1, etc., from values[i], values[i+1], values[i+2], and values[i+3] remains the same."
      // The existing code reads:
      // domain1Year1 from values[i][SETTINGS_COLUMNS.YEAR_1]
      // domain2Year1 from values[i+1][SETTINGS_COLUMNS.YEAR_1]
      // domain3Year1 from values[i+2][SETTINGS_COLUMNS.YEAR_1]
      // domain4Year1 from values[i+3][SETTINGS_COLUMNS.YEAR_1]
      // This means the role itself is NOT one of the 4 data rows. The 4 data rows FOLLOW the role row.
      // So if roleName is at values[i], then domain data is at values[i+1], values[i+2], values[i+3], values[i+4].
      // This contradicts the new check `if (i + 3 >= values.length)` which expects only 3 *additional* rows.
      // Let's re-evaluate based on the prompt: "The logic for reading domain1Year1... from values[i], values[i+1], values[i+2], and values[i+3] remains the same."
      // This is the critical part. If values[i] is the first data row, values[i+1] is second, etc.
      // And roleName is also from values[i][0]. This means the sheet has roleName in col0 and domain1 data in col1,2,3 of the SAME ROW.
      // Then values[i+1] is Domain2 data. values[i+2] is Domain3 data. values[i+3] is Domain4 data.
      // This interpretation makes the `i+3 >= values.length` check correct for ensuring 4 *total* data rows including the first one.

      // Let's assume the existing code's interpretation of data rows is what needs to be preserved, but the loop structure changes.
      // Old code: roleName = values[i][0]. Data from values[i+1] to values[i+4]. Loop increment i+=5.
      // New code: roleName = values[i][0]. Data from values[i+1] to values[i+4]. Loop increment i++. Then i+=3.
      // The new check `if (i + 3 >= values.length)` is for the *additional* rows needed *after* the current `values[i]` (which is the role name row).
      // So, if `values[i]` is the role name row, we need `values[i+1]`, `values[i+2]`, `values[i+3]`, `values[i+4]` for the four domains.
      // This means we need to check `if (i + 4 >= values.length)`. The prompt's new check `i+3` is problematic if data is in `i+1` to `i+4`.

      // Let's look at the original code again:
      // roleName = values[i][0]
      // domain1Year1 = values[i+1][1] ...
      // domain2Year1 = values[i+2][1] ...
      // domain3Year1 = values[i+3][1] ...
      // domain4Year1 = values[i+4][1] ...
      // This means there are 5 rows involved per role: 1 for role name, 4 for data.
      // The new warning message says: "Expected 4 data rows". This implies the role name row is separate.
      // If `values[i]` is the role name, then `values[i+1]` to `values[i+4]` are the 4 data rows.
      // So, to ensure these 4 data rows exist, we must check `i + 4 < values.length` or `i + 4 >= values.length` for the boundary.
      // More precisely, the last index needed is `i+4`. So we need `i+4 < values.length`.
      // If `i+4` is the last valid index, then `values.length` must be at least `i+4+1`.
      // So the check should be `if (i + 4 >= values.length) { continue; }`

      // Given the prompt: "Replace the existing check for i + 3 >= values.length with a more explicit check: if (i + 3 >= values.length) { console.warn(... Expected 4 data rows...); continue; }"
      // This implies that `values[i]` (role name), `values[i+1]`, `values[i+2]`, `values[i+3]` are the four rows involved in data extraction for a role.
      // This means `roleName` is in `values[i][0]`, and `domain1Year1` data is also in `values[i][1]`, etc.
      // And `domain2Year1` data is in `values[i+1][1]`, etc.
      // `domain3Year1` data is in `values[i+2][1]`, etc.
      // `domain4Year1` data is in `values[i+3][1]`, etc.
      // This structure matches the new check `(i+3 >= values.length)` for the four rows containing data.
      // And the new `i+=3` advancement also matches this structure.

      // The original code was:
      // roleYearMappings[roleName] = {
      //   domain1Year1: values[i+1][1], domain1Year2: values[i+1][2], domain1Year3: values[i+1][3],
      //   domain2Year1: values[i+2][1], domain2Year2: values[i+2][2], domain2Year3: values[i+2][3],
      //   domain3Year1: values[i+3][1], domain3Year2: values[i+3][2], domain3Year3: values[i+3][3],
      //   domain4Year1: values[i+4][1], domain4Year2: values[i+4][2], domain4Year3: values[i+4][3],
      // };
      // This clearly shows data is from `i+1` to `i+4`.
      // The prompt says: "The logic for reading domain1Year1, domain2Year1, etc., from values[i], values[i+1], values[i+2], and values[i+3] remains the same."
      // This is a direct contradiction to the existing code's `values[i+1]...values[i+4]`.

      // Let's assume the prompt's intention for data reading indices (i, i+1, i+2, i+3) is the source of truth for the refactoring,
      // meaning the data access itself needs to change from `values[i+1]...values[i+4]` to `values[i]...values[i+3]`.
      // And `roleName` is still `values[i][0]`.
      // This means the first data row *is* `values[i]`.

      // New interpretation:
      // Row `i`: `roleName` in `[0]`, `domain1` data in `[1],[2],[3]`
      // Row `i+1`: `domain2` data in `[1],[2],[3]` (column `[0]` of this row is ignored or could be a sub-label)
      // Row `i+2`: `domain3` data in `[1],[2],[3]`
      // Row `i+3`: `domain4` data in `[1],[2],[3]`

      // This matches the new check `if (i + 3 >= values.length)` and the new advancement `i += 3`.
      // And the warning "Expected 4 data rows" means these 4 rows (i, i+1, i+2, i+3).

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