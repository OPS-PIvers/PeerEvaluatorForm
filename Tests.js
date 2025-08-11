/**
 * =================================================================
 * ROBUST TEST SUITE FOR PEER EVALUATOR FORM
 * =================================================================
 * 
 * This file uses the GasT testing framework for Google Apps Script.
 * 
 * !! SETUP INSTRUCTIONS !!
 * 1. In the Apps Script Editor, go to "Libraries" > "+".
 * 2. Enter the following Script ID for GasT:
 *    1S_G7U9d2W_uN5_4Qjp2Wk2pOFs-l_5-6j26_g_I12ZN99G3S_T0i1L_b
 * 3. Click "Look up".
 * 4. Select the latest version and ensure the Identifier is "GasT".
 * 5. Click "Add".
 * 
 * HOW TO RUN TESTS:
 * - Select the "runAllTests" function from the function dropdown in the Apps Script Editor.
 * - Click "Run".
 * - To see the results, go to "View" > "Logs". A summary report will be printed.
 * 
 * =================================================================
 */

// GasT requires this global variable to be defined.
var test = GasT.newTest();

/**
 * Main function to run all test suites.
 * This is the function you execute from the Apps Script Editor.
 */
function runAllTests() {
  test.run();
}

// =================================================================
// MOCK DATA & MOCKING FUNCTIONS
// =================================================================

// Mock data that simulates the structure of our Google Sheets
const MOCK_DATA = {
  STAFF: [
    ['Name', 'Email', 'Role', 'Year'],
    ['Test Teacher', 'teacher@example.com', 'Teacher', '1'],
    ['Test Evaluator', 'evaluator@example.com', 'Peer Evaluator', '2'],
    ['Admin User', 'admin@example.com', 'Administrator', '3'],
    ['Probationary Teacher', 'probationary@example.com', 'Teacher', 'Probationary']
  ],
  SETTINGS: [
    ['Role', 'Year 1', 'Year 2', 'Year 3'],
    ['Teacher', '1a:,1b:', '2a:,2b:', '3a:,3b:'],
    ['', '', '', ''], // Domain 2 for Teacher
    ['', '', '', ''], // Domain 3 for Teacher
    ['', '', '', '']  // Domain 4 for Teacher
  ],
  TEACHER_RUBRIC: [
    ['Danielson Framework for Teaching'],
    ['Subtitle for the rubric'],
    ['1a: Demonstrating Knowledge of Content and Pedagogy', 'Dev 1a', 'Basic 1a', 'Prof 1a', 'Dist 1a'],
    ['1b: Demonstrating Knowledge of Students', 'Dev 1b', 'Basic 1b', 'Prof 1b', 'Dist 1b'],
    ['2a: Creating an Environment of Respect and Rapport', 'Dev 2a', 'Basic 2a', 'Prof 2a', 'Dist 2a']
  ],
  OBSERVATIONS: [
    ['observationId', 'observerEmail', 'observedEmail', 'status', 'observationData', 'evidenceLinks', 'checkedLookFors', 'observationNotes']
    // Data will be added by tests
  ]
};

/**
 * A mock SpreadsheetApp service that allows us to test without touching the live spreadsheet.
 */
const MockSpreadsheetApp = {
  openById: function(id) {
    return {
      getSheetByName: function(name) {
        let data;
        if (name === SHEET_NAMES.STAFF) data = MOCK_DATA.STAFF;
        else if (name === SHEET_NAMES.SETTINGS) data = MOCK_DATA.SETTINGS;
        else if (name === 'Teacher') data = MOCK_DATA.TEACHER_RUBRIC;
        else if (name === OBSERVATION_SHEET_NAME) data = MOCK_DATA.OBSERVATIONS;
        else return null;

        return {
          getDataRange: function() {
            return {
              getValues: function() { return data; },
              setValues: function(newValues) { data = newValues; }
            };
          },
          getLastRow: function() { return data.length; },
          getLastColumn: function() { return data.length > 0 ? data[0].length : 0; },
          getRange: function(row, col, numRows, numCols) {
            return {
              getValues: function() { 
                return data.slice(row - 1, row - 1 + numRows).map(r => r.slice(col - 1, col - 1 + numCols));
              },
              getValue: function() { return data[row - 1][col - 1]; },
              setValue: function(value) { data[row - 1][col - 1] = value; }
            };
          },
          appendRow: function(rowData) { data.push(rowData); },
          deleteRow: function(rowIndex) { data.splice(rowIndex - 1, 1); }
        };
      }
    };
  }
};

