/**
 * @OnlyCurrentDoc
 *
 * The above comment directs Apps Script to limit the scope of file
 * access for this add-on. It specifies that the add-on will only
 * attempt to read or modify the files in which it is used, and not
 * any other files in the user's Drive. This annotation is essential
 * for verification and publication of this add-on.
 */

/**
 * @file Code.js
 * @description This file contains the main functions for the Peer Evaluator Form Google Sheets Add-on.
 * It includes functions for the add-on's lifecycle (onOpen, onInstall), menu items, and core logic.
 * @license MIT
 * @version 1.0
 */

// Add-on Lifecycle Hooks
// ----------------------

/**
 * @description Creates the Add-on menu in the Google Sheet UI.
 * This function is automatically called when the user opens the spreadsheet.
 * @param {object} e - The event object.
 * @returns {void}
 */
function onOpen(e) {
  SpreadsheetApp.getUi()
    .createAddonMenu()
    .addItem('Start', 'showRubric')
    .addItem('Filter Observations', 'showFilterInterface')
    .addToUi();
}

/**
 * @description Runs when the add-on is installed.
 * This function is automatically called when the user installs the add-on.
 * It sets up the initial sheet structure and properties.
 * @param {object} e - The event object.
 * @returns {void}
 */
function onInstall(e) {
  // Set up the initial sheet structure and properties
  SheetService.setupInitialSheet();
  onOpen(e);
}

// Menu Functions
// --------------

/**
 * @description Displays the rubric in a sidebar.
 * This function is called when the user clicks the "Start" menu item.
 * @returns {void}
 */
function showRubric() {
  // Get the active user's email
  const userEmail = Session.getActiveUser().getEmail();

  // Check if the user is a reviewer
  if (UserService.isReviewer(userEmail)) {
    // If the user is a reviewer, show the rubric
    const html = HtmlService.createTemplateFromFile('rubric').evaluate();
    html.setTitle('Peer Evaluator Form');
    SpreadsheetApp.getUi().showSidebar(html);
  } else {
    // If the user is not a reviewer, show an error message
    const html = HtmlService.createHtmlOutputFromFile('error-page').setWidth(300).setHeight(150);
    SpreadsheetApp.getUi().showModalDialog(html, 'Access Denied');
  }
}

/**
 * @description Displays the filter interface in a sidebar.
 * This function is called when the user clicks the "Filter Observations" menu item.
 * @returns {void}
 */
function showFilterInterface() {
  const html = HtmlService.createTemplateFromFile('filter-interface').evaluate();
  html.setTitle('Filter Observations');
  SpreadsheetApp.getUi().showSidebar(html);
}

// Server-side functions for the Rubric
// ------------------------------------

/**
 * @description Gets the data for the rubric.
 * This includes the teachers, criteria, and other required data.
 * @returns {object} An object containing the data for the rubric.
 */
function getRubricData() {
  const userEmail = Session.getActiveUser().getEmail();
  const teachers = UserService.getTeachers();
  const criteria = SheetService.getCriteria();
  const isReviewer = UserService.isReviewer(userEmail);
  const isAdmin = UserService.isAdmin(userEmail);
  const isSuperAdmin = UserService.isSuperAdmin(userEmail);
  const isPrincipal = UserService.isPrincipal(userEmail);
  const reviewerName = UserService.getReviewerName(userEmail);

  return {
    teachers,
    criteria,
    isReviewer,
    isAdmin,
    isSuperAdmin,
    isPrincipal,
    reviewerName,
    userEmail,
  };
}

/**
 * @description Saves the observation data to the sheet.
 * @param {object} observationData - The data for the observation.
 * @returns {string} A success message.
 */
function saveObservation(observationData) {
  return ObservationService.saveObservation(observationData);
}

// Server-side functions for the Filter Interface
// ----------------------------------------------

/**
 * @description Gets the data for the filter interface.
 * This includes the teachers, reviewers, and observations.
 * @returns {object} An object containing the data for the filter interface.
 */
function getFilterData() {
  const userEmail = Session.getActiveUser().getEmail();
  const teachers = UserService.getTeachers();
  const reviewers = UserService.getReviewers();
  const observations = ObservationService.getAllObservations(userEmail); // Pass userEmail
  const isAdmin = UserService.isAdmin(userEmail);
  const isSuperAdmin = UserService.isSuperAdmin(userEmail);
  const isPrincipal = UserService.isPrincipal(userEmail);

  return {
    teachers,
    reviewers,
    observations,
    isAdmin,
    isSuperAdmin,
    isPrincipal,
    userEmail,
  };
}

/**
 * @description Gets the data for a single observation.
 * @param {string} observationId - The ID of the observation.
 * @returns {object} The data for the observation.
 */
function getObservationData(observationId) {
  return ObservationService.getObservationById(observationId);
}

/**
 * @description Updates the data for an observation.
 * @param {object} updatedData - The updated data for the observation.
 * @returns {string} A success message.
 */
