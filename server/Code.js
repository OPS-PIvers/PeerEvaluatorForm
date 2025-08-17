/**
 * Code.js - Main Orchestrator (Clean Production Version)
 * Google Apps Script Web App for Danielson Framework - Multi-Role Rubric System
 * 
 * This file orchestrates the modular services and maintains backward compatibility
 * while adding support for multiple roles and automatic cache management.
 */


/**
 * =================================================================
 * MAIN WEB APP ENTRY POINT (doGet)
 * =================================================================
 */

/**
 * Enhanced doGet function with proactive role change detection
 */
function doGet(e) {
  const startTime = Date.now();
  const requestId = generateUniqueId('request');
  
  try {
    // Ensure the Observation_Data sheet has the correct columns before any other operation.
    setupObservationSheet();

    // Clean up expired sessions periodically (10% chance)
    if (Math.random() < 0.1) {
      cleanupExpiredSessions();
    }

    // Parse URL parameters for cache control
    const params = e.parameter || {};

    const forceRefresh = params.refresh === 'true' || params.nocache === 'true';
    const debugMode = params.debug === 'true';

    debugLog('Web app request received', { requestId, forceRefresh, debugMode });

    if (forceRefresh) {
      forceCleanAllCaches();
    }

    let userContext = createUserContext();

    // Handle special role filtering
    if (userContext.hasSpecialAccess && UiService.hasActiveFilters(params)) {
      const effectiveRole = params.filterRole || userContext.role;
      const effectiveYear = params.filterYear || userContext.year;
      const filterDetails = {
        filterType: params.filterType || 'staff',
        filterStaff: params.filterStaff || null,
        showFullRubric: params.view === 'full',
        showAssignedAreas: params.view === 'assigned'
      };

      userContext = UiService.createSyntheticUserContext(effectiveRole, effectiveYear, userContext, filterDetails);
    }

    // If the user has special access and no specific staff member is being targeted,
    // show the filter interface instead of a rubric.
    if (userContext.hasSpecialAccess && !params.filterStaff) {
        debugLog('Special access user detected - showing filter interface', { role: userContext.role, requestId });
        return UiService.createFilterSelectionInterface(userContext, requestId);
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
    
    // Attach responseMetadata to userContext for template access
    userContext.responseMetadata = responseMetadata;
    userContext.cacheVersion = responseMetadata.cacheVersion;
    userContext.requestId = responseMetadata.requestId;
    
    // Create and configure the HTML template
    const htmlTemplate = HtmlService.createTemplateFromFile(TEMPLATE_PATHS.STAFF_RUBRIC); // This is now a fallback view
    htmlTemplate.data = rubricData;
    
    // Generate the HTML output
    const htmlOutput = htmlTemplate.evaluate()
      .setTitle(UiService.getPageTitle(userContext.role))
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
      
    addCacheBustingHeaders(htmlOutput, responseMetadata);

    const executionTime = Date.now() - startTime;
    logPerformanceMetrics('doGet', executionTime, { role: userContext.role, requestId });
    
    return htmlOutput;
    
  } catch (error) {
    console.error('Fatal error in doGet:', formatErrorMessage(error, 'doGet'));
    return UiService.createEnhancedErrorPage(error, requestId, null, e.userAgent);
  }
}


/**
 * =================================================================
 * SERVER-SIDE FUNCTIONS CALLABLE FROM CLIENT (google.script.run)
 * =================================================================
 */

/**
 * Main data loading function for the filter interface.
 * This function orchestrates what data or action to return based on user filters.
 * @param {Object} filterParams Parameters from the client (e.g., {staff: 'email@...'}).
 * @returns {Object} A response object for the client.
 */
function loadRubricData(filterParams) {
    try {
        debugLog('Loading rubric data via AJAX', { filterParams });
        const userContext = createUserContext();

        // Handle Peer Evaluator selecting a staff member to observe
        if (userContext.role === SPECIAL_ROLES.PEER_EVALUATOR && filterParams.staff) {
            const staffUser = getUserByEmail(filterParams.staff);
            if (!staffUser) return { success: false, error: `Staff not found: ${filterParams.staff}` };
            
            return {
                success: true,
                action: 'show_observation_selector',
                observedEmail: staffUser.email,
                observedName: staffUser.name
            };
        }
        
        // Handle loading current user's own rubric
        if (filterParams.myOwnView) {
            const rubricData = getAllDomainsData(userContext.role, userContext.year, 'assigned', userContext.assignedSubdomains);
            rubricData.userContext = userContext; // Attach user context
            return { success: true, rubricData: rubricData };
        }

        // Default behavior (could be expanded for other roles like Admin)
        return { success: false, error: 'Invalid filter request.' };

    } catch (error) {
        console.error('Error in loadRubricData:', error);
        return { success: false, error: error.message };
    }
}

// loadRubricDataWithViewMode function removed - using client-side toggle approach instead


/**
 * Gets the list of staff members for the filter dropdowns.
 * @param {string} role The role to filter by.
 * @param {string} year The year to filter by.
 * @returns {Object} A response object with success status and the staff list.
 */
function getStaffListForDropdown(role, year) {
  try {
    const staffList = getStaffByRoleAndYear(role, year);
    return { success: true, staff: staffList };
  } catch (error) {
    console.error('Error in getStaffListForDropdown:', error);
    return { success: false, error: error.message, staff: [] };
  }
}


/**
 * Gets the list of observations for a user.
 * @param {string} observedEmail The email of the staff member.
 * @returns {Object} A response object with success status and observations list.
 */
function getObservationOptions(observedEmail) {
    try {
        const userContext = createUserContext();
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR) {
            return { success: false, error: 'Permission denied.' };
        }
        const observations = getObservationsForUser(observedEmail);
        return { success: true, observations: observations };
    } catch (error) {
        console.error('Error in getObservationOptions:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Creates a new observation draft and returns the data needed to render the editor.
 * @param {string} observedEmail The email of the staff member to be observed.
 * @returns {Object} A response object containing the new observation and the rubric data.
 */
function createNewObservationForPeerEvaluator(observedEmail) {
  try {
    const userContext = createUserContext();
    if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR) {
      return { success: false, error: ERROR_MESSAGES.PERMISSION_DENIED };
    }

    const newObservation = createNewObservation(userContext.email, observedEmail);
    if (!newObservation) {
      return { success: false, error: 'Failed to create a new observation record.' };
    }
    
    // Get assigned subdomains for the observed user to enhance the rubric
    const assignedSubdomains = getAssignedSubdomainsForRoleYear(newObservation.observedRole, newObservation.observedYear);

    // Get the FULL rubric data, but enhance it with assignment flags so the UI can toggle views
    const rubricData = getAllDomainsData(
      newObservation.observedRole,
      newObservation.observedYear,
      'full',
      assignedSubdomains
    );
    
    // Create a special context for this observation session
    const evaluatorContext = createFilteredUserContext(observedEmail, userContext.role);
    rubricData.userContext = evaluatorContext;

    return { 
        success: true, 
        observation: newObservation,
        rubricData: rubricData
    };

  } catch (error) {
    console.error('Error in createNewObservationForPeerEvaluator:', error);
    return { success: false, error: 'An unexpected error occurred: ' + error.message };
  }
}

/**
 * Loads an existing observation draft for editing.
 * @param {string} observationId The ID of the observation to load.
 * @returns {Object} A response object with the observation and rubric data.
 */
function loadObservationForEditing(observationId) {
    try {
        const userContext = createUserContext();
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR) {
            return { success: false, error: ERROR_MESSAGES.PERMISSION_DENIED };
        }

        const observation = getObservationById(observationId);
        if (!observation) {
            return { success: false, error: 'Observation not found.' };
        }
        if (observation.observerEmail !== userContext.email) {
            return { success: false, error: 'You do not have permission to edit this observation.' };
        }
        
        const assignedSubdomains = getAssignedSubdomainsForRoleYear(observation.observedRole, observation.observedYear);
        const rubricData = getAllDomainsData(observation.observedRole, observation.observedYear, 'full', assignedSubdomains);
        
        const evaluatorContext = createFilteredUserContext(observation.observedEmail, userContext.role);
        rubricData.userContext = evaluatorContext;

        return { success: true, observation: observation, rubricData: rubricData };

    } catch (error) {
        console.error('Error in loadObservationForEditing:', error);
        return { success: false, error: 'An unexpected error occurred: ' + error.message };
    }
}

/**
 * Deletes an observation draft.
 * @param {string} observationId The ID of the observation to delete.
 * @returns {Object} A response object indicating success or failure.
 */
function deleteObservation(observationId) {
    try {
        setupObservationSheet(); // Ensure the sheet is ready
        const userContext = createUserContext();
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR) {
            return { success: false, error: ERROR_MESSAGES.PERMISSION_DENIED };
        }
        return deleteObservationRecord(observationId, userContext.email);
    } catch (error) {
        console.error('Error in deleteObservation wrapper:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Helper function to find the row number for a given observation ID in the sheet.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet The observation data sheet.
 * @param {string} observationId The ID of the observation to find.
 * @returns {number} The 1-based row number, or -1 if not found.
 */
function findObservationRow(sheet, observationId) {
    const idColumn = 1; // Assuming observationId is in column A
    const ids = sheet.getRange(2, idColumn, sheet.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
        if (ids[i][0] === observationId) {
            return i + 2; // +2 because data starts at row 2 and i is 0-indexed
        }
    }
    return -1;
}

/**
 * Saves a look-for selection for an observation component.
 * @param {string} observationId The ID of the observation to update.
 * @param {string} key The key for the look-for category.
 * @param {string} lookForText The text content of the look-for.
 * @param {boolean} isChecked The state of the checkbox.
 * @returns {Object} A response object with success status.
 */
function saveLookForSelection(observationId, componentId, lookForText, isChecked) {
    try {
        const userContext = createUserContext();
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR) {
            return { success: false, error: ERROR_MESSAGES.PERMISSION_DENIED };
        }
        
        // Call the ObservationService implementation
        return _saveLookForSelection(observationId, componentId, lookForText, isChecked);
    } catch (error) {
        console.error('Error in saveLookForSelection wrapper:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Saves a proficiency level selection for an observation component.
 * @param {string} observationId The ID of the observation to update.
 * @param {string} componentId The rubric component ID.
 * @param {string} proficiency The selected proficiency level.
 * @returns {Object} A response object with success status.
 */
function saveProficiencySelection(observationId, componentId, proficiency) {
    try {
        const userContext = createUserContext();
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR) {
            return { success: false, error: ERROR_MESSAGES.PERMISSION_DENIED };
        }
        
        // Call the ObservationService implementation
        return _saveProficiencySelection(observationId, componentId, proficiency);
    } catch (error) {
        console.error('Error in saveProficiencySelection wrapper:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Saves observation notes for a specific component.
 * @param {string} observationId The ID of the observation to update.
 * @param {string} componentId The ID of the component.
 * @param {string} notesContent The HTML content of the notes.
 * @returns {Object} A response object with success status.
 */
function saveObservationNotes(observationId, componentId, notesContent) {
    try {
        const userContext = createUserContext();
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR) {
            return { success: false, error: ERROR_MESSAGES.PERMISSION_DENIED };
        }
        
        // Call the ObservationService implementation
        return _saveObservationNotes(observationId, componentId, notesContent);
    } catch (error) {
        console.error('Error in saveObservationNotes wrapper:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Updates the script content for an observation.
 * @param {string} observationId The ID of the observation to update.
 * @param {Object} scriptContent The Quill Delta object representing the script content.
 * @returns {Object} A response object with success status.
 */
function updateObservationScript(observationId, scriptContent) {
    try {
        const userContext = createUserContext();
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR) {
            return { success: false, error: ERROR_MESSAGES.PERMISSION_DENIED };
        }

        const observation = getObservationById(observationId);
        if (!observation) {
            return { success: false, error: 'Observation not found.' };
        }

        // Add or update the scriptContent field
        observation.scriptContent = scriptContent;

        // Persist the changes
        updateObservationInSheet(observation);

        return { success: true };
    } catch (error) {
        console.error('Error updating script content:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Retrieves the script content for an observation.
 * @param {string} observationId The ID of the observation.
 * @returns {Object|null} The Quill Delta object or null if not found.
 */
function getObservationScript(observationId) {
    try {
        const userContext = createUserContext();
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR) {
            return null; // Return null instead of error object for consistency
        }

        const observation = getObservationById(observationId);
        // Return the scriptContent if it exists, otherwise return null
        return observation ? (observation.scriptContent || null) : null;
    } catch (error) {
        console.error('Error getting script content:', error);
        return null; // Return null on error to prevent client-side issues
    }
}

/**
 * Saves component tags for a specific observation.
 * Component tags map script content sections to rubric components.
 * @param {string} observationId The ID of the observation.
 * @param {Object} componentTags The component tags mapping.
 * @returns {Object} A response object indicating success or failure.
 */
function saveComponentTags(observationId, componentTags) {
    try {
        setupObservationSheet();
        const userContext = createUserContext();
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR) {
            return { success: false, error: ERROR_MESSAGES.PERMISSION_DENIED };
        }

        const observation = getObservationById(observationId);
        if (!observation) {
            return { success: false, error: 'Observation not found.' };
        }

        if (observation.observerEmail !== userContext.email) {
            return { success: false, error: 'Permission denied. You did not create this observation.' };
        }

        // Add or update the componentTags field
        observation.componentTags = componentTags || {};

        const result = updateObservationInSheet(observation);
        if (result.success) {
            debugLog('Component tags updated', { observationId, tagCount: Object.keys(componentTags).length });
        }
        return result;

    } catch (error) {
        console.error('Error saving component tags:', error);
        return { success: false, error: 'An unexpected error occurred while saving component tags.' };
    }
}

/**
 * Retrieves component tags for a specific observation.
 * @param {string} observationId The ID of the observation.
 * @returns {Object|null} The component tags mapping, or null if not found.
 */
function getComponentTags(observationId) {
    try {
        setupObservationSheet();
        const userContext = createUserContext();
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR) {
            return {};
        }

        const observation = getObservationById(observationId);
        if (!observation) {
            return {};
        }

        // Check permissions - only the observer can access tags
        if (observation.observerEmail !== userContext.email) {
            return {};
        }

        // Return the componentTags if they exist, otherwise return empty object
        return observation.componentTags || {};
    } catch (error) {
        console.error('Error getting component tags:', error);
        return {}; // Return empty object on error to prevent client-side issues
    }
}

/**
 * Finalizes an observation draft.
 * @param {string} observationId The ID of the observation to finalize.
 * @returns {Object} A response object indicating success or failure.
 */
function finalizeObservation(observationId) {
    try {
        const userContext = createUserContext();
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR) {
            return { success: false, error: ERROR_MESSAGES.PERMISSION_DENIED };
        }

        const statusUpdateResult = updateObservationStatus(observationId, OBSERVATION_STATUS.FINALIZED, userContext.email);
        if (!statusUpdateResult.success) {
            return statusUpdateResult;
        }

        // Generate script PDF first if script content exists
        let scriptPdfResult = null;
        const observation = getObservationById(observationId);
        if (observation && observation.scriptContent) {
            debugLog('Generating script PDF during finalization', { observationId });
            scriptPdfResult = generateScriptPDF(observationId);
            
            if (scriptPdfResult.success) {
                debugLog('Script PDF generated successfully during finalization', { 
                    observationId, 
                    scriptPdfUrl: scriptPdfResult.pdfUrl 
                });
            } else {
                debugLog('Script PDF generation failed during finalization', { 
                    observationId, 
                    error: scriptPdfResult.error 
                });
                // Continue with main PDF even if script PDF fails
            }
        }

        const pdfProcessingResult = PdfService.processPdfForFinalization(observationId, userContext);

        const result = {
            success: true, // Maintain original behavior
            observationId: observationId,
            pdfStatus: pdfProcessingResult.pdfStatus,
        };

        if (!pdfProcessingResult.success) {
            result.pdfError = pdfProcessingResult.pdfError;
        }

        // Add script PDF info to result if generated
        if (scriptPdfResult) {
            result.scriptPdfStatus = scriptPdfResult.success ? 'generated' : 'failed';
            if (scriptPdfResult.success) {
                result.scriptPdfUrl = scriptPdfResult.pdfUrl;
            } else {
                result.scriptPdfError = scriptPdfResult.error;
            }
        }

        return result;

    } catch (error) {
        console.error('Error in finalizeObservation wrapper:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Deletes a finalized observation. This is a permanent action.
 * @param {string} observationId The ID of the observation to delete.
 * @returns {Object} A response object indicating success or failure.
 */
function deleteFinalizedObservation(observationId) {
    try {
        setupObservationSheet(); // Ensure the sheet is ready
        const userContext = createUserContext();
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR) {
            return { success: false, error: ERROR_MESSAGES.PERMISSION_DENIED };
        }
        return deleteFinalizedObservationRecord(observationId, userContext.email);
    } catch (error) {
        console.error('Error in deleteFinalizedObservation wrapper:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Loads a finalized observation for read-only viewing.
 * @param {string} observationId The ID of the observation to load.
 * @returns {Object} A response object with the observation and rubric data.
 */
function loadFinalizedObservationForViewing(observationId) {
    try {
        setupObservationSheet(); // Ensure the sheet is ready

        const viewingUserContext = createUserContext(); // Get context for the currently authenticated user accessing the observation (could be observer, observed staff, or another authorized user)
        const observation = getObservationById(observationId);

        if (!observation) {
            return { success: false, error: 'Observation not found.' };
        }

        // Permissions: The viewer must be the observer, the observed staff, or have special access rights.
        const isObserver = viewingUserContext.email === observation.observerEmail;
        const isObserved = viewingUserContext.email === observation.observedEmail;

        if (!isObserver && !isObserved && !viewingUserContext.hasSpecialAccess) {
            return { success: false, error: 'You do not have permission to view this observation.' };
        }

        // Load rubric data based on the *observed* staff's role and year.
        const assignedSubdomains = getAssignedSubdomainsForRoleYear(observation.observedRole, observation.observedYear);
        const rubricData = getAllDomainsData(observation.observedRole, observation.observedYear, 'full', assignedSubdomains);

        // The user context on the page should reflect the person being observed.
        const observedStaffContext = createUserContext(observation.observedEmail);

        // All finalized views are read-only.
        observedStaffContext.isEvaluator = false;

        // If the person viewing is the one who was observed, set special flags for the UI.
        if (isObserved) {
            observedStaffContext.isObservedStaff = true;
            observedStaffContext.viewMode = 'assigned'; // Default to a focused view for the staff member

            debugLog('Finalized observation loaded for the observed staff member.', {
                observationId: observationId,
                userEmail: viewingUserContext.email,
                isObservedStaff: observedStaffContext.isObservedStaff,
                viewMode: observedStaffContext.viewMode
            });
        }

        // Attach the correctly configured context to the rubric data.
        rubricData.userContext = observedStaffContext;

        return { success: true, observation: observation, rubricData: rubricData };

    } catch (error) {
        console.error('Error in loadFinalizedObservationForViewing:', error);
        return { success: false, error: 'An unexpected error occurred: ' + error.message };
    }
}

/**
 * Retrieves the URL for a previously generated PDF of a finalized observation.
 * @param {string} observationId The ID of the observation.
 * @returns {Object} A response object with success status and the PDF URL.
 */
function getObservationPdfUrl(observationId) {
    try {
        setupObservationSheet(); // Ensure the sheet is ready
        const userContext = createUserContext();
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR) {
            return { success: false, error: ERROR_MESSAGES.PERMISSION_DENIED };
        }

        const observation = getObservationById(observationId);
        if (!observation) {
            return { success: false, error: 'Observation not found.' };
        }

        if (observation.observerEmail !== userContext.email) {
            return { success: false, error: 'Permission denied. You did not create this observation.' };
        }

        if (observation.status !== OBSERVATION_STATUS.FINALIZED) {
            return { success: false, error: 'PDF is only available for finalized observations.' };
        }

        if (!observation.pdfUrl) {
            return { success: false, error: 'PDF has not been generated for this observation yet.' };
        }

        return { success: true, pdfUrl: observation.pdfUrl };

    } catch (error) {
        console.error(`Error getting PDF URL for observation ${observationId}:`, error);
        return { success: false, error: 'An unexpected error occurred while retrieving the PDF URL.' };
    }
}


/**
 * Retrieves the status and PDF URL for a given observation, optimized for polling.
 * @param {string} observationId The ID of the observation.
 * @returns {Object} A response object with success status, observation status, and PDF URL.
 */
function getObservationStatusAndPdfUrl(observationId) {
    try {
        const userContext = createUserContext();
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR) {
            return { success: false, error: ERROR_MESSAGES.PERMISSION_DENIED };
        }

        const spreadsheet = openSpreadsheet();
        const sheet = getSheetByName(spreadsheet, "Observation_Data");
        if (!sheet) {
            return { success: false, error: `Sheet '${"Observation_Data"}' not found.` };
        }

        const row = findObservationRow(sheet, observationId);
        if (row === -1) {
            return { success: false, error: 'Observation not found.' };
        }

        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        const pdfUrlCol = headers.indexOf('pdfUrl') + 1;
        const pdfStatusCol = headers.indexOf('pdfStatus') + 1;
        const statusCol = headers.indexOf('status') + 1;

        if (pdfUrlCol === 0 || pdfStatusCol === 0 || statusCol === 0) {
            return { success: false, error: 'Required columns (pdfUrl, pdfStatus, status) not found.' };
        }

        const range = sheet.getRange(row, 1, 1, sheet.getLastColumn());
        const values = range.getValues()[0];

        return {
            success: true,
            status: values[statusCol - 1],
            pdfUrl: values[pdfUrlCol - 1],
            pdfStatus: values[pdfStatusCol - 1]
        };

    } catch (error) {
        console.error(`Error polling for observation ${observationId}:`, error);
        return { success: false, error: 'An unexpected error occurred during polling.' };
    }
}



/**
 * Updates the metadata for an observation, such as its name or date.
 * @param {string} observationId The ID of the observation to update.
 * @param {object} metadata The metadata to update (e.g., { observationName: 'New Name', observationDate: '2025-12-25' }).
 * @returns {Object} A response object indicating success or failure.
 */
function updateObservationMetadata(observationId, metadata) {
    try {
        const userContext = createUserContext();
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR) {
            return { success: false, error: ERROR_MESSAGES.PERMISSION_DENIED };
        }

        const observation = getObservationById(observationId);
        if (!observation) {
            return { success: false, error: 'Observation not found.' };
        }

        if (observation.observerEmail !== userContext.email) {
            return { success: false, error: 'You do not have permission to edit this observation.' };
        }

        if (observation.status !== OBSERVATION_STATUS.DRAFT) {
            return { success: false, error: 'You can only edit draft observations.' };
        }

        const spreadsheet = openSpreadsheet();
        const sheet = getSheetByName(spreadsheet, "Observation_Data");
        if (!sheet) {
            return { success: false, error: `Sheet '${"Observation_Data"}' not found.` };
        }

        const row = findObservationRow(sheet, observationId);
        if (row === -1) {
            return { success: false, error: 'Observation row not found in the sheet.' };
        }

        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        
        if (metadata.observationName) {
            const nameCol = headers.indexOf('observationName') + 1;
            if (nameCol > 0) {
                sheet.getRange(row, nameCol).setValue(metadata.observationName);
            }
        }

        if (metadata.observationDate) {
            const dateCol = headers.indexOf('observationDate') + 1;
            if (dateCol > 0) {
                sheet.getRange(row, dateCol).setValue(metadata.observationDate);
            }
        }
        
        const lastModifiedCol = headers.indexOf('lastModifiedAt') + 1;
        if (lastModifiedCol > 0) {
            sheet.getRange(row, lastModifiedCol).setValue(new Date().toISOString());
        }

        SpreadsheetApp.flush();
        
        // Update the observation folder name if the observationName has changed
        if (metadata.observationName && metadata.observationName !== observation.observationName) {
            try {
                const rootFolderIterator = DriveApp.getFoldersByName(DRIVE_FOLDER_INFO.ROOT_FOLDER_NAME);
                if (rootFolderIterator.hasNext()) {
                    const rootFolder = rootFolderIterator.next();
                    const userFolderName = `${observation.observedName} (${observation.observedEmail}`;
                    const userFolderIterator = rootFolder.getFoldersByName(userFolderName);
                    if (userFolderIterator.hasNext()) {
                        const userFolder = userFolderIterator.next();
                        const oldFolderName = `Observation - ${observation.observationId}`;
                        const obsFolderIterator = userFolder.getFoldersByName(oldFolderName);
                        if (obsFolderIterator.hasNext()) {
                            const obsFolder = obsFolderIterator.next();
                            obsFolder.setName(metadata.observationName);
                        }
                    }
                }
            } catch (driveError) {
                // Log the error, but don't fail the whole operation
                console.error(`Failed to rename observation folder for ${observationId}:`, driveError);
            }
        }


        return { success: true };

    } catch (error) {
        console.error(`Error updating metadata for observation ${observationId}:`, error);
        return { success: false, error: 'An unexpected error occurred while saving the details.' };
    }
}

function uploadGlobalRecording(observationId, base64Data, filename, recordingType) {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000); // Wait up to 30 seconds

    try {
        const observation = getObservationById(observationId);
        if (!observation) {
            return { success: false, error: 'Observation not found.' };
        }

        // Convert base64 to blob with dynamic MIME type
        const binaryData = Utilities.base64Decode(base64Data);
        const mimeType = recordingType === 'video' ? 'video/webm' : 'audio/webm';
        const blob = Utilities.newBlob(binaryData, mimeType, filename);

        // Create/get observation folder
        const folder = getOrCreateObservationFolder(observationId);

        // Save file with specific permissions
        const file = folder.createFile(blob);
        file.addEditor(observation.observerEmail);
        file.addViewer(observation.observedEmail);

        // Update observation data
        if (!observation.globalRecordings) {
            observation.globalRecordings = { audio: [], video: [] };
        }

        observation.globalRecordings[recordingType].push({
            url: file.getUrl(),
            filename: filename,
            timestamp: new Date().toISOString()
        });

        updateObservationInSheet(observation);

        return { success: true, fileUrl: file.getUrl() };

    } catch (error) {
        console.error('Error uploading global recording:', error);
        return { success: false, error: error.message };
    } finally {
        lock.releaseLock();
    }
}

/**
 * Exports a script from the Script editor to a PDF. This is the client-facing function.
 * @param {string} scriptHtml The HTML content of the script to export.
 * @param {string} observationId The ID of the observation to associate the PDF with.
 * @returns {object} The result of the PDF generation and saving process.
 */
function exportScriptToPdf(scriptHtml, observationId) {
    // This function now simply calls the robust, centralized PDF generation function.
    return generateScriptPDF(observationId, scriptHtml);
}

/**
 * Generates a separate PDF for the observation script content.
 * This is the main, robust function for creating the script PDF.
 * @param {string} observationId The ID of the observation to generate script PDF for.
 * @param {string} [scriptHtml=null] Optional HTML content of the script. If not provided, it's fetched from the observation.
 * @returns {Object} A response object with success status and PDF details.
 */
function generateScriptPDF(observationId, scriptHtml = null) {
    try {
        const userContext = createUserContext();
        if (!userContext || !userContext.email) {
            return { success: false, error: 'Invalid user session.' };
        }

        const observation = getObservationById(observationId);
        if (!observation) {
            return { success: false, error: 'Observation not found.' };
        }

        if (observation.observerEmail !== userContext.email) {
            return { success: false, error: 'Permission denied. You did not create this observation.' };
        }

        // Determine the source of the script content
        const contentSource = scriptHtml ? 'html' : 'observation';
        const scriptContent = scriptHtml ? scriptHtml : observation.scriptContent;

        if (!scriptContent) {
            return { success: false, error: 'No script content found for this observation.' };
        }

        debugLog('Starting script PDF generation', { observationId, contentSource });

        const docName = `Script - ${observation.observedName} - ${new Date().toISOString().slice(0, 10)}`;

        // --- Create PDF using robust helper ---
        const pdfBlob = _createScriptPdfDocument(observation, scriptContent, docName, contentSource);

        // --- Save PDF to Drive ---
        const folder = getOrCreateObservationFolder(observationId);
        const pdfFile = folder.createFile(pdfBlob).setName(`${docName}.pdf`);
        const pdfUrl = pdfFile.getUrl();

        // --- Update Observation Record ---
        updateObservationScriptUrl(observationId, pdfUrl);

        debugLog('Script PDF generated successfully', { observationId, pdfUrl });

        return {
            success: true,
            url: pdfUrl, // Keep 'url' for backward compatibility with exportScriptToPdf caller
            pdfUrl: pdfUrl,
            pdfId: pdfFile.getId(),
            fileName: `${docName}.pdf`
        };

    } catch (error) {
        console.error('Error generating script PDF:', error);
        debugLog('Failed to generate script PDF', { error: error.message, stack: error.stack });
        return { success: false, error: 'Error generating script PDF: ' + error.message };
    }
}

/**
 * Creates a styled PDF document for the script content using robust methods.
 * @param {Object} observation The observation data.
 * @param {string|Object} scriptContent The script content (HTML string or Quill Delta object).
 * @param {string} docName The name for the document.
 * @param {string} contentSource The source of the content ('html' or 'observation').
 * @returns {Blob} A PDF blob.
 * @private
 */
function _createScriptPdfDocument(observation, scriptContent, docName, contentSource) {
    const doc = DocumentApp.create(docName);
    const docId = doc.getId();
    const body = doc.getBody();
    body.clear();

    // --- Header Section ---
    const title = body.appendParagraph(`Observation Script: ${observation.observedName}`);
    title.setHeading(DocumentApp.ParagraphHeading.HEADING1);
    title.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    title.getChild(0).asText().setFontSize(16).setBold(true);

    const subtitle = body.appendParagraph(`Generated on: ${new Date().toLocaleString()}`);
    subtitle.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    subtitle.getChild(0).asText().setFontSize(10).setItalic(true).setForegroundColor('#666666');
    body.appendParagraph('');

    // --- Metadata Table ---
    const metadataTable = body.appendTable([
        ['Observer:', observation.observerEmail],
        ['Observed Staff:', `${observation.observedName} (${observation.observedEmail})`]
    ]);
    metadataTable.setBorderWidth(0);

    for (let i = 0; i < metadataTable.getNumRows(); i++) {
        const row = metadataTable.getRow(i);
        row.getCell(0).getChild(0).asParagraph().setBold(true);
        row.getCell(0).setWidth(100);
        row.getCell(1).getChild(0).asParagraph().setItalic(true);
    }
    body.appendParagraph('');

    // --- Script Content Section ---
    // Always include the full script content first
    body.appendParagraph('Full Script Content').setHeading(DocumentApp.ParagraphHeading.HEADING2);

    if (contentSource === 'html') {
        addHtmlContentToDoc(body, scriptContent);
    } else if (contentSource === 'observation' && scriptContent.ops) {
        scriptContent.ops.forEach(op => {
            if (op.insert && typeof op.insert === 'string') {
                const text = op.insert;
                if (text.trim() || text === '\n') {
                    const p = body.appendParagraph(text);
                    if (op.attributes) {
                        const style = {};
                        if (op.attributes.bold) style[DocumentApp.Attribute.BOLD] = true;
                        if (op.attributes.italic) style[DocumentApp.Attribute.ITALIC] = true;
                        if (op.attributes.underline) style[DocumentApp.Attribute.UNDERLINE] = true;
                        if (Object.keys(style).length > 0) p.setAttributes(style);
                        if (op.attributes.header === 1) p.setHeading(DocumentApp.ParagraphHeading.HEADING3);
                        if (op.attributes.header === 2) p.setHeading(DocumentApp.ParagraphHeading.HEADING4);
                    }
                }
            }
        });
    } else {
        body.appendParagraph('No script content was provided or content format is invalid.').setItalic(true);
    }

    // If there are component tags, group the content by component after the full script
    if (contentSource === 'observation' && observation.componentTags && Object.keys(observation.componentTags).length > 0) {
        body.appendParagraph('');
        body.appendParagraph('---').setAlignment(DocumentApp.HorizontalAlignment.CENTER);
        body.appendParagraph('');
        body.appendParagraph('Content Organized by Rubric Components').setHeading(DocumentApp.ParagraphHeading.HEADING2);

        const componentTags = observation.componentTags;

        // Get all rubric data to look up component titles
        const rubricData = getAllDomainsData(observation.observedRole, observation.observedYear, 'full');

        // Create a lookup map for component titles for performance
        const componentMap = new Map();
        if (rubricData && rubricData.domains) {
            for (const domain of rubricData.domains) {
                for (const component of domain.components) {
                    componentMap.set(component.componentId, component.title);
                }
            }
        }

        Object.keys(componentTags).forEach(componentId => {
            const tags = componentTags[componentId];
            if (Array.isArray(tags) && tags.length > 0) {
                // Find component name from the lookup map
                const componentName = componentMap.get(componentId) || componentId;

                body.appendParagraph(componentName).setHeading(DocumentApp.ParagraphHeading.HEADING3);
                const content = tags.map(tag => tag.text).join('\n');
                body.appendParagraph(content).setSpacingAfter(12);
            }
        });
    }

    // --- Save and Cleanup ---
    doc.saveAndClose();
    const docFile = DriveApp.getFileById(docId);
    const pdfBlob = docFile.getBlob().getAs('application/pdf');
    docFile.setTrashed(true); // Cleanup temporary file

    return pdfBlob;
}


// This space is intentionally left blank.
// The HTML parsing utility functions have been moved to server/Utils.js
// to avoid code duplication and improve maintainability.



/**
 * Regenerates the PDF for a finalized observation.
 * @param {string} observationId The ID of the observation to regenerate PDF for.
 * @returns {Object} A response object with success status and PDF URL.
 */


/**
 * =================================================================
 * CORE DATA & UI RENDERING FUNCTIONS
 * =================================================================
 */

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
        validation.allowedActions = [SPECIAL_ACTIONS.VIEW_ANY, SPECIAL_ACTIONS.FILTER_BY_ROLE, SPECIAL_ACTIONS.FILTER_BY_YEAR, SPECIAL_ACTIONS.FILTER_BY_STAFF, SPECIAL_ACTIONS.GENERAL_ACCESS];
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
    let triggerInfo = {}; // Default value

    if (triggerInfoString) {
      try {
        triggerInfo = JSON.parse(triggerInfoString);
      } catch (e) {
        console.warn('Could not parse AUTO_TRIGGER_INFO from properties', e);
        // triggerInfo remains an empty object, which is the desired fallback.
      }
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
      subtitle: `An unexpected error occurred. Please see details below.`, // Subtitle can be generic
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
  const startIdx = config.startRow - 1; // Convert to 0-indexed
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
      const componentId = extractComponentId(component.title);
      
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
 * Process role-specific domains (placeholder for future implementation)
 */
function processRoleDomains(roleSheetData, role, year) {
  // For now, fall back to legacy processing
  debugLog(`Processing role domains for ${role} - falling back to legacy processing`);
  return processLegacyTeacherDomains(roleSheetData.data);
}

/**
 * Apply year-based filtering to domains (placeholder for future implementation)
 */
function applyYearFiltering(domains, role, year) {
  // Placeholder - future implementation will filter domains/components based on year
  debugLog('Year filtering not yet implemented - returning all domains', { role, year });
  return domains;
}