// =================================================================
// TEST SUITES
// =================================================================

/**
 * Test Suite for SheetService.js
 * It's crucial to mock SpreadsheetApp to avoid side effects.
 */
(function(global) {
  const originalSpreadsheetApp = global.SpreadsheetApp;
  global.SpreadsheetApp = MockSpreadsheetApp;

  test.add("SheetService", function() {
    this.add("getStaffData should return parsed user data", function() {
      const staffData = getStaffData();
      assert.isNotNull(staffData, 'Staff data should not be null.');
      assert.equal(staffData.users.length, 4, 'Should parse 4 valid users.');
      const teacher = staffData.users.find(u => u.email === 'teacher@example.com');
      assert.equal(teacher.role, 'Teacher', 'Teacher role should be correct.');
      assert.equal(teacher.year, 1, 'Teacher year should be correct.');
    });

    this.add("getSettingsData should return role-year mappings", function() {
      const settings = getSettingsData();
      assert.isNotNull(settings, 'Settings data should not be null.');
      assert.isTrue(settings.roleYearMappings.hasOwnProperty('Teacher'), 'Should have settings for Teacher role.');
      assert.equal(settings.roleYearMappings.Teacher.year1[0], '1a:,1b:', 'Year 1 data should be correct.');
    });

    this.add("getRoleSheetData should return rubric data", function() {
      const rubricData = getRoleSheetData('Teacher');
      assert.isNotNull(rubricData, 'Rubric data should not be null.');
      assert.equal(rubricData.roleName, 'Teacher', 'Role name should be correct.');
      assert.isTrue(rubricData.title.includes('Danielson Framework'), 'Title should be correct.');
      assert.equal(rubricData.data.length, 5, 'Should have 5 rows of data.');
    });
  });

  // Restore original SpreadsheetApp after tests
  // global.SpreadsheetApp = originalSpreadsheetApp;
})(this);


/**
 * Test Suite for UserService.js
 */
(function() {
  test.add("UserService", function() {
    this.add("getUserByEmail should find a user", function() {
      const user = getUserByEmail('admin@example.com');
      assert.isNotNull(user, 'User should be found.');
      assert.equal(user.name, 'Admin User', 'User name should be correct.');
      assert.equal(user.role, 'Administrator', 'User role should be correct.');
    });

    this.add("getUserByEmail should return null for non-existent user", function() {
      const user = getUserByEmail('nouser@example.com');
      assert.isNull(user, 'User should be null for non-existent email.');
    });

    this.add("createUserContext should build a valid context object", function() {
      const context = createUserContext('evaluator@example.com');
      assert.isNotNull(context, 'Context should not be null.');
      assert.equal(context.email, 'evaluator@example.com', 'Email should be correct.');
      assert.equal(context.role, 'Peer Evaluator', 'Role should be correct.');
      assert.isTrue(context.hasSpecialAccess, 'Peer Evaluator should have special access.');
    });
  });
})();


/**
 * Test Suite for ObservationService.js
 */
