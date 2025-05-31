/**
 * CacheManager.js - Advanced cache management for role switching
 * This file handles cache versioning, dependencies, and invalidation
 */

/**
 * Master cache version - increment this when making major cache changes
 */
const CACHE_VERSION = '1.0.0';

/**
 * Cache dependency map - defines which caches depend on others
 */
const CACHE_DEPENDENCIES = {
  'staff_data': ['user_*', 'role_mappings'], // When staff_data changes, clear user and role caches
  'settings_data': ['role_sheet_*', 'domain_mappings'],
  'user_*': ['role_sheet_*'], // When any user data changes, clear role sheets
  'role_sheet_*': [] // Role sheets have no dependencies
};

/**
 * Enhanced cache key generator with versioning
 * @param {string} baseKey - Base cache key (e.g., 'user', 'role_sheet')
 * @param {Object} params - Parameters to include in key
 * @return {string} Versioned cache key
 */
function generateCacheKey(baseKey, params = {}) {
  try {
    // Get master version
    const masterVersion = getMasterCacheVersion();

    // Build parameter string
    const paramString = Object.keys(params)
      .sort() // Ensure consistent ordering
      .map(key => `${key}:${params[key]}`)
      .join('_');

    // Combine all parts
    const fullKey = paramString ?
      `${baseKey}_${paramString}_v${masterVersion}` :
      `${baseKey}_v${masterVersion}`;

    debugLog('Generated cache key', { baseKey, params, fullKey });
    return fullKey;

  } catch (error) {
    console.error('Error generating cache key:', error);
    // Fallback to simple key
    return `${baseKey}_${Date.now()}`;
  }
}

/**
 * Get current master cache version
 * @return {string} Current version string
 */
function getMasterCacheVersion() {
  try {
    const properties = PropertiesService.getScriptProperties();
    let version = properties.getProperty('MASTER_CACHE_VERSION');

    if (!version) {
      version = `${CACHE_VERSION}_${Date.now()}`;
      properties.setProperty('MASTER_CACHE_VERSION', version);
      debugLog('Created new master cache version', { version });
    }

    return version;
  } catch (error) {
    console.error('Error getting master cache version:', error);
    return `${CACHE_VERSION}_${Date.now()}`;
  }
}

/**
 * Increment master cache version (forces all caches to invalidate)
 */
function incrementMasterCacheVersion() {
  try {
    const newVersion = `${CACHE_VERSION}_${Date.now()}`;
    const properties = PropertiesService.getScriptProperties();
    properties.setProperty('MASTER_CACHE_VERSION', newVersion);

    debugLog('Master cache version incremented', { newVersion });

    // Also clear all existing caches since version changed
    const cache = CacheService.getScriptCache();
    cache.removeAll();

    return true; // Indicate success
  } catch (error) {
    console.error('Error incrementing master cache version:', error);
    return false; // Indicate failure
  }
}

/**
 * Enhanced cache get with dependency tracking
 * @param {string} baseKey - Base cache key
 * @param {Object} params - Cache parameters
 * @return {*} Cached data or null
 */
function getCachedDataEnhanced(baseKey, params = {}) {
  try {
    const fullKey = generateCacheKey(baseKey, params);
    const cache = CacheService.getScriptCache();
    const cachedString = cache.get(fullKey);

    if (cachedString) {
      const cachedData = JSON.parse(cachedString);
      debugLog('Cache HIT', { baseKey, fullKey, hasData: !!cachedData });
      return cachedData;
    } else {
      debugLog('Cache MISS', { baseKey, fullKey });
      return null;
    }
  } catch (error) {
    console.error('Error getting cached data:', error);
    return null;
  }
}

/**
 * Enhanced cache set with dependency tracking
 * @param {string} baseKey - Base cache key
 * @param {Object} params - Cache parameters
 * @param {*} data - Data to cache
 * @param {number} ttl - Time to live in seconds
 */
