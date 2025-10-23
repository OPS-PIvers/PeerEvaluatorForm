/**
 * Code.js - Main Orchestrator (Clean Production Version)
 * Google Apps Script Web App for Danielson Framework - Multi-Role Rubric System
 * 
 * This file orchestrates the modular services and maintains backward compatibility
 * while adding support for multiple roles and automatic cache management.
 */

/**
 * =================================================================
 * CONSTANTS
 * =================================================================
 */
const MAX_JOBS_PER_RUN = 5;
const MAX_JOB_ATTEMPTS = 3;
const GEMINI_TRANSCRIPTION_MODEL = 'gemini-flash-lite-latest';
const MAX_BATCH_FILE_SIZE_BYTES = 37 * 1024 * 1024;


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
  
  // Global entry logging - capture ALL doGet() calls
  console.log('=== doGet() called ===', {
    timestamp: new Date().toISOString(),
    requestId: requestId,
    hasEventParameter: !!e,
    eventParameter: e ? e.parameter : null,
    urlParameters: e && e.parameter ? Object.keys(e.parameter) : []
  });
  
  try {
    // Ensure the Observation_Data sheet has the correct columns before any other operation.
    setupObservationSheet();

    // Clean up expired sessions periodically (10% chance)
    if (Math.random() < 0.1) {
      cleanupExpiredSessions();
    }

    // Parse URL parameters for cache control
    const params = e.parameter || {};
    
    // Log parameter parsing details
    console.log('URL parameters parsed', {
      allParams: params,
      myOwnRubric: params.myOwnRubric,
      myOwnRubricType: typeof params.myOwnRubric,
      requestId: requestId
    });

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
    // and they're not requesting their own rubric, show the filter interface.
    if (userContext.hasSpecialAccess && !params.filterStaff && !params.myOwnRubric) {
        debugLog('Special access user detected - showing filter interface', { role: userContext.role, requestId });
        return UiService.createFilterSelectionInterface(userContext, requestId);
    }
    
    // For users who land here directly (not through the filter UI) or for non-special roles
    if (params.myOwnRubric) {
        debugLog('My Own Rubric request detected', { 
            role: userContext.role, 
            year: userContext.year, 
            viewMode: userContext.viewMode,
            requestId 
        });
    }
    
    const rubricData = getAllDomainsData(
      userContext.role, 
      userContext.year, 
      userContext.viewMode, 
      userContext.assignedSubdomains
    );
    
    // Debug logging for My Own Rubric requests
    if (params.myOwnRubric) {
        debugLog('Rubric data structure returned', {
            role: userContext.role,
            hasTitle: !!rubricData.title,
            hasDomains: !!rubricData.domains,
            domainCount: rubricData.domains ? rubricData.domains.length : 0,
            isError: !!rubricData.isError,
            errorMessage: rubricData.errorMessage,
            requestId
        });
    }
    
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

    // Check if user has any Work Product or Instructional Round observations
    let hasWorkProduct = false;
    let hasInstructionalRound = false;
    if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR) {
      hasWorkProduct = checkUserHasWorkProductObservation(userContext.email);
      hasInstructionalRound = checkUserHasInstructionalRoundFromPeerEvaluator(userContext.email);
    }
    htmlTemplate.showWorkProductQuestionsButton = hasWorkProduct;
    htmlTemplate.showInstructionalRoundQuestionsButton = hasInstructionalRound;

    // Determine if staff member has finalized observations (for button positioning)
    const hasMyObservations = userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR ?
      getStaffObservationSummary(userContext.email).hasFinalized : false;

    // Set default state to avoid expensive doc lookups on page load
    // Progress state is calculated when modal opens for better performance
    const workProductState = 'not-started';
    const standardObservationState = 'not-started';

    htmlTemplate.hasMyObservations = hasMyObservations;
    htmlTemplate.workProductState = workProductState;
    htmlTemplate.standardObservationState = standardObservationState;
    
    // Generate the HTML output with error handling
    let htmlOutput;
    try {
        htmlOutput = htmlTemplate.evaluate()
          .setTitle(UiService.getPageTitle(userContext.role))
          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
          
        if (params.myOwnRubric) {
            debugLog('Template evaluation successful for My Own Rubric', { 
                role: userContext.role, 
                requestId 
            });
        }
    } catch (templateError) {
        console.error('Template evaluation failed', { 
            error: templateError.message,
            stack: templateError.stack,
            role: userContext.role,
            requestId 
        });
        
        // Return error page instead of blank page
        return UiService.createEnhancedErrorPage(
            templateError,
            userContext,
            requestId,
            'Template evaluation failed for My Own Rubric view'
        );
    }
      
    addCacheBustingHeaders(htmlOutput, responseMetadata);

    const executionTime = Date.now() - startTime;
    logPerformanceMetrics('doGet', executionTime, { role: userContext.role, requestId });
    
    return htmlOutput;
    
  } catch (error) {
    console.error('=== FATAL ERROR in doGet() ===', {
      timestamp: new Date().toISOString(),
      requestId: requestId,
      error: error.message,
      stack: error.stack,
      urlParameters: e && e.parameter ? e.parameter : null,
      myOwnRubric: e && e.parameter ? e.parameter.myOwnRubric : null,
      formattedError: formatErrorMessage(error, 'doGet')
    });
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

        // Handle Peer Evaluator or Admin selecting a staff member to observe
        if ((userContext.role === SPECIAL_ROLES.PEER_EVALUATOR || userContext.role === SPECIAL_ROLES.ADMINISTRATOR) && filterParams.staff) {
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
            debugLog('Loading own rubric data directly for Peer Evaluator', { 
                userRole: userContext.role, 
                userEmail: userContext.email 
            });
            
            // Generate the rubric data directly instead of redirecting
            const rubricData = getAllDomainsData(
                userContext.role, 
                userContext.year, 
                userContext.viewMode, 
                userContext.assignedSubdomains
            );
            
            // Create the complete HTML response for My Own Rubric view
            // Add flag to distinguish from regular special access views
            userContext.isMyOwnRubricView = true;
            rubricData.userContext = userContext;
            
            // Generate response metadata
            const responseMetadata = generateResponseMetadata(userContext, generateUniqueId('myownrubric'), false);
            userContext.responseMetadata = responseMetadata;
            userContext.cacheVersion = responseMetadata.cacheVersion;
            userContext.requestId = responseMetadata.requestId;
            
            try {
                const htmlTemplate = HtmlService.createTemplateFromFile(TEMPLATE_PATHS.STAFF_RUBRIC);
                htmlTemplate.data = rubricData;
                
                const htmlOutput = htmlTemplate.evaluate()
                    .setTitle(UiService.getPageTitle(userContext.role))
                    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
                
                const htmlContent = htmlOutput.getContent();
                
                debugLog('Successfully generated My Own Rubric HTML', { 
                    userRole: userContext.role,
                    htmlLength: htmlContent.length,
                    hasTitle: !!rubricData.title,
                    domainCount: rubricData.domains ? rubricData.domains.length : 0
                });
                
                return { 
                    success: true, 
                    action: 'show_html',
                    htmlContent: htmlContent
                };
            } catch (templateError) {
                console.error('Template generation failed for My Own Rubric', {
                    error: templateError.message,
                    stack: templateError.stack,
                    userRole: userContext.role
                });
                return { 
                    success: false, 
                    error: 'Failed to generate My Own Rubric view: ' + templateError.message 
                };
            }
        }

        // Default behavior (could be expanded for other roles like Admin)
        return { success: false, error: 'Invalid filter request.' };

    } catch (error) {
        console.error('Error in loadRubricData:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Processes transcription queue using Gemini Batch API
 * This runs on a time-based trigger (every 15-30 minutes)
 */
function processTranscriptionQueue() {
    const startTime = new Date().getTime();
    const MAX_EXECUTION_TIME = 5 * 60 * 1000; // 5 minutes buffer

    try {
        const properties = PropertiesService.getScriptProperties();
        let jobQueue = properties.getProperty('transcription_queue');

        if (!jobQueue) {
            debugLog('Transcription queue empty');
            return;
        }

        jobQueue = JSON.parse(jobQueue);
        if (jobQueue.length === 0) {
            debugLog('No pending transcription jobs');
            return;
        }

        const apiKey = properties.getProperty('GEMINI_API_KEY');
        if (!apiKey) {
            console.error('GEMINI_API_KEY not configured');
            return;
        }

        // Separate jobs by status
        const pendingJobs = [];
        const processingJobs = [];

        jobQueue.forEach(jobId => {
            const jobDataStr = properties.getProperty('transcription_job_' + jobId);
            if (!jobDataStr) {
                console.error('Job data not found:', jobId);
                return;
            }

            let jobData;
            try {
                jobData = JSON.parse(jobDataStr);
            } catch (err) {
                console.error('Malformed JSON for job:', jobId, err);
                return;
            }

            if (jobData.status === 'pending') {
                pendingJobs.push({ jobId, jobData });
            } else if (jobData.status === 'processing' && jobData.batchJobName) {
                processingJobs.push({ jobId, jobData });
            }
        });

        debugLog('Queue status', {
            total: jobQueue.length,
            pending: pendingJobs.length,
            processing: processingJobs.length
        });

        // STEP 1: Check status of processing jobs
        const jobsToRemoveFromQueue = [];
        for (const job of processingJobs) {
            try {
                const result = checkBatchJobStatus(job.jobData.batchJobName, apiKey);

                if (result.state === 'SUCCEEDED') {
                    completeBatchTranscription(job.jobId, job.jobData, result, apiKey);
                    // Always remove from queue after completeBatchTranscription, whether it succeeded or failed
                    // (completeBatchTranscription sets status to 'complete' or 'failed')
                    jobsToRemoveFromQueue.push(job.jobId);
                } else if (result.state === 'FAILED') {
                    job.jobData.status = 'failed';
                    job.jobData.error = result.error || 'Batch API processing failed';
                    properties.setProperty('transcription_job_' + job.jobId, JSON.stringify(job.jobData));
                    jobsToRemoveFromQueue.push(job.jobId);
                    sendTranscriptionNotification(job.jobData, false);
                }
            } catch (error) {
                console.error('Error checking batch job status:', error);
            }
        }

        // Batch update the queue after processing all jobs
        if (jobsToRemoveFromQueue.length > 0) {
            jobQueue = jobQueue.filter(id => !jobsToRemoveFromQueue.includes(id));
            properties.setProperty('transcription_queue', JSON.stringify(jobQueue));
        }

        // STEP 2: Submit pending jobs to Batch API
        if (pendingJobs.length > 0) {
            const jobsToSubmit = pendingJobs.slice(0, MAX_JOBS_PER_RUN); // Process up to 5 per trigger
            const jobsToRemoveFromQueuePending = [];

            for (const job of jobsToSubmit) {
                try {
                    const elapsedTime = new Date().getTime() - startTime;
                    if (elapsedTime > MAX_EXECUTION_TIME) {
                        debugLog('Approaching execution limit, stopping job submission');
                        break;
                    }

                    const batchResult = submitToBatchAPI(job.jobId, job.jobData, apiKey);

                    if (batchResult.success) {
                        job.jobData.status = 'processing';
                        job.jobData.batchJobName = batchResult.batchJobName;
                        job.jobData.submittedAt = new Date().toISOString();
                        properties.setProperty('transcription_job_' + job.jobId, JSON.stringify(job.jobData));

                        debugLog('Job submitted to Batch API', {
                            jobId: job.jobId,
                            batchJobName: batchResult.batchJobName
                        });
                    } else {
                        job.jobData.attempts = (job.jobData.attempts || 0) + 1;

                        if (job.jobData.attempts >= MAX_JOB_ATTEMPTS) {
                            job.jobData.status = 'failed';
                            job.jobData.error = batchResult.error;
                            properties.setProperty('transcription_job_' + job.jobId, JSON.stringify(job.jobData));
                            jobsToRemoveFromQueuePending.push(job.jobId);
                            sendTranscriptionNotification(job.jobData, false);
                        } else {
                            job.jobData.error = batchResult.error;
                            properties.setProperty('transcription_job_' + job.jobId, JSON.stringify(job.jobData));
                        }
                    }
                } catch (error) {
                    console.error('Error submitting job to Batch API:', error);
                }
            }

            // Batch update the queue after processing pending jobs
            if (jobsToRemoveFromQueuePending.length > 0) {
                jobQueue = jobQueue.filter(id => !jobsToRemoveFromQueuePending.includes(id));
                properties.setProperty('transcription_queue', JSON.stringify(jobQueue));
            }
        }

    } catch (error) {
        console.error('Error in processTranscriptionQueue:', error);
    }
}

/**
 * Submits a transcription job to Gemini Batch API
 */
function submitToBatchAPI(jobId, jobData, apiKey) {
    try {
        const audioFile = DriveApp.getFileById(jobData.fileId);
        const audioBlob = audioFile.getBlob();
        const audioBytes = audioBlob.getBytes();
        const base64Audio = Utilities.base64Encode(audioBytes);
        const mimeType = audioFile.getMimeType();

        const model = GEMINI_TRANSCRIPTION_MODEL;
        const batchApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchGenerateContent`;

        const payload = {
            batch: {
                display_name: `transcription-${jobId}`,
                input_config: {
                    requests: {
                        requests: [
                            {
                                request: {
                                    contents: [{
                                        parts: [
                                            { text: jobData.prompt },
                                            {
                                                inline_data: {
                                                    mime_type: mimeType,
                                                    data: base64Audio
                                                }
                                            }
                                        ]
                                    }],
                                    generationConfig: {
                                        temperature: 0.2,
                                        topK: 40,
                                        topP: 0.95,
                                        maxOutputTokens: 8192
                                    }
                                },
                                metadata: {
                                    key: `transcription-${jobId}`
                                }
                            }
                        ]
                    }
                }
            }
        };

        const options = {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify(payload),
            muteHttpExceptions: true,
            headers: {
                'x-goog-api-key': apiKey
            }
        };

        debugLog('Submitting to Gemini Batch API', {
            jobId: jobId,
            model: model,
            filename: jobData.filename,
            audioSize: audioBytes.length
        });

        const response = UrlFetchApp.fetch(batchApiUrl, options);
        const responseCode = response.getResponseCode();
        const responseText = response.getContentText();

        if (responseCode !== 200 && responseCode !== 201) {
            console.error('Batch API submission error:', responseCode, responseText);
            return {
                success: false,
                error: `Batch API error ${responseCode}: ${responseText}`
            };
        }

        const jsonResponse = JSON.parse(responseText);
        const batchJobName = jsonResponse.name;

        if (!batchJobName) {
            return {
                success: false,
                error: 'Batch API did not return job name'
            };
        }

        return {
            success: true,
            batchJobName: batchJobName
        };

    } catch (error) {
        console.error('Error submitting to Batch API:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Checks the status of a Gemini Batch API job
 */
function checkBatchJobStatus(batchJobName, apiKey) {
    try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/${batchJobName}`;

        const options = {
            method: 'get',
            muteHttpExceptions: true,
            headers: {
                'x-goog-api-key': apiKey
            }
        };

        const response = UrlFetchApp.fetch(apiUrl, options);
        const responseCode = response.getResponseCode();
        const responseText = response.getContentText();

        if (responseCode !== 200) {
            console.error('Batch status check error:', responseCode, responseText);
            return {
                state: 'UNKNOWN',
                error: `Status check error: ${responseCode}`
            };
        }

        const jsonResponse = JSON.parse(responseText);

        return {
            state: jsonResponse.state,
            metadata: jsonResponse.metadata,
            results: jsonResponse.results,
            error: jsonResponse.error
        };

    } catch (error) {
        console.error('Error checking batch status:', error);
        return {
            state: 'UNKNOWN',
            error: error.message
        };
    }
}

/**
 * Completes a batch transcription job
 */
function completeBatchTranscription(jobId, jobData, batchResult, apiKey) {
    const lock = LockService.getScriptLock();

    try {
        lock.waitLock(10000);

        const properties = PropertiesService.getScriptProperties();

        if (!batchResult.results || batchResult.results.length === 0) {
            throw new Error('No results in batch response');
        }

        const result = batchResult.results[0];

        if (!result.response || !result.response.candidates || result.response.candidates.length === 0) {
            throw new Error('No transcription in batch result');
        }

        const transcriptionText = result.response.candidates[0].content.parts[0].text;

        if (!transcriptionText) {
            throw new Error('Empty transcription received');
        }

        const observation = getObservationById(jobData.observationId);
        if (!observation) {
            throw new Error('Observation not found');
        }

        // Save transcription to Google Doc
        const folder = getOrCreateObservationFolder(jobData.observationId);
        const docUrl = saveTranscriptionToDoc(folder, jobData.filename, transcriptionText, observation);

        // Update observation record
        if (!observation.transcriptions) {
            observation.transcriptions = [];
        }
        observation.transcriptions.push({
            audioFilename: jobData.filename,
            docUrl: docUrl,
            timestamp: new Date().toISOString(),
            transcribedBy: jobData.createdBy,
            jobId: jobId,
            method: 'batch_api'
        });
        updateObservationInSheet(observation);

        // Mark job as complete
        jobData.status = 'complete';
        jobData.completedAt = new Date().toISOString();
        jobData.transcriptionUrl = docUrl;
        jobData.transcriptionContent = transcriptionText;
        properties.setProperty('transcription_job_' + jobId, JSON.stringify(jobData));

        // Note: Queue removal is now batched in processTranscriptionQueue for performance
        // The calling function will handle removing completed jobs from the queue

        sendTranscriptionNotification(jobData, true);

        debugLog('Batch transcription completed', {
            jobId,
            docUrl,
            processingTime: calculateProcessingTime(jobData)
        });

    } catch (error) {
        console.error('Error completing batch transcription:', error);

        jobData.status = 'failed';
        jobData.error = error.message;
        PropertiesService.getScriptProperties().setProperty('transcription_job_' + jobId, JSON.stringify(jobData));

        // Note: Queue removal is now batched in processTranscriptionQueue for performance
        // The calling function will handle removing failed jobs from the queue

        sendTranscriptionNotification(jobData, false);

    } finally {
        lock.releaseLock();
    }
}

/**
 * Saves the transcription text to a new Google Doc in the specified folder.
 * @param {GoogleAppsScript.Drive.Folder} folder The Drive folder to save the document in.
 * @param {string} originalFilename The name of the original audio file.
 * @param {string} transcriptionText The transcribed text.
 * @param {Object} observation The observation data object.
 * @returns {string} The URL of the newly created Google Doc.
 */
function saveTranscriptionToDoc(folder, originalFilename, transcriptionText, observation) {
    try {
        const docName = `Transcription of ${originalFilename} - ${new Date().toISOString().slice(0, 10)}`;
        const doc = DocumentApp.create(docName);
        const body = doc.getBody();

        // Add a header
        body.appendParagraph(`Transcription for Observation: ${observation.observationName || observation.observationId}`)
            .setHeading(DocumentApp.ParagraphHeading.HEADING1);
        body.appendParagraph(`Observed Staff: ${observation.observedName} | Observer: ${observation.observerEmail}`);
        body.appendParagraph(`Date Transcribed: ${new Date().toLocaleString()}`);
        body.appendHorizontalRule();
        body.appendParagraph('');

        // Add the transcription content
        body.appendParagraph(transcriptionText);

        doc.saveAndClose();

        // Move the new document to the correct observation folder
        const docFile = DriveApp.getFileById(doc.getId());
        folder.addFile(docFile);
        DriveApp.getRootFolder().removeFile(docFile); // Remove from root

        debugLog('Transcription saved to Google Doc', { docName, docId: doc.getId() });

        return docFile.getUrl();
    } catch (error) {
        console.error('Error saving transcription to Doc:', error);
        throw new Error('Failed to save transcription document: ' + error.message);
    }
}

/**
 * Sends an email notification to the user about the transcription job status.
 * @param {Object} jobData The data for the transcription job.
 * @param {boolean} success Whether the job was successful or not.
 */
function sendTranscriptionNotification(jobData, success) {
    try {
        const recipient = jobData.createdBy;
        if (!recipient) {
            console.error('No recipient found for transcription notification', { jobId: jobData.jobId });
            return;
        }

        // Use the centralized escapeHtml utility function from Utils.js
        const safeFilename = escapeHtml(jobData.filename);
        const safeError = escapeHtml(jobData.error);

        let subject = '';
        let htmlBody = '';

        if (success) {
            subject = `✅ Transcription Complete: ${safeFilename}`;
            htmlBody = `
                <p>Hello,</p>
                <p>Your transcription for the file <strong>${safeFilename}</strong> is complete.</p>
                <p>You can view the transcribed document here:</p>
                <p><a href="${jobData.transcriptionUrl}">View Transcription</a></p>
                <p>This transcription has been automatically added to the observation materials.</p>
                <br>
                <p>Job Details:</p>
                <ul>
                    <li>Job ID: ${jobData.jobId}</li>
                    <li>Observation ID: ${jobData.observationId}</li>
                </ul>
            `;
        } else {
            subject = `❌ Transcription Failed: ${safeFilename}`;
            htmlBody = `
                <p>Hello,</p>
                <p>We're sorry, but the transcription for the file <strong>${safeFilename}</strong> has failed.</p>
                <p><strong>Error details:</strong></p>
                <pre>${safeError || 'An unknown error occurred.'}</pre>
                <br>
                <p>You may want to try submitting the job again. If the problem persists, please contact support.</p>
                <br>
                <p>Job Details:</p>
                <ul>
                    <li>Job ID: ${jobData.jobId}</li>
                    <li>Observation ID: ${jobData.observationId}</li>
                </ul>
            `;
        }

        MailApp.sendEmail({
            to: recipient,
            subject: subject,
            htmlBody: htmlBody,
            name: 'Peer Evaluator System'
        });

        debugLog('Transcription notification sent', { recipient, success, jobId: jobData.jobId });

    } catch (error) {
        console.error('Error sending transcription notification email:', error);
    }
}

/**
 * Helper function to calculate processing time from job data
 * @param {Object} jobData The job data object
 * @returns {string} A string representing the processing time
 */
function calculateProcessingTime(jobData) {
    if (!jobData.submittedAt || !jobData.completedAt) {
        return 'N/A';
    }
    try {
        const start = new Date(jobData.submittedAt);
        const end = new Date(jobData.completedAt);
        const diffSeconds = Math.round((end - start) / 1000);
        return `${diffSeconds} seconds`;
    } catch (e) {
        return 'N/A';
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
    const userContext = createUserContext();
    let staffList;

    if (userContext.role === SPECIAL_ROLES.ADMINISTRATOR) {
      staffList = getStaffForAdmin(userContext);
    } else {
      staffList = getStaffByRoleAndYear(role, year);
    }

    return { success: true, staff: staffList };
  } catch (error) {
    console.error('Error in getStaffListForDropdown:', error);
    return { success: false, error: error.message, staff: [] };
  }
}

function getStaffForAdmin(adminUserContext) {
  if (!adminUserContext || adminUserContext.role !== SPECIAL_ROLES.ADMINISTRATOR) {
    return [];
  }

  const allStaff = getStaffData();
  if (!allStaff || !allStaff.users) {
    return [];
  }

  const adminBuilding = adminUserContext.building;
  
  // If admin doesn't have building data, fall back to showing summative year staff from all buildings
  if (!adminBuilding) {
    console.warn('Admin user missing building data, showing summative year staff from all buildings');
    const filteredStaff = allStaff.users.filter(user => {
      const isSummative = isSummativeYear(user.summativeYear);
      const isNotSelf = user.email !== adminUserContext.email;
      return isNotSelf && isSummative;
    });

    return filteredStaff.map(user => ({
        name: user.name || 'Unknown Name',
        email: user.email,
        role: user.role || 'Unknown Role',
        year: (user.year !== null && user.year !== undefined) ? user.year : null,
        displayName: `${user.name || 'Unknown'} (${user.role || 'Unknown'}, Year ${formatYearDisplay(user.year)})`
    }));
  }

  // Filter by building and summative year
  // Support multi-building assignments: Staff with "High School, Special Services"
  // will appear for both High School and Special Services administrators
  const filteredStaff = allStaff.users.filter(user => {
    const isSummative = isSummativeYear(user.summativeYear);
    const isInSameBuilding = buildingsMatch(user.building, adminBuilding);
    const isNotSelf = user.email !== adminUserContext.email;

    return isNotSelf && isInSameBuilding && isSummative;
  });

  return filteredStaff.map(user => ({
      name: user.name || 'Unknown Name',
      email: user.email,
      role: user.role || 'Unknown Role',
      year: (user.year !== null && user.year !== undefined) ? user.year : null,
      displayName: `${user.name || 'Unknown'} (${user.role || 'Unknown'}, Year ${formatYearDisplay(user.year)})`
  }));
}


/**
 * Gets the list of observations for a user.
 * @param {string} observedEmail The email of the staff member.
 * @returns {Object} A response object with success status and observations list.
 */
function getObservationOptions(observedEmail) {
    try {
        const userContext = createUserContext();
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR && userContext.role !== SPECIAL_ROLES.ADMINISTRATOR) {
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
function createNewObservationForEvaluator(observedEmail) {
  try {
    const userContext = createUserContext();
    
    if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR && userContext.role !== SPECIAL_ROLES.ADMINISTRATOR) {
      return { success: false, error: ERROR_MESSAGES.PERMISSION_DENIED };
    }

    const newObservation = createNewObservation(userContext.email, observedEmail);
    if (!newObservation) {
      return { success: false, error: 'Failed to create a new observation record.' };
    }

    let assignedSubdomains = null;
    // Populate assignedSubdomains for both Peer Evaluator and Administrator to enable toggle functionality
    // Administrators default to full view but can toggle to assigned subdomains
    // ALL years (including probationary P1, P2, P3) now have assigned subdomains
    if (userContext.role === SPECIAL_ROLES.PEER_EVALUATOR || userContext.role === SPECIAL_ROLES.ADMINISTRATOR) {
        assignedSubdomains = getAssignedSubdomainsForRoleYear(newObservation.observedRole, newObservation.observedYear);
    }

    // Administrator evaluates on full rubric, Peer Evaluator uses assigned subdomains
    const viewMode = (userContext.role === SPECIAL_ROLES.ADMINISTRATOR)
      ? 'full'
      : (userContext.role === SPECIAL_ROLES.PEER_EVALUATOR)
        ? 'assigned'
        : 'full';
      
    const rubricData = getAllDomainsData(
      newObservation.observedRole,
      newObservation.observedYear,
      viewMode,
      assignedSubdomains
    );
    
    const evaluatorContext = createFilteredUserContext(observedEmail, userContext.role);
    rubricData.userContext = evaluatorContext;

    return { 
        success: true, 
        observation: newObservation,
        rubricData: rubricData
    };

  } catch (error) {
    console.error('Error in createNewObservationForEvaluator:', error);
    return { success: false, error: 'An unexpected error occurred: ' + error.message };
  }
}

/**
 * Creates a new Work Product observation for an evaluator.
 * @param {string} observedEmail The email of the staff member to be observed.
 * @returns {Object} A response object containing the new observation and the rubric data.
 */
function createWorkProductObservationForEvaluator(observedEmail) {
  try {
    const userContext = createUserContext();

    if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR) {
      return { success: false, error: ERROR_MESSAGES.PERMISSION_DENIED };
    }

    const newObservation = createWorkProductObservation(userContext.email, observedEmail);
    if (!newObservation) {
      return { success: false, error: 'Failed to create work product observation.' };
    }

    let assignedSubdomains = null;
    // Peer Evaluator should use assigned subdomains approach, Administrator should see all subdomains
    if (userContext.role === SPECIAL_ROLES.PEER_EVALUATOR) {
        assignedSubdomains = getAssignedSubdomainsForRoleYear(newObservation.observedRole, newObservation.observedYear);
    }

    // Administrator evaluates on full rubric, Peer Evaluator uses assigned subdomains
    const viewMode = (userContext.role === SPECIAL_ROLES.ADMINISTRATOR)
      ? 'full'
      : (userContext.role === SPECIAL_ROLES.PEER_EVALUATOR)
        ? 'assigned'
        : 'full';

    const rubricData = getAllDomainsData(
      newObservation.observedRole,
      newObservation.observedYear,
      viewMode,
      assignedSubdomains
    );

    const evaluatorContext = createFilteredUserContext(observedEmail, userContext.role);
    rubricData.userContext = evaluatorContext;

    return {
      success: true,
      observation: newObservation,
      rubricData: rubricData,
      userContext: userContext
    };
  } catch (error) {
    console.error('Error in createWorkProductObservationForEvaluator:', error);
    return { success: false, error: 'An unexpected error occurred: ' + error.message };
  }
}

/**
 * Creates a new Instructional Round observation for a Peer Evaluator.
 * @param {string} observedEmail The email of the staff member to be observed.
 * @returns {Object} A response object containing the new observation and the rubric data.
 */
function createInstructionalRoundObservationForEvaluator(observedEmail) {
  try {
    const userContext = createUserContext();

    if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR) {
      return { success: false, error: ERROR_MESSAGES.PERMISSION_DENIED };
    }

    const newObservation = createInstructionalRoundObservation(userContext.email, observedEmail);
    if (!newObservation) {
      return { success: false, error: 'Failed to create instructional round observation.' };
    }

    let assignedSubdomains = null;
    // Peer Evaluator should use assigned subdomains approach
    if (userContext.role === SPECIAL_ROLES.PEER_EVALUATOR) {
        assignedSubdomains = getAssignedSubdomainsForRoleYear(newObservation.observedRole, newObservation.observedYear);
    }

    // Peer Evaluator uses assigned subdomains
    const viewMode = (userContext.role === SPECIAL_ROLES.ADMINISTRATOR)
      ? 'full'
      : (userContext.role === SPECIAL_ROLES.PEER_EVALUATOR)
        ? 'assigned'
        : 'full';

    const rubricData = getAllDomainsData(
      newObservation.observedRole,
      newObservation.observedYear,
      viewMode,
      assignedSubdomains
    );

    const evaluatorContext = createFilteredUserContext(observedEmail, userContext.role);
    rubricData.userContext = evaluatorContext;

    return {
      success: true,
      observation: newObservation,
      rubricData: rubricData,
      userContext: userContext
    };
  } catch (error) {
    console.error('Error in createInstructionalRoundObservationForEvaluator:', error);
    return { success: false, error: 'An unexpected error occurred: ' + error.message };
  }
}

/**
 * Gets work product questions for client-side use.
 * @returns {Object} A response object containing the questions array.
 */
function getWorkProductQuestionsForClient() {
  try {
    const questions = getWorkProductQuestions();
    return { success: true, questions: questions };
  } catch (error) {
    console.error('Error in getWorkProductQuestionsForClient:', error);
    return { success: false, error: 'Failed to load questions: ' + error.message };
  }
}

/**
 * Saves a work product answer from client-side.
 * @param {string} observationId The ID of the observation.
 * @param {string} questionId The ID of the question.
 * @param {string} answerText The answer text.
 * @returns {Object} A response object with success status.
 */
function saveWorkProductAnswerFromClient(observationId, questionId, answerText) {
  try {
    const userContext = createUserContext();

    // Verify user has access to this observation
    const observation = getObservationById(observationId);
    if (!observation || observation.observedEmail !== userContext.email) {
      return { success: false, error: 'Access denied to this observation.' };
    }

    // Save to Google Doc instead of spreadsheet
    const saved = saveWorkProductAnswerToDoc(observationId, questionId, answerText);
    return { success: saved };
  } catch (error) {
    console.error('Error in saveWorkProductAnswerFromClient:', error);
    return { success: false, error: 'Failed to save answer: ' + error.message };
  }
}

/**
 * Gets work product answers for client-side use.
 * @param {string} observationId The ID of the observation.
 * @returns {Object} A response object containing the answers array.
 */
function getWorkProductAnswersForClient(observationId) {
  try {
    const userContext = createUserContext();

    // Verify user has access to this observation
    const observation = getObservationById(observationId);
    if (!observation) {
      return { success: false, error: 'Observation not found.' };
    }

    // Allow access for observed staff or peer evaluators
    if (observation.observedEmail !== userContext.email &&
        userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR) {
      return { success: false, error: 'Access denied to this observation.' };
    }

    // Get answers from Google Doc instead of spreadsheet
    const answers = getWorkProductAnswersFromDoc(observationId);
    return { success: true, answers: answers };
  } catch (error) {
    console.error('Error in getWorkProductAnswersForClient:', error);
    return { success: false, error: 'Failed to load answers: ' + error.message };
  }
}

/**
 * Gets the current user's work product observation ID and ensures response doc exists.
 * @returns {Object} A response object containing the observation ID.
 */
function getCurrentUserWorkProductObservationId() {
  try {
    const userContext = createUserContext();
    const observations = _getObservationsDb();

    const userWorkProductObs = observations.find(obs =>
      obs.observedEmail === userContext.email &&
      obs.Type === 'Work Product' &&
      obs.status === 'Draft'
    );

    if (userWorkProductObs) {
      // Ensure response document exists
      const peerEvaluatorEmail = userWorkProductObs.observerEmail;
      const docResult = createOrGetWorkProductResponseDoc(
        userWorkProductObs.observationId,
        userContext.email,
        peerEvaluatorEmail
      );

      if (!docResult) {
        console.warn('Failed to create/get response document, but continuing...');
      }

      return { success: true, observationId: userWorkProductObs.observationId };
    } else {
      return { success: false, error: 'No work product observation found' };
    }
  } catch (error) {
    console.error('Error getting current user work product observation:', error);
    return { success: false, error: 'Failed to get observation ID: ' + error.message };
  }
}

/**
 * Gets standard observation questions for client-side use.
 * @returns {Object} A response object containing the questions array.
 */
function getStandardObservationQuestionsForClient() {
  try {
    const questions = getStandardObservationQuestions();
    return { success: true, questions: questions };
  } catch (error) {
    console.error('Error in getStandardObservationQuestionsForClient:', error);
    return { success: false, error: 'Failed to load questions: ' + error.message };
  }
}

/**
 * Saves a standard observation answer from client-side.
 * @param {string} observationId The ID of the observation.
 * @param {string} questionId The ID of the question.
 * @param {string} answerText The answer text.
 * @returns {Object} A response object with success status.
 */
function saveStandardObservationAnswerFromClient(observationId, questionId, answerText) {
  try {
    const userContext = createUserContext();

    // Verify user has access to this observation
    const observation = getObservationById(observationId);
    if (!observation || observation.observedEmail !== userContext.email) {
      return { success: false, error: 'Access denied to this observation.' };
    }

    // Verify observation is Standard type and created by Peer Evaluator
    if ((observation.Type || 'Standard') !== 'Standard') {
      return { success: false, error: 'This is not a standard observation.' };
    }

    const observer = getUserByEmail(observation.observerEmail);
    if (!observer || observer.role !== 'Peer Evaluator') {
      return { success: false, error: 'This observation was not created by a Peer Evaluator.' };
    }

    // Save to Google Doc
    const saved = saveStandardObservationAnswerToDoc(observationId, questionId, answerText);
    return { success: saved };
  } catch (error) {
    console.error('Error in saveStandardObservationAnswerFromClient:', error);
    return { success: false, error: 'Failed to save answer: ' + error.message };
  }
}

/**
 * Gets standard observation answers for client-side use.
 * @param {string} observationId The ID of the observation.
 * @returns {Object} A response object containing the answers array.
 */
function getStandardObservationAnswersForClient(observationId) {
  try {
    const userContext = createUserContext();

    // Verify user has access to this observation
    const observation = getObservationById(observationId);
    if (!observation) {
      return { success: false, error: 'Observation not found.' };
    }

    // Allow access for observed staff or peer evaluators
    if (observation.observedEmail !== userContext.email &&
        userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR) {
      return { success: false, error: 'Access denied to this observation.' };
    }

    // Get answers from Google Doc
    const answers = getStandardObservationAnswersFromDoc(observationId);
    return { success: true, answers: answers };
  } catch (error) {
    console.error('Error in getStandardObservationAnswersForClient:', error);
    return { success: false, error: 'Failed to load answers: ' + error.message };
  }
}

/**
 * Gets the current user's standard observation ID (created by Peer Evaluator) and ensures response doc exists.
 * @returns {Object} A response object containing the observation ID.
 */
function getCurrentUserStandardObservationId() {
  try {
    const userContext = createUserContext();
    const observations = _getObservationsDb();

    const userStandardObs = observations.find(obs => {
      if (obs.observedEmail !== userContext.email) return false;
      if ((obs.Type || 'Standard') !== 'Standard') return false;
      if (obs.status !== 'Draft') return false;

      // Check if observer is Peer Evaluator
      const observer = getUserByEmail(obs.observerEmail);
      return observer && observer.role === 'Peer Evaluator';
    });

    if (userStandardObs) {
      // Ensure response document exists
      const peerEvaluatorEmail = userStandardObs.observerEmail;
      const docResult = createOrGetStandardObservationResponseDoc(
        userStandardObs.observationId,
        userContext.email,
        peerEvaluatorEmail
      );

      if (!docResult) {
        console.warn('Failed to create/get response document, but continuing...');
      }

      return { success: true, observationId: userStandardObs.observationId };
    } else {
      return { success: false, error: 'No standard observation from Peer Evaluator found' };
    }
  } catch (error) {
    console.error('Error getting current user standard observation:', error);
    return { success: false, error: 'Failed to get observation ID: ' + error.message };
  }
}

/**
 * Gets the current user's instructional round observation ID and ensures response doc exists.
 * @returns {Object} A response object containing the observation ID.
 */
function getCurrentUserInstructionalRoundObservationId() {
  try {
    const userContext = createUserContext();
    const observations = _getObservationsDb();

    const userInstructionalRoundObs = observations.find(obs => {
      if (obs.observedEmail !== userContext.email) return false;
      if (obs.Type !== 'Instructional Round') return false;
      if (obs.status !== 'Draft') return false;

      // Check if observer is Peer Evaluator
      const observer = getUserByEmail(obs.observerEmail);
      return observer && observer.role === 'Peer Evaluator';
    });

    if (userInstructionalRoundObs) {
      // Ensure response document exists
      const peerEvaluatorEmail = userInstructionalRoundObs.observerEmail;
      const docResult = createOrGetInstructionalRoundResponseDoc(
        userInstructionalRoundObs.observationId,
        userContext.email,
        peerEvaluatorEmail
      );

      if (!docResult) {
        console.warn('Failed to create/get response document, but continuing...');
      }

      return { success: true, observationId: userInstructionalRoundObs.observationId };
    } else {
      return { success: false, error: 'No instructional round observation from Peer Evaluator found' };
    }
  } catch (error) {
    console.error('Error getting current user instructional round observation:', error);
    return { success: false, error: 'Failed to get observation ID: ' + error.message };
  }
}

/**
 * Saves an instructional round answer from the client.
 * @param {string} observationId The ID of the observation.
 * @param {string} questionId The ID of the question.
 * @param {string} answerText The answer text.
 * @returns {Object} A response object with success status.
 */
function saveInstructionalRoundAnswerFromClient(observationId, questionId, answerText) {
  try {
    const userContext = createUserContext();
    const observation = getObservationById(observationId);

    if (!observation) {
      return { success: false, error: 'Observation not found.' };
    }

    // Allow access for observed staff or peer evaluators
    if (observation.observedEmail !== userContext.email &&
        userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR) {
      return { success: false, error: 'Access denied to this observation.' };
    }

    const saved = saveInstructionalRoundAnswerToDoc(observationId, questionId, answerText);
    return { success: saved };
  } catch (error) {
    console.error('Error in saveInstructionalRoundAnswerFromClient:', error);
    return { success: false, error: 'Failed to save answer: ' + error.message };
  }
}

/**
 * Gets instructional round answers for the client.
 * @param {string} observationId The ID of the observation.
 * @returns {Object} A response object containing the answers array.
 */
function getInstructionalRoundAnswersForClient(observationId) {
  try {
    const userContext = createUserContext();
    const observation = getObservationById(observationId);

    if (!observation) {
      return { success: false, error: 'Observation not found.' };
    }

    // Allow access for observed staff or peer evaluators
    if (observation.observedEmail !== userContext.email &&
        userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR) {
      return { success: false, error: 'Access denied to this observation.' };
    }

    // Get answers from Google Doc
    const answers = getInstructionalRoundAnswersFromDoc(observationId);
    return { success: true, answers: answers };
  } catch (error) {
    console.error('Error in getInstructionalRoundAnswersForClient:', error);
    return { success: false, error: 'Failed to load answers: ' + error.message };
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
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR && userContext.role !== SPECIAL_ROLES.ADMINISTRATOR) {
            return { success: false, error: ERROR_MESSAGES.PERMISSION_DENIED };
        }

        const observation = getObservationById(observationId);
        if (!observation) {
            return { success: false, error: 'Observation not found.' };
        }
        if (observation.observerEmail !== userContext.email) {
            return { success: false, error: 'You do not have permission to edit this observation.' };
        }
        
        let assignedSubdomains = null;
        if (userContext.role === SPECIAL_ROLES.PEER_EVALUATOR || userContext.role === SPECIAL_ROLES.ADMINISTRATOR) {
            assignedSubdomains = getAssignedSubdomainsForRoleYear(observation.observedRole, observation.observedYear);
        }

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
        // Allow both Peer Evaluator and Administrator to delete observations
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR && userContext.role !== SPECIAL_ROLES.ADMINISTRATOR) {
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
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR && userContext.role !== SPECIAL_ROLES.ADMINISTRATOR) {
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
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR && userContext.role !== SPECIAL_ROLES.ADMINISTRATOR) {
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
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR && userContext.role !== SPECIAL_ROLES.ADMINISTRATOR) {
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
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR && userContext.role !== SPECIAL_ROLES.ADMINISTRATOR) {
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
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR && userContext.role !== SPECIAL_ROLES.ADMINISTRATOR) {
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
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR && userContext.role !== SPECIAL_ROLES.ADMINISTRATOR) {
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
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR && userContext.role !== SPECIAL_ROLES.ADMINISTRATOR) {
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
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR && userContext.role !== SPECIAL_ROLES.ADMINISTRATOR) {
            return { success: false, error: ERROR_MESSAGES.PERMISSION_DENIED };
        }

        // Step 1: Generate script PDF first if script content exists
        let scriptPdfResult = null;
        const observation = getObservationById(observationId);
        if (observation && observation.scriptContent) {
            debugLog('Generating script PDF during finalization', { observationId });
            scriptPdfResult = generateScriptPDF(observationId);
            if (!scriptPdfResult.success) {
                debugLog('Script PDF generation failed during finalization', { 
                    observationId, 
                    error: scriptPdfResult.error 
                });
                // Continue with main PDF even if script PDF fails
            }
        }

        // Step 2: Generate the main observation PDF.
        const pdfProcessingResult = PdfService.processPdfForFinalization(observationId, userContext);

        // Step 3: Now that all files are in place, update the status.
        // This will trigger folder sharing and email notifications.
        const statusUpdateResult = updateObservationStatus(observationId, OBSERVATION_STATUS.FINALIZED, userContext.email);
        if (!statusUpdateResult.success) {
            // If the final step fails, we return its error, though the PDFs are already created.
            return statusUpdateResult;
        }

        // Step 4: Construct the final success response.
        const result = {
            success: true,
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
        return { success: false, error: 'An unexpected error occurred during finalization: ' + error.message };
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
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR && userContext.role !== SPECIAL_ROLES.ADMINISTRATOR) {
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
        // For finalized observations, default to 'assigned' view mode to show relevant subdomains
        const rubricData = getAllDomainsData(observation.observedRole, observation.observedYear, 'assigned', assignedSubdomains);

        // CRITICAL FIX: Keep the viewer's actual context, don't switch to observed staff context
        // The main user context should always reflect the person actually viewing the page
        const actualViewerContext = viewingUserContext;

        // Create separate display information for the observed staff member
        const observedStaffInfo = {
            email: observation.observedEmail,
            name: observation.observedName,
            role: observation.observedRole,
            year: observation.observedYear
        };

        // Configure viewer context based on who is viewing
        if (isObserved) {
            // The observed staff member is viewing their own observation
            actualViewerContext.isObservedStaff = true;
            actualViewerContext.isEvaluator = false; // Read-only for observed staff
            actualViewerContext.viewMode = 'assigned'; // Show only relevant subdomains
            
            debugLog('Finalized observation loaded for the observed staff member.', {
                observationId: observationId,
                userEmail: viewingUserContext.email,
                isObservedStaff: actualViewerContext.isObservedStaff,
                viewMode: actualViewerContext.viewMode
            });
        } else {
            // Peer Evaluator, Administrator, or other authorized viewer
            actualViewerContext.isObservedStaff = false;
            // Maintain the viewer's original evaluator status and permissions
            if (actualViewerContext.role === SPECIAL_ROLES.ADMINISTRATOR) {
                actualViewerContext.isEvaluator = false; // Read-only for finalized observations
                actualViewerContext.viewMode = 'full'; // Administrators always see full rubric
            } else if (actualViewerContext.role === SPECIAL_ROLES.PEER_EVALUATOR) {
                actualViewerContext.isEvaluator = false; // Read-only for finalized observations
                // Peer evaluators can choose their view mode
                actualViewerContext.viewMode = actualViewerContext.hasSpecialAccess ? 'full' : 'assigned';
            } else {
                actualViewerContext.isEvaluator = false;
                actualViewerContext.viewMode = 'assigned';
            }
            
            debugLog('Finalized observation loaded for peer evaluator viewing.', {
                observationId: observationId,
                viewerEmail: viewingUserContext.email,
                viewerRole: actualViewerContext.role,
                viewMode: actualViewerContext.viewMode
            });
        }

        // Attach the viewer's actual context and observed staff info to the rubric data
        rubricData.userContext = actualViewerContext;
        rubricData.observedStaffInfo = observedStaffInfo;

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
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR && userContext.role !== SPECIAL_ROLES.ADMINISTRATOR) {
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
 * Retrieves finalized observations for a staff member to view their own observation materials
 * @param {string} staffEmail Optional email - if not provided, uses current user's email
 * @returns {Object} Response object with success status and observations array
 */
function getFinalizedObservationsForStaff(staffEmail = null) {
    try {
        const userContext = createUserContext();
        
        // Use provided email or current user's email
        const targetEmail = staffEmail || userContext.email;
        
        if (!targetEmail) {
            return { success: false, error: 'Unable to determine user email' };
        }
        
        // Get finalized observations for this staff member
        const observations = getObservationsForUser(targetEmail, OBSERVATION_STATUS.FINALIZED);
        
        // Enhanced observations with file listing and folder URL from Drive folders
        const enhancedObservations = observations.map(obs => {
            try {
                // Get observation folder and list files
                const files = getObservationFiles(obs.observationId);
                
                // Get the folder URL for direct access - prioritize stored URL over search
                let folderUrl = obs.folderUrl; // Use stored folder URL if available
                
                if (!folderUrl) {
                    // Fallback: Use read-only lookup for older observations that don't have stored URLs
                    try {
                        const folder = getExistingObservationFolder(obs.observationId);
                        if (folder) {
                            folderUrl = folder.getUrl();
                            debugLog(`Found existing observation folder via search for staff view`, { 
                                observationId: obs.observationId,
                                folderId: folder.getId()
                            });
                        } else {
                            console.warn(`No folder URL stored and no existing observation folder found for ${obs.observationId}. This may indicate the observation has not been properly finalized or the folder is not accessible.`);
                        }
                    } catch (folderError) {
                        console.warn(`Could not search for folder URL for observation ${obs.observationId}:`, folderError);
                    }
                } else {
                    debugLog(`Using stored folder URL for staff view`, { 
                        observationId: obs.observationId,
                        folderUrl: folderUrl
                    });
                }
                
                return {
                    ...obs,
                    files: files || [],
                    folderUrl: folderUrl
                };
            } catch (error) {
                console.warn(`Could not load files for observation ${obs.observationId}:`, error);
                return {
                    ...obs,
                    files: [],
                    folderUrl: null
                };
            }
        });
        
        debugLog('Retrieved finalized observations for staff', {
            email: targetEmail,
            observationCount: enhancedObservations.length
        });
        
        return { 
            success: true, 
            observations: enhancedObservations 
        };
        
    } catch (error) {
        console.error('Error in getFinalizedObservationsForStaff:', error);
        return { success: false, error: 'An unexpected error occurred while retrieving observations.' };
    }
}

/**
 * Helper function to get files from an observation's Drive folder
 * @param {string} observationId The observation ID
 * @returns {Array} Array of file objects with name, url, and type
 */
function getObservationFiles(observationId) {
    try {
        const observation = getObservationById(observationId);
        if (!observation) return [];
        
        // Get the observation folder from Drive
        const folderName = `Observation - ${observationId}`;
        const userFolderName = observation.observedName || 'Unknown User';
        
        // Search for the folder in Drive
        const folders = DriveApp.searchFolders(`title contains "${userFolderName}"`);
        while (folders.hasNext()) {
            const userFolder = folders.next();
            const obsFolders = userFolder.searchFolders(`title contains "${folderName}"`);
            if (obsFolders.hasNext()) {
                const obsFolder = obsFolders.next();
                const files = obsFolder.getFiles();
                const fileList = [];
                
                while (files.hasNext()) {
                    const file = files.next();
                    fileList.push({
                        name: file.getName(),
                        url: file.getUrl(),
                        type: file.getMimeType(),
                        size: file.getSize(),
                        lastModified: file.getLastUpdated().toISOString()
                    });
                }
                
                return fileList.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
            }
        }
        
        return [];
    } catch (error) {
        console.error(`Error getting files for observation ${observationId}:`, error);
        return [];
    }
}

/**
 * Uploads a file to the observation's Drive folder (observation-level, not component-specific).
 * This is for the global media manager feature.
 * @param {string} observationId The ID of the observation
 * @param {string} base64Data The base64 encoded file data
 * @param {string} fileName The original file name
 * @param {string} mimeType The MIME type of the file
 * @returns {Object} A response object with success status and file details
 */
function uploadGlobalMediaFile(observationId, base64Data, fileName, mimeType) {
    try {
        const userContext = createUserContext();

        // Only peer evaluators and administrators can upload files
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR && userContext.role !== SPECIAL_ROLES.ADMINISTRATOR) {
            return { success: false, error: ERROR_MESSAGES.PERMISSION_DENIED };
        }

        if (!observationId || !base64Data || !fileName || !mimeType) {
            return { success: false, error: 'Missing required parameters for upload.' };
        }

        const observation = getObservationById(observationId);
        if (!observation) {
            return { success: false, error: 'Observation not found.' };
        }

        // Verify the current user is the observer
        if (observation.observerEmail !== userContext.email) {
            return { success: false, error: 'Permission denied. You did not create this observation.' };
        }

        // Get or create the observation folder
        const obsFolder = getOrCreateObservationFolder(observationId);

        // Decode base64 and create a blob
        const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);

        // Create the file in the observation folder
        const file = obsFolder.createFile(blob);
        const fileUrl = file.getUrl();
        const fileId = file.getId();

        debugLog('Global media file uploaded', {
            observationId,
            fileName,
            fileId,
            uploadedBy: userContext.email
        });

        return {
            success: true,
            fileUrl: fileUrl,
            fileId: fileId,
            fileName: fileName,
            fileType: mimeType,
            uploadedAt: new Date().toISOString()
        };

    } catch (error) {
        console.error('Error in uploadGlobalMediaFile:', error);
        return { success: false, error: 'Failed to upload file: ' + error.message };
    }
}

