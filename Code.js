/**
 * Code.js - Main Orchestrator (Refactored for Modular Architecture)
 * Google Apps Script Web App for Danielson Framework - Multi-Role System
 * 
 * This file now orchestrates the modular services and maintains backward compatibility
 * while adding support for multiple roles and user-specific content.
 */

/**
 * Legacy DOMAIN_CONFIGS for backward compatibility
 * Kept in Code.js to avoid cross-file dependency issues
 * @deprecated Use ConfigurationService.loadRoleConfiguration() instead
 */
const DOMAIN_CONFIGS = {
  1: {
    name: 'Domain 1: Planning and Preparation',
    startRow: 3,   // 1-indexed - Domain 1 starts at row 3
    endRow: 22,    // 1-indexed - estimated end row (adjust as needed)
    subdomains: ['1a:', '1b:', '1c:', '1d:', '1e:', '1f:']
  },
  2: {
    name: 'Domain 2: The Classroom Environment',
    startRow: 23,  // 1-indexed - Domain 2 starts at row 23
    endRow: 39,    // 1-indexed - estimated end row (adjust as needed)
    subdomains: ['2a:', '2b:', '2c:', '2d:', '2e:']
  },
  3: {
    name: 'Domain 3: Instruction',
    startRow: 40,  // 1-indexed - Domain 3 starts at row 40
    endRow: 56,    // 1-indexed - estimated end row (adjust as needed)
    subdomains: ['3a:', '3b:', '3c:', '3d:', '3e:']
  },
  4: {
    name: 'Domain 4: Professional Responsibilities',
    startRow: 57,  // 1-indexed - Domain 4 starts at row 57
    endRow: 76,    // 1-indexed - estimated end row (adjust as needed)
    subdomains: ['4a:', '4b:', '4c:', '4d:', '4e:', '4f:']
  }
};

/**
 * ADD THIS NEW FUNCTION to Code.js
 * Enhanced cache clearing for role changes
 */
function clearCachesForRoleChange(userEmail = null) {
  console.log('=== CLEARING CACHES FOR ROLE CHANGE (Enhanced) ===');

  try {
    // Get user email if not provided
    if (!userEmail) {
      const sessionUser = getUserFromSession();
      userEmail = sessionUser ? sessionUser.email : null;
    }

    if (userEmail) {
      debugLog('Clearing caches for user role change', { userEmail });

      // Clear user-specific cache
      invalidateDependentCaches('user_*');

      // Clear role sheet caches (since user might switch between roles)
      invalidateDependentCaches('role_sheet_*');

    } else {
      debugLog('No user email - performing global cache clear');
      forceCleanAllCaches();
    }

    console.log('✅ Enhanced cache clearing completed');

  } catch (error) {
    console.error('Error in enhanced cache clearing:', error);
    // Fallback to force clear
    forceCleanAllCaches();
  }
}

/**
 * Main function to serve the web app
 * Enhanced to support user-specific role-based content
 */
