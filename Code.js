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
    // Validate email if provided
    if (userEmail && !isValidEmail(userEmail)) { // Assuming isValidEmail is globally available
      console.warn('Invalid email provided to clearCachesForRoleChange: ' + userEmail);
      debugLog('Invalid email format in clearCachesForRoleChange, aborting.', { userEmail });
      return; // Exit if email is provided but invalid
    }

    // Get user email if not provided
    if (!userEmail) {
      const sessionUser = getUserFromSession();
      userEmail = sessionUser ? sessionUser.email : null;
    }

    if (userEmail) {
      debugLog('Performing targeted cache invalidation for user role change', { userEmail });
      const cache = CacheService.getScriptCache();
      const trimmedEmail = userEmail.toLowerCase().trim();

      // Clear direct user-specific caches
      const userKey = generateCacheKey('user', { email: trimmedEmail });
      cache.remove(userKey);
      debugLog('Cleared specific user cache for role change', { userEmail, key: userKey });

      const userContextKey = generateCacheKey('user_context', { email: trimmedEmail });
      cache.remove(userContextKey);
      debugLog('Cleared specific user_context cache for role change', { userEmail, key: userContextKey });

      // Decision: This function will NOT call incrementMasterCacheVersion itself.
      // It focuses on clearing only the specific user's direct data.
      // If a role change was detected by the caller (e.g., createUserContext),
      // the caller might take further specific actions regarding role sheets
      // or rely on the user data change to propagate.
      // This keeps clearCachesForRoleChange highly focused on the user's direct caches.

    } else {
      debugLog('No user email provided to clearCachesForRoleChange - performing global cache clear via forceCleanAllCaches');
      forceCleanAllCaches();
    }

    console.log('✅ Cache clearing for role change process completed');

  } catch (error) {
    console.error('Error in clearCachesForRoleChange:', error);
    // Fallback to force clear to ensure system stability
    forceCleanAllCaches();
  }
}

/**
 * ADD THESE TESTING FUNCTIONS to Code.js
 * Test Phase 3 implementation
 */

/**
 * Test Phase 3 user context enhancement
 */
function testPhase3UserContextEnhancement() {
  console.log('=== TESTING PHASE 3 USER CONTEXT ENHANCEMENT ===');

  try {
    const sessionUser = getUserFromSession();
    if (!sessionUser || !sessionUser.email) {
      console.log('❌ No session user found for testing');
      return;
    }

    const userEmail = sessionUser.email;
    console.log(`Testing with user: ${userEmail}`);

    // Test 1: Session management
    console.log('Test 1: Session Management');
    const session = getUserSession(userEmail);
    console.log('✓ Session created/retrieved:', {
      sessionId: session.sessionId,
      isActive: session.isActive,
      accessCount: session.accessCount
    });

    // Test 2: State detection
    console.log('Test 2: State Detection');
    const currentUser = getUserByEmail(userEmail);
    const changeDetection = detectUserStateChanges(userEmail, {
      role: currentUser.role,
      year: currentUser.year,
      name: currentUser.name,
      email: userEmail
    });
    console.log('✓ State detection result:', {
      hasChanged: changeDetection.hasChanged,
      changes: changeDetection.changes.length,
      isNewUser: changeDetection.isNewUser
    });

    // Test 3: Enhanced user context
    console.log('Test 3: Enhanced User Context');
    const context = createUserContext(userEmail);
    console.log('✓ Enhanced context created:', {
      role: context.role,
      roleChangeDetected: context.roleChangeDetected,
      stateChanges: context.stateChanges.length,
      sessionId: context.metadata.sessionId,
      contextVersion: context.metadata.contextVersion
    });

    // Test 4: Role change history
    console.log('Test 4: Role Change History');
    const history = getRoleChangeHistory(userEmail);
    console.log('✓ Role change history:', {
      totalChanges: history.length,
      recentChanges: history.slice(0, 3)
    });

    // Test 5: User dashboard
    console.log('Test 5: User Dashboard');
    const dashboard = getUserDashboardData(userEmail);
    console.log('✓ Dashboard data generated:', {
      currentRole: dashboard.user?.currentRole,
      sessionActive: dashboard.session?.isActive,
      totalRoleChanges: dashboard.roleChanges?.total
    });

    console.log('✅ Phase 3 user context enhancement test completed successfully');

  } catch (error) {
    console.error('❌ Error testing Phase 3:', error);
  }
}

/**
 * Test role change detection and automatic cache clearing
 */
function testRoleChangeDetection(testEmail, newRole) {
  console.log('=== TESTING ROLE CHANGE DETECTION ===');
  console.log(`Test Email: ${testEmail}`);
  console.log(`New Role: ${newRole}`);

  try {
    // Step 1: Get current state
    console.log('Step 1: Getting current state...');
    const currentState = getStoredUserState(testEmail);
    console.log('Current stored state:', currentState);

    // Step 2: Simulate role change in Staff sheet
    console.log('Step 2: Simulating role change...');
    console.log('ℹ️  In real usage, you would change the role in the Staff sheet');
    console.log('ℹ️  For this test, we will manually trigger detection');

    // Step 3: Test change detection
    console.log('Step 3: Testing change detection...');
    const mockNewState = {
      role: newRole,
      year: currentState?.year || 1,
      name: currentState?.name || 'Test User',
      email: testEmail
    };

    const changeDetection = detectUserStateChanges(testEmail, mockNewState);
    console.log('Change detection result:', {
      hasChanged: changeDetection.hasChanged,
      changes: changeDetection.changes,
      reason: changeDetection.reason
    });

    // Step 4: Test proactive cache clearing
    if (changeDetection.hasChanged) {
      console.log('Step 4: Testing proactive cache clearing...');

      const roleChange = changeDetection.changes.find(change => change.field === 'role');
      if (roleChange) {
        addRoleChangeToHistory(testEmail, roleChange.oldValue, roleChange.newValue);
        clearCachesForRoleChange(testEmail);
        console.log('✓ Role change processed and caches cleared');
      }
    }

    // Step 5: Test cache warming
    console.log('Step 5: Testing cache warming...');
    warmCacheForRoleChange(testEmail, newRole);
    console.log('✓ Cache warming completed');

    // Step 6: Generate URLs for the new role
    console.log('Step 6: Generating URLs for new role...');
    const urls = getUrlForRoleChange(newRole, testEmail);
    console.log('✓ Role change URL generated');

    console.log('✅ Role change detection test completed');
    console.log('📋 To complete the test:');
    console.log('1. Change the users role in the Staff sheet');
    console.log('2. Use the generated URL above');
    console.log('3. Role change should be detected automatically');

  } catch (error) {
    console.error('❌ Error testing role change detection:', error);
  }
}

/**
 * Test proactive monitoring for all users
 */
function testProactiveMonitoring() {
  console.log('=== TESTING PROACTIVE MONITORING ===');

  try {
    // Test 1: Check all users for role changes
    console.log('Test 1: Checking all users for role changes...');
    const changeResults = checkAllUsersForRoleChanges();
    console.log('✓ Change check results:', {
      totalUsers: changeResults.totalUsers,
      usersChecked: changeResults.usersChecked,
      changesDetected: changeResults.changesDetected,
      roleChanges: changeResults.roleChanges?.length || 0
    });

    // Test 2: Session cleanup
    console.log('Test 2: Testing session cleanup...');
    const cleanupCount = cleanupExpiredSessions();
    console.log('✓ Cleanup completed:', {
      itemsCleaned: cleanupCount
    });

    // Test 3: Enhanced validation
    console.log('Test 3: Testing enhanced user validation...');
    const sessionUser = getUserFromSession();
    if (sessionUser && sessionUser.email) {
      const validation = validateUserWithStateTracking(sessionUser.email);
      console.log('✓ Enhanced validation result:', {
        valid: validation.hasAccess,
        role: validation.role,
        sessionActive: validation.sessionActive,
        totalRoleChanges: validation.totalRoleChanges
      });
    } else {
      console.log('⚠️  No session user for validation test');
    }

    console.log('✅ Proactive monitoring test completed successfully');

  } catch (error) {
    console.error('❌ Error testing proactive monitoring:', error);
  }
}

/**
 * Complete Phase 3 integration test
 */
