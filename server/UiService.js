/**
 * UiService.js
 * Handles server-side logic for generating UI components and pages for the
 * Danielson Framework Multi-Role System.
 */

const UiService = (function() {
  'use strict';

  /**
   * Creates the filter selection interface for special access roles.
   * @param {Object} userContext - The context of the current user.
   * @param {string} requestId - The unique ID for the current request.
   * @returns {HtmlOutput} The HTML output for the filter interface.
   */
  function createFilterSelectionInterface(userContext, requestId) {
    try {
      const htmlTemplate = HtmlService.createTemplateFromFile(TEMPLATE_PATHS.PEER_EVALUATOR_FILTER);
      htmlTemplate.userContext = userContext;
      htmlTemplate.userContext.probationaryYearValue = PROBATIONARY_OBSERVATION_YEAR;
      htmlTemplate.availableRoles = AVAILABLE_ROLES;
      htmlTemplate.availableYears = OBSERVATION_YEARS;
      htmlTemplate.requestId = requestId;
      htmlTemplate.scriptEditorSettings = SCRIPT_EDITOR_SETTINGS;

      const htmlOutput = htmlTemplate.evaluate()
        .setTitle(`${userContext.role} - Filter View`)
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

      const metadata = generateResponseMetadata(userContext, requestId, userContext.debugMode);
      addCacheBustingHeaders(htmlOutput, metadata);

      return htmlOutput;
    } catch (error) {
      console.error('Error creating filter selection interface:', error);
      return createEnhancedErrorPage(error, requestId, userContext);
    }
  }

  /**
   * Checks if any filters are active in the URL parameters.
   * @param {Object} params - The URL parameters from the event object.
   * @returns {boolean} True if any filter parameter is present.
   */
  function hasActiveFilters(params) {
    return !!(params.filterRole || params.filterYear || params.filterStaff || (params.filterType && params.filterType !== 'all'));
  }

  /**
   * Creates a synthetic user context for special role filtering scenarios.
   * @param {string} effectiveRole - The role to view as.
   * @param {string|number} effectiveYear - The year to view as.
   * @param {Object} originalContext - The original user's context.
   * @param {Object} filterDetails - Additional details about the filter.
   * @returns {Object} A new user context object.
   */
  function createSyntheticUserContext(effectiveRole, effectiveYear, originalContext, filterDetails) {
    const syntheticContext = JSON.parse(JSON.stringify(originalContext)); // Deep copy

    syntheticContext.role = effectiveRole;
    syntheticContext.year = effectiveYear;
    syntheticContext.isSynthetic = true;
    syntheticContext.isFiltered = true;
    syntheticContext.filterInfo = {
      viewingAs: `Role: ${effectiveRole}`,
      viewingRole: effectiveRole,
      viewingYear: effectiveYear,
      requestedBy: originalContext.role,
      ...filterDetails
    };

    if (filterDetails.showFullRubric) {
      syntheticContext.viewMode = VIEW_MODES.FULL;
      syntheticContext.assignedSubdomains = null;
    } else if (filterDetails.showAssignedAreas) {
      syntheticContext.viewMode = VIEW_MODES.ASSIGNED;
      syntheticContext.assignedSubdomains = getAssignedSubdomainsForRoleYear(effectiveRole, effectiveYear);
    }

    return syntheticContext;
  }

  /**
   * Generates a page title based on the user's role.
   * @param {string} role - The user's role.
   * @returns {string} The title for the HTML page.
   */
  function getPageTitle(role) {
    return `${role} - Danielson Framework Rubric`;
  }

  /**
   * Creates an enhanced error page with debugging information.
   * @param {Error} error - The error object.
   * @param {string} requestId - The unique ID for the request.
   * @param {Object} userContext - The user context at the time of the error.
   * @param {string} userAgent - The user agent string.
   * @returns {HtmlOutput} The HTML output for the error page.
   */
  function createEnhancedErrorPage(error, requestId, userContext, userAgent = 'Unknown') {
    try {
      const htmlTemplate = HtmlService.createTemplateFromFile(TEMPLATE_PATHS.SHARED_ERROR);
      htmlTemplate.error = {
        message: error.message,
        stack: error.stack,
        requestId: requestId,
        timestamp: new Date().toISOString(),
        version: SYSTEM_INFO.VERSION,
        userEmail: userContext ? userContext.email : (Session.getActiveUser() ? Session.getActiveUser().getEmail() : 'N/A'),
        userAgent: userAgent
      };

      const htmlOutput = htmlTemplate.evaluate()
        .setTitle('Application Error')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

      const metadata = generateResponseMetadata(userContext || {}, requestId);
      addCacheBustingHeaders(htmlOutput, metadata);

      return htmlOutput;
    } catch (e) {
      console.error('FATAL: Could not create error page.', e);
      return HtmlService.createHtmlOutput(
        `<h1>An unexpected error occurred</h1><p>Additionally, the error page itself failed to render.</p><pre>${e.stack}</pre><pre>${error.stack}</pre>`
      );
    }
  }


  // Public API
  return {
    createFilterSelectionInterface: createFilterSelectionInterface,
    createEnhancedErrorPage: createEnhancedErrorPage,
    getPageTitle: getPageTitle,
    hasActiveFilters: hasActiveFilters,
    createSyntheticUserContext: createSyntheticUserContext
  };
})();