/**
 * Deletes a file from an observation's Drive folder and removes it from evidenceLinks if present.
 * @param {string} observationId The ID of the observation
 * @param {string} fileName The name of the file to delete
 * @returns {Object} A response object with success status
 */
function deleteObservationFile(observationId, fileName) {
    try {
        const userContext = createUserContext();

        // Only peer evaluators and administrators can delete files
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR && userContext.role !== SPECIAL_ROLES.ADMINISTRATOR) {
            return { success: false, error: ERROR_MESSAGES.PERMISSION_DENIED };
        }

        if (!observationId || !fileName) {
            return { success: false, error: 'Observation ID and file name are required.' };
        }

        const observation = getObservationById(observationId);
        if (!observation) {
            return { success: false, error: 'Observation not found.' };
        }

        // Verify the current user is the observer
        if (observation.observerEmail !== userContext.email) {
            return { success: false, error: 'Permission denied. You did not create this observation.' };
        }

        // Get the observation folder from Drive
        const folderName = `Observation - ${observationId}`;
        const userFolderName = observation.observedName || 'Unknown User';

        let fileDeleted = false;
        let fileUrl = null;

        // Search for the folder and file in Drive
        const folders = DriveApp.searchFolders(`title contains "${userFolderName}"`);
        while (folders.hasNext()) {
            const userFolder = folders.next();
            const obsFolders = userFolder.searchFolders(`title contains "${folderName}"`);
            if (obsFolders.hasNext()) {
                const obsFolder = obsFolders.next();
                const files = obsFolder.getFilesByName(fileName);

                if (files.hasNext()) {
                    const file = files.next();
                    fileUrl = file.getUrl();
                    const fileId = file.getId();
                    const mimeType = file.getMimeType();
                    const isShortcut = mimeType === 'application/vnd.google-apps.shortcut';

                    // Delete the file (works for both shortcuts and actual files)
                    file.setTrashed(true);
                    fileDeleted = true;

                    debugLog('File moved to trash', {
                        observationId,
                        fileName,
                        fileId: fileId,
                        isShortcut: isShortcut,
                        mimeType: mimeType,
                        deletedBy: userContext.email
                    });
                    break;
                }
            }
        }

        if (!fileDeleted) {
            return { success: false, error: 'File not found in observation folder.' };
        }

        // Clean up evidenceLinks if the file exists there
        if (observation.evidenceLinks && fileUrl) {
            let linksUpdated = false;
            const updatedEvidenceLinks = {};

            for (const componentId in observation.evidenceLinks) {
                const componentLinks = observation.evidenceLinks[componentId];
                if (Array.isArray(componentLinks)) {
                    // Filter out the deleted file by matching URL or name
                    const filteredLinks = componentLinks.filter(link =>
                        link.url !== fileUrl && link.name !== fileName
                    );

                    if (filteredLinks.length !== componentLinks.length) {
                        linksUpdated = true;
                    }

                    // Only keep the component if it still has links
                    if (filteredLinks.length > 0) {
                        updatedEvidenceLinks[componentId] = filteredLinks;
                    }
                } else {
                    updatedEvidenceLinks[componentId] = componentLinks;
                }
            }

            if (linksUpdated) {
                // Update the observation with cleaned evidenceLinks
                observation.evidenceLinks = updatedEvidenceLinks;
                const updateResult = updateObservationInSheet(observation);

                if (updateResult.success) {
                    debugLog('EvidenceLinks updated after file deletion', {
                        observationId,
                        fileName
                    });
                } else {
                    console.warn('File deleted from Drive but failed to update evidenceLinks:', updateResult.error);
                }
            }
        }

        return {
            success: true,
            message: 'File deleted successfully.',
            fileName: fileName
        };

    } catch (error) {
        console.error('Error in deleteObservationFile:', error);
        return { success: false, error: 'Failed to delete file: ' + error.message };
    }
}

