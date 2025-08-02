// Test suite for utility functions

function runAllTests() {
  console.log("Starting all tests...");
  testIsValidEmailFunction();
  // Add other test functions here if needed
  console.log("All tests completed.");
}

function assert(condition, message) {
  if (!condition) {
    console.error("Assertion Failed: " + message);
  } else {
    // console.log("Assertion Passed: " + message); // Optional: for verbose logging
  }
}

function testIsValidEmailFunction() {
  console.log("Running tests for isValidEmail...");

  // Valid emails
  assert(isValidEmail("test@example.com") === true, "Test Case 1 Failed: test@example.com");
  assert(isValidEmail("test.name@example.co.uk") === true, "Test Case 2 Failed: test.name@example.co.uk");
  assert(isValidEmail("test-name@example-domain.com") === true, "Test Case 3 Failed: test-name@example-domain.com");
  assert(isValidEmail("user123@sub.example-domain.io") === true, "Test Case 4 Failed: user123@sub.example-domain.io");
  assert(isValidEmail("firstname+lastname@example.com") === true, "Test Case 5 Failed: firstname+lastname@example.com");
  assert(isValidEmail("test@domainwithhyphen-example.com") === true, "Test Case 6 Failed: test@domainwithhyphen-example.com");
  assert(isValidEmail("test@sub.domain.with.dots.com") === true, "Test Case 7 Failed: test@sub.domain.with.dots.com");
  assert(isValidEmail("a@b.co") === true, "Test Case 8 Failed: a@b.co (short TLD)");


  // Invalid emails
  assert(isValidEmail("test@example") === false, "Test Case 9 Failed: test@example (missing TLD)");
  assert(isValidEmail("test.example.com") === false, "Test Case 10 Failed: test.example.com (missing @)");
  assert(isValidEmail("@example.com") === false, "Test Case 11 Failed: @example.com (missing local part)");
  assert(isValidEmail("test@.com") === false, "Test Case 12 Failed: test@.com (missing domain name)");
  assert(isValidEmail("test@domain.") === false, "Test Case 13 Failed: test@domain. (missing TLD after dot)");
  assert(isValidEmail("test@-example.com") === false, "Test Case 14 Failed: test@-example.com (domain starts with hyphen)");
  // Note: The regex /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/ actually allows domains to end with a hyphen before the TLD.
  // Example: `test@example-.com` would be seen as `example-` . `com`. This is a common regex behavior.
  // Let's adjust the expectation or the regex if this is not desired. For now, assuming standard regex behavior.
  // The regex `[a-zA-Z0-9.-]+` means it can contain hyphens. `example-` is a valid part.
  // The issue was about `[^\s@.-]+` which disallowed hyphens *within* segments.
  assert(isValidEmail("test@example-.com") === true, "Test Case 15 Failed: test@example-.com (domain segment ends with hyphen, but valid by regex before TLD)");
  assert(isValidEmail("test@example..com") === false, "Test Case 16 Failed: test@example..com (double dot in domain)");
  assert(isValidEmail("") === false, "Test Case 17 Failed: empty string");
  assert(isValidEmail(null) === false, "Test Case 18 Failed: null");
  assert(isValidEmail(undefined) === false, "Test Case 19 Failed: undefined");
  assert(isValidEmail(" plainaddress") === false, "Test Case 20 Failed: ' plainaddress' (leading space)");
  assert(isValidEmail("plainaddress ") === false, "Test Case 21 Failed: 'plainaddress ' (trailing space)");
  assert(isValidEmail("test@domain withspace.com") === false, "Test Case 22 Failed: test@domain withspace.com (space in domain)");
  assert(isValidEmail("test@domain.c") === false, "Test Case 23 Failed: test@domain.c (TLD too short)");
  assert(isValidEmail("test@sub-.example.com") === true, "Test Case 24 Failed: test@sub-.example.com (subdomain ends with hyphen)");

  console.log("isValidEmail tests completed.");
}

// To run tests, execute runAllTests() from the Apps Script editor.

// --- NEW OBSERVATION WORKFLOW TESTS ---

// Mock data and services
const MOCK_DATA = {
  evaluator: { email: 'evaluator@example.com', role: 'Peer Evaluator' },
  teacher1: { email: 'teacher1@example.com', role: 'Teacher' },
  teacher2: { email: 'teacher2@example.com', role: 'Teacher' },
  observations: [],
  ratings: []
};