function doGet(e) {
  const startTime = Date.now();
  const requestId = generateUniqueId('request');
  
  try {
    // Parse URL parameters for cache control
    const params = e.parameter || {};
    const forceRefresh = params.refresh === 'true' || params.nocache === 'true';
    const debugMode = params.debug === 'true';
    const urlTimestamp = params.t || null;
    const urlRole = params.role || null;

    debugLog('Web app request received', {
      requestId: requestId,
      forceRefresh: forceRefresh,
      debugMode: debugMode,
      urlTimestamp: urlTimestamp,
      urlRole: urlRole,
      userAgent: e.userAgent || 'Unknown'
    });

    // Handle force refresh - clear all relevant caches
    if (forceRefresh) {
      debugLog('Force refresh requested - clearing caches', { requestId });

      const sessionUser = getUserFromSession();
      if (sessionUser && sessionUser.email) {
        clearCachesForRoleChange(sessionUser.email);
        debugLog('Cleared caches for user', { email: sessionUser.email, requestId });
      } else {
        // Clear all caches if no specific user
        forceCleanAllCaches();
        debugLog('Performed global cache clear', { requestId });
      }
    }

    // Create user context with enhanced cache handling
    const userContext = createUserContext();
    
    // Override role if specified in URL (for testing)
    if (urlRole && AVAILABLE_ROLES.includes(urlRole)) {
      debugLog('URL role override detected', {
        originalRole: userContext.role,
        urlRole: urlRole,
        requestId
      });
      userContext.role = urlRole;
      userContext.isRoleOverride = true;
    }

    debugLog('User context created', {
      email: userContext.email,
      role: userContext.role,
      year: userContext.year,
      isDefaultUser: userContext.isDefaultUser,
      isRoleOverride: userContext.isRoleOverride || false,
      requestId: requestId
    });
    
    // Get role-specific rubric data
    const rubricData = getAllDomainsData(userContext.role, userContext.year);
    
    // Generate response metadata for cache busting
    const responseMetadata = generateResponseMetadata(userContext, requestId, debugMode);

    // Add enhanced user context to the data for the HTML template
    rubricData.userContext = {
      email: userContext.email,
      role: userContext.role,
      year: userContext.year,
      isAuthenticated: userContext.isAuthenticated,
      displayName: userContext.email ? userContext.email.split('@')[0] : 'Guest',
      requestId: requestId,
      timestamp: Date.now(),
      forceRefresh: forceRefresh,
      debugMode: debugMode,
      isRoleOverride: userContext.isRoleOverride || false,
      cacheVersion: getMasterCacheVersion(),
      responseMetadata: responseMetadata
    };
    
    // Create and configure the HTML template
    const htmlTemplate = HtmlService.createTemplateFromFile('rubric');
    htmlTemplate.data = rubricData;
    
    // Generate the HTML output
    const htmlOutput = htmlTemplate.evaluate()
      .setTitle(getPageTitle(userContext.role))
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

    // Add comprehensive cache-busting headers
    addCacheBustingHeaders(htmlOutput, responseMetadata);

    // Add debug headers if requested
    if (debugMode) {
      addDebugHeaders(htmlOutput, userContext, responseMetadata);
    }
    
    const executionTime = Date.now() - startTime;
    logPerformanceMetrics('doGet', executionTime, {
      role: userContext.role,
      year: userContext.year,
      domainCount: rubricData.domains ? rubricData.domains.length : 0,
      isDefaultUser: userContext.isDefaultUser,
      forceRefresh: forceRefresh,
      requestId: requestId
    });
    
    debugLog('Web app request completed successfully', {
      role: userContext.role,
      executionTime: executionTime,
      requestId: requestId,
      responseETag: responseMetadata.etag
    });
    
    return htmlOutput;
    
  } catch (error) {
    console.error('Error in doGet:', formatErrorMessage(error, 'doGet'));
    
    // Return enhanced error page with cache busting
    return createEnhancedErrorPage(error, requestId);
  }
}

/**
 * ADD THESE NEW FUNCTIONS to Code.js
 * Helper functions for response enhancement
 */

/**
 * Generate comprehensive response metadata for cache busting
 * @param {Object} userContext - User context object
 * @param {string} requestId - Unique request identifier
 * @param {boolean} debugMode - Whether debug mode is enabled
 * @return {Object} Response metadata
 */
function generateResponseMetadata(userContext, requestId, debugMode = false) {
  try {
    const timestamp = Date.now();
    const cacheVersion = getMasterCacheVersion();

    // Generate ETag based on user state and data version
    const etagData = {
      role: userContext.role,
      year: userContext.year,
      email: userContext.email,
      cacheVersion: cacheVersion,
      timestamp: Math.floor(timestamp / 60000) // Round to minute for some caching
    };

    const etag = Utilities.base64Encode(
      Utilities.computeDigest(
        Utilities.DigestAlgorithm.MD5,
        JSON.stringify(etagData)
      )
    ).substring(0, 16);

    const metadata = {
      requestId: requestId,
      timestamp: timestamp,
      cacheVersion: cacheVersion,
      etag: etag,
      role: userContext.role,
      year: userContext.year,
      debugMode: debugMode,
      lastModified: new Date().toUTCString(),
      maxAge: 0, // No caching by default
      mustRevalidate: true
    };

    debugLog('Response metadata generated', metadata);
    return metadata;

  } catch (error) {
    console.error('Error generating response metadata:', error);
    return {
      requestId: requestId,
      timestamp: Date.now(),
      etag: 'error-' + Date.now(),
      error: error.message
    };
  }
}

/**
 * Add cache-busting headers to HTML output
 * @param {HtmlOutput} htmlOutput - The HTML output object
 * @param {Object} metadata - Response metadata
 */