function updateObservation(updatedData) {
  return ObservationService.updateObservation(updatedData);
}

/**
 * @description Deletes an observation from the sheet.
 * @param {string} observationId - The ID of the observation to delete.
 * @returns {string} A success message indicating the observation was deleted.
 */
function deleteObservation(observationId) {
  return ObservationService.deleteObservation(observationId);
}

/**
 * @description Finalizes an observation.
 * This function is called when the user clicks the "Finalize" button.
 * It creates a PDF of the observation and sends an email to the teacher.
 * @param {string} observationId - The ID of the observation to finalize.
 * @returns {string} A success message.
 */
function finalizeObservation(observationId) {
  // Create the PDF
  const pdfUrl = ObservationService.createObservationPdf(observationId);

  // Update the sheet with the PDF URL
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.observations);
  const data = sheet.getDataRange().getValues();
  const observationIdCol = Utils.getColumnIndex(sheet, COLUMN_NAMES.observationId);
  const pdfUrlCol = Utils.getColumnIndex(sheet, COLUMN_NAMES.pdfUrl);

  for (let i = 1; i < data.length; i++) {
    if (data[i][observationIdCol - 1] === observationId) {
      sheet.getRange(i + 1, pdfUrlCol).setValue(pdfUrl);
      break;
    }
  }

  // Send the email
  ObservationService.sendFinalizedEmail(observationId);

  return 'Observation finalized successfully.';
}

/**
 * @description This function is designed to be run on a time-based trigger (e.g., every hour).
 * It iterates through the observations in the "Observations" sheet, and for each observation
 * that is marked as "Complete" but does not yet have a PDF URL, it generates a PDF and
 * updates the sheet with the URL of the generated file.
 *
 * @returns {void}
 */
function processCompletedObservations() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.observations);
  const data = sheet.getDataRange().getValues();
  const header = data[0];
  const statusCol = header.indexOf(COLUMN_NAMES.status) + 1;
  const pdfUrlCol = header.indexOf(COLUMN_NAMES.pdfUrl) + 1;
  const observationIdCol = header.indexOf(COLUMN_NAMES.observationId) + 1;

  if (statusCol === 0 || pdfUrlCol === 0 || observationIdCol === 0) {
    console.error('One or more required columns are missing in the Observations sheet.');
    return;
  }

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    try {
      if (row[statusCol - 1] === 'Complete' && !row[pdfUrlCol - 1]) {
        const pdfUrl = ObservationService.createObservationPdf(
          row[observationIdCol - 1]
        );
        sheet.getRange(i + 1, pdfUrlCol).setValue(pdfUrl);
        CacheManager.clear('all_observations'); // Clear cache after updating sheet
      }
    } catch (e) {
      console.error(
        `Error processing observation ID ${
          row[observationIdCol - 1]
        }: ${e.toString()}`
      );
    }
  }
}

/**
 * @description Includes the content of another file.
 * This is a helper function to allow for including HTML files within other HTML files.
 * @param {string} filename - The name of the file to include.
 * @returns {string} The content of the file.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Creates a filter selection interface for special access users
 * @param {Object} userContext - The user context object
 * @param {string} requestId - The request ID for tracking
 * @returns {HtmlOutput} The HTML output for the filter interface
 */
