/**
 * ValidationService.js - Comprehensive validation and error handling
 * This file handles data validation, error recovery, and system health monitoring
 */

/**
 * Validation error types
 */
// const VALIDATION_ERROR_TYPES = {
//   MISSING_SHEET: 'missing_sheet',
//   INVALID_ROLE: 'invalid_role',
//   MISSING_USER: 'missing_user',
//   DATA_CORRUPTION: 'data_corruption',
//   PERMISSION_ERROR: 'permission_error',
//   CONFIGURATION_ERROR: 'configuration_error',
//   NETWORK_ERROR: 'network_error',
//   TIMEOUT_ERROR: 'timeout_error'
// };

/**
 * Validation severity levels
 */
const VALIDATION_SEVERITY = {
  CRITICAL: 'critical',    // System cannot function
  ERROR: 'error',          // Feature broken but system works
  WARNING: 'warning',      // Potential issue
  INFO: 'info'            // Informational only
};

/**
 * Validates an email address.
 * @param {string} email The email address to validate.
 * @return {boolean} True if the email is valid, false otherwise.
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  // Basic email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Comprehensive role validation
 * @param {string} role - Role to validate
 * @return {Object} Validation result
 */
function validateRole(role) {
  const validationId = generateUniqueId('role_validation');

  try {
    const result = {
      validationId: validationId,
      role: role,
      isValid: false,
      issues: [],
      severity: VALIDATION_SEVERITY.INFO,
      fallbackRole: null,
      sheetExists: false,
      sheetAccessible: false,
      hasContent: false,
      recommendedActions: []
    };

    // Check if role is provided
    if (!role) {
      result.issues.push({
        type: VALIDATION_ERROR_TYPES.INVALID_ROLE,
        message: 'No role provided',
        severity: VALIDATION_SEVERITY.ERROR
      });
      result.severity = VALIDATION_SEVERITY.ERROR;
      result.fallbackRole = 'Teacher';
      result.recommendedActions.push('Use default Teacher role');
      return result;
    }

    // Check if role is in available roles list
    if (!AVAILABLE_ROLES.includes(role)) {
      result.issues.push({
        type: VALIDATION_ERROR_TYPES.INVALID_ROLE,
        message: `Role "${role}" is not in AVAILABLE_ROLES list`,
        severity: VALIDATION_SEVERITY.ERROR,
        details: {
          providedRole: role,
          availableRoles: AVAILABLE_ROLES
        }
      });
      result.severity = VALIDATION_SEVERITY.ERROR;
      result.fallbackRole = findClosestRole(role) || 'Teacher';
      result.recommendedActions.push(`Add "${role}" to AVAILABLE_ROLES in Constants.js`);
      result.recommendedActions.push(`Or use fallback role: ${result.fallbackRole}`);
    }

    // Check if role sheet exists
    const sheetValidation = validateSheetExists(role);
    result.sheetExists = sheetValidation.exists;
    result.sheetAccessible = sheetValidation.exists && sheetValidation.errors.length === 0;

    if (!result.sheetExists) {
      result.issues.push({
        type: VALIDATION_ERROR_TYPES.MISSING_SHEET,
        message: `Sheet "${role}" does not exist`,
        severity: VALIDATION_SEVERITY.CRITICAL,
        details: {
          sheetName: role,
          errors: sheetValidation.errors
        }
      });
      result.severity = VALIDATION_SEVERITY.CRITICAL;
      result.fallbackRole = 'Teacher';
      result.recommendedActions.push(`Create sheet tab named "${role}"`);
      result.recommendedActions.push('Or copy existing role sheet and rename it');
      result.recommendedActions.push('Use Teacher role as fallback');
    }

    // Check if sheet has content
    if (result.sheetExists) {
      result.hasContent = sheetValidation.rowCount > 2; // Header + at least one content row

      if (!result.hasContent) {
        result.issues.push({
          type: VALIDATION_ERROR_TYPES.DATA_CORRUPTION,
          message: `Sheet "${role}" exists but appears to be empty`,
          severity: VALIDATION_SEVERITY.ERROR,
          details: {
            rowCount: sheetValidation.rowCount,
            columnCount: sheetValidation.columnCount
          }
        });
        result.severity = Math.max(result.severity, VALIDATION_SEVERITY.ERROR);
        result.recommendedActions.push(`Add content to "${role}" sheet`);
        result.recommendedActions.push('Copy content from Teacher sheet');
      }
    }

    // Overall validation result
    result.isValid = result.sheetExists && result.sheetAccessible && result.hasContent &&
                    AVAILABLE_ROLES.includes(role);

    if (result.isValid) {
      result.severity = VALIDATION_SEVERITY.INFO;
      result.recommendedActions = ['Role is valid and ready to use'];
    }

    debugLog('Role validation completed', {
      validationId: validationId,
      role: role,
      isValid: result.isValid,
      issueCount: result.issues.length,
      severity: result.severity
    });

    return result;

  } catch (error) {
    console.error('Error in role validation:', error);
    return {
      validationId: validationId,
      role: role,
      isValid: false,
      issues: [{
        type: VALIDATION_ERROR_TYPES.CONFIGURATION_ERROR,
        message: 'Validation system error: ' + error.message,
        severity: VALIDATION_SEVERITY.CRITICAL
      }],
      severity: VALIDATION_SEVERITY.CRITICAL,
      fallbackRole: 'Teacher',
      error: error.message
    };
  }
}