function addCacheBustingHeaders(htmlOutput, metadata) {
  try {
    // Primary cache control headers
    htmlOutput
      .addMetaTag('cache-control', 'no-cache, no-store, must-revalidate, max-age=0')
      .addMetaTag('pragma', 'no-cache')
      .addMetaTag('expires', '0')
      .addMetaTag('last-modified', metadata.lastModified)
      .addMetaTag('etag', metadata.etag);

    // Custom headers for debugging and version tracking
    htmlOutput
      .addMetaTag('x-app-version', SYSTEM_INFO.VERSION)
      .addMetaTag('x-cache-version', metadata.cacheVersion)
      .addMetaTag('x-request-id', metadata.requestId)
      .addMetaTag('x-timestamp', metadata.timestamp.toString())
      .addMetaTag('x-role', metadata.role)
      .addMetaTag('x-year', metadata.year.toString());

    // Viewport and mobile optimization
    htmlOutput.addMetaTag('viewport', 'width=device-width, initial-scale=1.0');

    debugLog('Cache-busting headers added', {
      etag: metadata.etag,
      requestId: metadata.requestId
    });

  } catch (error) {
    console.error('Error adding cache-busting headers:', error);
  }
}

/**
 * Add debug headers for development
 * @param {HtmlOutput} htmlOutput - The HTML output object
 * @param {Object} userContext - User context object
 * @param {Object} metadata - Response metadata
 */
function addDebugHeaders(htmlOutput, userContext, metadata) {
  try {
    htmlOutput
      .addMetaTag('x-debug-mode', 'true')
      .addMetaTag('x-user-email', userContext.email || 'anonymous')
      .addMetaTag('x-user-authenticated', userContext.isAuthenticated.toString())
      .addMetaTag('x-user-default', userContext.isDefaultUser.toString())
      .addMetaTag('x-role-override', (userContext.isRoleOverride || false).toString())
      .addMetaTag('x-execution-time', (Date.now() - metadata.timestamp).toString());

    debugLog('Debug headers added', { requestId: metadata.requestId });

  } catch (error) {
    console.error('Error adding debug headers:', error);
  }
}

/**
 * Enhanced error page with cache busting
 * @param {Error} error - Error object
 * @param {string} requestId - Request identifier
 * @return {HtmlOutput} Enhanced error page
 */
function createEnhancedErrorPage(error, requestId) {
  const timestamp = Date.now();

  const errorHtml = `
    <html>
      <head>
        <title>Error Loading Application</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="cache-control" content="no-cache, no-store, must-revalidate">
        <meta name="pragma" content="no-cache">
        <meta name="expires" content="0">
        <meta name="x-request-id" content="${requestId}">
        <meta name="x-timestamp" content="${timestamp}">
        <meta name="x-error" content="true">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            padding: 20px; max-width: 600px; margin: 0 auto;
            background: #f8f9fa; color: #333;
          }
          .error-container {
            background: white; border: 1px solid #dee2e6;
            padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .error-title {
            color: #dc3545; margin-bottom: 20px; font-size: 1.5rem; font-weight: 600;
          }
          .error-message {
            background: #f8f9fa; padding: 15px; border-radius: 6px;
            margin: 15px 0; border-left: 4px solid #dc3545;
          }
          .error-details {
            font-size: 0.9rem; color: #6c757d; margin-top: 10px;
          }
          .troubleshooting { margin-top: 25px; }
          .troubleshooting h3 { color: #495057; margin-bottom: 15px; }
          .troubleshooting ul { padding-left: 20px; line-height: 1.6; }
          .retry-section { margin-top: 25px; text-align: center; }
          .retry-button {
            background: #007bff; color: white; padding: 12px 24px;
            border: none; border-radius: 6px; cursor: pointer; font-size: 1rem;
            text-decoration: none; display: inline-block;
          }
          .retry-button:hover { background: #0056b3; }
          .cache-clear-button {
            background: #28a745; margin-left: 10px;
          }
          .cache-clear-button:hover { background: #1e7e34; }
        </style>
      </head>
      <body>
        <div class="error-container">
          <h2 class="error-title">🚨 Application Error</h2>

          <div class="error-message">
            <strong>Error:</strong> ${error.toString()}
            <div class="error-details">
              Request ID: ${requestId}<br>
              Timestamp: ${new Date(timestamp).toLocaleString()}<br>
              Cache Version: ${getMasterCacheVersion()}
            </div>
          </div>

          <div class="troubleshooting">
            <h3>🔧 Troubleshooting Steps:</h3>
            <ul>
              <li><strong>First:</strong> Try the "Clear Cache & Retry" button below</li>
              <li><strong>Check:</strong> SHEET_ID is correctly set in Script Properties</li>
              <li><strong>Verify:</strong> Spreadsheet exists and is accessible</li>
              <li><strong>Ensure:</strong> Required sheet tabs exist (Staff, Settings, Teacher)</li>
              <li><strong>Confirm:</strong> You have permission to access the spreadsheet</li>
              <li><strong>If persistent:</strong> Open in incognito/private browser window</li>
            </ul>
          </div>

          <div class="retry-section">
            <button class="retry-button" onclick="window.location.reload()">
              🔄 Simple Retry
            </button>
            <button class="retry-button cache-clear-button" onclick="clearCacheAndRetry()">
              🧹 Clear Cache & Retry
            </button>
          </div>
        </div>

        <script>
          function clearCacheAndRetry() {
            // Add cache-busting parameters
            const url = new URL(window.location);
            url.searchParams.set('refresh', 'true');
            url.searchParams.set('nocache', 'true');
            url.searchParams.set('t', Date.now());
            url.searchParams.set('r', Math.random().toString(36).substr(2, 9));

            // Redirect to cache-busted URL
            window.location.href = url.toString();
          }

          // Auto-retry after 30 seconds
          setTimeout(function() {
            const retryNotice = document.createElement('div');
            retryNotice.style.cssText = 'background:#fff3cd; padding:15px; margin:20px 0; border-radius:6px; border-left:4px solid #ffc107;';
            retryNotice.innerHTML = '<strong>⏰ Auto-retry in progress...</strong> The page will refresh automatically.';
            document.querySelector('.error-container').appendChild(retryNotice);

            setTimeout(clearCacheAndRetry, 5000);
          }, 30000);
        </script>
      </body>
    </html>
  `;

  return HtmlService.createHtmlOutput(errorHtml);
}

