/**
 * @OnlyCurrentDoc
 */

/**
 * @file Code.js
 * @description Main functions for the Peer Evaluator Form web app.
 * @license MIT
 * @version 1.1
 */

// Add-on Lifecycle Hooks (Legacy - for potential spreadsheet-bound execution)
function onOpen(e) {
  SpreadsheetApp.getUi()
    .createAddonMenu()
    .addItem(UI_STRINGS.MENU_START, 'showRubric')
    .addItem(UI_STRINGS.MENU_FILTER_OBSERVATIONS, 'showFilterInterface')
    .addToUi();
}

function onInstall(e) {
  SheetService.setupInitialSheet();
  onOpen(e);
}

// Menu Functions (Legacy)
function showRubric() {
  const userEmail = Session.getActiveUser().getEmail();
  if (UserService.isReviewer(userEmail)) {
    const html = HtmlService.createTemplateFromFile(UI_STRINGS.HTML_TEMPLATE_RUBRIC).evaluate();
    html.setTitle(UI_STRINGS.PAGE_TITLE_RUBRIC);
    SpreadsheetApp.getUi().showSidebar(html);
  } else {
    const html = HtmlService.createHtmlOutputFromFile(UI_STRINGS.HTML_TEMPLATE_ERROR).setWidth(300).setHeight(150);
    SpreadsheetApp.getUi().showModalDialog(html, UI_STRINGS.ERROR_ACCESS_DENIED);
  }
}

function showFilterInterface() {
  const html = HtmlService.createTemplateFromFile(UI_STRINGS.HTML_TEMPLATE_FILTER).evaluate();
  html.setTitle(UI_STRINGS.PAGE_TITLE_FILTER);
  SpreadsheetApp.getUi().showSidebar(html);
}

// Server-side functions called from client-side JavaScript
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

function saveObservation(observationData) {
  return ObservationService.saveObservation(observationData);
}

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

function getObservationData(observationId) {
  return ObservationService.getObservationById(observationId);
}

function updateObservation(updatedData) {
  return ObservationService.updateObservation(updatedData);
}

function deleteObservation(observationId) {
  return ObservationService.deleteObservation(observationId);
}

function finalizeObservation(observationId) {
  const pdfUrl = ObservationService.createObservationPdf(observationId);
  ObservationService.updateObservationPdfUrl(observationId, pdfUrl); // Refactored
  ObservationService.sendFinalizedEmail(observationId);
  return UI_STRINGS.SUCCESS_OBSERVATION_FINALIZED;
}

// Time-based trigger function
function processCompletedObservations() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.observations);
  const data = sheet.getDataRange().getValues();
  const header = data[0];
  const statusCol = header.indexOf(COLUMN_NAMES.status);
  const pdfUrlCol = header.indexOf(COLUMN_NAMES.pdfUrl);
  const observationIdCol = header.indexOf(COLUMN_NAMES.observationId);

  if (statusCol === -1 || pdfUrlCol === -1 || observationIdCol === -1) {
    console.error(UI_STRINGS.LOG_ERROR_MISSING_COLUMNS);
    return;
  }

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    try {
      if (row[statusCol] === 'Complete' && !row[pdfUrlCol]) {
        const observationId = row[observationIdCol];
        const pdfUrl = ObservationService.createObservationPdf(observationId);
        sheet.getRange(i + 1, pdfUrlCol + 1).setValue(pdfUrl);
        CacheManager.clear('all_observations');
      }
    } catch (e) {
      console.error(`Error processing observation ID ${row[observationIdCol]}: ${e.toString()}`);
    }
  }
}

// HTML include helper
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// UI Generation
function createFilterSelectionInterface(userContext, requestId) {
  const template = HtmlService.createTemplateFromFile(UI_STRINGS.HTML_TEMPLATE_FILTER);
  template.userContext = userContext;
  template.availableRoles = UserService.getAvailableRoles();
  return template.evaluate()
      .setTitle(UI_STRINGS.PAGE_TITLE_SELECT_VIEW)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

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

// Wrapper Functions
function generateResponseMetadata(userContext, requestId, debugMode) {
  return Utils.generateResponseMetadata(userContext, requestId, debugMode);
}

function getPageTitle(role) {
  return `Danielson Framework - ${role}`; // Could be a constant
}

function addCacheBustingHeaders(htmlOutput, responseMetadata) {
  return Utils.addCacheBustingHeaders(htmlOutput, responseMetadata);
}

function logPerformanceMetrics(operation, executionTime, metrics) {
  return Utils.logPerformanceMetrics(operation, executionTime, metrics);
}

function formatErrorMessage(error, context) {
  return Utils.formatErrorMessage(error, context);
}

function createEnhancedErrorPage(error, requestId, userEmail, userAgent) {
  const template = HtmlService.createTemplateFromFile(UI_STRINGS.HTML_TEMPLATE_ERROR);
  template.error = {
    message: error.message,
    requestId: requestId,
    timestamp: new Date().toISOString(),
    version: SYSTEM_INFO.VERSION,
    userEmail: userEmail,
    stack: error.stack
  };
  return template.evaluate().setTitle(UI_STRINGS.PAGE_TITLE_ERROR);
}

function cleanupExpiredSessions() {
  return SessionManager.cleanupExpiredSessions();
}

function forceCleanAllCaches() {
  return CacheManager.forceCleanAllCaches();
}

// Main Web App Entry Point
function doGet(e) {
  const startTime = Date.now();
  const requestId = Utils.generateUniqueId(UI_STRINGS.REQUEST_ID_PREFIX);
  
  try {
    if (Math.random() < 0.1) {
      cleanupExpiredSessions();
    }

    const params = e.parameter || {};
    const forceRefresh = params.refresh === 'true' || params.nocache === 'true';
    const debugMode = params.debug === 'true';

    Utils.debugLog('Web app request received', { requestId, forceRefresh, debugMode });

    if (forceRefresh) {
      forceCleanAllCaches();
    }

    const userContext = UserService.createUserContext();

    if (userContext.hasSpecialAccess && !params.filterStaff) {
        Utils.debugLog(UI_STRINGS.LOG_INFO_SPECIAL_ACCESS_USER, { role: userContext.role, requestId });
        return createFilterSelectionInterface(userContext, requestId);
    }
    
    const rubricData = getAllDomainsData(
      userContext.role, 
      userContext.year, 
      userContext.viewMode, 
      userContext.assignedSubdomains
    );
    
    rubricData.userContext = userContext;

    const responseMetadata = generateResponseMetadata(userContext, requestId, debugMode);
    
    const htmlTemplate = HtmlService.createTemplateFromFile(UI_STRINGS.HTML_TEMPLATE_RUBRIC);
    htmlTemplate.data = rubricData;
    
    const htmlOutput = htmlTemplate.evaluate()
      .setTitle(getPageTitle(userContext.role))
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
      
    addCacheBustingHeaders(htmlOutput, responseMetadata);

    const executionTime = Date.now() - startTime;
    logPerformanceMetrics(UI_STRINGS.LOG_CONTEXT_DOGET, executionTime, { role: userContext.role, requestId });
    
    return htmlOutput;
    
  } catch (error) {
    console.error(UI_STRINGS.LOG_ERROR_FATAL_DOGET, Utils.formatErrorMessage(error, UI_STRINGS.LOG_CONTEXT_DOGET));
    return createEnhancedErrorPage(error, requestId, null, e.userAgent);
  }
}