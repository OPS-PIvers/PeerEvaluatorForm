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