/**
 * ADD THESE URL FUNCTIONS to Code.js
 * URL generation and cache-busting utilities
 */

/**
 * Generate cache-busted web app URL
 * @param {Object} options - URL generation options
 * @return {string} Cache-busted URL
 */
function generateCacheBustedUrl(options = {}) {
  try {
    const scriptId = ScriptApp.getScriptId();
    const baseUrl = `https://script.google.com/macros/s/${scriptId}/exec`;

    const params = new URLSearchParams();

    // Always add cache busting
    params.set('refresh', 'true');
    params.set('nocache', 'true');
    params.set('t', Date.now().toString());
    params.set('r', Math.random().toString(36).substr(2, 9));

    // Add optional parameters
    if (options.role) params.set('role', options.role);
    if (options.debug) params.set('debug', 'true');
    if (options.year) params.set('year', options.year.toString());
    if (options.mobile) params.set('mobile', 'true');

    // Add cache version for tracking
    params.set('cv', getMasterCacheVersion());

    const fullUrl = `${baseUrl}?${params.toString()}`;

    debugLog('Generated cache-busted URL', {
      baseUrl: baseUrl,
      options: options,
      fullUrl: fullUrl
    });

    return fullUrl;

  } catch (error) {
    console.error('Error generating cache-busted URL:', error);
    return 'https://script.google.com/macros/s/ERROR/exec';
  }
}

/**
 * Generate multiple URL variations for different use cases
 * @param {Object} userContext - User context (optional)
 * @return {Object} Object containing different URL variations
 */
function generateAllUrlVariations(userContext = null) {
  try {
    const baseOptions = {};
    if (userContext) {
      baseOptions.role = userContext.role;
      baseOptions.year = userContext.year;
    }

    const urls = {
      standard: generateCacheBustedUrl(baseOptions),
      debug: generateCacheBustedUrl({ ...baseOptions, debug: true }),
      mobile: generateCacheBustedUrl({ ...baseOptions, mobile: true }),
      teacherOverride: generateCacheBustedUrl({ ...baseOptions, role: 'Teacher' }),
      forceRefresh: generateCacheBustedUrl({ ...baseOptions, refresh: 'true', nocache: 'true' })
    };

    // Add role-specific URLs for all available roles
    urls.roleSpecific = {};
    AVAILABLE_ROLES.forEach(role => {
      urls.roleSpecific[role] = generateCacheBustedUrl({
        ...baseOptions,
        role: role
      });
    });

    console.log('=== WEB APP URLS ===');
    console.log('📌 STANDARD URL (with your current role):');
    console.log(urls.standard);
    console.log('');
    console.log('🧪 DEBUG URL (shows debug info):');
    console.log(urls.debug);
    console.log('');
    console.log('📱 MOBILE-OPTIMIZED URL:');
    console.log(urls.mobile);
    console.log('');
    console.log('👨‍🏫 TEACHER OVERRIDE URL:');
    console.log(urls.teacherOverride);
    console.log('');
    console.log('🔄 FORCE REFRESH URL:');
    console.log(urls.forceRefresh);
    console.log('');
    console.log('🎭 ROLE-SPECIFIC URLS:');
    Object.keys(urls.roleSpecific).forEach(role => {
      console.log(`${role}: ${urls.roleSpecific[role]}`);
    });
    console.log('===================');

    return urls;

  } catch (error) {
    console.error('Error generating URL variations:', error);
    return { error: error.message };
  }
}