/**
 * Find the closest matching role for typos or similar names
 * @param {string} invalidRole - Invalid role to find match for
 * @return {string|null} Closest matching role or null
 */
function findClosestRole(invalidRole) {
  if (!invalidRole || typeof invalidRole !== 'string') {
    return null;
  }

  const lowerInvalid = invalidRole.toLowerCase();

  // Direct substring matches
  const substringMatch = AVAILABLE_ROLES.find(role =>
    role.toLowerCase().includes(lowerInvalid) ||
    lowerInvalid.includes(role.toLowerCase())
  );

  if (substringMatch) {
    return substringMatch;
  }

  // Common mappings
  const roleMappings = {
    'admin': 'Administrator',
    'administrator': 'Administrator',
    'teach': 'Teacher',
    'teacher': 'Teacher',
    'instructor': 'Instructional Specialist',
    'instructional': 'Instructional Specialist',
    'counsellor': 'Counselor',
    'psychologist': 'School Psychologist',
    'psych': 'School Psychologist',
    'librarian': 'Library/Media Specialist',
    'media': 'Library/Media Specialist',
    'special': 'Sp.Ed.',
    'sped': 'Sp.Ed.',
    'early': 'Early Childhood',
    'parent': 'Parent Educator',
    'social': 'Social Worker'
  };

  const mapping = roleMappings[lowerInvalid];
  if (mapping && AVAILABLE_ROLES.includes(mapping)) {
    return mapping;
  }

  return null;
}

/**
 * Validate user data integrity
 * @param {Object} user - User object to validate
 * @return {Object} Validation result
 */
