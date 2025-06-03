/**
 * Utils.js
 * Shared utility functions for the Danielson Framework Multi-Role System
 */

/**
 * Sanitizes text content by trimming whitespace and handling null values
 * @param {string|null|undefined} text - Text to sanitize
 * @return {string} Sanitized text
 */
function sanitizeText(text) {
  if (text === null || text === undefined) {
    return '';
  }
  return text.toString().trim();
}

/**
 * Parses multi-line cell content into an array of non-empty lines
 * @param {string} cellContent - Cell content with potential line breaks
 * @return {Array<string>} Array of non-empty lines
 */
function parseMultilineCell(cellContent) {
  if (!cellContent) return [];
  
  return cellContent.toString()
    .split(CONTENT_PATTERNS.LINE_BREAKS)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !CONTENT_PATTERNS.EMPTY_LINES.test(line));
}

/**
 * Formats an error message with context information
 * @param {Error|string} error - The error object or message
 * @param {string} context - Additional context about where the error occurred
 * @return {string} Formatted error message
 */
function formatErrorMessage(error, context = '') {
  const errorMessage = error instanceof Error ? error.message : error.toString();
  const timestamp = new Date().toISOString();
  
  if (context) {
    return `[${timestamp}] Error in ${context}: ${errorMessage}`;
  }
  return `[${timestamp}] Error: ${errorMessage}`;
}

/**
 * Generates a unique identifier for caching and tracking
 * @param {string} prefix - Optional prefix for the ID
 * @return {string} Unique identifier
 */