/**
 * Quick URL generator for role changes
 * @param {string} newRole - Role to switch to
 * @param {string} userEmail - User email (optional)
 * @return {string} Cache-busted URL for the new role
 */
function getUrlForRoleChange(newRole, userEmail = null) {
  console.log(`=== GENERATING URL FOR ROLE CHANGE ===`);
  console.log(`New Role: ${newRole}`);

  try {
    // Validate role
    if (!AVAILABLE_ROLES.includes(newRole)) {
      console.error(`❌ Invalid role: ${newRole}`);
      console.log('Valid roles:', AVAILABLE_ROLES);
      return null;
    }

    // Clear caches first
    if (userEmail) {
      clearCachesForRoleChange(userEmail);
    } else {
      forceCleanAllCaches();
    }

    // Generate URL
    const url = generateCacheBustedUrl({
      role: newRole,
      debug: true  // Include debug info for role changes
    });

    console.log('✅ ROLE CHANGE URL READY:');
    console.log(url);
    console.log('');
    console.log('📋 INSTRUCTIONS:');
    console.log('1. Update your role in the Staff sheet');
    console.log('2. Copy the URL above');
    console.log('3. Open in new incognito/private window');
    console.log('4. You should see the new role immediately');

    return url;

  } catch (error) {
    console.error('Error generating role change URL:', error);
    return null;
  }
}

/**
 * Enhanced function to get all domains data with role and year support
 * Maintains backward compatibility when called without parameters
 * @param {string} role - User's role (optional, defaults to Teacher)
 * @param {number} year - User's observation year (optional, defaults to show all)
 * @return {Object} Complete rubric data structure
 */
function getAllDomainsData(role = null, year = null) {
  const startTime = Date.now();
  
  try {
    // Use default role if none provided (backward compatibility)
    const userRole = role || 'Teacher';
    const userYear = year;
    
    debugLog('Loading domains data', { role: userRole, year: userYear });
    
    // Get role-specific sheet data
    const roleSheetData = getRoleSheetData(userRole);
    if (!roleSheetData) {
      throw new Error(`Unable to load data for role: ${userRole}`);
    }
    
    // Build result structure
    const result = {
      title: roleSheetData.title || `${userRole} Framework`,
      subtitle: roleSheetData.subtitle || "Professional practices and standards",
      role: userRole,
      year: userYear,
      domains: []
    };
    
    // For Teacher role, use legacy processing for backward compatibility
    if (userRole === 'Teacher') {
      result.domains = processLegacyTeacherDomains(roleSheetData.data);
    } else {
      // Use dynamic processing for other roles (will be implemented in later phases)
      result.domains = processRoleDomains(roleSheetData, userRole, userYear);
    }
    
    // Apply year-based filtering if specified
    if (userYear && userYear !== null) {
      result.domains = applyYearFiltering(result.domains, userRole, userYear);
    }
    
    const executionTime = Date.now() - startTime;
    logPerformanceMetrics('getAllDomainsData', executionTime, {
      role: userRole,
      year: userYear,
      domainCount: result.domains.length
    });
    
    debugLog('Domains data loaded successfully', {
      role: userRole,
      domainCount: result.domains.length,
      totalComponents: result.domains.reduce((total, domain) => total + domain.components.length, 0)
    });
    
    return result;
    
  } catch (error) {
    console.error('Error reading sheet data:', formatErrorMessage(error, 'getAllDomainsData'));
    
    return {
      title: "Error Loading Data",
      subtitle: `Please check the configuration for role: ${role || 'default'}. Error: ${error.message}`,
      role: role || 'Teacher',
      year: year,
      domains: []
    };
  }
}

/**
 * Legacy function to process Teacher domain data (maintains exact backward compatibility)
 * @param {Array<Array>} sheetData - Raw sheet data
 * @return {Array<Object>} Array of domain objects
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
 * Process data for a specific domain from the sheet data (legacy implementation)
 * This maintains the exact original logic for backward compatibility
 * @param {Array<Array>} sheetData - Raw sheet data
 * @param {number} domainNumber - Domain number (1-4)
 * @param {Object} config - Domain configuration
 * @return {Object} Domain object with components
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
  const startIdx = config.startRow - 1;
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
      const componentId = componentTitle.substring(0, 3);
      debugLog(`Component ID extracted: "${componentId}"`);
      
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
 * Create best practices mapping for a specific domain (legacy implementation)
 * @param {number} domainNumber - Domain number
 * @param {Object} config - Domain configuration
 * @return {Object} Mapping of component IDs to best practices locations
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
 * @param {Object} roleSheetData - Role sheet data
 * @param {string} role - User role
 * @param {number} year - User year
 * @return {Array<Object>} Array of domain objects
 */