function validateUserData(user) {
  const validationId = generateUniqueId('user_validation');

  try {
    const result = {
      validationId: validationId,
      isValid: false,
      issues: [],
      severity: VALIDATION_SEVERITY.INFO,
      sanitizedUser: null,
      recommendedActions: []
    };

    if (!user) {
      result.issues.push({
        type: VALIDATION_ERROR_TYPES.MISSING_USER,
        message: 'User object is null or undefined',
        severity: VALIDATION_SEVERITY.CRITICAL
      });
      result.severity = VALIDATION_SEVERITY.CRITICAL;
      return result;
    }

    // Create sanitized user object
    const sanitizedUser = {
      name: sanitizeText(user.name),
      email: sanitizeText(user.email),
      role: sanitizeText(user.role),
      year: parseInt(user.year) || 1,
      rowNumber: user.rowNumber
    };

    // Validate email
    if (!sanitizedUser.email || !isValidEmail(sanitizedUser.email)) {
      result.issues.push({
        type: VALIDATION_ERROR_TYPES.MISSING_USER,
        message: 'Invalid or missing email address',
        severity: VALIDATION_SEVERITY.CRITICAL,
        details: { email: sanitizedUser.email }
      });
      result.severity = VALIDATION_SEVERITY.CRITICAL;
      result.recommendedActions.push('Provide valid email address');
    }

    // Validate role
    if (!sanitizedUser.role) {
      result.issues.push({
        type: VALIDATION_ERROR_TYPES.INVALID_ROLE,
        message: 'Missing role',
        severity: VALIDATION_SEVERITY.ERROR
      });
      result.severity = Math.max(result.severity, VALIDATION_SEVERITY.ERROR);
      sanitizedUser.role = 'Teacher';
      result.recommendedActions.push('Set role to Teacher as default');
    } else if (!AVAILABLE_ROLES.includes(sanitizedUser.role)) {
      result.issues.push({
        type: VALIDATION_ERROR_TYPES.INVALID_ROLE,
        message: `Invalid role: ${sanitizedUser.role}`,
        severity: VALIDATION_SEVERITY.ERROR,
        details: { role: sanitizedUser.role, availableRoles: AVAILABLE_ROLES }
      });
      result.severity = Math.max(result.severity, VALIDATION_SEVERITY.ERROR);
      const fallbackRole = findClosestRole(sanitizedUser.role) || 'Teacher';
      sanitizedUser.role = fallbackRole;
      result.recommendedActions.push(`Role changed to: ${fallbackRole}`);
    }

    // Validate year
    if (!OBSERVATION_YEARS.includes(sanitizedUser.year)) {
      result.issues.push({
        type: VALIDATION_ERROR_TYPES.DATA_CORRUPTION,
        message: `Invalid observation year: ${sanitizedUser.year}`,
        severity: VALIDATION_SEVERITY.WARNING,
        details: { year: sanitizedUser.year, validYears: OBSERVATION_YEARS }
      });
      result.severity = Math.max(result.severity, VALIDATION_SEVERITY.WARNING);
      sanitizedUser.year = 1;
      result.recommendedActions.push('Year set to 1 as default');
    }

    // Validate name
    if (!sanitizedUser.name) {
      result.issues.push({
        type: VALIDATION_ERROR_TYPES.DATA_CORRUPTION,
        message: 'Missing user name',
        severity: VALIDATION_SEVERITY.WARNING
      });
      result.severity = Math.max(result.severity, VALIDATION_SEVERITY.WARNING);
      sanitizedUser.name = sanitizedUser.email ? sanitizedUser.email.split('@')[0] : 'Unknown User';
      result.recommendedActions.push('Name derived from email');
    }

    result.sanitizedUser = sanitizedUser;
    result.isValid = result.severity !== VALIDATION_SEVERITY.CRITICAL;

    if (result.isValid && result.issues.length === 0) {
      result.severity = VALIDATION_SEVERITY.INFO;
      result.recommendedActions = ['User data is valid'];
    }

    debugLog('User data validation completed', {
      validationId: validationId,
      email: sanitizedUser.email,
      isValid: result.isValid,
      issueCount: result.issues.length,
      severity: result.severity
    });

    return result;

  } catch (error) {
    console.error('Error in user data validation:', error);
    return {
      validationId: validationId,
      isValid: false,
      issues: [{
        type: VALIDATION_ERROR_TYPES.CONFIGURATION_ERROR,
        message: 'User validation error: ' + error.message,
        severity: VALIDATION_SEVERITY.CRITICAL
      }],
      severity: VALIDATION_SEVERITY.CRITICAL,
      error: error.message
    };
  }
}

/**
 * Validate system configuration
 * @return {Object} System validation result
 */
