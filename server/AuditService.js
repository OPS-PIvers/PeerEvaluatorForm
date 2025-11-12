/**
 * AuditService.js
 * Comprehensive audit logging for security, compliance, and insider threat detection
 *
 * SECURITY IMPLEMENTATION: Critical Priority
 * - Logs all sensitive operations
 * - Detects suspicious activity patterns
 * - Provides compliance audit trail
 * - Alerts on security incidents
 */

/**
 * Audit action constants for standardized logging
 */
const AUDIT_ACTIONS = {
  // Authentication and Authorization
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',
  ACCESS_DENIED: 'ACCESS_DENIED',
  UNAUTHORIZED_ACCESS_ATTEMPT: 'UNAUTHORIZED_ACCESS_ATTEMPT',
  ROLE_CHANGED: 'ROLE_CHANGED',

  // Observation Operations
  OBSERVATION_CREATED: 'OBSERVATION_CREATED',
  OBSERVATION_VIEWED: 'OBSERVATION_VIEWED',
  OBSERVATION_EDITED: 'OBSERVATION_EDITED',
  OBSERVATION_FINALIZED: 'OBSERVATION_FINALIZED',
  OBSERVATION_DELETED: 'OBSERVATION_DELETED',
  OBSERVATION_PDF_GENERATED: 'OBSERVATION_PDF_GENERATED',

  // Administrative Access
  ADMIN_OBSERVATION_ACCESS: 'ADMIN_OBSERVATION_ACCESS',
  FULL_ACCESS_OBSERVATION_VIEW: 'FULL_ACCESS_OBSERVATION_VIEW',
  STAFF_LIST_ACCESSED: 'STAFF_LIST_ACCESSED',

  // Communication
  EMAIL_SENT: 'EMAIL_SENT',
  EMAIL_BLOCKED: 'EMAIL_BLOCKED',

  // Rate Limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // Data Access
  RUBRIC_DATA_ACCESSED: 'RUBRIC_DATA_ACCESSED',
  CACHE_CLEARED: 'CACHE_CLEARED'
};

/**
 * Creates an audit log entry with comprehensive context
 * @param {string} action - Action from AUDIT_ACTIONS
 * @param {Object} details - Additional context about the action
 * @returns {Object} The created log entry
 */
function auditLog(action, details = {}) {
  try {
    const userEmail = Session.getActiveUser().getEmail();

    const logEntry = {
      timestamp: new Date().toISOString(),
      action: action,
      user: userEmail,
      userAgent: getUserAgent(),
      sessionId: getCurrentSessionId(),
      details: details,
      severity: getActionSeverity(action)
    };

    // Always log to console for Apps Script logging
    console.log('AUDIT:', JSON.stringify(logEntry));

    // Write to persistent audit sheet (non-blocking)
    try {
      writeToAuditSheet(logEntry);
    } catch (sheetError) {
      console.error('Failed to write to audit sheet:', sheetError.message);
      // Don't fail the operation if audit logging fails
    }

    // Check for suspicious activity and alert if needed
    if (isSuspiciousActivity(action, details, userEmail)) {
      try {
        alertOnSuspiciousActivity(logEntry);
      } catch (alertError) {
        console.error('Failed to send security alert:', alertError.message);
      }
    }

    return logEntry;
  } catch (error) {
    console.error('Error in auditLog:', error.message);
    // Don't throw - audit logging should never break functionality
    return null;
  }
}

/**
 * Gets the current session ID safely
 * @returns {string} Session ID or generated ID
 * @private
 */
function getCurrentSessionId() {
  try {
    const userEmail = Session.getActiveUser().getEmail();
    const session = getUserSession(userEmail);
    return session ? session.sessionId : generateUniqueId('session');
  } catch (error) {
    return generateUniqueId('session');
  }
}

/**
 * Determines the severity level of an action
 * @param {string} action - Audit action
 * @returns {string} Severity level
 * @private
 */
function getActionSeverity(action) {
  const highSeverity = [
    AUDIT_ACTIONS.UNAUTHORIZED_ACCESS_ATTEMPT,
    AUDIT_ACTIONS.ACCESS_DENIED,
    AUDIT_ACTIONS.EMAIL_BLOCKED,
    AUDIT_ACTIONS.RATE_LIMIT_EXCEEDED
  ];

  const mediumSeverity = [
    AUDIT_ACTIONS.OBSERVATION_FINALIZED,
    AUDIT_ACTIONS.OBSERVATION_DELETED,
    AUDIT_ACTIONS.ADMIN_OBSERVATION_ACCESS,
    AUDIT_ACTIONS.EMAIL_SENT,
    AUDIT_ACTIONS.ROLE_CHANGED
  ];

  if (highSeverity.includes(action)) return 'HIGH';
  if (mediumSeverity.includes(action)) return 'MEDIUM';
  return 'LOW';
}