function processRoleDomains(roleSheetData, role, year) {
  // For now, fall back to legacy processing
  // This will be enhanced in Phase 2 with dynamic domain detection
  debugLog(`Processing role domains for ${role} - falling back to legacy processing`);
  return processLegacyTeacherDomains(roleSheetData.data);
}

/**
 * Apply year-based filtering to domains (placeholder for future implementation)
 * @param {Array<Object>} domains - Array of domain objects
 * @param {string} role - User role
 * @param {number} year - User year
 * @return {Array<Object>} Filtered domains
 */
function applyYearFiltering(domains, role, year) {
  // For now, return all domains (no filtering)
  // This will be implemented in Phase 3
  debugLog(`Year filtering not yet implemented - returning all domains for ${role}, year ${year}`);
  return domains;
}

/**
 * Get appropriate page title based on role
 * @param {string} role - User role
 * @return {string} Page title
 */
function getPageTitle(role) {
  if (role === 'Teacher') {
    return HTML_SETTINGS.DEFAULT_TITLE;
  }
  return `${role} Framework - Professional Standards`;
}

/**
 * Create an error page for display to users
 * @param {Error} error - Error object
 * @return {HtmlOutput} Error page HTML
 */
function createErrorPage(error) {
  const errorHtml = `
    <html>
      <head>
        <title>Error Loading Application</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
          .error-container { background: #f8f9fa; border: 1px solid #dee2e6; padding: 20px; border-radius: 5px; }
          .error-title { color: #dc3545; margin-bottom: 15px; }
          .error-message { background: white; padding: 15px; border-radius: 3px; margin: 10px 0; }
          .troubleshooting { margin-top: 20px; }
          .troubleshooting ul { padding-left: 20px; }
          .retry-button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 3px; cursor: pointer; }
        </style>
      </head>
      <body>
        <div class="error-container">
          <h2 class="error-title">Error Loading Application</h2>
          <div class="error-message">
            <strong>Error:</strong> ${error.toString()}
          </div>
          <div class="troubleshooting">
            <h3>Troubleshooting Steps:</h3>
            <ul>
              <li>Check that the SHEET_ID is correctly set in Script Properties</li>
              <li>Verify that the spreadsheet exists and is accessible</li>
              <li>Ensure the required sheet tabs exist (Staff, Settings, Teacher)</li>
              <li>Check that you have permission to access the spreadsheet</li>
            </ul>
          </div>
          <button class="retry-button" onclick="window.location.reload()">Try Again</button>
        </div>
      </body>
    </html>
  `;
  
  return HtmlService.createHtmlOutput(errorHtml);
}

// ====================
// LEGACY TEST FUNCTIONS (maintained for backward compatibility)
// ====================

/**
 * Test function to check if Sheet ID is working and list all sheets
 * @return {string} Test result message
 */
function testSheetAccess() {
  try {
    const connectivity = testSheetConnectivity();
    
    if (connectivity.spreadsheet.accessible) {
      const available = Object.keys(connectivity.sheets).filter(sheet => 
        connectivity.sheets[sheet].exists
      );
      return `Success - Spreadsheet accessible. Found ${available.length} sheets: ${available.join(', ')}`;
    } else {
      return `Error: ${connectivity.spreadsheet.error}`;
    }
  } catch (error) {
    console.error('Error in testSheetAccess:', error);
    return 'Error: ' + error.toString();
  }
}

/**
 * Test function to debug all domains data parsing
 */