/**
 * Adds a Google Doc/Sheet/Slide by moving the file or creating a shortcut in the observation folder.
 * If the current user owns the file, it will be moved. Otherwise, a shortcut is created.
 * @param {string} observationId The ID of the observation
 * @param {string} docUrl The URL of the Google Doc/Sheet/Slide
 * @param {string} docName Optional name (deprecated, kept for backward compatibility)
 * @returns {Object} A response object with success status
 */
function addGoogleDocLink(observationId, docUrl, docName = null) {
    try {
        const userContext = createUserContext();

        // Only peer evaluators and administrators can add links
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR && userContext.role !== SPECIAL_ROLES.ADMINISTRATOR) {
            return { success: false, error: ERROR_MESSAGES.PERMISSION_DENIED };
        }

        if (!observationId || !docUrl) {
            return { success: false, error: 'Observation ID and document URL are required.' };
        }

        // Validate URL format
        if (!docUrl.startsWith('http://') && !docUrl.startsWith('https://')) {
            return { success: false, error: 'Invalid URL format. URL must start with http:// or https://' };
        }

        const observation = getObservationById(observationId);
        if (!observation) {
            return { success: false, error: 'Observation not found.' };
        }

        // Verify the current user is the observer
        if (observation.observerEmail !== userContext.email) {
            return { success: false, error: 'Permission denied. You did not create this observation.' };
        }

        // Extract file ID from Google Docs/Sheets/Slides URL
        const fileId = extractGoogleFileId(docUrl);
        if (!fileId) {
            return { success: false, error: 'Invalid Google Docs/Sheets/Slides URL. Could not extract file ID.' };
        }

        // Try to access the file
        let file;
        try {
            file = DriveApp.getFileById(fileId);
        } catch (error) {
            return { success: false, error: 'Could not access the file. Please check the URL and ensure you have permission to access the document.' };
        }

        // Get or create the observation folder
        const obsFolder = getOrCreateObservationFolder(observationId);

        // Check if the current user is the owner of the file
        let isOwner = false;
        try {
            const owner = file.getOwner();
            isOwner = owner && owner.getEmail() === userContext.email;
        } catch (error) {
            // If we can't get owner info, assume not owner
            console.warn('Could not determine file ownership:', error);
        }

        let resultFile;
        let actionTaken;

        if (isOwner) {
            // User owns the file - move it to the observation folder
            try {
                // Remove from all current parents and add to observation folder
                const parents = file.getParents();
                while (parents.hasNext()) {
                    const parent = parents.next();
                    parent.removeFile(file);
                }
                obsFolder.addFile(file);
                resultFile = file;
                actionTaken = 'moved';

                debugLog('Google Doc file moved to observation folder', {
                    observationId,
                    fileId: fileId,
                    fileName: file.getName(),
                    movedBy: userContext.email
                });
            } catch (error) {
                return { success: false, error: 'Failed to move the file: ' + error.message };
            }
        } else {
            // User does not own the file - create a shortcut
            try {
                resultFile = obsFolder.createShortcut(fileId);
                actionTaken = 'shortcut_created';

                debugLog('Shortcut to Google Doc created in observation folder', {
                    observationId,
                    fileId: fileId,
                    shortcutId: resultFile.getId(),
                    fileName: file.getName(),
                    createdBy: userContext.email
                });
            } catch (error) {
                return { success: false, error: 'Failed to create shortcut: ' + error.message };
            }
        }

        return {
            success: true,
            fileUrl: resultFile.getUrl(),
            fileId: resultFile.getId(),
            fileName: resultFile.getName(),
            linkedUrl: docUrl,
            actionTaken: actionTaken,
            isOwner: isOwner
        };

    } catch (error) {
        console.error('Error in addGoogleDocLink:', error);
        return { success: false, error: 'Failed to add link: ' + error.message };
    }
}

