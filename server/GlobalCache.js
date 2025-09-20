/**
 * GlobalCache.js
 * A separate, more resilient caching layer for frequently accessed, non-user-specific data.
 * This cache is designed to survive master cache version increments.
 */

const GLOBAL_CACHE_KEY_STAFF_DATA = 'global_staff_data_v2';
const GLOBAL_CACHE_STAFF_TTL_SECONDS = 3600; // 1 hour

/**
 * Retrieves and decompresses data from the global cache.
 * @param {string} key The global cache key.
 * @return {Object|null} The parsed data or null if not found or on error.
 */
function getGlobalCache(key) {
    try {
        const cache = CacheService.getScriptCache();
        const compressedData = cache.get(key);

        if (compressedData) {
            const decompressedJson = Utilities.unzip(Utilities.base64Decode(compressedData))[0].getDataAsString();
            const data = JSON.parse(decompressedJson);
            debugLog('GlobalCache HIT', { key: key });
            return data;
        }

        debugLog('GlobalCache MISS', { key: key });
        return null;
    } catch (error) {
        console.error(`Error getting from GlobalCache (key: ${key}):`, formatErrorMessage(error, 'getGlobalCache'));
        return null;
    }
}

/**
 * Compresses and stores data in the global cache.
 * @param {string} key The global cache key.
 * @param {Object} data The data to store.
 * @param {number} ttlSeconds The time-to-live in seconds.
 */
function setGlobalCache(key, data, ttlSeconds) {
    try {
        const cache = CacheService.getScriptCache();
        const jsonString = JSON.stringify(data);
        const compressed = Utilities.base64Encode(Utilities.zip(Utilities.newBlob(jsonString, 'application/json')).getBytes());

        cache.put(key, compressed, ttlSeconds);
        debugLog('GlobalCache SET', { key: key, ttl: ttlSeconds });
    } catch (error) {
        console.error(`Error setting GlobalCache (key: ${key}):`, formatErrorMessage(error, 'setGlobalCache'));
    }
}

/**
 * Fetches fresh staff data directly from the sheet, bypassing any cache.
 * This is a simplified version of SheetService.getStaffData, focused only on retrieval.
 * @return {Object|null} The staff data object or null on error.
 */
function getFreshStaffData() {
    try {
        const spreadsheet = openSpreadsheet();
        const sheet = getSheetByName(spreadsheet, SHEET_NAMES.STAFF);
        if (!sheet) return null;

        const lastRow = sheet.getLastRow();
        if (lastRow < 2) return { users: [], lastUpdated: new Date().toISOString() };

        const range = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
        const values = range.getValues();

        const users = values.map((row, index) => {
            // Simplified user object creation for cache
            const user = {
                name: sanitizeText(row[STAFF_COLUMNS.NAME]),
                email: sanitizeText(row[STAFF_COLUMNS.EMAIL] || '').toLowerCase(),
                role: sanitizeText(row[STAFF_COLUMNS.ROLE]),
                year: parseYearValue(row[STAFF_COLUMNS.YEAR]) || 1,
                building: sanitizeText(row[STAFF_COLUMNS.BUILDING]),
                summativeYear: isSummativeYear(row[STAFF_COLUMNS.SUMMATIVE_YEAR]),
                rowNumber: index + 2
            };
            if (!user.email || !isValidEmail(user.email)) return null;
            return user;
        }).filter(Boolean); // Filter out null users (invalid email)

        return {
            users: users,
            lastUpdated: new Date().toISOString(),
            dataHash: generateDataHash(values)
        };
    } catch (error) {
        console.error('Error fetching fresh staff data:', formatErrorMessage(error, 'getFreshStaffData'));
        return null;
    }
}

/**
 * The main function to get staff data, using the global cache with a fetch-on-miss strategy.
 * This is the new entry point for retrieving staff data.
 * @return {Object} The staff data object.
 */
function getStaffDataFromGlobalCache() {
    let staffData = _getGlobalCache(GLOBAL_CACHE_KEY_STAFF_DATA);

    if (staffData && staffData.users) {
        return staffData;
    }

    // If cache is empty, fetch fresh data
    staffData = _getFreshStaffData();

    if (staffData) {
        _setGlobalCache(GLOBAL_CACHE_KEY_STAFF_DATA, staffData, GLOBAL_CACHE_STAFF_TTL_SECONDS);
    }

    return staffData;
}

/**
 * Retrieves and decompresses data from the global cache.
 * @private
 * @param {string} key The global cache key.
 * @return {Object|null} The parsed data or null if not found or on error.
 */
function _getGlobalCache(key) {
    try {
        const cache = CacheService.getScriptCache();
        const compressedData = cache.get(key);

        if (compressedData) {
            const decompressedJson = Utilities.unzip(Utilities.base64Decode(compressedData))[0].getDataAsString();
            const data = JSON.parse(decompressedJson);
            debugLog('GlobalCache HIT', { key: key });
            return data;
        }

        debugLog('GlobalCache MISS', { key: key });
        return null;
    } catch (error) {
        console.error(`Error getting from GlobalCache (key: ${key}):`, formatErrorMessage(error, '_getGlobalCache'));
        return null;
    }
}

/**
 * Compresses and stores data in the global cache.
 * @private
 * @param {string} key The global cache key.
 * @param {Object} data The data to store.
 * @param {number} ttlSeconds The time-to-live in seconds.
 */
function _setGlobalCache(key, data, ttlSeconds) {
    try {
        const cache = CacheService.getScriptCache();
        const jsonString = JSON.stringify(data);
        const compressed = Utilities.base64Encode(Utilities.zip(Utilities.newBlob(jsonString, 'application/json')).getBytes());

        cache.put(key, compressed, ttlSeconds);
        debugLog('GlobalCache SET', { key: key, ttl: ttlSeconds });
    } catch (error) {
        console.error(`Error setting GlobalCache (key: ${key}):`, formatErrorMessage(error, '_setGlobalCache'));
    }
}

/**
 * Fetches fresh staff data directly from the sheet, bypassing any cache.
 * @private
 * @return {Object|null} The staff data object or null on error.
 */
function _getFreshStaffData() {
    try {
        const spreadsheet = openSpreadsheet();
        const sheet = getSheetByName(spreadsheet, SHEET_NAMES.STAFF);
        if (!sheet) return null;

        const lastRow = sheet.getLastRow();
        if (lastRow < 2) return { users: [], lastUpdated: new Date().toISOString() };

        const range = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
        const values = range.getValues();

        const users = values.map((row, index) => {
            // Simplified user object creation for cache
            const user = {
                name: sanitizeText(row[STAFF_COLUMNS.NAME]),
                email: sanitizeText(row[STAFF_COLUMNS.EMAIL] || '').toLowerCase(),
                role: sanitizeText(row[STAFF_COLUMNS.ROLE]),
                year: parseYearValue(row[STAFF_COLUMNS.YEAR]) || 1,
                building: sanitizeText(row[STAFF_COLUMNS.BUILDING]),
                summativeYear: isSummativeYear(row[STAFF_COLUMNS.SUMMATIVE_YEAR]),
                rowNumber: index + 2
            };
            if (!user.email || !isValidEmail(user.email)) return null;
            return user;
        }).filter(Boolean); // Filter out null users (invalid email)

        return {
            users: users,
            lastUpdated: new Date().toISOString(),
            dataHash: generateDataHash(values)
        };
    } catch (error) {
        console.error('Error fetching fresh staff data:', formatErrorMessage(error, '_getFreshStaffData'));
        return null;
    }
}
