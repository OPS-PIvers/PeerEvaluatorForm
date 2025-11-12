/**
 * CacheManager.js - Advanced cache management for role switching
 * This file handles cache versioning, dependencies, and invalidation
 */


// Script-scoped cache for the master cache version
let scriptScopedMasterCacheVersion = null;

/**
 * Enhanced cache key generator with versioning and secure hashing
 * SECURITY: Now includes salt-based hashing to prevent cache key enumeration
 * @param {string} baseKey - Base cache key (e.g., 'user', 'role_sheet')
 * @param {Object} params - Parameters to include in key
 * @return {string} Versioned and hashed cache key
 */
function generateCacheKey(baseKey, params = {}) {
  try {
    // Get master version
    const masterVersion = getMasterCacheVersion();

    // Get security salt for hashing
    const salt = getSecuritySalt();

    // Build parameter string
    const paramString = Object.keys(params)
      .sort() // Ensure consistent ordering
      .map(key => `${key}:${params[key]}`)
      .join('_');

    // Create pre-hash key
    const preHashKey = paramString ?
      `${baseKey}_${paramString}_v${masterVersion}_${salt}` :
      `${baseKey}_v${masterVersion}_${salt}`;

    // Hash the key for security (prevents enumeration)
    const hash = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      preHashKey
    );
    const hashedKey = Utilities.base64Encode(hash).substring(0, 32);

    // Prefix with baseKey for debugging purposes
    const fullKey = `${baseKey}_${hashedKey}`;

    debugLog('Generated secure cache key', { baseKey, params, fullKey });
    return fullKey;

  } catch (error) {
    console.error('Error generating cache key:', error);
    // Fallback to simple key with timestamp
    return `${baseKey}_${Date.now()}`;
  }
}

/**
 * Get current master cache version
 * @return {string} Current version string
 */
function getMasterCacheVersion() {
  try {
    // Check script-scoped cache first
    if (scriptScopedMasterCacheVersion !== null) {
      // debugLog('Master cache version retrieved from script scope', { version: scriptScopedMasterCacheVersion });
      return scriptScopedMasterCacheVersion;
    }

    const properties = PropertiesService.getScriptProperties();
    let version = properties.getProperty('MASTER_CACHE_VERSION');

    if (!version) {
      version = `${CACHE_VERSION}_${Date.now()}`;
      properties.setProperty('MASTER_CACHE_VERSION', version);
      debugLog('Created new master cache version and stored in properties', { version });
    } else {
      // debugLog('Master cache version fetched from properties', { version });
    }

    scriptScopedMasterCacheVersion = version; // Store in script-scoped cache
    return version;
  } catch (error) {
    console.error('Error getting master cache version:', error);
    // Fallback to a dynamic version for this execution only if properties fail
    // Ensure the script-scoped cache is null on error.
    scriptScopedMasterCacheVersion = null;
    return `${CACHE_VERSION}_${Date.now()}`; // Fallback
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

    scriptScopedMasterCacheVersion = newVersion; // Update script-scoped cache

    debugLog('Master cache version incremented', { newVersion });
    // By changing the MASTER_CACHE_VERSION, all previously generated cache keys
    // (which include this version) will effectively become stale.
    // New calls to generateCacheKey() will use the newVersion,
    // thus fetching or storing fresh data against new keys.
    // A full cache.removeAll() is therefore not strictly necessary if all
    // relevant cached items are versioned, and can be a performance overhead.

    return true; // Indicate success
  } catch (error) {
    console.error('Error incrementing master cache version:', error);
    // On error, invalidate the script-scoped cache to force re-fetch on next getMasterCacheVersion
    scriptScopedMasterCacheVersion = null;
    return false; // Indicate failure
  }
}

/**
 * Enhanced cache get with dependency tracking
 * SECURITY: Now uses user-scoped cache for isolation between users
 * @param {string} baseKey - Base cache key
 * @param {Object} params - Cache parameters
 * @return {*} Cached data or null
 */
function getCachedDataEnhanced(baseKey, params = {}) {
  try {
    const fullKey = generateCacheKey(baseKey, params);
    // SECURITY FIX: Use user-scoped cache instead of script cache
    const cache = CacheService.getUserCache();
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
 * SECURITY: Now uses user-scoped cache and reduced TTL values
 * @param {string} baseKey - Base cache key
 * @param {Object} params - Cache parameters
 * @param {*} data - Data to cache
 * @param {number} ttl - Time to live in seconds
 */
function setCachedDataEnhanced(baseKey, params = {}, data, ttl = CACHE_SETTINGS.DEFAULT_TTL) {
  try {
    const fullKey = generateCacheKey(baseKey, params);
    // SECURITY FIX: Use user-scoped cache instead of script cache
    const cache = CacheService.getUserCache();

    // Add metadata to cached data
    const cacheEntry = {
      data: data,
      timestamp: Date.now(),
      version: getMasterCacheVersion(),
      baseKey: baseKey,
      params: params
    };

    // SECURITY: Reduce maximum TTL to prevent long-lived cached data
    const maxTTL = 600; // 10 minutes maximum
    const safeTTL = Math.min(ttl, maxTTL);

    cache.put(fullKey, JSON.stringify(cacheEntry), safeTTL);
    debugLog('Cache SET', { baseKey, fullKey, ttl: safeTTL });

  } catch (error) {
    console.error('Error setting cached data:', error);
  }
}

/**
 * Clear caches based on dependency map
 * SECURITY: Now uses user-scoped cache for cache invalidation
 * @param {string} changedKey - The base cache key that changed
 */
function invalidateDependentCaches(changedKey) {
  try {
    debugLog('Invalidating dependent caches based on changed key', { changedKey });

    // SECURITY FIX: Use user-scoped cache
    const cache = CacheService.getUserCache();
    const dependencies = CACHE_DEPENDENCIES[changedKey] || [];

    dependencies.forEach(dependentPattern => {
      if (dependentPattern.includes('*')) {
        // If a changed key (e.g., 'staff_data') has a wildcard dependency (e.g., 'user_*'),
        // it triggers a master version increment. This is because the specific instance
        // of the wildcard (e.g., which user) is not known at this level of dependency processing.
        // Callers with specific context (e.g., a specific userEmail) should handle
        // direct, targeted invalidation *before* calling this function if they want to avoid
        // a global invalidation for that specific wildcard instance.
        const basePattern = dependentPattern.replace('*', '');
        debugLog('Global invalidation for wildcard dependency', { changedKey, dependentPattern: dependentPattern, basePattern });
        incrementMasterCacheVersion();
      } else {
        // For non-wildcard dependencies, remove the specific versioned key.
        const fullKeyToRemove = generateCacheKey(dependentPattern);
        cache.remove(fullKeyToRemove);
        debugLog('Cleared specific dependent cache (versioned)', { changedKey, baseKey: dependentPattern, fullKey: fullKeyToRemove });
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
    return Utilities.base64Encode(hash); // Full Base64 encoded MD5 hash
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

    // Note: We don't need to explicitly clear the cache service since incrementing
    // the master version effectively invalidates all versioned cache keys.
    // The old cache entries will naturally expire or become unused.

    // Clear stored hashes to force fresh data detection
    const properties = PropertiesService.getScriptProperties();
    const allProperties = properties.getProperties();
    Object.keys(allProperties).forEach(key => {
      // Clear sheet hash properties to force data change detection
      if (key.startsWith('SHEET_HASH_')) {
        properties.deleteProperty(key);
      }
    });

    debugLog('All caches force cleared via master version increment');

  } catch (error) {
    console.error('Error force clearing caches:', error);
  }
}