/**
 * Extracts the file ID from a Google Docs/Sheets/Slides URL.
 * Supports various URL formats:
 * - https://docs.google.com/document/d/{FILE_ID}/edit
 * - https://docs.google.com/spreadsheets/d/{FILE_ID}/edit
 * - https://docs.google.com/presentation/d/{FILE_ID}/edit
 * @param {string} url The Google Docs URL
 * @returns {string|null} The file ID or null if not found
 * @private
 */
function extractGoogleFileId(url) {
    try {
        // Pattern to match Google Docs/Sheets/Slides URLs
        const patterns = [
            /\/d\/([a-zA-Z0-9_-]+)/,  // Match /d/{FILE_ID}
            /id=([a-zA-Z0-9_-]+)/,     // Match id={FILE_ID}
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }

        return null;
    } catch (error) {
        console.error('Error extracting file ID from URL:', error);
        return null;
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
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR && userContext.role !== SPECIAL_ROLES.ADMINISTRATOR) {
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
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR && userContext.role !== SPECIAL_ROLES.ADMINISTRATOR) {
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
        
        // The observationName is metadata only and should not affect the folder name,
        // which is based on the immutable observationId.
        // The logic to rename the folder has been removed to fix the bug.


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
        // Verify user context and permissions
        const userContext = createUserContext();
        if (!userContext || !userContext.email) {
            return { success: false, error: 'Invalid user session.' };
        }

        const observation = getObservationById(observationId);
        if (!observation) {
            return { success: false, error: 'Observation not found.' };
        }

        // Ensure only the observation creator can upload recordings
        if (observation.observerEmail !== userContext.email) {
            return { success: false, error: 'Permission denied. You did not create this observation.' };
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
        // Note: File remains private until observation is finalized
        // Staff member will get access when folder is shared during finalization

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

        // Enhanced debug logging to track script content state
        const scriptContentInfo = {
            contentSource: contentSource,
            contentType: typeof scriptContent,
            hasOps: scriptContent && scriptContent.ops ? true : false,
            opsCount: scriptContent && scriptContent.ops ? scriptContent.ops.length : 0,
            hasComponentTags: observation.componentTags && Object.keys(observation.componentTags).length > 0,
            componentTagsCount: observation.componentTags ? Object.keys(observation.componentTags).length : 0,
            lastModifiedAt: observation.lastModifiedAt || 'not set',
            observationStatus: observation.status
        };

        debugLog('Starting script PDF generation with content details', {
            observationId,
            ...scriptContentInfo
        });

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
        let opsProcessed = 0;
        let paragraphsAdded = 0;
        let opsSkipped = 0;

        scriptContent.ops.forEach(op => {
            opsProcessed++;
            if (op.insert && typeof op.insert === 'string') {
                const text = op.insert;
                if (text.trim() || text === '\n') {
                    const p = body.appendParagraph(text);
                    paragraphsAdded++;
                    if (op.attributes) {
                        const style = {};
                        if (op.attributes.bold) style[DocumentApp.Attribute.BOLD] = true;
                        if (op.attributes.italic) style[DocumentApp.Attribute.ITALIC] = true;
                        if (op.attributes.underline) style[DocumentApp.Attribute.UNDERLINE] = true;
                        if (Object.keys(style).length > 0) p.setAttributes(style);
                        if (op.attributes.header === 1) p.setHeading(DocumentApp.ParagraphHeading.HEADING3);
                        if (op.attributes.header === 2) p.setHeading(DocumentApp.ParagraphHeading.HEADING4);
                    }
                } else {
                    opsSkipped++;
                }
            } else {
                opsSkipped++;
            }
        });

        debugLog('Script PDF content rendering stats', {
            observationId: observation.observationId,
            opsProcessed,
            paragraphsAdded,
            opsSkipped,
            hasComponentTags: observation.componentTags && Object.keys(observation.componentTags).length > 0
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
        // Filter for all probationary years: P1, P2, P3
        filteredUsers = filteredUsers.filter(user =>
          [PROB_YEAR_1, PROB_YEAR_2, PROB_YEAR_3].includes(user.year)
        );
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
      year: (user.year !== null && user.year !== undefined) ? user.year : null,
      displayName: `${user.name || 'Unknown'} (${user.role || 'Unknown'}, Year ${formatYearDisplay(user.year)})`
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

  // If assignedSubdomains is not provided, still need to set componentId for all components
  // (Required for Administrators who use full view without assigned subdomains)
  if (!assignedSubdomains) {
    return domains.map(domain => ({
      ...domain,
      components: domain.components ? domain.components.map(component => ({
        ...component,
        componentId: extractComponentId(component.title),
        isAssigned: false  // All components treated as not assigned in full view mode
      })) : []
    }));
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

      // Always send all components to client for toggle functionality
      // The client-side will handle visibility based on view mode
      let filteredComponents = enhancedComponents;

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
    // Always enhance domains with assignments - this adds componentId to all components
    // For Administrators (null assignedSubdomains), componentId is added without assignment info
    // For Peer Evaluators (with assignedSubdomains), componentId and isAssigned flags are added
    result.domains = enhanceDomainsWithAssignments(result.domains, effectiveAssignedSubdomains, effectiveViewMode);
    if (effectiveAssignedSubdomains) {
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

/**
 * Comprehensive test function to verify the fix for the orphaned folder bug.
 * Tests both scenarios: deleting observations without folders AND deleting observations with existing folders.
 * To run this test, you must first create a copy of the production spreadsheet for testing.
 *
 * INSTRUCTIONS:
 * 1. Create a copy of the spreadsheet.
 * 2. In the script editor, go to File > Project Properties > Script Properties.
 * 3. Add/update a script property named 'TEST_SHEET_ID' with the ID of your test spreadsheet.
 * 4. Run this function from the Apps Script Editor.
 * 5. Check the logs for PASS/FAIL results.
 */
function test_OrphanedFolderBugFix() {
    const originalSheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    const testSheetId = PropertiesService.getScriptProperties().getProperty('TEST_SHEET_ID');

    if (!testSheetId) {
        Logger.log('TEST SKIPPED: Script property "TEST_SHEET_ID" is not set. Cannot run test.');
        return;
    }

    Logger.log('--- Starting Comprehensive Test: Orphaned Folder Bug Fix ---');

    // Temporarily switch to the test spreadsheet
    PropertiesService.getScriptProperties().setProperty('SHEET_ID', testSheetId);
    Logger.log(`Switched to TEST spreadsheet (ID: ${testSheetId})`);

    let testsPassed = 0;
    let testsTotal = 2;

    try {
        const obsSheet = openSpreadsheet().getSheetByName('Observation_Data');
        if (!obsSheet) {
            throw new Error('Test setup failed: "Observation_Data" sheet not found in the test spreadsheet.');
        }

        const observerEmail = Session.getActiveUser().getEmail();
        const headers = obsSheet.getRange(1, 1, 1, obsSheet.getLastColumn()).getValues()[0];

        // TEST 1: Delete observation WITHOUT existing folder (original bug scenario)
        Logger.log('\n=== TEST 1: Delete observation WITHOUT existing folder ===');
        const testObsId1 = 'test-no-folder-' + new Date().getTime();
        const FOLDER_NAME_1 = `Observation - ${testObsId1}`;

        try {
            // Clean up any existing test data
            const range1 = obsSheet.getRange("A:A").createTextFinder(testObsId1).findNext();
            if (range1) {
                obsSheet.deleteRow(range1.getRow());
            }

            // Add dummy observation record
            const rowData1 = new Array(headers.length).fill('');
            rowData1[headers.indexOf('observationId')] = testObsId1;
            rowData1[headers.indexOf('observerEmail')] = observerEmail;
            rowData1[headers.indexOf('observedName')] = 'Test User 1';
            rowData1[headers.indexOf('observedEmail')] = 'test.user1@example.com';
            rowData1[headers.indexOf('status')] = 'Draft';
            rowData1[headers.indexOf('createdAt')] = new Date().toISOString();
            obsSheet.appendRow(rowData1);
            Logger.log(`Test 1 Setup: Created observation record ${testObsId1} (NO folder will be created)`);

            // Verify no folder exists
            const foldersBeforeTest1 = DriveApp.getFoldersByName(FOLDER_NAME_1);
            if (foldersBeforeTest1.hasNext()) {
                foldersBeforeTest1.next().setTrashed(true);
                Logger.log('Test 1 Setup: Cleaned up pre-existing folder');
            }

            // Execute deletion
            Logger.log('Test 1 Execution: Calling deleteObservationRecord...');
            const result1 = deleteObservationRecord(testObsId1, observerEmail);
            if (!result1.success) {
                throw new Error(`Test 1 FAILED: Deletion failed - ${result1.error}`);
            }

            // Verify no orphaned folders were created
            const foldersAfterTest1 = DriveApp.getFoldersByName(FOLDER_NAME_1);
            if (foldersAfterTest1.hasNext()) {
                const createdFolder = foldersAfterTest1.next();
                createdFolder.setTrashed(true);
                throw new Error(`Test 1 FAILED: Folder was created during deletion. Folder ID: ${createdFolder.getId()}`);
            }

            // Verify sheet record was deleted
            const rangeAfterTest1 = obsSheet.getRange("A:A").createTextFinder(testObsId1).findNext();
            if (rangeAfterTest1) {
                throw new Error('Test 1 FAILED: Observation row was not deleted from sheet');
            }

            Logger.log('Test 1 PASSED: No orphaned folder created, sheet record deleted');
            testsPassed++;

        } catch (e) {
            Logger.log(`Test 1 FAILED: ${e.message}`);
        }

        // TEST 2: Delete observation WITH existing folder
        Logger.log('\n=== TEST 2: Delete observation WITH existing folder ===');
        const testObsId2 = 'test-with-folder-' + new Date().getTime();
        const FOLDER_NAME_2 = `Observation - ${testObsId2}`;

        try {
            // Clean up any existing test data
            const range2 = obsSheet.getRange("A:A").createTextFinder(testObsId2).findNext();
            if (range2) {
                obsSheet.deleteRow(range2.getRow());
            }

            // Add dummy observation record
            const rowData2 = new Array(headers.length).fill('');
            rowData2[headers.indexOf('observationId')] = testObsId2;
            rowData2[headers.indexOf('observerEmail')] = observerEmail;
            rowData2[headers.indexOf('observedName')] = 'Test User 2';
            rowData2[headers.indexOf('observedEmail')] = 'test.user2@example.com';
            rowData2[headers.indexOf('status')] = 'Draft';
            rowData2[headers.indexOf('createdAt')] = new Date().toISOString();
            obsSheet.appendRow(rowData2);
            Logger.log(`Test 2 Setup: Created observation record ${testObsId2}`);

            // Create the folder structure that would exist for a real observation
const rootFolderIterator = DriveApp.getFoldersByName('Peer Evaluator Form Data');
const rootFolder = rootFolderIterator.hasNext()
    ? rootFolderIterator.next()
    : DriveApp.createFolder('Peer Evaluator Form Data');

            const userFolderName = 'Test User 2 (test.user2@example.com)';
            const userFolderIterator = rootFolder.getFoldersByName(userFolderName);
            const userFolder = userFolderIterator.hasNext()
                ? userFolderIterator.next()
                : rootFolder.createFolder(userFolderName);

            const obsFolder = userFolder.createFolder(FOLDER_NAME_2);
            const testFile = obsFolder.createFile(Utilities.newBlob('test content', 'text/plain', 'test.txt'));
            Logger.log(`Test 2 Setup: Created folder structure with test file. Folder ID: ${obsFolder.getId()}`);

            // Verify folder exists before deletion
            const foldersBeforeTest2 = DriveApp.getFoldersByName(FOLDER_NAME_2);
            if (!foldersBeforeTest2.hasNext()) {
                throw new Error('Test 2 Setup FAILED: Expected folder was not created');
            }

            // Execute deletion
            Logger.log('Test 2 Execution: Calling deleteObservationRecord...');
            const result2 = deleteObservationRecord(testObsId2, observerEmail);
            if (!result2.success) {
                throw new Error(`Test 2 FAILED: Deletion failed - ${result2.error}`);
            }

            // Verify folder was moved to trash
            const foldersAfterTest2 = DriveApp.getFoldersByName(FOLDER_NAME_2);
            let folderFoundInTrash = false;
            while (foldersAfterTest2.hasNext()) {
                const folder = foldersAfterTest2.next();
                if (folder.isTrashed()) {
                    folderFoundInTrash = true;
                    Logger.log(`Test 2 Verification: Found folder ${folder.getId()} in trash (correct)`);
                    break;
                } else {
                    // Clean up any non-trashed folders
                    folder.setTrashed(true);
                    throw new Error(`Test 2 FAILED: Folder ${folder.getId()} still exists and was not trashed`);
                }
            }

            if (!folderFoundInTrash) {
                Logger.log('Test 2 Verification: No folders found with observation name (folder may have been completely deleted)');
            }

            // Verify sheet record was deleted
            const rangeAfterTest2 = obsSheet.getRange("A:A").createTextFinder(testObsId2).findNext();
            if (rangeAfterTest2) {
                throw new Error('Test 2 FAILED: Observation row was not deleted from sheet');
            }

            Logger.log('Test 2 PASSED: Existing folder trashed, sheet record deleted');
            testsPassed++;

        } catch (e) {
            Logger.log(`Test 2 FAILED: ${e.message}`);
        }

        // FINAL RESULTS
        Logger.log('\n=== FINAL TEST RESULTS ===');
        Logger.log(`Tests passed: ${testsPassed}/${testsTotal}`);
        if (testsPassed === testsTotal) {
            Logger.log('--- ALL TESTS PASSED ---');
            Logger.log('✓ No orphaned folders created when deleting observations without folders');
            Logger.log('✓ Existing folders properly deleted when deleting observations with folders');
        } else {
            Logger.log('--- SOME TESTS FAILED ---');
            Logger.log('Please review the detailed logs above for failure reasons.');
        }

    } catch (e) {
        Logger.log(`TEST SUITE FAILED: ${e.message}`);
    } finally {
        // Restore the original spreadsheet ID
        if (originalSheetId) {
            PropertiesService.getScriptProperties().setProperty('SHEET_ID', originalSheetId);
            Logger.log(`Teardown: Restored original spreadsheet ID.`);
        } else {
            PropertiesService.getScriptProperties().deleteProperty('SHEET_ID');
            Logger.log(`Teardown: Cleared temporary spreadsheet ID property.`);
        }
        Logger.log('--- Test Suite Finished ---');
    }
}

/**
 * Creates a transcription job for batch processing
 * Uses Gemini Batch API for 50% cost savings
 */
function createTranscriptionJob(observationId, filename, prompt) {
    try {
        const userContext = createUserContext();
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR &&
            userContext.role !== SPECIAL_ROLES.ADMINISTRATOR) {
            return { success: false, error: ERROR_MESSAGES.PERMISSION_DENIED };
        }

        const observation = getObservationById(observationId);
        if (!observation) {
            return { success: false, error: 'Observation not found.' };
        }

        // Get audio file and check size
        const folder = getOrCreateObservationFolder(observationId);
        const files = folder.getFilesByName(filename);
        if (!files.hasNext()) {
            return { success: false, error: 'Audio file not found.' };
        }
        const audioFile = files.next();
        const fileSizeBytes = audioFile.getSize();
        const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);

        // Batch API has higher limits - check 50MB limit (with base64 overhead ~37MB source)
        if (fileSizeBytes > MAX_BATCH_FILE_SIZE_BYTES) {
            return {
                success: false,
                error: `File too large (${fileSizeMB}MB). Maximum size for batch transcription is 37MB. Please use the "Copy Prompt" option for larger files.`
            };
        }

        // Generate unique job ID
        const jobId = Utilities.getUuid();

        // Store job in Script Properties
        const jobData = {
            jobId: jobId,
            observationId: observationId,
            filename: filename,
            prompt: prompt,
            status: 'pending', // pending, processing, complete, failed
            createdAt: new Date().toISOString(),
            createdBy: userContext.email,
            fileSizeMB: fileSizeMB,
            fileId: audioFile.getId(),
            attempts: 0,
            batchJobName: null
        };

        const properties = PropertiesService.getScriptProperties();
        properties.setProperty('transcription_job_' + jobId, JSON.stringify(jobData));

        // Add to job queue
        let jobQueue = properties.getProperty('transcription_queue');
        jobQueue = jobQueue ? JSON.parse(jobQueue) : [];
        jobQueue.push(jobId);
        properties.setProperty('transcription_queue', JSON.stringify(jobQueue));

        debugLog('Batch transcription job created', { jobId, filename, fileSizeMB });

        const estimatedMinutes = Math.ceil(fileSizeMB / 2) + 15;

        return {
            success: true,
            jobId: jobId,
            status: 'pending',
            estimatedWaitMinutes: estimatedMinutes,
            message: `Batch transcription job queued. Estimated completion: ${estimatedMinutes} minutes`,
            costSavings: '50% cheaper using Batch API'
        };

    } catch (error) {
        console.error('Error creating batch transcription job:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Checks the status of a transcription job
 */
function checkTranscriptionJobStatus(jobId) {
    try {
        const properties = PropertiesService.getScriptProperties();
        const jobDataStr = properties.getProperty('transcription_job_' + jobId);

        if (!jobDataStr) {
            return { success: false, error: 'Job not found' };
        }

        const jobData = JSON.parse(jobDataStr);

        return {
            success: true,
            status: jobData.status,
            jobId: jobId,
            filename: jobData.filename,
            createdAt: jobData.createdAt,
            completedAt: jobData.completedAt,
            transcriptionUrl: jobData.transcriptionUrl,
            error: jobData.error,
            progress: jobData.progress || 'Waiting in queue...'
        };

    } catch (error) {
        console.error('Error checking job status:', error);
        return { success: false, error: error.message };
    }
}

/**
 * =================================================================
 * TRANSCRIPTION BATCH PROCESSING TRIGGER MANAGEMENT
 * =================================================================
 */

/**
 * Installs a time-based trigger to process the transcription queue every 15 minutes.
 * This function should be run once by an administrator to set up the system.
 * @param {boolean} forceReinstall If true, will remove existing triggers before installing.
 * @returns {Object} A result object with success status and message.
 */
function installTranscriptionTrigger(forceReinstall = false) {
    console.log('=== INSTALLING TRANSCRIPTION BATCH TRIGGER ===');
    try {
        const handlerFunction = 'processTranscriptionQueue';

        // Check for existing triggers for this handler
        const existingTriggers = ScriptApp.getProjectTriggers().filter(trigger =>
            trigger.getHandlerFunction() === handlerFunction
        );

        if (existingTriggers.length > 0 && !forceReinstall) {
            console.log(`✅ Transcription trigger for '${handlerFunction}' already installed.`);
            return {
                success: true,
                message: 'Trigger already exists.',
                triggerCount: existingTriggers.length
            };
        }

        // Remove existing triggers if force reinstall
        if (forceReinstall && existingTriggers.length > 0) {
            console.log(`Removing ${existingTriggers.length} existing triggers for '${handlerFunction}'...`);
            existingTriggers.forEach(trigger => {
                ScriptApp.deleteTrigger(trigger);
            });
            console.log('✓ Existing triggers removed.');
        }

        // Create a new time-based trigger
        console.log('Creating new time-based trigger to run every 15 minutes...');
        const newTrigger = ScriptApp.newTrigger(handlerFunction)
            .timeBased()
            .everyMinutes(15)
            .create();

        const triggerId = newTrigger.getUniqueId();
        console.log(`✅ TRANSCRIPTION TRIGGER INSTALLED SUCCESSFULLY (ID: ${triggerId})`);
        console.log(`The function '${handlerFunction}' will now run approximately every 15 minutes.`);

        return {
            success: true,
            message: 'Transcription trigger installed successfully.',
            triggerId: triggerId
        };

    } catch (error) {
        console.error(`Error installing transcription trigger: ${error.message}`);
        return {
            success: false,
            error: `Failed to install trigger: ${error.message}`
        };
    }
}

/**
 * Checks the status of the transcription processing trigger.
 * @returns {Object} An object containing the status of the trigger.
 */
function checkTranscriptionTriggerStatus() {
    console.log('=== CHECKING TRANSCRIPTION TRIGGER STATUS ===');
    try {
        const handlerFunction = 'processTranscriptionQueue';
        const triggers = ScriptApp.getProjectTriggers().filter(trigger =>
            trigger.getHandlerFunction() === handlerFunction
        );

        if (triggers.length === 0) {
            console.log(`❌ No trigger found for '${handlerFunction}'.`);
            return {
                isInstalled: false,
                message: `Transcription trigger is not installed. Please run installTranscriptionTrigger().`
            };
        }

        const status = triggers.map(trigger => ({
            id: trigger.getUniqueId(),
            handler: trigger.getHandlerFunction(),
            type: trigger.getTriggerSource().toString(),
            eventType: trigger.getEventType().toString()
        }));

        console.log(`✅ Found ${triggers.length} trigger(s) for '${handlerFunction}':`, status);
        return {
            isInstalled: true,
            triggerCount: triggers.length,
            triggers: status
        };

    } catch (error) {
        console.error(`Error checking transcription trigger status: ${error.message}`);
        return {
            isInstalled: false,
            error: `Failed to check trigger status: ${error.message}`
        };
    }
}

/**
 * Removes all time-based triggers for the transcription queue processor.
 * @returns {Object} A result object with success status and message.
 */
function removeTranscriptionTrigger() {
    console.log('=== REMOVING TRANSCRIPTION BATCH TRIGGER ===');
    try {
        const handlerFunction = 'processTranscriptionQueue';
        const triggers = ScriptApp.getProjectTriggers().filter(trigger =>
            trigger.getHandlerFunction() === handlerFunction
        );

        if (triggers.length === 0) {
            console.log(`No triggers found for '${handlerFunction}' to remove.`);
            return {
                success: true,
                message: 'No active transcription triggers to remove.',
                removedCount: 0
            };
        }

        console.log(`Found ${triggers.length} trigger(s) to remove...`);
        triggers.forEach(trigger => {
            const triggerId = trigger.getUniqueId();
            ScriptApp.deleteTrigger(trigger);
            console.log(`✓ Trigger ${triggerId} removed.`);
        });

        console.log(`✅ Successfully removed ${triggers.length} transcription trigger(s).`);
        return {
            success: true,
            message: `Removed ${triggers.length} trigger(s).`,
            removedCount: triggers.length
        };

    } catch (error) {
        console.error(`Error removing transcription trigger: ${error.message}`);
        return {
            success: false,
            error: `Failed to remove trigger: ${error.message}`
        };
    }
}