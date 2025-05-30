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
 * Main function to serve the web app
 * Enhanced to support user-specific role-based content
 */
function doGet(e) {
  const startTime = Date.now();
  
  try {
    // Create user context (handles authentication and role detection)
    const userContext = createUserContext();
    
    debugLog('Web app request started', {
      email: userContext.email,
      role: userContext.role,
      year: userContext.year,
      isDefaultUser: userContext.isDefaultUser
    });
    
    // Get role-specific rubric data
    const rubricData = getAllDomainsData(userContext.role, userContext.year);
    
    // Add user context to the data for the HTML template
    rubricData.userContext = {
      email: userContext.email,
      role: userContext.role,
      year: userContext.year,
      isAuthenticated: userContext.isAuthenticated,
      displayName: userContext.email ? userContext.email.split('@')[0] : 'Guest'
    };
    
    // Create and configure the HTML template
    const htmlTemplate = HtmlService.createTemplateFromFile('rubric');
    htmlTemplate.data = rubricData;
    
    const htmlOutput = htmlTemplate.evaluate()
      .setTitle(getPageTitle(userContext.role))
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', HTML_SETTINGS.VIEWPORT_META);
    
    const executionTime = Date.now() - startTime;
    logPerformanceMetrics('doGet', executionTime, {
      role: userContext.role,
      year: userContext.year,
      domainCount: rubricData.domains ? rubricData.domains.length : 0,
      isDefaultUser: userContext.isDefaultUser
    });
    
    debugLog('Web app request completed successfully', {
      role: userContext.role,
      executionTime: executionTime
    });
    
    return htmlOutput;
    
  } catch (error) {
    console.error('Error in doGet:', formatErrorMessage(error, 'doGet'));
    
    // Return user-friendly error page
    return createErrorPage(error);
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