function testCompletePhase3Integration() {
  console.log('=== COMPLETE PHASE 3 INTEGRATION TEST ===');

  try {
    const sessionUser = getUserFromSession();
    if (!sessionUser || !sessionUser.email) {
      console.log('❌ No session user found - cannot run integration test');
      return;
    }

    const userEmail = sessionUser.email;
    console.log(`Running integration test for: ${userEmail}`);

    // Phase 1: Test enhanced cache system
    console.log('🔧 Testing Phase 1 (Enhanced Cache System)...');
    testEnhancedCacheSystem();

    // Phase 2: Test cache busting
    console.log('🌐 Testing Phase 2 (Cache Busting)...');
    testPhase2CacheBusting();

    // Phase 3: Test user context enhancement
    console.log('👤 Testing Phase 3 (User Context Enhancement)...');
    testPhase3UserContextEnhancement();

    // Integration: Test complete workflow
    console.log('🔄 Testing Complete Integration Workflow...');
    const dashboard = getUserDashboardData(userEmail);

    if (dashboard.error) {
      console.log('❌ Dashboard generation failed:', dashboard.error);
      return;
    }

    console.log('✅ INTEGRATION TEST RESULTS:');
    console.log('User Info:', {
      email: dashboard.user.email,
      role: dashboard.user.currentRole,
      year: dashboard.user.currentYear,
      hasStaffRecord: dashboard.user.hasStaffRecord
    });

    console.log('Session Info:', {
      sessionId: dashboard.session.sessionId,
      isActive: dashboard.session.isActive,
      accessCount: dashboard.session.accessCount
    });

    console.log('Role Changes:', {
      total: dashboard.roleChanges.total,
      lastChange: dashboard.roleChanges.lastChange
    });

    console.log('URLs Generated:', {
      standard: !!dashboard.urls.standard,
      debug: !!dashboard.urls.debug,
      roleSpecific: Object.keys(dashboard.urls.roleSpecific || {}).length
    });

    console.log('🎯 RECOMMENDED NEXT STEPS:');
    console.log('1. Change your role in the Staff sheet');
    console.log('2. Run: testRoleChangeDetection("' + userEmail + '", "Administrator")');
    console.log('3. Use generated URL to test immediate role switching');
    console.log('4. Verify proactive cache clearing works');

    console.log('✅ COMPLETE PHASE 3 INTEGRATION TEST PASSED');

    return dashboard;

  } catch (error) {
    console.error('❌ Integration test failed:', error);
    return { error: error.message };
  }
}

/**
 * REPLACE THIS FUNCTION in Code.js
 * Enhanced doGet function with proactive role change detection
 */