function validateSystemConfiguration() {
  const validationId = generateUniqueId('system_validation');

  try {
    const result = {
      validationId: validationId,
      isValid: false,
      issues: [],
      severity: VALIDATION_SEVERITY.INFO,
      systemHealth: {
        spreadsheetAccess: false,
        requiredSheets: {},
        roleSheets: {},
        cacheSystem: false,
        triggerSystem: false
      },
      recommendedActions: []
    };

    // Test spreadsheet access
    try {
      const spreadsheet = openSpreadsheet();
      result.systemHealth.spreadsheetAccess = true;
      debugLog('Spreadsheet access verified', {
        name: spreadsheet.getName(),
        validationId: validationId
      });
    } catch (error) {
      result.issues.push({
        type: VALIDATION_ERROR_TYPES.PERMISSION_ERROR,
        message: 'Cannot access spreadsheet: ' + error.message,
        severity: VALIDATION_SEVERITY.CRITICAL
      });
      result.severity = VALIDATION_SEVERITY.CRITICAL;
      result.recommendedActions.push('Check SHEET_ID in Script Properties');
      result.recommendedActions.push('Verify spreadsheet permissions');
    }

    // Test required system sheets
    const requiredSheets = [SHEET_NAMES.STAFF, SHEET_NAMES.SETTINGS, SHEET_NAMES.TEACHER];
    requiredSheets.forEach(sheetName => {
      const validation = validateSheetExists(sheetName);
      result.systemHealth.requiredSheets[sheetName] = validation.exists;

      if (!validation.exists) {
        result.issues.push({
          type: VALIDATION_ERROR_TYPES.MISSING_SHEET,
          message: `Required sheet "${sheetName}" not found`,
          severity: sheetName === SHEET_NAMES.TEACHER ? VALIDATION_SEVERITY.CRITICAL : VALIDATION_SEVERITY.ERROR
        });
        result.severity = Math.max(result.severity,
          sheetName === SHEET_NAMES.TEACHER ? VALIDATION_SEVERITY.CRITICAL : VALIDATION_SEVERITY.ERROR);
        result.recommendedActions.push(`Create "${sheetName}" sheet`);
      }
    });

    // Test role sheets
    AVAILABLE_ROLES.forEach(role => {
      const validation = validateSheetExists(role);
      result.systemHealth.roleSheets[role] = validation.exists;

      if (!validation.exists && role !== 'Teacher') {
        result.issues.push({
          type: VALIDATION_ERROR_TYPES.MISSING_SHEET,
          message: `Role sheet "${role}" not found`,
          severity: VALIDATION_SEVERITY.WARNING
        });
        result.severity = Math.max(result.severity, VALIDATION_SEVERITY.WARNING);
        result.recommendedActions.push(`Create "${role}" sheet or users will see Teacher rubric`);
      }
    });

    // Test cache system
    try {
      const testKey = 'system_validation_test';
      const testData = { test: true, timestamp: Date.now() };
      setCachedDataEnhanced('test', { key: testKey }, testData, 60);
      const retrieved = getCachedDataEnhanced('test', { key: testKey });

      if (retrieved && retrieved.data && retrieved.data.test) {
        result.systemHealth.cacheSystem = true;
        // Clean up test data
        const cache = CacheService.getScriptCache();
        cache.remove(generateCacheKey('test', { key: testKey }));
      } else {
        throw new Error('Cache test failed');
      }
    } catch (error) {
      result.issues.push({
        type: VALIDATION_ERROR_TYPES.CONFIGURATION_ERROR,
        message: 'Cache system not working: ' + error.message,
        severity: VALIDATION_SEVERITY.ERROR
      });
      result.severity = Math.max(result.severity, VALIDATION_SEVERITY.ERROR);
      result.recommendedActions.push('Check Phase 1 implementation');
    }

    // Test trigger system
    try {
      if (typeof checkAutoTriggerStatus === 'function') {
        const triggerStatus = checkAutoTriggerStatus();
        result.systemHealth.triggerSystem = triggerStatus.isInstalled;

        if (!triggerStatus.isInstalled) {
          result.issues.push({
            type: VALIDATION_ERROR_TYPES.CONFIGURATION_ERROR,
            message: 'Auto-trigger system not installed',
            severity: VALIDATION_SEVERITY.WARNING
          });
          result.severity = Math.max(result.severity, VALIDATION_SEVERITY.WARNING);
          result.recommendedActions.push('Run installRoleChangeAutoTrigger()');
        }
      } else {
        result.issues.push({
          type: VALIDATION_ERROR_TYPES.CONFIGURATION_ERROR,
          message: 'Auto-trigger system not implemented',
          severity: VALIDATION_SEVERITY.INFO
        });
        result.recommendedActions.push('Implement auto-trigger system for automatic role change detection');
      }
    } catch (error) {
      result.issues.push({
        type: VALIDATION_ERROR_TYPES.CONFIGURATION_ERROR,
        message: 'Error checking trigger system: ' + error.message,
        severity: VALIDATION_SEVERITY.WARNING
      });
      result.severity = Math.max(result.severity, VALIDATION_SEVERITY.WARNING);
    }

    // Overall system health
    const criticalIssues = result.issues.filter(issue =>
      issue.severity === VALIDATION_SEVERITY.CRITICAL
    ).length;

    result.isValid = criticalIssues === 0;

    if (result.isValid && result.issues.length === 0) {
      result.severity = VALIDATION_SEVERITY.INFO;
      result.recommendedActions = ['System configuration is healthy'];
    }

    debugLog('System configuration validation completed', {
      validationId: validationId,
      isValid: result.isValid,
      issueCount: result.issues.length,
      severity: result.severity,
      systemHealth: result.systemHealth
    });

    return result;

  } catch (error) {
    console.error('Error in system configuration validation:', error);
    return {
      validationId: validationId,
      isValid: false,
      issues: [{
        type: VALIDATION_ERROR_TYPES.CONFIGURATION_ERROR,
        message: 'System validation error: ' + error.message,
        severity: VALIDATION_SEVERITY.CRITICAL
      }],
      severity: VALIDATION_SEVERITY.CRITICAL,
      error: error.message
    };
  }
}