function createFilterSelectionInterface(userContext, requestId) {
  const template = HtmlService.createTemplateFromFile('filter-interface');
  template.userContext = userContext;
  template.availableRoles = UserService.getAvailableRoles();
  return template.evaluate()
      .setTitle('Select Rubric View')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Gets all domains data for a specific role, year, and view mode
 * @param {string} role - The user role
 * @param {number} year - The user year
 * @param {string} viewMode - The view mode (full or assigned)
 * @param {Array} assignedSubdomains - Array of assigned subdomains
 * @returns {Object} The rubric data with domains
 */
function getAllDomainsData(role, year, viewMode, assignedSubdomains) {
  const roleSheetData = SheetService.getRoleSheetData(role);
  if (!roleSheetData || roleSheetData.validation.isErrorData) {
    return { title: 'Error', subtitle: 'Could not load rubric data.', domains: [] };
  }

  const domains = [];
  let currentDomain = null;

  roleSheetData.data.forEach((row, index) => {
    const componentTitle = row[0] ? row[0].toString().trim() : '';
    const componentIdMatch = componentTitle.match(VALIDATION_PATTERNS.COMPONENT_ID);

    if (componentIdMatch) {
      if (!currentDomain) {
        currentDomain = { name: `Domain ${componentIdMatch[0][0]}`, components: [] };
        domains.push(currentDomain);
      }
      if (currentDomain.name[7] !== componentIdMatch[0][0]) {
        currentDomain = { name: `Domain ${componentIdMatch[0][0]}`, components: [] };
        domains.push(currentDomain);
      }

      currentDomain.components.push({
        componentId: componentIdMatch[0],
        title: componentTitle,
        developing: row[1] || '',
        basic: row[2] || '',
        proficient: row[3] || '',
        distinguished: row[4] || '',
        bestPractices: [], // Placeholder
        isAssigned: UserService.isComponentAssigned(componentIdMatch[0], assignedSubdomains)
      });
    }
  });

  return {
    title: roleSheetData.title,
    subtitle: roleSheetData.subtitle,
    domains: domains
  };
}

/**
 * Wrapper function for Utils.generateResponseMetadata
 */
function generateResponseMetadata(userContext, requestId, debugMode) {
  return Utils.generateResponseMetadata(userContext, requestId, debugMode);
}

/**
 * Generates a page title based on the user's role
 * @param {string} role - The user's role
 * @returns {string} The title for the HTML page
 */
function getPageTitle(role) {
  return `Danielson Framework - ${role}`;
}

/**
 * Wrapper function for Utils.addCacheBustingHeaders
 */
function addCacheBustingHeaders(htmlOutput, responseMetadata) {
  return Utils.addCacheBustingHeaders(htmlOutput, responseMetadata);
}

/**
 * Wrapper function for Utils.logPerformanceMetrics
 */
function logPerformanceMetrics(operation, executionTime, metrics) {
  return Utils.logPerformanceMetrics(operation, executionTime, metrics);
}

/**
 * Wrapper function for Utils.formatErrorMessage
 */
function formatErrorMessage(error, context) {
  return Utils.formatErrorMessage(error, context);
}

/**
 * Creates an enhanced error page with debugging information
 * @param {Error} error - The error object
 * @param {string} requestId - The unique ID for the request
 * @param {string} userEmail - The user's email
 * @param {string} userAgent - The user agent string
 * @returns {HtmlOutput} The HTML output for the error page
 */
function createEnhancedErrorPage(error, requestId, userEmail, userAgent) {
  const template = HtmlService.createTemplateFromFile('error-page');
  template.error = {
    message: error.message,
    requestId: requestId,
    timestamp: new Date().toISOString(),
    version: SYSTEM_INFO.VERSION,
    userEmail: userEmail,
    stack: error.stack
  };
  return template.evaluate().setTitle('Error');
}

/**
 * Wrapper function for SessionManager.cleanupExpiredSessions
 */
function cleanupExpiredSessions() {
  return SessionManager.cleanupExpiredSessions();
}

/**
 * Wrapper function for CacheManager.forceCleanAllCaches
 */
function forceCleanAllCaches() {
  return CacheManager.forceCleanAllCaches();
}

/**
 * Main entry point for the Google Apps Script web application
 * Handles HTTP GET requests and returns appropriate HTML content
 * @param {Object} e - The event object containing request parameters
 * @returns {HtmlOutput} The HTML output to be displayed
 */
function doGet(e) {
  const startTime = Date.now();
  const requestId = Utils.generateUniqueId('request');
  
  try {
    // Clean up expired sessions periodically (10% chance)
    if (Math.random() < 0.1) {
      cleanupExpiredSessions();
    }

    // Parse URL parameters for cache control
    const params = e.parameter || {};

    const forceRefresh = params.refresh === 'true' || params.nocache === 'true';
    const debugMode = params.debug === 'true';

    Utils.debugLog('Web app request received', { requestId, forceRefresh, debugMode });

    if (forceRefresh) {
      forceCleanAllCaches();
    }

    const userContext = UserService.createUserContext();

    // If the user has special access and no specific staff member is being targeted,
    // show the filter interface instead of a rubric.
    if (userContext.hasSpecialAccess && !params.filterStaff) {
        Utils.debugLog('Special access user detected - showing filter interface', { role: userContext.role, requestId });
        return createFilterSelectionInterface(userContext, requestId);
    }
    
    // For users who land here directly (not through the filter UI) or for non-special roles
    const rubricData = getAllDomainsData(
      userContext.role, 
      userContext.year, 
      userContext.viewMode, 
      userContext.assignedSubdomains
    );
    
    // Attach the full user context to the data payload for the template
    rubricData.userContext = userContext;

    // Generate response metadata for headers
    const responseMetadata = generateResponseMetadata(userContext, requestId, debugMode);
    
    // Create and configure the HTML template
    const htmlTemplate = HtmlService.createTemplateFromFile('rubric.html'); // This is now a fallback view
    htmlTemplate.data = rubricData;
    
    // Generate the HTML output
    const htmlOutput = htmlTemplate.evaluate()
      .setTitle(getPageTitle(userContext.role))
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
      
    addCacheBustingHeaders(htmlOutput, responseMetadata);

    const executionTime = Date.now() - startTime;
    logPerformanceMetrics('doGet', executionTime, { role: userContext.role, requestId });
    
    return htmlOutput;
    
  } catch (error) {
    console.error('Fatal error in doGet:', Utils.formatErrorMessage(error, 'doGet'));
    return createEnhancedErrorPage(error, requestId, null, e.userAgent);
  }
}