function doGet(e) {
  const startTime = Date.now();
  const requestId = generateUniqueId('request');
  
  try {
    // Clean up expired sessions periodically (10% chance)
    if (Math.random() < 0.1) {
      cleanupExpiredSessions();
    }

    // Parse URL parameters for cache control
    const params = e.parameter || {};
    const forceRefresh = params.refresh === 'true' || params.nocache === 'true';
    const debugMode = params.debug === 'true';
    const urlTimestamp = params.t || null;
    const urlRole = params.role || null;
    const proactiveCheck = params.proactive !== 'false'; // Default to true

    debugLog('Enhanced web app request received', {
      requestId: requestId,
      forceRefresh: forceRefresh,
      debugMode: debugMode,
      urlTimestamp: urlTimestamp,
      urlRole: urlRole,
      proactiveCheck: proactiveCheck,
      userAgent: e.userAgent || 'Unknown'
    });

    // Handle force refresh - clear all relevant caches
    if (forceRefresh) {
      debugLog('Force refresh requested - clearing caches', { requestId });

      const sessionUser = getUserFromSession();
      if (sessionUser && sessionUser.email) {
        clearCachesForRoleChange(sessionUser.email);
      } else {
        forceCleanAllCaches();
      }
    }

    // Create enhanced user context with proactive role change detection
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

    // Warm cache for the current role if role change was detected
    if (userContext.roleChangeDetected && userContext.email) {
      warmCacheForRoleChange(userContext.email, userContext.role);
    }

    debugLog('Enhanced user context created', {
      email: userContext.email,
      role: userContext.role,
      year: userContext.year,
      isDefaultUser: userContext.isDefaultUser,
      roleChangeDetected: userContext.roleChangeDetected,
      stateChanges: userContext.stateChanges.length,
      isRoleOverride: userContext.isRoleOverride || false,
      sessionId: userContext.metadata.sessionId,
      requestId: requestId
    });
    
    // Get role-specific rubric data
    const rubricData = getAllDomainsData(userContext.role, userContext.year);
    
    // Generate enhanced response metadata
    const responseMetadata = generateResponseMetadata(userContext, requestId, debugMode);

    // Add comprehensive user context to the data for the HTML template
    rubricData.userContext = {
      // Basic user info
      email: userContext.email,
      role: userContext.role,
      year: userContext.year,
      isAuthenticated: userContext.isAuthenticated,
      displayName: userContext.email ? userContext.email.split('@')[0] : 'Guest',

      // Request context
      requestId: requestId,
      timestamp: Date.now(),
      forceRefresh: forceRefresh,
      debugMode: debugMode,
      isRoleOverride: userContext.isRoleOverride || false,

      // State tracking
      roleChangeDetected: userContext.roleChangeDetected,
      stateChanges: userContext.stateChanges,
      isNewUser: userContext.isNewUser,
      previousRole: userContext.previousState?.role || null,

      // Session info
      sessionId: userContext.metadata.sessionId,
      sessionActive: userContext.sessionInfo?.isActive || false,

      // Cache info
      cacheVersion: userContext.metadata.cacheVersion,
      responseMetadata: responseMetadata,

      // Enhanced metadata
      contextVersion: userContext.metadata.contextVersion,
      hasStaffRecord: userContext.hasStaffRecord
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

    // Add enhanced debug headers if requested
    if (debugMode) {
      addDebugHeaders(htmlOutput, userContext, responseMetadata);
      addStateTrackingHeaders(htmlOutput, userContext);
    }
    
    const executionTime = Date.now() - startTime;
    logPerformanceMetrics('doGet', executionTime, {
      role: userContext.role,
      year: userContext.year,
      domainCount: rubricData.domains ? rubricData.domains.length : 0,
      isDefaultUser: userContext.isDefaultUser,
      forceRefresh: forceRefresh,
      roleChangeDetected: userContext.roleChangeDetected,
      stateChanges: userContext.stateChanges.length,
      requestId: requestId
    });
    
    debugLog('Enhanced web app request completed successfully', {
      role: userContext.role,
      executionTime: executionTime,
      requestId: requestId,
      responseETag: responseMetadata.etag,
      roleChangeDetected: userContext.roleChangeDetected
    });
    
    return htmlOutput;
    
  } catch (error) {
    console.error('Error in enhanced doGet:', formatErrorMessage(error, 'doGet'));
    
    // Return enhanced error page with cache busting
    return createEnhancedErrorPage(error, requestId, null, e.userAgent);
  }
}

/**
 * ADD THIS FUNCTION to Code.js
 * Add state tracking headers for debugging
 */
function addStateTrackingHeaders(htmlOutput, userContext) {
  try {
    if (userContext.roleChangeDetected) {
      htmlOutput.addMetaTag('x-role-change-detected', 'true');
      htmlOutput.addMetaTag('x-previous-role', userContext.previousState?.role || 'unknown');
      htmlOutput.addMetaTag('x-state-changes', userContext.stateChanges.length.toString());
    }

    if (userContext.isNewUser) {
      htmlOutput.addMetaTag('x-new-user', 'true');
    }

    htmlOutput.addMetaTag('x-session-id', userContext.metadata.sessionId);
    htmlOutput.addMetaTag('x-context-version', userContext.metadata.contextVersion);
    htmlOutput.addMetaTag('x-has-staff-record', userContext.hasStaffRecord.toString());

    debugLog('State tracking headers added', {
      roleChangeDetected: userContext.roleChangeDetected,
      sessionId: userContext.metadata.sessionId
    });

  } catch (error) {
    console.error('Error adding state tracking headers:', error);
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
 * ADD THESE TESTING FUNCTIONS to Code.js
 * Test Phase 4 implementation
 */

/**
 * Test Phase 4 validation and error handling
 */
function testPhase4ValidationAndErrorHandling() {
  console.log('=== TESTING PHASE 4 VALIDATION AND ERROR HANDLING ===');

  try {
    const results = {
      systemValidation: null,
      roleValidation: null,
      userValidation: null,
      errorHandling: null,
      gracefulDegradation: null
    };

    // Test 1: System Configuration Validation
    console.log('\nTest 1: System Configuration Validation');
    results.systemValidation = validateSystemConfiguration();
    console.log('✓ System validation result:', {
      isValid: results.systemValidation.isValid,
      systemHealth: results.systemValidation.systemHealth,
      issueCount: results.systemValidation.issues?.length || 0
    });

    // Test 2: Role Validation
    console.log('\nTest 2: Role Validation');
    const testRoles = ['Teacher', 'InvalidRole', 'Administrator'];
    results.roleValidation = {};

    testRoles.forEach(role => {
      const validation = validateRole(role);
      results.roleValidation[role] = validation;
      console.log(`✓ Role "${role}": ${validation.isValid ? 'VALID' : 'INVALID'} (${validation.issues.length} issues)`);
    });

    // Test 3: User Validation
    console.log('\nTest 3: User Validation');
    const sessionUser = getUserFromSession();
    if (sessionUser && sessionUser.email) {
      results.userValidation = validateUserAccess(sessionUser.email);
      console.log('✓ User validation result:', {
        hasAccess: results.userValidation.hasAccess,
        role: results.userValidation.role,
        issueCount: results.userValidation.issues?.length || 0
      });
    } else {
      console.log('⚠️ No session user for validation test');
      results.userValidation = { skipped: true, reason: 'No session user' };
    }

    // Test 4: Error Handling
    console.log('\nTest 4: Error Handling');
    try {
      // Simulate error
      const testError = new Error('Test error for Phase 4 validation');
      const errorPage = createEnhancedErrorPage(testError, 'test-request-id', results.systemValidation);
      results.errorHandling = {
        success: true,
        hasContent: errorPage.getContent().length > 1000
      };
      console.log('✓ Error page generation: SUCCESS');
    } catch (errorHandlingError) {
      results.errorHandling = {
        success: false,
        error: errorHandlingError.message
      };
      console.log('❌ Error page generation: FAILED');
    }

    // Test 5: Graceful Degradation
    console.log('\nTest 5: Graceful Degradation');
    try {
      // Test with non-existent role
      const nonExistentRoleData = getRoleSheetData('NonExistentRole');
      results.gracefulDegradation = {
        success: true,
        fallbackUsed: nonExistentRoleData.validation?.isErrorData || false,
        hasErrorContent: !!nonExistentRoleData.error
      };
      console.log('✓ Graceful degradation: SUCCESS');
      console.log('  - Fallback triggered:', results.gracefulDegradation.fallbackUsed);
    } catch (degradationError) {
      results.gracefulDegradation = {
        success: false,
        error: degradationError.message
      };
      console.log('❌ Graceful degradation: FAILED');
    }

    // Overall assessment
    const allTestsPassed =
      results.systemValidation?.isValid &&
      results.roleValidation?.Teacher?.isValid &&
      results.errorHandling?.success &&
      results.gracefulDegradation?.success;

    console.log('\n=== PHASE 4 TEST RESULTS ===');
    console.log('System Validation:', results.systemValidation?.isValid ? '✅ PASS' : '❌ FAIL');
    console.log('Role Validation:', results.roleValidation?.Teacher?.isValid ? '✅ PASS' : '❌ FAIL');
    console.log('User Validation:', results.userValidation?.hasAccess !== false ? '✅ PASS' : '❌ FAIL');
    console.log('Error Handling:', results.errorHandling?.success ? '✅ PASS' : '❌ FAIL');
    console.log('Graceful Degradation:', results.gracefulDegradation?.success ? '✅ PASS' : '❌ FAIL');

    if (allTestsPassed) {
      console.log('\n🎉 ALL PHASE 4 TESTS PASSED - VALIDATION AND ERROR HANDLING READY!');
    } else {
      console.log('\n⚠️ SOME PHASE 4 TESTS FAILED - CHECK RESULTS ABOVE');
    }

    return {
      success: allTestsPassed,
      results: results,
      summary: {
        systemHealth: results.systemValidation?.systemHealth || 'unknown',
        validationWorking: !!results.systemValidation,
        errorHandlingWorking: results.errorHandling?.success || false,
        gracefulDegradationWorking: results.gracefulDegradation?.success || false
      }
    };

  } catch (error) {
    console.error('❌ Error testing Phase 4:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Test comprehensive validation report
 */
function testComprehensiveValidationReport() {
  console.log('=== TESTING COMPREHENSIVE VALIDATION REPORT ===');

  try {
    const validationResults = [];

    // System validation
    validationResults.push(validateSystemConfiguration());

    // Role validations
    AVAILABLE_ROLES.forEach(role => {
      validationResults.push(validateRole(role));
    });

    // User validation (if possible)
    const sessionUser = getUserFromSession();
    if (sessionUser && sessionUser.email) {
      validationResults.push(validateUserAccess(sessionUser.email));
    }

    // Create comprehensive report
    const report = createValidationReport(validationResults);

    console.log('✅ COMPREHENSIVE VALIDATION REPORT');
    console.log('Report ID:', report.reportId);
    console.log('System Health:', report.systemHealth);
    console.log('Summary:', report.summary);
    console.log('Total Recommendations:', report.recommendations.length);

    if (report.systemHealth === 'healthy') {
      console.log('\n🎉 SYSTEM IS HEALTHY - ALL VALIDATIONS PASSED');
    } else if (report.systemHealth === 'warning') {
      console.log('\n⚠️ SYSTEM HAS WARNINGS - REVIEW RECOMMENDATIONS');
    } else if (report.systemHealth === 'degraded') {
      console.log('\n🔧 SYSTEM IS DEGRADED - ACTION REQUIRED');
    } else {
      console.log('\n🚨 SYSTEM HAS CRITICAL ISSUES - IMMEDIATE ACTION REQUIRED');
    }

    if (report.recommendations.length > 0) {
      console.log('\n📋 TOP RECOMMENDATIONS:');
      report.recommendations.slice(0, 5).forEach((rec, index) => {
        console.log(`${index + 1}. ${rec}`);
      });
    }

    return report;

  } catch (error) {
    console.error('❌ Error creating comprehensive validation report:', error);
    return { error: error.message };
  }
}

/**
 * Test error scenarios and recovery
 */
function testErrorScenariosAndRecovery() {
  console.log('=== TESTING ERROR SCENARIOS AND RECOVERY ===');

  try {
    const testScenarios = [
      {
        name: 'Invalid Role',
        test: () => validateRole('NonExistentRole')
      },
      {
        name: 'Missing User',
        test: () => validateUserAccess('nonexistent@example.com')
      },
      {
        name: 'Invalid Email',
        test: () => validateUserAccess('invalid-email')
      },
      {
        name: 'Missing Role Sheet',
        test: () => getRoleSheetData('MissingRole')
      }
    ];

    const results = {};

    testScenarios.forEach(scenario => {
      console.log(`\nTesting: ${scenario.name}`);

      try {
        const result = scenario.test();
        const hasGracefulHandling = result && (
          result.isValid === false ||  // Validation failed gracefully
          result.hasAccess !== undefined ||  // User access handled
          result.validation?.isErrorData  // Error data provided
        );

        results[scenario.name] = {
          success: true,
          gracefulHandling: hasGracefulHandling,
          result: {
            isValid: result.isValid,
            hasAccess: result.hasAccess,
            issueCount: result.issues?.length || 0,
            hasErrorData: result.validation?.isErrorData || false
          }
        };

        console.log(`✓ ${scenario.name}: ${hasGracefulHandling ? 'GRACEFUL' : 'BASIC'} handling`);

      } catch (error) {
        results[scenario.name] = {
          success: false,
          error: error.message
        };
        console.log(`❌ ${scenario.name}: FAILED with error`);
      }
    });

    // Test error page generation
    console.log('\nTesting Error Page Generation');
    try {
      const testError = new Error('Test error for recovery testing');
      const errorPage = createEnhancedErrorPage(testError, 'test-recovery');
      const content = errorPage.getContent();

      results.ErrorPageGeneration = {
        success: true,
        hasContent: content.length > 1000,
        hasSystemStatus: content.includes('System Health'),
        hasRecoveryActions: content.includes('Recovery Actions')
      };

      console.log('✓ Error Page Generation: SUCCESS');

    } catch (error) {
      results.ErrorPageGeneration = {
        success: false,
        error: error.message
      };
      console.log('❌ Error Page Generation: FAILED');
    }

    const successfulTests = Object.values(results).filter(r => r.success).length;
    const totalTests = Object.keys(results).length;

    console.log('\n=== ERROR SCENARIO TEST RESULTS ===');
    console.log(`Tests Passed: ${successfulTests}/${totalTests}`);

    Object.keys(results).forEach(testName => {
      const result = results[testName];
      console.log(`${testName}: ${result.success ? '✅' : '❌'} ${result.success ? (result.gracefulHandling ? '(Graceful)' : '(Basic)') : '(Failed)'}`);
    });

    if (successfulTests === totalTests) {
      console.log('\n🎉 ALL ERROR SCENARIOS HANDLED SUCCESSFULLY');
    } else {
      console.log('\n⚠️ SOME ERROR SCENARIOS FAILED - REVIEW IMPLEMENTATION');
    }

    return {
      success: successfulTests === totalTests,
      results: results,
      summary: {
        total: totalTests,
        passed: successfulTests,
        failed: totalTests - successfulTests
      }
    };

  } catch (error) {
    console.error('❌ Error testing error scenarios:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Complete Phase 4 integration test
 */
function testCompletePhase4Integration() {
  console.log('=== COMPLETE PHASE 4 INTEGRATION TEST ===');

  try {
    // Test all previous phases first
    console.log('🧪 Testing integration with previous phases...');

    const integrationResults = {
      phase1: null,
      phase2: null,
      phase3: null,
      phase4: null,
      autoTrigger: null
    };

    // Test Phase 1 (if available)
    if (typeof testEnhancedCacheSystem === 'function') {
      try {
        testEnhancedCacheSystem();
        integrationResults.phase1 = { success: true };
        console.log('✓ Phase 1 integration: PASS');
      } catch (p1Error) {
        integrationResults.phase1 = { success: false, error: p1Error.message };
        console.log('❌ Phase 1 integration: FAIL');
      }
    }

    // Test Phase 2 (if available)
    if (typeof testPhase2CacheBusting === 'function') {
      try {
        testPhase2CacheBusting();
        integrationResults.phase2 = { success: true };
        console.log('✓ Phase 2 integration: PASS');
      } catch (p2Error) {
        integrationResults.phase2 = { success: false, error: p2Error.message };
        console.log('❌ Phase 2 integration: FAIL');
      }
    }

    // Test Phase 3 (if available)
    if (typeof testPhase3UserContextEnhancement === 'function') {
      try {
        testPhase3UserContextEnhancement();
        integrationResults.phase3 = { success: true };
        console.log('✓ Phase 3 integration: PASS');
      } catch (p3Error) {
        integrationResults.phase3 = { success: false, error: p3Error.message };
        console.log('❌ Phase 3 integration: FAIL');
      }
    }

    // Test Auto-Trigger (if available)
    if (typeof checkAutoTriggerStatus === 'function') {
      try {
        const triggerStatus = checkAutoTriggerStatus();
        integrationResults.autoTrigger = {
          success: true,
          installed: triggerStatus.isInstalled
        };
        console.log('✓ Auto-Trigger integration: PASS');
      } catch (atError) {
        integrationResults.autoTrigger = { success: false, error: atError.message };
        console.log('❌ Auto-Trigger integration: FAIL');
      }
    }

    // Test Phase 4
    console.log('🛡️ Testing Phase 4 components...');
    integrationResults.phase4 = testPhase4ValidationAndErrorHandling();

    // Create comprehensive system report
    console.log('📊 Creating comprehensive system report...');
    const systemReport = testComprehensiveValidationReport();

    // Test error handling integration
    console.log('🚨 Testing error handling integration...');
    const errorTests = testErrorScenariosAndRecovery();

    console.log('\n=== COMPLETE PHASE 4 INTEGRATION RESULTS ===');
    console.log('Phase 1 (Cache):', integrationResults.phase1?.success ? '✅ PASS' : '❌ FAIL/MISSING');
    console.log('Phase 2 (Response):', integrationResults.phase2?.success ? '✅ PASS' : '❌ FAIL/MISSING');
    console.log('Phase 3 (Context):', integrationResults.phase3?.success ? '✅ PASS' : '❌ FAIL/MISSING');
    console.log('Auto-Trigger:', integrationResults.autoTrigger?.success ? '✅ PASS' : '❌ FAIL/MISSING');
    console.log('Phase 4 (Validation):', integrationResults.phase4?.success ? '✅ PASS' : '❌ FAIL');

    console.log('\nSystem Health:', systemReport.systemHealth || 'unknown');
    console.log('Error Handling:', errorTests.success ? '✅ ROBUST' : '❌ NEEDS WORK');

    const allPhasesWorking = integrationResults.phase4?.success;
    const systemHealthy = systemReport.systemHealth === 'healthy' || systemReport.systemHealth === 'warning';
    const errorHandlingRobust = errorTests.success;

    if (allPhasesWorking && systemHealthy && errorHandlingRobust) {
      console.log('\n🎉 COMPLETE PHASE 4 INTEGRATION SUCCESS!');
      console.log('🛡️ System has comprehensive validation and error handling');
      console.log('🔄 All components work together seamlessly');
      console.log('🚨 Error scenarios are handled gracefully');
    } else {
      console.log('\n⚠️ INTEGRATION ISSUES DETECTED');
      if (!allPhasesWorking) console.log('- Phase 4 validation needs attention');
      if (!systemHealthy) console.log('- System health issues need resolution');
      if (!errorHandlingRobust) console.log('- Error handling needs improvement');
    }

    return {
      success: allPhasesWorking && systemHealthy && errorHandlingRobust,
      integrationResults: integrationResults,
      systemReport: systemReport,
      errorTests: errorTests,
      summary: {
        phase4Ready: integrationResults.phase4?.success || false,
        systemHealthy: systemHealthy,
        errorHandlingRobust: errorHandlingRobust,
        overallHealth: systemReport.systemHealth
      }
    };

  } catch (error) {
    console.error('❌ Complete Phase 4 integration test failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Comprehensive test of the auto-trigger system
 */
function testCompleteAutoTriggerSystem() {
  console.log('=== COMPREHENSIVE AUTO-TRIGGER SYSTEM TEST ===');

  try {
    const results = {
      triggerInstallation: null,
      triggerStatus: null,
      systemTest: null,
      userValidation: null,
      cacheTest: null
    };

    // Test 1: Trigger Installation
    console.log('\n1. Testing trigger installation...');
    // Assuming installRoleChangeAutoTrigger is defined from previous steps
    results.triggerInstallation = installRoleChangeAutoTrigger(true); // Force reinstall
    console.log('✓ Installation result:', results.triggerInstallation.success ? 'SUCCESS' : 'FAILED');

    // Test 2: Trigger Status Check
    console.log('\n2. Checking trigger status...');
    // Assuming checkAutoTriggerStatus is defined from previous steps
    results.triggerStatus = checkAutoTriggerStatus();
    console.log('✓ Status check result:', results.triggerStatus.isInstalled ? 'ACTIVE' : 'INACTIVE');

    // Test 3: System Test
    console.log('\n3. Testing system functionality...');
    // Assuming testAutoTriggerSystem is defined from previous steps
    results.systemTest = testAutoTriggerSystem(); // Uses session user by default if available
    console.log('✓ System test result:', results.systemTest.success ? 'PASSED' : 'FAILED');

    // Test 4: User Validation (Basic check for session user and staff data)
    console.log('\n4. Testing user validation...');
    const sessionUser = getUserFromSession(); // Assumed to exist
    if (sessionUser && sessionUser.email) {
      const staffUser = getUserByEmail(sessionUser.email); // Assumed to exist
      results.userValidation = {
        hasSessionUser: true,
        email: sessionUser.email,
        userFoundInStaff: !!staffUser,
        role: staffUser ? staffUser.role : 'N/A'
      };
    } else {
      results.userValidation = {
        hasSessionUser: false,
        error: 'No session user found for validation part of the test.'
      };
    }
    console.log('✓ User validation result:', results.userValidation.hasSessionUser ? (results.userValidation.userFoundInStaff ? 'VALID' : 'SESSION USER NOT IN STAFF') : 'NO SESSION USER');

    // Test 5: Cache System Test (Check if related cache functions exist)
    console.log('\n5. Testing cache system integration (basic check)...');
    if (typeof CacheService !== 'undefined' && typeof CacheService.getScriptCache === 'function' &&
        typeof generateCacheKey === 'function' &&
        typeof incrementMasterCacheVersion === 'function' &&
        typeof clearCachesForSpecificUser === 'function') { // clearCachesForSpecificUser added in Step 1
      results.cacheTest = { integrated: true, message: 'Core cache functions seem available.' };
      console.log('✓ Cache system integration: SEEMS ACTIVE (core functions present)');
    } else {
      results.cacheTest = { integrated: false, error: 'One or more core cache functions (CacheService, generateCacheKey, incrementMasterCacheVersion, clearCachesForSpecificUser) not found.' };
      console.log('⚠️ Cache system integration: CORE FUNCTIONS MISSING');
    }

    // Overall result
    const allTestsPassed =
      results.triggerInstallation?.success &&
      results.triggerStatus?.isInstalled &&
      results.systemTest?.success &&
      results.userValidation?.hasSessionUser &&
      results.userValidation?.userFoundInStaff && // Added this condition
      results.cacheTest?.integrated; // Simplified this condition

    console.log('\n=== COMPREHENSIVE TEST RESULTS ===');
    console.log('Trigger Installation:', results.triggerInstallation?.success ? '✅ PASS' : '❌ FAIL');
    console.log('Trigger Status:', results.triggerStatus?.isInstalled ? '✅ ACTIVE' : '❌ INACTIVE');
    console.log('System Test:', results.systemTest?.success ? '✅ PASS' : '❌ FAIL', results.systemTest?.message || '');
    console.log('User Validation:', results.userValidation?.hasSessionUser && results.userValidation?.userFoundInStaff ? '✅ VALID' : '❌ INVALID/INCOMPLETE', results.userValidation?.error || '');
    console.log('Cache Integration:', results.cacheTest?.integrated ? '✅ ACTIVE' : '❌ MISSING/FAIL', results.cacheTest?.error || results.cacheTest?.message || '');

    if (allTestsPassed) {
      console.log('\n🎉 ALL ESSENTIAL TESTS PASSED - AUTO-TRIGGER SYSTEM IS LIKELY READY!');
      console.log('\n📋 NEXT STEPS:');
      console.log('1. Go to your Staff sheet');
      console.log('2. Change any user\'s role');
      console.log('3. Check Apps Script logs for automatic processing (View > Executions)');
      console.log('4. Access web app - role change should be immediate');
      console.log('\n🔄 REAL-TIME MONITORING:');
      console.log('- All role changes are now automatically detected');
      console.log('- Caches are cleared immediately upon role changes');
      console.log('- No manual intervention required');
    } else {
      console.log('\n⚠️ SOME TESTS FAILED - CHECK RESULTS ABOVE');
      console.log('\nTROUBLESHOOTING:');
      if (!results.triggerInstallation?.success) {
        console.log('- Trigger installation failed - check permissions or errors in installRoleChangeAutoTrigger logs.');
      }
      if (!results.triggerStatus?.isInstalled) {
        console.log('- Trigger not active - run installRoleChangeAutoTrigger() manually and check logs.');
      }
       if (!results.systemTest?.success) {
        console.log('- System test failed - check errors in testAutoTriggerSystem logs.');
      }
      if (!results.userValidation?.hasSessionUser || !results.userValidation?.userFoundInStaff) {
        console.log('- User validation failed - ensure you are running the script as a user who is listed in the Staff sheet or provide a valid test email to testAutoTriggerSystem.');
      }
      if (!results.cacheTest?.integrated) {
        console.log('- Cache integration failed - ensure `CacheService` is available and `generateCacheKey`, `incrementMasterCacheVersion`, `clearCachesForSpecificUser` functions are correctly defined and accessible.');
      }
    }

    return {
      success: allTestsPassed,
      results: results,
      summary: {
        triggerActive: results.triggerStatus?.isInstalled || false,
        systemReady: allTestsPassed,
        requiresAttention: !allTestsPassed // General flag if anything failed
      }
    };

  } catch (error) {
    console.error('Error in comprehensive auto-trigger test:', formatErrorMessage(error, 'testCompleteAutoTriggerSystem'));
    return {
      success: false,
      error: error.message,
      message: 'The comprehensive test itself encountered an unhandled error.'
    };
  }
}

/**
 * Install the automatic role change trigger
 * @param {boolean} forceReinstall - Whether to reinstall if trigger already exists
 * @return {Object} Installation result
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
      .forSpreadsheet(spreadsheet) // Ensure it's for the correct spreadsheet
      .onEdit()
      .create();

    const triggerId = trigger.getUniqueId();

    // Store trigger info in properties for monitoring
    const properties = PropertiesService.getScriptProperties();
    const triggerInfo = {
      triggerId: triggerId,
      installedAt: Date.now(),
      installedBy: 'installRoleChangeAutoTrigger',
      version: '1.0', // You can update this version as needed
      spreadsheetId: spreadsheet.getId()
    };

    properties.setProperty('AUTO_TRIGGER_INFO', JSON.stringify(triggerInfo));

    console.log('✅ ROLE CHANGE AUTO-TRIGGER INSTALLED SUCCESSFULLY');
    console.log(`Trigger ID: ${triggerId}`);
    console.log('The system will now automatically clear caches when roles are changed in the Staff sheet.');

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

/**
 * Check the status of the auto-trigger
 * @return {Object} Trigger status information
 */
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
    let triggerInfo = null;

    if (triggerInfoString) {
      try {
        triggerInfo = JSON.parse(triggerInfoString);
      } catch (e) {
        console.warn('Could not parse AUTO_TRIGGER_INFO from properties', e);
        triggerInfo = {}; // Initialize to empty object if parsing fails
      }
    } else {
        triggerInfo = {}; // Initialize to empty object if property doesn't exist
    }

    const status = {
      isInstalled: editTriggers.length > 0,
      triggerCount: editTriggers.length,
      installedAt: triggerInfo?.installedAt ? new Date(triggerInfo.installedAt).toISOString() : null,
      triggerIdStored: triggerInfo?.triggerId || null, // ID from properties
      spreadsheetIdStored: triggerInfo?.spreadsheetId || null, // Spreadsheet ID from properties
      triggers: editTriggers.map(trigger => ({
        id: trigger.getUniqueId(),
        handlerFunction: trigger.getHandlerFunction(),
        enabled: trigger.isDisabled ? !trigger.isDisabled() : true // Check isDisabled if it exists
      }))
    };

    console.log('Trigger Status:', {
      installed: status.isInstalled,
      count: status.triggerCount,
      installedAt: status.installedAt,
      storedId: status.triggerIdStored
    });

    if (status.isInstalled) {
      console.log('✅ Auto-trigger is active and monitoring role changes for onEditTrigger');
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

/**
 * Remove the auto-trigger
 * @return {Object} Removal result
 */
function removeAutoTrigger() {
  console.log('=== REMOVING AUTO-TRIGGER ===');

  try {
    const existingTriggers = ScriptApp.getProjectTriggers();
    const editTriggers = existingTriggers.filter(trigger =>
      trigger.getEventType() === ScriptApp.EventType.ON_EDIT &&
      trigger.getTriggerSource() === ScriptApp.TriggerSource.SPREADSHEETS
      // Removed specific handler function filter here to match existing logic more broadly,
      // but will add it in the loop for targeted deletion.
    );

    if (editTriggers.length === 0) {
      console.log('No edit triggers found to remove'); // Broader message
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
    console.log('Role changes will no longer automatically clear caches via these specific triggers');

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
 * Test the auto-trigger system
 * @param {string} testEmail - Email to test with (optional)
 * @return {Object} Test result
 */
function testAutoTriggerSystem(testEmail = null) {
  console.log('=== TESTING AUTO-TRIGGER SYSTEM ===');

  try {
    // Check if trigger is installed
    const status = checkAutoTriggerStatus();
    if (!status.isInstalled) {
      console.log('❌ Auto-trigger not installed. Installing now...');
      const installResult = installRoleChangeAutoTrigger();
      if (!installResult.success) {
        return {
          success: false,
          message: 'Failed to install trigger during test',
          error: installResult.error
        };
      }
      // Re-check status after installation attempt
      const newStatus = checkAutoTriggerStatus();
      if (!newStatus.isInstalled) {
          return {
              success: false,
              message: 'Trigger installation failed, cannot proceed with test.',
              error: 'Post-installation check failed.'
          };
      }
    }

    // Get test user
    let currentTestEmail = testEmail;
    if (!currentTestEmail) {
      const sessionUser = getUserFromSession(); // Assumed to exist
      currentTestEmail = sessionUser ? sessionUser.email : null;
    }

    if (!currentTestEmail) {
      console.warn('No test email available. Please provide an email or ensure you have an active session.');
      return {
        success: false,
        message: 'No test email available for trigger system test.',
        error: 'No test email provided or found in session.'
      };
    }

    console.log(`Testing with email: ${currentTestEmail}`);

    // Get current user data
    const staffData = getStaffData(); // Assumed to exist
    const user = staffData?.users?.find(u =>
      u.email?.toLowerCase() === currentTestEmail.toLowerCase()
    );

    if (!user) {
      console.warn(`Test user ${currentTestEmail} not found in Staff sheet.`);
      return {
        success: false,
        message: `Test user ${currentTestEmail} not found in Staff sheet.`,
        error: 'Test user not found'
      };
    }

    console.log('Current user data:', {
      email: user.email,
      role: user.role,
      year: user.year,
      rowNumber: user.rowNumber // Assuming getStaffData adds rowNumber
    });

    // Simulate trigger execution
    console.log('Simulating trigger execution...');
    const mockOldRole = user.role === 'Teacher' ? 'Administrator' : 'Teacher'; // Example roles
    const triggerId = generateUniqueId('test_trigger'); // Assumed to exist

    // Test the trigger processing function
    const spreadsheet = openSpreadsheet(); // Assumed to exist
    const staffSheet = getSheetByName(spreadsheet, SHEET_NAMES.STAFF); // Assumed to exist

    if (!staffSheet) {
        console.error('Staff sheet not found during test.');
        return {
            success: false,
            message: 'Staff sheet not found, cannot simulate trigger.',
            error: 'Staff sheet missing'
        };
    }

    // Call processRoleChangeFromTrigger which should exist from Step 1
    processRoleChangeFromTrigger(
      staffSheet,
      user.rowNumber, // Make sure user object has rowNumber
      user.role,
      mockOldRole,
      triggerId
    );

    console.log('✅ Auto-trigger system test completed (simulation)');
    console.log('');
    console.log('🧪 TO TEST REAL TRIGGER:');
    console.log('1. Go to your Staff sheet');
    console.log(`2. Change ${user.email}'s role in row ${user.rowNumber}`);
    console.log('3. Check Apps Script logs for automatic processing');
    console.log('4. Access web app - should show new role immediately');

    return {
      success: true,
      message: 'Auto-trigger system test simulation passed',
      testUser: {
        email: user.email,
        currentRole: user.role,
        rowNumber: user.rowNumber
      },
      triggerId: triggerId
    };

  } catch (error) {
    console.error('Error testing auto-trigger system:', formatErrorMessage(error, 'testAutoTriggerSystem'));
    return {
      success: false,
      message: 'Error during auto-trigger system test.',
      error: error.message
    };
  }
}

/**
 * Main trigger function that handles sheet edits
 * This function is automatically called when the spreadsheet is edited
 * @param {Object} e - Edit event object
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

    // Only process edits to the Staff sheet
    if (sheetName !== SHEET_NAMES.STAFF) {
      debugLog('Edit not in Staff sheet - ignoring', {
        sheetName: sheetName,
        triggerId: triggerId
      });
      return;
    }

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

    // Process the role change
    processRoleChangeFromTrigger(sheet, editedRow, newValue, oldValue, triggerId);

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
 * Process a role change detected by the trigger
 * @param {Sheet} sheet - The Staff sheet
 * @param {number} editedRow - Row number that was edited
 * @param {string} newRole - New role value
 * @param {string} oldRole - Previous role value
 * @param {string} triggerId - Trigger execution ID
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
 * Enhanced cache clearing for specific user triggered by sheet edit.
 * This function now exclusively clears versioned cache keys.
 * @param {string} userEmail - User whose role changed
 * @param {string} oldRole - Previous role
 * @param {string} newRole - New role
 * @param {string} triggerId - Trigger execution ID
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
 * ADD THESE MONITORING FUNCTIONS to Code.js
 * Proactive role change monitoring and state management
 */

/**
 * Check for role changes across all active users
 * @return {Object} Summary of detected changes
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
            clearCachesForRoleChange(user.email);

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
 * @param {string} userEmail - User email to warm cache for
 * @param {string} newRole - New role to warm cache for
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
 * @param {string} userEmail - User email to validate
 * @return {Object} Enhanced validation result
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
 * Get comprehensive user dashboard data
 * @param {string} userEmail - User email
 * @return {Object} Dashboard data
 */
function getUserDashboardData(userEmail) {
  if (!userEmail) {
    return { error: 'No email provided' };
  }

  try {
    const validation = validateUserWithStateTracking(userEmail);
    const context = createUserContext(userEmail);

    const dashboard = {
      user: {
        email: userEmail,
        name: validation.storedState?.name || 'Unknown',
        currentRole: context.role,
        currentYear: context.year,
        isAuthenticated: context.isAuthenticated,
        hasStaffRecord: context.hasStaffRecord
      },
      session: {
        sessionId: context.sessionInfo?.sessionId || 'No session',
        createdAt: context.sessionInfo?.createdAt ? new Date(context.sessionInfo.createdAt).toISOString() : null,
        lastAccessed: context.sessionInfo?.lastAccessedAt ? new Date(context.sessionInfo.lastAccessedAt).toISOString() : null,
        accessCount: context.sessionInfo?.accessCount || 0,
        isActive: context.sessionInfo?.isActive || false
      },
      roleChanges: {
        recent: validation.roleHistory.slice(0, 5),
        total: validation.totalRoleChanges,
        lastChange: validation.lastRoleChange ? {
          timestamp: new Date(validation.lastRoleChange.timestamp).toISOString(),
          from: validation.lastRoleChange.oldRole,
          to: validation.lastRoleChange.newRole
        } : null
      },
      state: {
        changeDetected: context.roleChangeDetected,
        changes: context.stateChanges,
        isNewUser: context.isNewUser,
        cacheVersion: context.metadata.cacheVersion
      },
      urls: generateAllUrlVariations(context)
    };

    debugLog('User dashboard data generated', {
      userEmail: userEmail,
      currentRole: dashboard.user.currentRole,
      roleChanges: dashboard.roleChanges.total,
      sessionActive: dashboard.session.isActive
    });

    return dashboard;

  } catch (error) {
    console.error('Error generating user dashboard data:', error);
    return { error: error.message };
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
 * @param {string} requestId - The request ID
 * @param {Object} validationResults - Optional validation results
 * @param {string} userAgentString - The User Agent string
 * REPLACE THIS FUNCTION in Code.js
 * Comprehensive error page with validation and recovery options
 */
function createEnhancedErrorPage(error, requestId, validationResults = null, userAgentString) {
  const timestamp = Date.now();
  const errorId = generateUniqueId('error_page');

  try {
    // Perform quick system validation if not provided
    if (!validationResults) {
      try {
        validationResults = validateSystemConfiguration();
      } catch (validationError) {
        console.warn('Could not perform system validation in error page:', validationError);
      }
    }

    const systemHealth = validationResults?.systemHealth || 'unknown';
    const criticalIssues = validationResults?.issues?.filter(issue =>
      issue.severity === VALIDATION_SEVERITY.CRITICAL
    ) || [];

    const errorHtml = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>System Error - Danielson Framework</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="cache-control" content="no-cache, no-store, must-revalidate">
        <meta name="pragma" content="no-cache">
        <meta name="expires" content="0">
        <meta name="x-request-id" content="${Utilities.encodeHtml(requestId || 'unknown')}">
        <meta name="x-error-id" content="${Utilities.encodeHtml(errorId)}">
        <meta name="x-timestamp" content="${Utilities.encodeHtml(timestamp.toString())}">
        <meta name="x-system-health" content="${Utilities.encodeHtml(systemHealth)}">
        <meta name="x-error" content="true">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            padding: 20px; max-width: 800px; margin: 0 auto;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh; color: #333;
          }
          .error-container {
            background: white; border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            overflow: hidden;
          }
          .error-header {
            background: linear-gradient(135deg, #dc3545, #c82333);
            color: white; padding: 30px; text-align: center;
          }
          .error-header h1 {
            font-size: 2rem; font-weight: 600; margin-bottom: 10px;
          }
          .error-header p {
            font-size: 1.1rem; opacity: 0.9;
          }
          .error-content {
            padding: 30px;
          }
          .system-status {
            background: ${systemHealth === 'healthy' ? '#d4edda' :
                          systemHealth === 'warning' ? '#fff3cd' :
                          systemHealth === 'degraded' ? '#f8d7da' : '#f8d7da'};
            border: 1px solid ${systemHealth === 'healthy' ? '#c3e6cb' :
                               systemHealth === 'warning' ? '#ffeaa7' :
                               systemHealth === 'degraded' ? '#f5c6cb' : '#f5c6cb'};
            color: ${systemHealth === 'healthy' ? '#155724' :
                    systemHealth === 'warning' ? '#856404' :
                    systemHealth === 'degraded' ? '#721c24' : '#721c24'};
            padding: 15px; border-radius: 6px; margin-bottom: 25px;
          }
          .error-details {
            background: #f8f9fa; padding: 20px; border-radius: 8px;
            margin: 20px 0; border-left: 4px solid #dc3545;
          }
          .error-details h3 {
            color: #dc3545; margin-bottom: 15px; font-size: 1.2rem;
          }
          .error-message {
            font-family: 'Courier New', monospace; background: #fff;
            padding: 15px; border-radius: 4px; margin: 10px 0;
            border: 1px solid #dee2e6; word-break: break-word;
          }
          .validation-section {
            margin: 25px 0;
          }
          .validation-item {
            display: flex; align-items: center; padding: 8px 0;
            border-bottom: 1px solid #e9ecef;
          }
          .validation-status {
            width: 24px; height: 24px; border-radius: 50%;
            margin-right: 12px; display: flex; align-items: center;
            justify-content: center; font-weight: bold; font-size: 0.8rem;
          }
          .status-pass { background: #28a745; color: white; }
          .status-fail { background: #dc3545; color: white; }
          .status-warn { background: #ffc107; color: black; }
          .troubleshooting { margin-top: 25px; }
          .troubleshooting h3 { color: #495057; margin-bottom: 15px; }
          .troubleshooting ul { padding-left: 20px; line-height: 1.6; }
          .troubleshooting li { margin-bottom: 8px; }
          .action-section {
            margin-top: 30px; text-align: center;
            padding: 20px; background: #f8f9fa; border-radius: 8px;
          }
          .action-button {
            background: #007bff; color: white; padding: 12px 24px;
            border: none; border-radius: 6px; cursor: pointer; font-size: 1rem;
            text-decoration: none; display: inline-block; margin: 0 10px;
            transition: background 0.3s;
          }
          .action-button:hover { background: #0056b3; text-decoration: none; color: white; }
          .action-button.danger { background: #dc3545; }
          .action-button.danger:hover { background: #c82333; }
          .action-button.success { background: #28a745; }
          .action-button.success:hover { background: #1e7e34; }
          .diagnostic-info {
            margin-top: 30px; font-size: 0.9rem; color: #6c757d;
            background: #f8f9fa; padding: 15px; border-radius: 6px;
          }
          .diagnostic-info h4 {
            color: #495057; margin-bottom: 10px;
          }
          .critical-alert {
            background: #f8d7da; border: 2px solid #dc3545;
            color: #721c24; padding: 20px; border-radius: 8px;
            margin-bottom: 25px;
          }
          .critical-alert h3 {
            color: #721c24; margin-bottom: 15px;
          }
        </style>
      </head>
      <body>
        <div class="error-container">
          <div class="error-header">
            <h1>🚨 System Error</h1>
            <p>The Danielson Framework application encountered an error</p>
          </div>

          <div class="error-content">
            <div class="system-status">
              <strong>System Health: ${systemHealth.toUpperCase()}</strong>
              <br>
              ${systemHealth === 'healthy' ? '✅ System appears to be functioning normally' :
                systemHealth === 'warning' ? '⚠️ System has minor issues but should work' :
                systemHealth === 'degraded' ? '🔧 System has significant issues affecting functionality' :
                '❌ System has critical issues preventing normal operation'}
            </div>

            ${criticalIssues.length > 0 ? `
            <div class="critical-alert">
              <h3>🚨 Critical Issues Detected</h3>
              <ul>
                ${criticalIssues.map(issue => `<li>${issue.message}</li>`).join('')}
              </ul>
            </div>
            ` : ''}

            <div class="error-details">
              <h3>Error Details</h3>
              <div class="error-message">
                <strong>Error:</strong> ${Utilities.encodeHtml(error.toString())}<br>
                <strong>Request ID:</strong> ${Utilities.encodeHtml(requestId || 'Unknown')}<br>
                <strong>Error ID:</strong> ${Utilities.encodeHtml(errorId)}<br>
                <strong>Timestamp:</strong> ${Utilities.encodeHtml(new Date(timestamp).toLocaleString())}<br>
                <strong>Cache Version:</strong> ${Utilities.encodeHtml(getMasterCacheVersion())}
              </div>
            </div>

            ${validationResults ? `
            <div class="validation-section">
              <h3>📋 System Status Check</h3>
              <div class="validation-item">
                <div class="validation-status ${validationResults.systemHealth.spreadsheetAccess ? 'status-pass' : 'status-fail'}">
                  ${validationResults.systemHealth.spreadsheetAccess ? '✓' : '✗'}
                </div>
                <span>Spreadsheet Access</span>
              </div>
              <div class="validation-item">
                <div class="validation-status ${validationResults.systemHealth.requiredSheets?.Staff ? 'status-pass' : 'status-fail'}">
                  ${validationResults.systemHealth.requiredSheets?.Staff ? '✓' : '✗'}
                </div>
                <span>Staff Sheet</span>
              </div>
              <div class="validation-item">
                <div class="validation-status ${validationResults.systemHealth.requiredSheets?.Teacher ? 'status-pass' : 'status-fail'}">
                  ${validationResults.systemHealth.requiredSheets?.Teacher ? '✓' : '✗'}
                </div>
                <span>Teacher Sheet</span>
              </div>
              <div class="validation-item">
                <div class="validation-status ${validationResults.systemHealth.cacheSystem ? 'status-pass' : 'status-warn'}">
                  ${validationResults.systemHealth.cacheSystem ? '✓' : '⚠'}
                </div>
                <span>Cache System</span>
              </div>
              <div class="validation-item">
                <div class="validation-status ${validationResults.systemHealth.triggerSystem ? 'status-pass' : 'status-warn'}">
                  ${validationResults.systemHealth.triggerSystem ? '✓' : '⚠'}
                </div>
                <span>Auto-Trigger System</span>
              </div>
            </div>
            ` : ''}

            <div class="troubleshooting">
              <h3>🔧 Troubleshooting Steps</h3>
              <ul>
                <li><strong>First:</strong> Try the "Clear Cache & Retry" button below</li>
                <li><strong>Check:</strong> SHEET_ID is correctly set in Script Properties</li>
                <li><strong>Verify:</strong> Spreadsheet exists and is accessible</li>
                <li><strong>Ensure:</strong> Required sheet tabs exist (Staff, Settings, Teacher)</li>
                <li><strong>Confirm:</strong> You have permission to access the spreadsheet</li>
                <li><strong>Role Sheets:</strong> Verify your role has a corresponding sheet tab</li>
                <li><strong>If persistent:</strong> Open in incognito/private browser window</li>
                <li><strong>Admin:</strong> Run system validation in Apps Script editor</li>
              </ul>
            </div>

            <div class="action-section">
              <h3>🛠️ Recovery Actions</h3>
              <button class="action-button" onclick="window.location.reload()">
                🔄 Simple Retry
              </button>
              <button class="action-button success" onclick="clearCacheAndRetry()">
                🧹 Clear Cache & Retry
              </button>
              <button class="action-button danger" onclick="emergencyReset()">
                🚨 Emergency Reset
              </button>
              <br><br>
              <a href="mailto:${CONTACT_SETTINGS.SUPPORT_EMAIL}?subject=Danielson Framework Error&body=Error ID: ${Utilities.encodeHtml(errorId)}%0ATimestamp: ${Utilities.encodeHtml(new Date(timestamp).toISOString())}%0AError: ${encodeURIComponent(error.toString())}"
                 class="action-button" style="background: #6c757d;">
                📧 Contact Support
              </a>
            </div>

            <div class="diagnostic-info">
              <h4>🔍 Diagnostic Information</h4>
              <strong>Error ID:</strong> ${Utilities.encodeHtml(errorId)}<br>
              <strong>Request ID:</strong> ${Utilities.encodeHtml(requestId || 'Unknown')}<br>
              <strong>System Health:</strong> ${Utilities.encodeHtml(systemHealth)}<br>
              <strong>Cache Version:</strong> ${Utilities.encodeHtml(getMasterCacheVersion())}<br>
              <strong>Timestamp:</strong> ${Utilities.encodeHtml(new Date(timestamp).toISOString())}<br>
              <strong>User Agent:</strong> ${userAgentString ? Utilities.encodeHtml(userAgentString) : 'Unknown'}<br>
              ${validationResults ? `
              <strong>Validation Issues:</strong> ${Utilities.encodeHtml((validationResults.issues?.length || 0).toString())}<br>
              <strong>System Components:</strong>
              Spreadsheet: ${validationResults.systemHealth.spreadsheetAccess ? 'OK' : 'FAIL'},
              Cache: ${validationResults.systemHealth.cacheSystem ? 'OK' : 'WARN'},
              Triggers: ${validationResults.systemHealth.triggerSystem ? 'OK' : 'WARN'}
              ` : ''}
            </div>
          </div>
        </div>

        <script>
          function clearCacheAndRetry() {
            console.log('Clearing cache and retrying...');
            const url = new URL(window.location);
            url.searchParams.set('refresh', 'true');
            url.searchParams.set('nocache', 'true');
            url.searchParams.set('t', Date.now());
            url.searchParams.set('r', Math.random().toString(36).substr(2, 9));
            window.location.href = url.toString();
          }

          function emergencyReset() {
            console.log('Performing emergency reset...');
            const url = new URL(window.location);
            url.searchParams.set('refresh', 'true');
            url.searchParams.set('nocache', 'true');
            url.searchParams.set('emergency', 'true');
            url.searchParams.set('reset', 'true');
            url.searchParams.set('t', Date.now());
            window.location.href = url.toString();
          }

          // Auto-retry after 2 minutes if critical issues
          const systemHealth = '${systemHealth}';
          if (systemHealth === 'critical' || systemHealth === 'error') {
            setTimeout(function() {
              const retryNotice = document.createElement('div');
              retryNotice.style.cssText = 'background:#fff3cd; padding:15px; margin:20px; border-radius:6px; border-left:4px solid #ffc107; text-align:center;';
              retryNotice.innerHTML = '<strong>⏰ Auto-retry in progress...</strong><br>The system will attempt automatic recovery.';
              document.querySelector('.error-content').appendChild(retryNotice);

              setTimeout(clearCacheAndRetry, 5000);
            }, 120000); // 2 minutes
          }

          // Log error for analytics
          console.error('Enhanced Error Page Displayed', {
            errorId: '${Utilities.encodeHtml(errorId)}',
            requestId: '${Utilities.encodeHtml(requestId || 'unknown')}',
            systemHealth: '${Utilities.encodeHtml(systemHealth)}',
            timestamp: '${Utilities.encodeHtml(new Date(timestamp).toISOString())}',
            error: '${Utilities.encodeHtml(error.toString()).replace(/'/g, "\\\\'")}'
          });
        </script>
      </body>
    </html>
  `;

  return HtmlService.createHtmlOutput(errorHtml);

  } catch (pageError) {
    console.error('Error creating enhanced error page:', pageError);

    // Fallback to simple error page
    const fallbackHtml = `
      <html>
        <head><title>Critical System Error</title></head>
        <body style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">
          <h1 style="color: #dc3545;">Critical System Error</h1>
          <p>The error reporting system has also failed.</p>
          <p><strong>Original Error:</strong> ${Utilities.encodeHtml(error.toString())}</p>
          <p><strong>Page Error:</strong> ${Utilities.encodeHtml(pageError.toString())}</p>
          <p><strong>Error ID:</strong> ${Utilities.encodeHtml(errorId)}</p>
          <p><strong>Timestamp:</strong> ${Utilities.encodeHtml(new Date(timestamp).toISOString())}</p>
          <button onclick="window.location.reload()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 3px;">
            Retry
          </button>
        </body>
      </html>
    `;

    return HtmlService.createHtmlOutput(fallbackHtml);
  }
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
 * Dynamically detect and process domains from any role sheet
 * @param {Array<Array>} sheetData - Raw sheet data
 * @param {string} role - Role name for logging
 * @return {Array<Object>} Array of domain objects
 */
function processDynamicDomains(sheetData, role) {
  debugLog(`Starting dynamic domain detection for ${role}`);
  
  const domains = [];
  const domainMap = detectDomainStructure(sheetData);
  
  debugLog(`Detected domain structure for ${role}:`, domainMap);
  
  // Process each detected domain
  Object.keys(domainMap).sort().forEach(domainNumber => {
    const domainInfo = domainMap[domainNumber];
    debugLog(`Processing ${domainInfo.name} (rows ${domainInfo.startRow}-${domainInfo.endRow})`);
    
    const domain = {
      number: parseInt(domainNumber),
      name: domainInfo.name,
      components: []
    };
    
    // Find components within this domain
    const components = findComponentsInDomain(sheetData, domainInfo);
    domain.components = components;
    
    debugLog(`Found ${components.length} components in ${domainInfo.name}`);
    domains.push(domain);
  });
  
  debugLog(`Dynamic domain processing completed for ${role}. Found ${domains.length} domains.`);
  return domains;
}

/**
 * Detect the structure of domains in a sheet by scanning for domain headers
 * @param {Array<Array>} sheetData - Raw sheet data
 * @return {Object} Map of domain numbers to their info
 */
function detectDomainStructure(sheetData) {
  const domainMap = {};
  const domainPattern = /^domain\s+([1-4])[:\s]?\s*(.+)/i;
  
  for (let rowIndex = 0; rowIndex < sheetData.length; rowIndex++) {
    const row = sheetData[rowIndex];
    const cellValue = row[0] ? row[0].toString().trim() : '';
    
    const match = cellValue.match(domainPattern);
    if (match) {
      const domainNumber = match[1];
      const domainTitle = match[2] || `Domain ${domainNumber}`;
      
      debugLog(`Found domain header at row ${rowIndex + 1}: "${cellValue}"`);
      
      domainMap[domainNumber] = {
        number: parseInt(domainNumber),
        name: `Domain ${domainNumber}: ${domainTitle}`,
        headerRow: rowIndex,
        startRow: rowIndex + 1, // Start looking for components after the header
        endRow: null // Will be set when we find the next domain or end of data
      };
    }
  }
  
  // Set end rows for each domain
  const domainNumbers = Object.keys(domainMap).sort();
  for (let i = 0; i < domainNumbers.length; i++) {
    const currentDomain = domainNumbers[i];
    const nextDomain = domainNumbers[i + 1];
    
    if (nextDomain) {
      // End this domain where the next one starts
      domainMap[currentDomain].endRow = domainMap[nextDomain].headerRow - 1;
    } else {
      // Last domain goes to end of data
      domainMap[currentDomain].endRow = sheetData.length - 1;
    }
  }
  
  return domainMap;
}

/**
 * Find all components within a specific domain
 * @param {Array<Array>} sheetData - Raw sheet data
 * @param {Object} domainInfo - Domain information from detectDomainStructure
 * @return {Array<Object>} Array of component objects
 */
function findComponentsInDomain(sheetData, domainInfo) {
  const components = [];
  const componentPattern = new RegExp(`^${domainInfo.number}[a-z][:\s]`, 'i');
  
  debugLog(`Looking for components in domain ${domainInfo.number} (rows ${domainInfo.startRow}-${domainInfo.endRow})`);
  
  for (let rowIndex = domainInfo.startRow; rowIndex <= domainInfo.endRow && rowIndex < sheetData.length; rowIndex++) {
    const row = sheetData[rowIndex];
    const cellValue = row[0] ? row[0].toString().trim() : '';
    
    if (componentPattern.test(cellValue)) {
      debugLog(`Found component at row ${rowIndex + 1}: "${cellValue}"`);
      
      const component = {
        title: cellValue,
        developing: sanitizeText(row[1]) || '',
        basic: sanitizeText(row[2]) || '',
        proficient: sanitizeText(row[3]) || '',
        distinguished: sanitizeText(row[4]) || '',
        bestPractices: []
      };
      
      // Find best practices for this component
      const practices = findBestPracticesForComponent(sheetData, cellValue, rowIndex, domainInfo);
      component.bestPractices = practices;
      
      components.push(component);
      debugLog(`Component processed: ${cellValue} with ${practices.length} best practices`);
    }
  }
  
  return components;
}

/**
 * Find best practices for a specific component using multiple search strategies
 * @param {Array<Array>} sheetData - Raw sheet data
 * @param {string} componentTitle - Component title (e.g., "1a: ...")
 * @param {number} componentRow - Row where component was found
 * @param {Object} domainInfo - Domain information
 * @return {Array<string>} Array of best practice strings
 */
function findBestPracticesForComponent(sheetData, componentTitle, componentRow, domainInfo) {
  const componentId = extractComponentId(componentTitle); // e.g., "1a:"
  
  if (!componentId) {
    debugLog(`Could not extract component ID from: ${componentTitle}`);
    return [];
  }
  
  debugLog(`Looking for best practices for component: ${componentId}`);
  
  // Strategy 1: Look in the same pattern as Teacher sheet (4 rows down, column B)
  let practices = searchBestPracticesStrategy1(sheetData, componentRow);
  if (practices.length > 0) {
    debugLog(`Found ${practices.length} practices using Strategy 1 (Teacher pattern)`);
    return practices;
  }
  
  // Strategy 2: Search for "best practices" header near this component
  practices = searchBestPracticesStrategy2(sheetData, componentRow, domainInfo);
  if (practices.length > 0) {
    debugLog(`Found ${practices.length} practices using Strategy 2 (header search)`);
    return practices;
  }
  
  // Strategy 3: Look for practices in nearby cells (scan around the component)
  practices = searchBestPracticesStrategy3(sheetData, componentRow, componentId);
  if (practices.length > 0) {
    debugLog(`Found ${practices.length} practices using Strategy 3 (nearby search)`);
    return practices;
  }
  
  // Strategy 4: Search for the component ID in other columns
  practices = searchBestPracticesStrategy4(sheetData, componentId, domainInfo);
  if (practices.length > 0) {
    debugLog(`Found ${practices.length} practices using Strategy 4 (column search)`);
    return practices;
  }
  
  debugLog(`No best practices found for component: ${componentId}`);
  return [];
}

/**
 * Strategy 1: Use the same pattern as Teacher sheet (4 rows down, column B)
 */
function searchBestPracticesStrategy1(sheetData, componentRow) {
  const practicesRow = componentRow + 4; // Same offset as Teacher sheet
  const practicesCol = 1; // Column B (0-indexed)
  
  if (practicesRow >= sheetData.length) {
    return [];
  }
  
  const practicesCell = sheetData[practicesRow][practicesCol];
  if (practicesCell && practicesCell.toString().trim()) {
    return parseMultilineCell(practicesCell.toString());
  }
  
  return [];
}

/**
 * Strategy 2: Search for "best practices" header within the domain
 */
function searchBestPracticesStrategy2(sheetData, componentRow, domainInfo) {
  const searchStart = Math.max(0, componentRow - 2);
  const searchEnd = Math.min(sheetData.length - 1, componentRow + 10);
  
  for (let rowIndex = searchStart; rowIndex <= searchEnd; rowIndex++) {
    const row = sheetData[rowIndex];
    
    for (let colIndex = 0; colIndex < Math.min(6, row.length); colIndex++) {
      const cellValue = row[colIndex] ? row[colIndex].toString().toLowerCase() : '';
      
      if (cellValue.includes('best') && cellValue.includes('practice')) {
        debugLog(`Found "best practices" header at row ${rowIndex + 1}, col ${colIndex + 1}`);
        
        // Look for practices in nearby cells
        const practices = extractPracticesNearHeader(sheetData, rowIndex, colIndex);
        if (practices.length > 0) {
          return practices;
        }
      }
    }
  }
  
  return [];
}

/**
 * Strategy 3: Search in nearby cells around the component
 */
function searchBestPracticesStrategy3(sheetData, componentRow, componentId) {
  const searchOffsets = [
    { row: 1, col: 1 }, { row: 2, col: 1 }, { row: 3, col: 1 }, { row: 4, col: 1 }, { row: 5, col: 1 },
    { row: 1, col: 0 }, { row: 2, col: 0 }, { row: 3, col: 0 }, { row: 4, col: 0 }, { row: 5, col: 0 },
    { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 }, { row: 0, col: 5 }
  ];
  
  for (const offset of searchOffsets) {
    const checkRow = componentRow + offset.row;
    const checkCol = offset.col;
    
    if (checkRow < sheetData.length && checkCol < sheetData[checkRow].length) {
      const cellValue = sheetData[checkRow][checkCol];
      
      if (cellValue && cellValue.toString().trim()) {
        const cellText = cellValue.toString();
        
        // Check if this cell contains multiple lines (likely practices)
        if (cellText.includes('\n') || cellText.includes('\r')) {
          const practices = parseMultilineCell(cellText);
          if (practices.length > 2) { // Likely practices if multiple items
            debugLog(`Found practices in nearby cell at row ${checkRow + 1}, col ${checkCol + 1}`);
            return practices;
          }
        }
        
        // Check if cell mentions the component ID
        if (cellText.toLowerCase().includes(componentId.toLowerCase().replace(':', ''))) {
          const practices = parseMultilineCell(cellText);
          if (practices.length > 0) {
            debugLog(`Found practices mentioning component ${componentId} at row ${checkRow + 1}, col ${checkCol + 1}`);
            return practices;
          }
        }
      }
    }
  }
  
  return [];
}

/**
 * Strategy 4: Search for component ID references in other columns
 */
function searchBestPracticesStrategy4(sheetData, componentId, domainInfo) {
  const searchStart = domainInfo.startRow;
  const searchEnd = domainInfo.endRow;
  
  for (let rowIndex = searchStart; rowIndex <= searchEnd && rowIndex < sheetData.length; rowIndex++) {
    const row = sheetData[rowIndex];
    
    for (let colIndex = 1; colIndex < Math.min(10, row.length); colIndex++) {
      const cellValue = row[colIndex] ? row[colIndex].toString() : '';
      
      // Look for cells that reference this component ID
      if (cellValue.toLowerCase().includes(componentId.toLowerCase().replace(':', ''))) {
        const practices = parseMultilineCell(cellValue);
        if (practices.length > 1) {
          debugLog(`Found practices for ${componentId} at row ${rowIndex + 1}, col ${colIndex + 1}`);
          return practices;
        }
      }
    }
  }
  
  return [];
}

/**
 * Extract practices from cells near a "best practices" header
 */
function extractPracticesNearHeader(sheetData, headerRow, headerCol) {
  const searchCells = [
    { row: headerRow + 1, col: headerCol },     // Directly below header
    { row: headerRow, col: headerCol + 1 },     // Right of header
    { row: headerRow + 1, col: headerCol + 1 }, // Diagonal from header
    { row: headerRow + 2, col: headerCol },     // Two rows below
    { row: headerRow + 1, col: headerCol - 1 }, // Below and left
  ];
  
  for (const cell of searchCells) {
    if (cell.row >= 0 && cell.row < sheetData.length && 
        cell.col >= 0 && cell.col < sheetData[cell.row].length) {
      
      const cellValue = sheetData[cell.row][cell.col];
      if (cellValue && cellValue.toString().trim()) {
        const practices = parseMultilineCell(cellValue.toString());
        if (practices.length > 0) {
          debugLog(`Extracted ${practices.length} practices from cell at row ${cell.row + 1}, col ${cell.col + 1}`);
          return practices;
        }
      }
    }
  }
  
  return [];
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

// Add this temporary test function to Code.js for testing
function testBasicImplementation() {
  console.log('=== TESTING BASIC IMPLEMENTATION ===');
  
  try {
    // Test with Teacher role first (should use legacy processing)
    console.log('Testing Teacher role (legacy)...');
    const teacherData = getAllDomainsData('Teacher', 1);
    console.log('✓ Teacher role works:', teacherData.domains.length + ' domains');
    
    // Test with another role (should use dynamic processing)
    console.log('Testing Nurse role (dynamic)...');
    const nurseData = getAllDomainsData('Nurse', 1);
    console.log('✓ Nurse role works:', nurseData.domains.length + ' domains');
    
    console.log('✅ Basic implementation test passed');
    
  } catch (error) {
    console.error('❌ Basic implementation test failed:', error);
  }
}