/**
 * Create validation report
 * @param {Array<Object>} validationResults - Array of validation results
 * @return {Object} Comprehensive validation report
 */
function createValidationReport(validationResults) {
  const reportId = generateUniqueId('validation_report');

  try {
    const report = {
      reportId: reportId,
      timestamp: new Date().toISOString(),
      summary: {
        totalValidations: validationResults.length,
        passed: 0,
        failed: 0,
        warnings: 0,
        critical: 0
      },
      validations: validationResults,
      recommendations: [],
      systemHealth: 'unknown'
    };

    // Analyze results
    validationResults.forEach(result => {
      if (result.isValid) {
        report.summary.passed++;
      } else {
        report.summary.failed++;
      }

      if (result.issues) {
        result.issues.forEach(issue => {
          if (issue.severity === VALIDATION_SEVERITY.CRITICAL) {
            report.summary.critical++;
          } else if (issue.severity === VALIDATION_SEVERITY.WARNING) {
            report.summary.warnings++;
          }
        });
      }

      // Collect recommendations
      if (result.recommendedActions) {
        report.recommendations.push(...result.recommendedActions);
      }
    });

    // Remove duplicate recommendations
    report.recommendations = [...new Set(report.recommendations)];

    // Determine overall system health
    if (report.summary.critical > 0) {
      report.systemHealth = 'critical';
    } else if (report.summary.failed > 0) {
      report.systemHealth = 'degraded';
    } else if (report.summary.warnings > 0) {
      report.systemHealth = 'warning';
    } else {
      report.systemHealth = 'healthy';
    }

    debugLog('Validation report created', {
      reportId: reportId,
      systemHealth: report.systemHealth,
      totalValidations: report.summary.totalValidations,
      critical: report.summary.critical,
      failed: report.summary.failed
    });

    return report;

  } catch (error) {
    console.error('Error creating validation report:', error);
    return {
      reportId: reportId,
      timestamp: new Date().toISOString(),
      error: error.message,
      systemHealth: 'error'
    };
  }
}