function setCachedDataEnhanced(baseKey, params = {}, data, ttl = CACHE_SETTINGS.DEFAULT_TTL) {
  try {
    const fullKey = generateCacheKey(baseKey, params);
    const cache = CacheService.getScriptCache();

    // Add metadata to cached data
    const cacheEntry = {
      data: data,
      timestamp: Date.now(),
      version: getMasterCacheVersion(),
      baseKey: baseKey,
      params: params
    };

    cache.put(fullKey, JSON.stringify(cacheEntry), ttl);
    debugLog('Cache SET', { baseKey, fullKey, ttl });

  } catch (error) {
    console.error('Error setting cached data:', error);
  }
}

/**
 * Clear caches based on dependency map
 * @param {string} changedKey - The cache key that changed
 */
function invalidateDependentCaches(changedKey) {
  try {
    debugLog('Invalidating dependent caches', { changedKey });

    const cache = CacheService.getScriptCache();
    const dependencies = CACHE_DEPENDENCIES[changedKey] || [];

    dependencies.forEach(dependentPattern => {
      if (dependentPattern.includes('*')) {
        // Handle wildcard patterns
        const basePattern = dependentPattern.replace('*', '');
        debugLog('Clearing wildcard pattern', { pattern: basePattern });

        // For wildcard patterns, we need to increment master version
        // since we can't easily enumerate all matching keys
        incrementMasterCacheVersion();
      } else {
        // Clear specific key
        cache.remove(dependentPattern);
        debugLog('Cleared specific cache', { key: dependentPattern });
      }
    });

  } catch (error) {
    console.error('Error invalidating dependent caches:', error);
  }
}

/**
 * Data change detection using hash comparison
 * @param {string} sheetName - Name of the sheet to check
 * @param {Array<Array>} currentData - Current sheet data
 * @return {boolean} True if data has changed
 */
function hasSheetDataChanged(sheetName, currentData) {
  try {
    // Generate hash of current data
    const currentHash = generateDataHash(currentData);

    // Get stored hash
    const properties = PropertiesService.getScriptProperties();
    const storedHash = properties.getProperty(`SHEET_HASH_${sheetName}`);

    if (!storedHash) {
      // No stored hash, assume it's new data
      properties.setProperty(`SHEET_HASH_${sheetName}`, currentHash);
      debugLog('No stored hash found, creating new', { sheetName, currentHash });
      return true;
    }

    const hasChanged = currentHash !== storedHash;

    if (hasChanged) {
      // Update stored hash
      properties.setProperty(`SHEET_HASH_${sheetName}`, currentHash);
      debugLog('Data change detected', { sheetName, oldHash: storedHash, newHash: currentHash });
    }

    return hasChanged;

  } catch (error) {
    console.error('Error checking sheet data changes:', error);
    return true; // Assume changed on error to be safe
  }
}

/**
 * Generate hash of sheet data for change detection
 * @param {Array<Array>} data - Sheet data
 * @return {string} Hash string
 */
function generateDataHash(data) {
  try {
    // Convert data to string and generate simple hash
    const dataString = JSON.stringify(data);
    const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, dataString);
    return Utilities.base64Encode(hash).substring(0, 16); // First 16 chars
  } catch (error) {
    console.error('Error generating data hash:', error);
    return Date.now().toString(); // Fallback to timestamp
  }
}

/**
 * Force clear all caches (emergency function)
 */
function forceCleanAllCaches() {
  try {
    debugLog('Force clearing all caches');

    // Increment master version (invalidates all versioned caches)
    incrementMasterCacheVersion();

    // Clear the cache service entirely
    const cache = CacheService.getScriptCache();
    cache.removeAll();

    // Clear stored hashes
    const properties = PropertiesService.getScriptProperties();
    const allProperties = properties.getProperties();
    Object.keys(allProperties).forEach(key => {
      if (key.startsWith('SHEET_HASH_') || key.startsWith('CACHE_')) {
        properties.deleteProperty(key);
      }
    });

    debugLog('All caches force cleared');

  } catch (error) {
    console.error('Error force clearing caches:', error);
  }
}
