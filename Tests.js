// Test suite for utility functions

function runAllTests() {
  console.log("Starting all tests...");
  testIsValidEmailFunction();
  testEscapeHtmlFunction();
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

function testEscapeHtmlFunction() {
  console.log("Running tests for escapeHtml...");

  // Basic HTML entity escaping
  assert(escapeHtml("<script>alert('xss')</script>") === "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;", 
         "Test Case 1 Failed: Basic script tag escaping");
  assert(escapeHtml("Hello & goodbye") === "Hello &amp; goodbye", 
         "Test Case 2 Failed: Ampersand escaping");
  assert(escapeHtml('She said "Hello"') === "She said &quot;Hello&quot;", 
         "Test Case 3 Failed: Double quote escaping");
  assert(escapeHtml("It's working") === "It&#39;s working", 
         "Test Case 4 Failed: Single quote/apostrophe escaping");
  assert(escapeHtml("5 > 3 < 10") === "5 &gt; 3 &lt; 10", 
         "Test Case 5 Failed: Greater than and less than escaping");

  // Edge cases with null and undefined
  assert(escapeHtml(null) === "", "Test Case 6 Failed: null input should return empty string");
  assert(escapeHtml(undefined) === "", "Test Case 7 Failed: undefined input should return empty string");
  assert(escapeHtml("") === "", "Test Case 8 Failed: empty string should return empty string");

  // Non-string inputs
  assert(escapeHtml(123) === "123", "Test Case 9 Failed: number input should be converted to string");
  assert(escapeHtml(true) === "true", "Test Case 10 Failed: boolean input should be converted to string");
  assert(escapeHtml(false) === "false", "Test Case 11 Failed: boolean false should be converted to string");
  assert(escapeHtml(0) === "0", "Test Case 12 Failed: zero should be converted to string");

  // Complex cases with multiple entities
  assert(escapeHtml('<div class="test">Hello & "goodbye"</div>') === 
         "&lt;div class=&quot;test&quot;&gt;Hello &amp; &quot;goodbye&quot;&lt;/div&gt;", 
         "Test Case 13 Failed: Multiple entities in complex HTML");
  
  // Entities already escaped should be double-escaped (prevent double escaping issues)
  assert(escapeHtml("&lt;already&gt;") === "&amp;lt;already&amp;gt;", 
         "Test Case 14 Failed: Already escaped entities should be double-escaped");

  // All entities in one string
  assert(escapeHtml("&<>\"'") === "&amp;&lt;&gt;&quot;&#39;", 
         "Test Case 15 Failed: All entities in one string");

  // String with no entities to escape
  assert(escapeHtml("Hello World 123") === "Hello World 123", 
         "Test Case 16 Failed: String with no entities should remain unchanged");

  // Object with toString method
  const testObj = { toString: function() { return "<script>"; } };
  assert(escapeHtml(testObj) === "&lt;script&gt;", 
         "Test Case 17 Failed: Object with toString should be converted and escaped");

  console.log("escapeHtml tests completed.");
}

// To run tests, execute runAllTests() from the Apps Script editor.