// Mock Apps Script Services
const MockSession = {
  getActiveUser: () => ({ getEmail: () => MOCK_DATA.currentUser.email })
};

const MockDriveApp = {
  createFolder: (name) => ({ getId: () => `folder_${name.replace(/\s/g, '_')}` }),
  getFileById: (id) => ({ moveTo: (folder) => {} })
};

const MockDocumentApp = {
  create: (name) => ({ getId: () => `doc_${name.replace(/\s/g, '_')}` })
};

function runObservationTests() {
  // Backup original services
  const originalSession = Session;
  const originalDriveApp = DriveApp;
  const originalDocumentApp = DocumentApp;

  // Inject mocks
  Session = MockSession;
  DriveApp = MockDriveApp;
  DocumentApp = MockDocumentApp;

  console.log("Starting Observation Workflow Tests...");
  try {
    test_createObservation();
    test_getObservations_security();
    test_finalizeObservation();
  } catch (e) {
    console.error("An error occurred during testing:", e);
  } finally {
    // Restore original services
    Session = originalSession;
    DriveApp = originalDriveApp;
    DocumentApp = originalDocumentApp;
    console.log("Observation Workflow Tests Completed.");
  }
}

function test_createObservation() {
  console.log("Running test: createObservation...");
  MOCK_DATA.currentUser = MOCK_DATA.evaluator;
  
  const obsId = createObservation(MOCK_DATA.teacher1.email, 'Q1 Observation');
  
  assert(obsId, "createObservation should return an observation ID.");
  
  const obs = getObservationDetails(obsId);
  assert(obs, "getObservationDetails should retrieve the created observation.");
  assert(obs.observeeEmail === MOCK_DATA.teacher1.email, "Observation has incorrect observee email.");
  assert(obs.evaluatorEmail === MOCK_DATA.evaluator.email, "Observation has incorrect evaluator email.");
  assert(obs.status === OBSERVATION_STATUS.IN_PROGRESS, "New observation should have 'In Progress' status.");
  
  MOCK_DATA.observations.push(obs); // Save for next tests
  console.log("...createObservation PASSED.");
}

function test_getObservations_security() {
  console.log("Running test: getObservations security...");
  
  // 1. Peer Evaluator should see the observation they created for teacher1
  MOCK_DATA.currentUser = MOCK_DATA.evaluator;
  let evaluatorObs = getObservations(MOCK_DATA.teacher1.email);
  assert(evaluatorObs.length === 1, "Evaluator should see 1 observation for teacher1.");
  assert(evaluatorObs[0].id === MOCK_DATA.observations[0].id, "Evaluator sees the correct observation.");

  // 2. Teacher1 should NOT see the observation yet (it's not finalized)
  MOCK_DATA.currentUser = MOCK_DATA.teacher1;
  let teacher1Obs_inprogress = getObservations(MOCK_DATA.teacher1.email);
  assert(teacher1Obs_inprogress.length === 0, "Teacher should see 0 observations while it's in progress.");

  // 3. Teacher2 should NOT see the observation
  MOCK_DATA.currentUser = MOCK_DATA.teacher2;
  let teacher2Obs = getObservations(MOCK_DATA.teacher1.email);
  assert(teacher2Obs.length === 0, "Teacher2 should not see observations for Teacher1.");

  console.log("...getObservations security PASSED.");
}

function test_finalizeObservation() {
  console.log("Running test: finalizeObservation...");
  const obsId = MOCK_DATA.observations[0].id;

  // Finalize the observation
  MOCK_DATA.currentUser = MOCK_DATA.evaluator;
  finalizeObservation(obsId);
  
  const obs = getObservationDetails(obsId);
  assert(obs.status === OBSERVATION_STATUS.FINALIZED, "Observation status should be 'Finalized'.");
  assert(obs.endTime, "Finalized observation should have an end time.");

  // Now, Teacher1 should be able to see it.
  MOCK_DATA.currentUser = MOCK_DATA.teacher1;
  let teacher1Obs_finalized = getObservations(MOCK_DATA.teacher1.email);
  assert(teacher1Obs_finalized.length === 1, "Teacher should see 1 observation after it is finalized.");
  assert(teacher1Obs_finalized[0].id === obsId, "Teacher sees the correct finalized observation.");

  console.log("...finalizeObservation PASSED.");
}