/**
 * Writes audit log entry to persistent sheet storage
 * @param {Object} logEntry - The log entry to write
 * @private
 */
function writeToAuditSheet(logEntry) {
  const spreadsheet = openSpreadsheet();
  let auditSheet = getSheetByName(spreadsheet, 'AuditLog');

  // Create audit sheet if it doesn't exist
  if (!auditSheet) {
    auditSheet = spreadsheet.insertSheet('AuditLog');

    // Set up headers
    const headers = ['Timestamp', 'Action', 'User', 'Severity', 'Session ID', 'User Agent', 'Details'];
    auditSheet.appendRow(headers);

    // Format header row
    const headerRange = auditSheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4a5568');
    headerRange.setFontColor('#ffffff');

    // Freeze header row
    auditSheet.setFrozenRows(1);

    // Set column widths
    auditSheet.setColumnWidth(1, 180); // Timestamp
    auditSheet.setColumnWidth(2, 200); // Action
    auditSheet.setColumnWidth(3, 250); // User
    auditSheet.setColumnWidth(4, 80);  // Severity
    auditSheet.setColumnWidth(5, 200); // Session ID
    auditSheet.setColumnWidth(6, 150); // User Agent
    auditSheet.setColumnWidth(7, 400); // Details
  }

  // Append log entry
  auditSheet.appendRow([
    logEntry.timestamp,
    logEntry.action,
    logEntry.user,
    logEntry.severity,
    logEntry.sessionId,
    logEntry.userAgent,
    JSON.stringify(logEntry.details)
  ]);
}

/**
 * Detects suspicious activity patterns that may indicate security threats
 * @param {string} action - The action being performed
 * @param {Object} details - Action details
 * @param {string} userEmail - User performing the action
 * @returns {boolean} True if activity is suspicious
 * @private
 */
function isSuspiciousActivity(action, details, userEmail) {
  // Always flag unauthorized access attempts
  if (action === AUDIT_ACTIONS.UNAUTHORIZED_ACCESS_ATTEMPT) {
    return true;
  }

  // Check for excessive observation viewing (potential data scraping)
  if (action === AUDIT_ACTIONS.OBSERVATION_VIEWED) {
    const recentViews = countRecentAuditActions(userEmail, AUDIT_ACTIONS.OBSERVATION_VIEWED, 5); // 5 minutes
    if (recentViews > 20) {
      return true;
    }
  }

  // Check for excessive admin access
  if (action === AUDIT_ACTIONS.ADMIN_OBSERVATION_ACCESS) {
    const recentAccess = countRecentAuditActions(userEmail, AUDIT_ACTIONS.ADMIN_OBSERVATION_ACCESS, 10); // 10 minutes
    if (recentAccess > 15) {
      return true;
    }
  }

  // Check for rate limit violations
  if (action === AUDIT_ACTIONS.RATE_LIMIT_EXCEEDED) {
    return true;
  }

  return false;
}

/**
 * Counts recent audit actions for a user within a time window
 * @param {string} userEmail - User email
 * @param {string} action - Action to count
 * @param {number} minutesAgo - Time window in minutes
 * @returns {number} Count of actions
 * @private
 */
function countRecentAuditActions(userEmail, action, minutesAgo) {
  try {
    const cache = CacheService.getUserCache();
    const cacheKey = `audit_count_${action}_${userEmail}`;
    const count = parseInt(cache.get(cacheKey) || '0');

    // Increment and store count
    cache.put(cacheKey, (count + 1).toString(), minutesAgo * 60);

    return count + 1;
  } catch (error) {
    console.error('Error counting recent actions:', error.message);
    return 0;
  }
}

/**
 * Sends security alert for suspicious activity
 * @param {Object} logEntry - The suspicious log entry
 * @private
 */
function alertOnSuspiciousActivity(logEntry) {
  const securityAdminEmail = PropertiesService.getScriptProperties().getProperty('SECURITY_ADMIN_EMAIL');

  // If no security admin configured, log but don't fail
  if (!securityAdminEmail) {
    console.warn('No SECURITY_ADMIN_EMAIL configured - cannot send alert');
    return;
  }

  const subject = `🚨 Security Alert: Suspicious Activity in Peer Evaluator System`;
  const body = `
Suspicious activity detected in the Peer Evaluator Form application.

=== ALERT DETAILS ===
Action: ${logEntry.action}
User: ${logEntry.user}
Timestamp: ${logEntry.timestamp}
Severity: ${logEntry.severity}
Session ID: ${logEntry.sessionId}

=== CONTEXT ===
${JSON.stringify(logEntry.details, null, 2)}

=== RECOMMENDED ACTIONS ===
1. Review the user's recent activity in the AuditLog sheet
2. Contact the user to verify the activity is legitimate
3. Consider temporarily restricting the user's access if needed
4. Review the full audit trail for other suspicious patterns

This is an automated security alert. Do not reply to this email.
  `;

  try {
    GmailApp.sendEmail(securityAdminEmail, subject, body);
    console.log('Security alert sent to:', securityAdminEmail);
  } catch (error) {
    console.error('Failed to send security alert email:', error.message);
  }
}

