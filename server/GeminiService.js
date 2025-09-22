/**
 * GeminiService.js
 * Handles audio transcription using Google's Gemini AI API
 * Provides enhanced transcription with component tagging for Danielson Framework observations
 */

/**
 * Gets the Gemini API key from Script Properties
 * @returns {string|null} The API key or null if not configured
 */
function getGeminiApiKey() {
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) {
      debugLog('Gemini API key not found in Script Properties', { function: 'getGeminiApiKey' });
      return null;
    }
    return apiKey;
  } catch (error) {
    console.error('Error retrieving Gemini API key:', error);
    return null;
  }
}

/**
 * Validates if Gemini service is properly configured
 * @returns {Object} Validation result with success status and message
 */
function validateGeminiConfiguration() {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return {
      success: false,
      error: 'Gemini API key not configured. Please set GEMINI_API_KEY in Script Properties.',
      errorType: VALIDATION_ERROR_TYPES.CONFIGURATION_ERROR
    };
  }

  return {
    success: true,
    message: 'Gemini service properly configured'
  };
}

/**
 * Builds a context-aware transcription prompt for Gemini API
 * @param {Object} userContext - User context with role and assigned subdomains
 * @param {Array} audioFiles - Array of audio file objects to transcribe
 * @returns {string} The formatted prompt for Gemini
 */
function buildTranscriptionPrompt(userContext, audioFiles) {
  const role = userContext.role || 'Teacher';
  const assignedSubdomains = userContext.assignedSubdomains || [];

  // Build subdomain context for component tagging
  const subdomainContext = assignedSubdomains.length > 0
    ? `Focus on these Danielson Framework components: ${assignedSubdomains.join(', ')}`
    : 'Include all relevant Danielson Framework components (1a-4f)';

  const prompt = `${GEMINI_SETTINGS.TRANSCRIPTION_PROMPT_TEMPLATE.baseInstructions}

${GEMINI_SETTINGS.TRANSCRIPTION_PROMPT_TEMPLATE.subdomainContext.replace('{role}', role).replace('{subdomains}', subdomainContext)}

Requirements:
${GEMINI_SETTINGS.TRANSCRIPTION_PROMPT_TEMPLATE.requirements.map(req => `- ${req}`).join('\n')}

Audio files to transcribe: ${audioFiles.length} file(s)
Expected duration: ${audioFiles.length * 20} minutes (typical observation length)

Please provide a complete, accurate transcription with speaker identification, timestamps, and component tags based on the content.`;

  debugLog('Built transcription prompt', {
    role,
    assignedSubdomains: assignedSubdomains.length,
    audioFileCount: audioFiles.length
  });

  return prompt;
}

/**
 * Processes audio files through Gemini API for transcription
 * @param {string} observationId - The observation ID for tracking
 * @param {Array} audioFiles - Array of audio file objects from Drive
 * @param {Object} userContext - User context with role and subdomains
 * @returns {Object} Transcription result with success status and data
 */
function transcribeAudioFiles(observationId, audioFiles, userContext) {
  const startTime = Date.now();

  try {
    // Validate configuration first
    const configValidation = validateGeminiConfiguration();
    if (!configValidation.success) {
      return configValidation;
    }

    if (!audioFiles || audioFiles.length === 0) {
      return {
        success: false,
        error: 'No audio files provided for transcription',
        errorType: VALIDATION_ERROR_TYPES.DATA_CORRUPTION
      };
    }

    debugLog('Starting audio transcription', {
      observationId,
      fileCount: audioFiles.length,
      userRole: userContext.role
    });

    // Build context-aware prompt
    const prompt = buildTranscriptionPrompt(userContext, audioFiles);

    // Make API call to Gemini
    const transcriptionResult = callGeminiApi(prompt, audioFiles);

    if (!transcriptionResult.success) {
      return transcriptionResult;
    }

    // Process and validate the response
    const processedResult = processGeminiResponse(transcriptionResult.data, userContext);

    const processingTime = Date.now() - startTime;
    logPerformanceMetrics('gemini_transcription', processingTime, {
      observationId,
      fileCount: audioFiles.length,
      success: processedResult.success
    });

    return {
      success: true,
      data: {
        transcription: processedResult.transcription,
        componentTags: processedResult.componentTags,
        timestamp: new Date().toISOString(),
        processingTime: processingTime,
        fileCount: audioFiles.length
      }
    };

  } catch (error) {
    console.error('Error in transcribeAudioFiles:', error);
    logPerformanceMetrics('gemini_transcription_error', Date.now() - startTime, {
      observationId,
      error: error.message
    });

    return {
      success: false,
      error: 'Failed to process audio transcription: ' + error.message,
      errorType: VALIDATION_ERROR_TYPES.CONFIGURATION_ERROR
    };
  }
}

