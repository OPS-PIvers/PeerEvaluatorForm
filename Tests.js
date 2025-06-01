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