/**
 * Sets up the security admin email for alerts
 * Run this function once to configure security alerts
 * @param {string} adminEmail - Email address to receive security alerts
 */
function setupSecurityAlerts(adminEmail) {
  if (!adminEmail || !isValidEmail(adminEmail)) {
    throw new Error('Valid admin email address required');
  }

  PropertiesService.getScriptProperties().setProperty('SECURITY_ADMIN_EMAIL', adminEmail);

  console.log('Security alerts configured for:', adminEmail);
  auditLog(AUDIT_ACTIONS.ADMIN_OBSERVATION_ACCESS, {
    action: 'security_alerts_configured',
    adminEmail: adminEmail
  });
}

/**
 * Retrieves recent audit logs for a user
 * Useful for investigating suspicious activity
 * @param {string} userEmail - User email to retrieve logs for
 * @param {number} hours - Number of hours to look back (default 24)
 * @returns {Array<Object>} Array of audit log entries
 */
function getUserAuditLogs(userEmail, hours = 24) {
  try {
    const spreadsheet = openSpreadsheet();
    const auditSheet = getSheetByName(spreadsheet, 'AuditLog');

    if (!auditSheet || auditSheet.getLastRow() < 2) {
      return [];
    }

    const range = auditSheet.getRange(2, 1, auditSheet.getLastRow() - 1, 7);
    const values = range.getValues();

    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - hours);

    // Filter logs for the user within time window
    const userLogs = values
      .filter(row => {
        const timestamp = new Date(row[0]);
        const user = row[2];
        return user === userEmail && timestamp >= cutoffTime;
      })
      .map(row => ({
        timestamp: row[0],
        action: row[1],
        user: row[2],
        severity: row[3],
        sessionId: row[4],
        userAgent: row[5],
        details: row[6]
      }));

    return userLogs;
  } catch (error) {
    console.error('Error retrieving user audit logs:', error.message);
    return [];
  }
}

/**
 * Generates an audit report for administrative review
 * @param {number} days - Number of days to include in report
 * @returns {Object} Audit statistics and summary
 */
function generateAuditReport(days = 7) {
  try {
    const spreadsheet = openSpreadsheet();
    const auditSheet = getSheetByName(spreadsheet, 'AuditLog');

    if (!auditSheet || auditSheet.getLastRow() < 2) {
      return {
        totalEntries: 0,
        message: 'No audit data available'
      };
    }

    const range = auditSheet.getRange(2, 1, auditSheet.getLastRow() - 1, 7);
    const values = range.getValues();

    const cutoffTime = new Date();
    cutoffTime.setDate(cutoffTime.getDate() - days);

    const recentLogs = values.filter(row => new Date(row[0]) >= cutoffTime);

    // Calculate statistics
    const stats = {
      totalEntries: recentLogs.length,
      period: `Last ${days} days`,
      actionCounts: {},
      severityCounts: { HIGH: 0, MEDIUM: 0, LOW: 0 },
      topUsers: {},
      suspiciousActivityCount: 0
    };

    recentLogs.forEach(row => {
      const action = row[1];
      const severity = row[3];
      const user = row[2];

      // Count actions
      stats.actionCounts[action] = (stats.actionCounts[action] || 0) + 1;

      // Count severity
      if (severity in stats.severityCounts) {
        stats.severityCounts[severity]++;
      }

      // Count by user
      stats.topUsers[user] = (stats.topUsers[user] || 0) + 1;

      // Count suspicious activity
      if (action === AUDIT_ACTIONS.UNAUTHORIZED_ACCESS_ATTEMPT ||
          action === AUDIT_ACTIONS.RATE_LIMIT_EXCEEDED) {
        stats.suspiciousActivityCount++;
      }
    });

    // Sort top users
    stats.topUsers = Object.entries(stats.topUsers)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .reduce((obj, [key, val]) => ({ ...obj, [key]: val }), {});

    return stats;
  } catch (error) {
    console.error('Error generating audit report:', error.message);
    return {
      error: error.message
    };
  }
}