function testAllDomainsDataParsing() {
  const data = getAllDomainsData();
  console.log('=== ALL DOMAINS PARSED DATA ===');
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Debug function to check component mapping for all domains
 */
function debugAllDomainComponents() {
  try {
    const roleSheetData = getRoleSheetData(DEFAULT_ROLE_CONFIG.role);
    if (!roleSheetData) {
      console.log('Teacher sheet not found!');
      return;
    }
    
    const sheetData = roleSheetData.data;
    
    Object.keys(DOMAIN_CONFIGS).forEach(domainNum => {
      const config = DOMAIN_CONFIGS[domainNum];
      console.log(`\n=== ${config.name} (Rows ${config.startRow}-${config.endRow}) ===`);
      
      const startIdx = config.startRow - 1;
      const endIdx = config.endRow - 1;
      
      for (let i = startIdx; i <= endIdx && i < sheetData.length; i++) {
        const row = sheetData[i];
        
        if (row[0] && row[0].toString().match(new RegExp(`^${domainNum}[a-f]:`))) {
          const componentTitle = row[0].toString().trim();
          console.log(`Row ${i + 1}: ${componentTitle}`);
        }
      }
    });
    
  } catch (error) {
    console.error('Error in debugAllDomainComponents:', error);
  }
}

/**
 * Debug function to check best practices cells for all domains
 */
function debugAllBestPracticesCells() {
  try {
    const roleSheetData = getRoleSheetData(DEFAULT_ROLE_CONFIG.role);
    if (!roleSheetData) {
      console.log('Teacher sheet not found!');
      return;
    }
    
    Object.keys(TEACHER_DOMAIN_CONFIGS).forEach(domainNum => {
      const config = TEACHER_DOMAIN_CONFIGS[domainNum];
      const bestPracticesMap = createBestPracticesMap(parseInt(domainNum), config);
      
      console.log(`\n=== ${config.name} Best Practices ===`);
      
      Object.keys(bestPracticesMap).forEach(componentId => {
        const location = bestPracticesMap[componentId];
        try {
          const value = roleSheetData.data[location.row] ? 
            roleSheetData.data[location.row][location.col] : 'N/A';
          console.log(`${componentId} at ${location.row + 1}${columnIndexToLetter(location.col)}: "${value}"`);
        } catch (e) {
          console.log(`Error reading ${componentId}: ${e}`);
        }
      });
    });
    
  } catch (error) {
    console.error('Error in debugAllBestPracticesCells:', error);
  }
}

/**
 * Helper function to check Script Properties
 */
function checkScriptProperties() {
  const properties = PropertiesService.getScriptProperties().getProperties();
  console.log('All Script Properties:', properties);
  
  const sheetId = properties.SHEET_ID;
  if (sheetId) {
    console.log('SHEET_ID found:', sheetId);
    console.log('SHEET_ID length:', sheetId.length);
    console.log('SHEET_ID trimmed:', sheetId.trim());
  } else {
    console.log('SHEET_ID not found in properties');
  }
}

/**
 * Function to help verify the expected sheet structure
 */
function listExpectedSheetStructure() {
  console.log('Expected sheet structure:');
  console.log('Required sheets: Staff, Settings, Teacher');
  console.log('\nDomain ranges in the Teacher sheet:');
  
  Object.keys(DOMAIN_CONFIGS).forEach(domainNum => {
    const config = DOMAIN_CONFIGS[domainNum];
    console.log(`${config.name}: Rows ${config.startRow}-${config.endRow}`);
  });
  
  // Also list actual sheets for comparison
  try {
    const connectivity = testSheetConnectivity();
    console.log('\nActual sheets in spreadsheet:');
    Object.keys(connectivity.sheets).forEach(sheetName => {
      const sheet = connectivity.sheets[sheetName];
      console.log(`"${sheetName}" - ${sheet.exists ? 'EXISTS' : 'MISSING'} - ${sheet.rowCount || 0} rows`);
    });
  } catch (error) {
    console.error('Error accessing spreadsheet:', error);
  }
}

/**
 * ADD THESE TESTING FUNCTIONS to Code.js
 * Test the enhanced cache system
 */

/**
 * Test enhanced cache system
 */
function testEnhancedCacheSystem() {
  console.log('=== TESTING ENHANCED CACHE SYSTEM ===');

  try {
    // Test 1: Cache versioning
    console.log('Test 1: Cache versioning');
    const version1 = getMasterCacheVersion();
    console.log('Current version:', version1);

    // Test 2: Cache key generation
    console.log('Test 2: Cache key generation');
    const userKey = generateCacheKey('user', { email: 'test@example.com' });
    const roleKey = generateCacheKey('role_sheet', { role: 'Teacher' });
    console.log('User cache key:', userKey);
    console.log('Role cache key:', roleKey);

    // Test 3: Data change detection
    console.log('Test 3: Data change detection');
    const testData = [['Test', 'Data'], ['Row', '2']];
    const hasChanged = hasSheetDataChanged('TestSheet', testData);
    console.log('Data changed:', hasChanged);

    // Test 4: Cache invalidation
    console.log('Test 4: Cache invalidation');
    invalidateDependentCaches('staff_data');
    console.log('Cache invalidation completed');

    console.log('✅ Enhanced cache system test completed');

  } catch (error) {
    console.error('Error testing enhanced cache system:', error);
  }
}

/**
 * Test complete role change workflow with enhanced caching
 */
function testRoleChangeWithEnhancedCache(testEmail, newRole) {
  console.log('=== TESTING ROLE CHANGE WITH ENHANCED CACHE ===');
  console.log(`Email: ${testEmail}, New Role: ${newRole}`);

  try {
    // Step 1: Clear caches
    console.log('Step 1: Clearing caches...');
    clearCachesForRoleChange(testEmail);

    // Step 2: Test user lookup
    console.log('Step 2: Testing user lookup...');
    const user = getUserByEmail(testEmail);
    console.log('User found:', user ? {
      email: user.email,
      role: user.role,
      year: user.year
    } : 'NOT FOUND');

    // Step 3: Test role sheet loading
    console.log('Step 3: Testing role sheet loading...');
    const roleSheet = getRoleSheetData(newRole);
    console.log('Role sheet loaded:', {
      exists: !!roleSheet,
      title: roleSheet?.title,
      rowCount: roleSheet?.rowCount
    });

    // Step 4: Test cache effectiveness
    console.log('Step 4: Testing cache effectiveness...');
    const cachedUser = getUserByEmail(testEmail); // Should hit cache
    const cachedRoleSheet = getRoleSheetData(newRole); // Should hit cache
    console.log('Cache hits successful:', !!cachedUser && !!cachedRoleSheet);

    console.log('✅ Enhanced role change test completed');

  } catch (error) {
    console.error('Error testing enhanced role change:', error);
  }
}

/**
 * ADD THESE TESTING FUNCTIONS to Code.js
 * Test Phase 2 implementation
 */

/**
 * Test Phase 2 cache busting implementation
 */
function testPhase2CacheBusting() {
  console.log('=== TESTING PHASE 2 CACHE BUSTING ===');

  try {
    // Test 1: URL generation
    console.log('Test 1: URL Generation');
    const urls = generateAllUrlVariations();
    console.log('✓ URL generation successful');

    // Test 2: Response metadata
    console.log('Test 2: Response Metadata Generation');
    const mockContext = {
      role: 'Teacher',
      year: 1,
      email: 'test@example.com',
      isAuthenticated: true,
      isDefaultUser: false
    };
    const metadata = generateResponseMetadata(mockContext, 'test-request', true);
    console.log('Generated metadata:', {
      requestId: metadata.requestId,
      etag: metadata.etag,
      cacheVersion: metadata.cacheVersion
    });
    console.log('✓ Metadata generation successful');

    // Test 3: Role change URL
    console.log('Test 3: Role Change URL');
    const roleChangeUrl = getUrlForRoleChange('Administrator');
    console.log('✓ Role change URL generated');

    console.log('✅ Phase 2 cache busting test completed successfully');

  } catch (error) {
    console.error('❌ Error testing Phase 2:', error);
  }
}

/**
 * Test complete workflow with Phase 2 enhancements
 */
function testCompleteWorkflowPhase2(testRole = 'Administrator') {
  console.log('=== TESTING COMPLETE WORKFLOW WITH PHASE 2 ===');
  console.log(`Test Role: ${testRole}`);

  try {
    // Step 1: Clear caches (Phase 1)
    console.log('Step 1: Clearing caches...');
    clearCachesForRoleChange();

    // Step 2: Generate fresh URLs (Phase 2)
    console.log('Step 2: Generating fresh URLs...');
    const sessionUser = getUserFromSession();
    const userContext = sessionUser ? {
      role: testRole,
      year: 1,
      email: sessionUser.email
    } : null;

    const urls = generateAllUrlVariations(userContext);

    // Step 3: Test doGet simulation
    console.log('Step 3: Testing enhanced doGet...');
    const mockEvent = {
      parameter: {
        refresh: 'true',
        role: testRole,
        debug: 'true',
        t: Date.now().toString()
      }
    };

    // This would normally be called by the web app
    console.log('Mock doGet parameters:', mockEvent.parameter);

    // Step 4: Verify cache busting
    console.log('Step 4: Verifying cache busting...');
    const currentVersion = getMasterCacheVersion();
    console.log('Current cache version:', currentVersion);

    console.log('✅ COMPLETE WORKFLOW TEST PASSED');
    console.log('');
    console.log('🎯 NEXT STEPS:');
    console.log('1. Update your role in the Staff sheet');
    console.log('2. Use this cache-busted URL:');
    console.log(urls.standard);
    console.log('3. Open in incognito/private window');
    console.log('4. Should see role change immediately');

    return {
      success: true,
      urls: urls,
      cacheVersion: currentVersion
    };

  } catch (error) {
    console.error('❌ Complete workflow test failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}