function generateUniqueId(prefix = '') {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

/**
 * Measures execution time of a function
 * @param {Function} func - Function to measure
 * @param {Array} args - Arguments to pass to the function
 * @return {Object} Result object with execution time and function result
 */
function measureExecutionTime(func, args = []) {
  const startTime = Date.now();
  
  try {
    const result = func.apply(null, args);
    const executionTime = Date.now() - startTime;
    
    return {
      success: true,
      result: result,
      executionTime: executionTime,
      error: null
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    return {
      success: false,
      result: null,
      executionTime: executionTime,
      error: error
    };
  }
}

/**
 * Logs performance metrics if performance logging is enabled
 * @param {string} operation - Name of the operation being measured
 * @param {number} executionTime - Time taken in milliseconds
 * @param {Object} additionalMetrics - Additional metrics to log
 */
function logPerformanceMetrics(operation, executionTime, additionalMetrics = {}) {
  if (!PERFORMANCE_SETTINGS.ENABLE_PERFORMANCE_LOGGING) return;
  
  const metrics = {
    operation: operation,
    executionTime: executionTime,
    timestamp: new Date().toISOString(),
    ...additionalMetrics
  };
  
  console.log(`[PERFORMANCE] ${operation}: ${executionTime}ms`, metrics);
}

/**
 * Validates email format using the defined pattern
 * @param {string} email - Email address to validate
 * @return {boolean} True if email is valid
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return VALIDATION_PATTERNS.EMAIL.test(email.trim());
}

/**
 * Validates if a string matches a component ID pattern (e.g., "1a:", "2b:")
 * @param {string} componentId - Component identifier to validate
 * @return {boolean} True if component ID is valid
 */
function isValidComponentId(componentId) {
  if (!componentId || typeof componentId !== 'string') return false;
  return VALIDATION_PATTERNS.COMPONENT_ID.test(componentId.trim());
}

/**
 * Extracts component identifier from component title
 * @param {string} componentTitle - Full component title
 * @return {string|null} Component ID (e.g., "1a:") or null if not found
 */
function extractComponentId(componentTitle) {
  if (!componentTitle) return null;
  
  const match = componentTitle.toString().match(VALIDATION_PATTERNS.COMPONENT_ID);
  return match ? match[0] : null;
}

/**
 * Safely accesses nested object properties without throwing errors
 * @param {Object} obj - Object to access
 * @param {string} path - Dot-notation path (e.g., "user.profile.name")
 * @param {*} defaultValue - Default value if path doesn't exist
 * @return {*} Value at path or default value
 */
function safeGet(obj, path, defaultValue = null) {
  if (!obj || !path) return defaultValue;
  
  const keys = path.split('.');
  let current = obj;
  
  for (const key of keys) {
    if (current === null || current === undefined || !(key in current)) {
      return defaultValue;
    }
    current = current[key];
  }
  
  return current;
}

/**
 * Safely sets nested object properties, creating intermediate objects as needed
 * @param {Object} obj - Object to modify
 * @param {string} path - Dot-notation path
 * @param {*} value - Value to set
 */
function safeSet(obj, path, value) {
  if (!obj || !path) return;
  
  const keys = path.split('.');
  let current = obj;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  
  current[keys[keys.length - 1]] = value;
}

/**
 * Retries a function with exponential backoff
 * @param {Function} func - Function to retry
 * @param {Array} args - Arguments for the function
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {number} baseDelay - Base delay in milliseconds
 * @return {*} Function result or throws last error
 */
function retryWithBackoff(func, args = [], maxRetries = PERFORMANCE_SETTINGS.MAX_RETRY_ATTEMPTS, baseDelay = 1000) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return func.apply(null, args);
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s, etc.
      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error.message);
      Utilities.sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Converts 1-indexed row/column to 0-indexed for array access
 * @param {number} oneIndexed - 1-indexed value
 * @return {number} 0-indexed value
 */
function toZeroIndexed(oneIndexed) {
  return Math.max(0, oneIndexed - 1);
}

/**
 * Converts 0-indexed row/column to 1-indexed for sheet access
 * @param {number} zeroIndexed - 0-indexed value
 * @return {number} 1-indexed value
 */
function toOneIndexed(zeroIndexed) {
  return Math.max(1, zeroIndexed + 1);
}

/**
 * Converts column number to letter (e.g., 0 -> A, 1 -> B, 25 -> Z, 26 -> AA)
 * @param {number} columnIndex - 0-indexed column number
 * @return {string} Column letter(s)
 */
function columnIndexToLetter(columnIndex) {
  let result = '';
  let index = columnIndex;
  
  while (index >= 0) {
    result = String.fromCharCode(65 + (index % 26)) + result;
    index = Math.floor(index / 26) - 1;
  }
  
  return result;
}

/**
 * Creates a deep copy of an object
 * @param {*} obj - Object to clone
 * @return {*} Deep copy of the object
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  
  const cloned = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

/**
 * Merges two objects, with the second object taking precedence
 * @param {Object} obj1 - Base object
 * @param {Object} obj2 - Object to merge in
 * @return {Object} Merged object
 */
function mergeObjects(obj1, obj2) {
  const result = deepClone(obj1);
  
  for (const key in obj2) {
    if (obj2.hasOwnProperty(key)) {
      if (typeof obj2[key] === 'object' && obj2[key] !== null && !Array.isArray(obj2[key])) {
        result[key] = mergeObjects(result[key] || {}, obj2[key]);
      } else {
        result[key] = obj2[key];
      }
    }
  }
  
  return result;
}

/**
 * Debounces a function to prevent excessive calls
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @return {Function} Debounced function
 */
function debounce(func, delay) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

/**
 * Checks if execution time is approaching the Apps Script limit
 * @param {number} startTime - Start time in milliseconds
 * @param {number} bufferTime - Buffer time in milliseconds (default 5 seconds)
 * @return {boolean} True if approaching time limit
 */
function isApproachingTimeLimit(startTime, bufferTime = 5000) {
  const elapsed = Date.now() - startTime;
  return elapsed > (PERFORMANCE_SETTINGS.MAX_EXECUTION_TIME - bufferTime);
}

/**
 * Logs debug information if debug logging is enabled
 * @param {string} message - Debug message
 * @param {*} data - Additional data to log
 */
function debugLog(message, data = null) {
  if (!PERFORMANCE_SETTINGS.ENABLE_DEBUG_LOGGING) return;
  
  const timestamp = new Date().toISOString();
  if (data !== null) {
    console.log(`[DEBUG ${timestamp}] ${message}`, data);
  } else {
    console.log(`[DEBUG ${timestamp}] ${message}`);
  }
}

/**
 * Parse comma-separated subdomain list into array with colons
 * @param {string} subdomainString - String like "1a, 1c, 1f"
 * @return {Array<string>} Array like ["1a:", "1c:", "1f:"]
 */
function parseSubdomainList(subdomainString) {
  // Handle empty or null input
  if (!subdomainString || typeof subdomainString !== 'string') {
    return [];
  }

  // Split by comma, clean up, and add colons
  return subdomainString
    .split(',')
    .map(item => item.trim()) // Remove spaces
    .filter(item => item.length > 0) // Remove empty items
    .map(item => {
      // Add colon if not already present
      return item.endsWith(':') ? item : item + ':';
    });
}

/**
 * Get assigned subdomains for a specific role and year
 * @param {string} role - User's role
 * @param {number|string} year - User's year (1, 2, 3, or 'Probationary')
 * @return {Object} Object with domain arrays
 */
function getAssignedSubdomainsForRoleYear(role, year) {
  try {
    const settingsData = getSettingsData();
    if (!settingsData || !settingsData.roleYearMappings) {
      debugLog('No settings data available for subdomain assignment');
      return { domain1: [], domain2: [], domain3: [], domain4: [] };
    }

    const roleMapping = settingsData.roleYearMappings[role];
    if (!roleMapping) {
      debugLog('No mapping found for role', { role: role });
      return { domain1: [], domain2: [], domain3: [], domain4: [] };
    }

    // Probationary users see all subdomains (Year 1 content)
    const yearKey = year === 'Probationary' ? 'year1' : `year${year}`;
    const yearData = roleMapping[yearKey];

    if (!yearData || !Array.isArray(yearData) || yearData.length < 4) {
      debugLog('Invalid year data for role', { role: role, year: year, yearKey: yearKey });
      return { domain1: [], domain2: [], domain3: [], domain4: [] };
    }

    return {
      domain1: parseSubdomainList(yearData[0]),
      domain2: parseSubdomainList(yearData[1]),
      domain3: parseSubdomainList(yearData[2]),
      domain4: parseSubdomainList(yearData[3])
    };

  } catch (error) {
    console.error('Error getting assigned subdomains:', error);
    return { domain1: [], domain2: [], domain3: [], domain4: [] };
  }
}