/**
 * Makes the actual API call to Gemini service
 * @param {string} prompt - The transcription prompt
 * @param {Array} audioFiles - Array of audio file objects
 * @returns {Object} API response with success status and data
 */
function callGeminiApi(prompt, audioFiles) {
  const apiKey = getGeminiApiKey();
  const maxRetries = GEMINI_SETTINGS.MAX_RETRY_ATTEMPTS;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      debugLog(`Gemini API call attempt ${attempt}`, { fileCount: audioFiles.length });

      // Prepare the API request
      const payload = {
        contents: [{
          parts: [
            { text: prompt },
            ...audioFiles.map(file => ({
              inline_data: {
                mime_type: file.mimeType || 'audio/mpeg',
                data: Utilities.base64Encode(file.blob.getBytes())
              }
            }))
          ]
        }],
        generationConfig: {
          temperature: GEMINI_SETTINGS.GENERATION_CONFIG.temperature,
          maxOutputTokens: GEMINI_SETTINGS.GENERATION_CONFIG.maxOutputTokens
        }
      };

      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        payload: JSON.stringify(payload)
      };

      const response = UrlFetchApp.fetch(GEMINI_SETTINGS.API_ENDPOINT, options);
      const responseCode = response.getResponseCode();

      if (responseCode === 200) {
        const responseData = JSON.parse(response.getContentText());
        debugLog('Gemini API call successful', { attempt, responseLength: responseData.candidates?.[0]?.content?.parts?.[0]?.text?.length || 0 });

        return {
          success: true,
          data: responseData
        };
      } else if (responseCode === 429) {
        // Rate limit hit, wait before retry
        const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
        debugLog(`Rate limit hit, waiting ${waitTime}ms before retry ${attempt + 1}`, { responseCode });
        Utilities.sleep(waitTime);
        continue;
      } else {
        const errorText = response.getContentText();
        debugLog(`Gemini API error response`, { attempt, responseCode, error: errorText });

        if (attempt === maxRetries) {
          return {
            success: false,
            error: `Gemini API error (${responseCode}): ${errorText}`,
            errorType: VALIDATION_ERROR_TYPES.CONFIGURATION_ERROR
          };
        }
      }

    } catch (error) {
      debugLog(`Gemini API call failed`, { attempt, error: error.message });

      if (attempt === maxRetries) {
        return {
          success: false,
          error: 'Failed to connect to Gemini API: ' + error.message,
          errorType: VALIDATION_ERROR_TYPES.CONFIGURATION_ERROR
        };
      }

      // Wait before retry
      Utilities.sleep(1000 * attempt);
    }
  }

  return {
    success: false,
    error: 'Maximum retry attempts exceeded',
    errorType: VALIDATION_ERROR_TYPES.CONFIGURATION_ERROR
  };
}

/**
 * Processes and validates the response from Gemini API
 * @param {Object} apiResponse - Raw response from Gemini API
 * @param {Object} userContext - User context for component validation
 * @returns {Object} Processed transcription data
 */