(function() {
  test.add("ObservationService", function() {
    let testObservationId = null;

    this.add("createNewObservation should create a new draft", function() {
      const observer = 'evaluator@example.com';
      const observed = 'teacher@example.com';
      const newObs = createNewObservation(observer, observed);
      
      assert.isNotNull(newObs, 'New observation should not be null.');
      assert.equal(newObs.observerEmail, observer, 'Observer email should match.');
      assert.equal(newObs.observedEmail, observed, 'Observed email should match.');
      assert.equal(newObs.status, OBSERVATION_STATUS.DRAFT, 'Status should be Draft.');
      testObservationId = newObs.observationId; // Save for next tests
    });

    this.add("getObservationById should retrieve the created observation", function() {
      assert.isNotNull(testObservationId, 'Prerequisite testObservationId is missing.');
      const obs = getObservationById(testObservationId);
      assert.isNotNull(obs, 'Observation should be found by ID.');
      assert.equal(obs.observationId, testObservationId, 'Observation ID should match.');
    });

    this.add("saveProficiencySelection should update observation data", function() {
      const result = saveProficiencySelection(testObservationId, '1a:', 'proficient');
      assert.isTrue(result.success, 'Saving proficiency should be successful.');
      
      const obs = getObservationById(testObservationId);
      assert.equal(obs.observationData['1a:'], 'proficient', 'Proficiency level should be saved.');
    });

    this.add("updateObservationStatus should change the status to Finalized", function() {
      const result = updateObservationStatus(testObservationId, OBSERVATION_STATUS.FINALIZED, 'evaluator@example.com');
      assert.isTrue(result.success, 'Updating status should be successful.');
      
      const obs = getObservationById(testObservationId);
      assert.equal(obs.status, OBSERVATION_STATUS.FINALIZED, 'Status should be Finalized.');
    });

    this.add("deleteObservationRecord should fail for a finalized observation", function() {
      const result = deleteObservationRecord(testObservationId, 'evaluator@example.com');
      assert.isFalse(result.success, 'Should not be able to delete a finalized observation.');
      assert.isTrue(result.error.includes('Only draft observations'), 'Error message should be correct.');
    });

    this.add("deleteFinalizedObservationRecord should delete a finalized record", function() {
      const result = deleteFinalizedObservationRecord(testObservationId, 'evaluator@example.com');
      assert.isTrue(result.success, 'Should be able to delete a finalized observation.');
      const obs = getObservationById(testObservationId);
      assert.isNull(obs, 'Observation should be null after deletion.');
    });
  });
})();


/**
 * Test Suite for Utility functions in Utils.js
 */
(function() {
  test.add("Utils", function() {
    this.add("isValidEmail should validate email formats correctly", function() {
      assert.isTrue(isValidEmail('test@example.com'), 'Valid email should be true.');
      assert.isFalse(isValidEmail('test.example.com'), 'Invalid email should be false.');
      assert.isFalse(isValidEmail(null), 'Null email should be false.');
      // Additional test cases for improved validation
      assert.isFalse(isValidEmail('test..name@example.com'), 'Consecutive dots in local part should be false.');
      assert.isFalse(isValidEmail('.test@example.com'), 'Leading dot in local part should be false.');
      assert.isFalse(isValidEmail('test.@example.com'), 'Trailing dot in local part should be false.');
    });

    this.add("escapeHtml should escape HTML entities", function() {
      const input = '<script>alert("xss")</script>';
      const expected = '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;';
      // Note: GasT may have different behavior for single quotes, let's stick to double quotes for consistency.
      const actual = escapeHtml(input).replace(/&#39;/g, '&quot;');
      const expectedForTest = expected.replace(/&#39;/g, '&quot;');
      assert.equal(actual, expectedForTest, 'HTML should be properly escaped.');
    });

    this.add("generateUniqueId should create a unique ID", function() {
      const id1 = generateUniqueId('test');
      const id2 = generateUniqueId('test');
      assert.isTrue(id1.startsWith('test-'), 'ID should have the correct prefix.');
      assert.notEqual(id1, id2, 'Two generated IDs should not be equal.');
    });
  });
})();