function processGeminiResponse(apiResponse, userContext) {
  try {
    // Extract transcription text from Gemini response
    const transcriptionText = apiResponse.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!transcriptionText) {
      throw new Error('No transcription text found in Gemini response');
    }

    debugLog('Processing Gemini response', { textLength: transcriptionText.length });

    // Extract component tags from the transcription
    const componentTags = extractComponentTags(transcriptionText, userContext.assignedSubdomains);

    // Clean and format the transcription
    const cleanedTranscription = cleanTranscriptionText(transcriptionText);

    return {
      success: true,
      transcription: cleanedTranscription,
      componentTags: componentTags
    };

  } catch (error) {
    console.error('Error processing Gemini response:', error);
    return {
      success: false,
      error: 'Failed to process transcription response: ' + error.message
    };
  }
}

/**
 * Extracts component tags from transcription text
 * @param {string} transcriptionText - The full transcription
 * @param {Array} assignedSubdomains - User's assigned subdomains
 * @returns {Object} Component tags organized by subdomain
 */
function extractComponentTags(transcriptionText, assignedSubdomains) {
  const componentTags = {};

  // Look for component tags in format [1a], [2b], etc.
  const tagPattern = /\[([1-4][a-f])\]/gi;
  const matches = transcriptionText.match(tagPattern) || [];

  // Group text segments by component tags
  const sections = transcriptionText.split(tagPattern);

  for (let i = 1; i < sections.length; i += 2) {
    const component = sections[i].toLowerCase();
    const content = sections[i + 1] ? sections[i + 1].trim() : '';

    // Only include if it's an assigned subdomain or no restrictions
    if (assignedSubdomains.length === 0 || assignedSubdomains.includes(component + ':')) {
      if (!componentTags[component + ':']) {
        componentTags[component + ':'] = [];
      }
      if (content) {
        componentTags[component + ':'].push(content.substring(0, 500)); // Limit content length
      }
    }
  }

  debugLog('Extracted component tags', {
    tagCount: Object.keys(componentTags).length,
    components: Object.keys(componentTags)
  });

  return componentTags;
}

/**
 * Cleans and formats transcription text for display
 * @param {string} rawText - Raw transcription from Gemini
 * @returns {string} Cleaned and formatted text
 */
function cleanTranscriptionText(rawText) {
  return rawText
    .replace(/\[([1-4][a-f])\]/gi, '\n\n[$1] ') // Format component tags
    .replace(/\[Speaker (\d+):\]/gi, '\n\n**Speaker $1:** ') // Format speaker labels
    .replace(/\[(\d{2}:\d{2})\]/gi, '\n*[$1]* ') // Format timestamps
    .replace(/\n{3,}/g, '\n\n') // Remove excessive line breaks
    .trim();
}

/**
 * Caches transcription result for future retrieval
 * @param {string} observationId - The observation ID
 * @param {Object} transcriptionData - The transcription result to cache
 */
function cacheTranscriptionResult(observationId, transcriptionData) {
  try {
    const cacheKey = generateCacheKey('transcription', { observationId });
    setCachedDataEnhanced(cacheKey, transcriptionData, CACHE_SETTINGS.DEFAULT_TTL);
    debugLog('Cached transcription result', { observationId, cacheKey });
  } catch (error) {
    console.error('Error caching transcription result:', error);
  }
}

/**
 * Retrieves cached transcription result
 * @param {string} observationId - The observation ID
 * @returns {Object|null} Cached transcription data or null if not found
 */
function getCachedTranscriptionResult(observationId) {
  try {
    const cacheKey = generateCacheKey('transcription', { observationId });
    const cachedData = getCachedDataEnhanced(cacheKey);
    if (cachedData) {
      debugLog('Retrieved cached transcription result', { observationId, cacheKey });
    }
    return cachedData;
  } catch (error) {
    console.error('Error retrieving cached transcription result:', error);
    return null;
  }
}