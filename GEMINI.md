# GEMINI.md

This file provides guidance to Google Gemini when working with code in this repository.

## Project Overview

This is a Google Apps Script (GAS) web application called "Peer Evaluator Form" that implements a multi-role Danielson Framework rubric system for educational evaluation. The system supports different user roles including Teachers, Administrators, Peer Evaluators, and Full Access users, each with different permissions and views of the evaluation rubric.

## Core Architecture

## Project File Structure

```
/workspaces/PeerEvaluatorForm/
├── client/                           # Client-side HTML templates and resources
│   ├── CLAUDE.md                    # Client-specific Claude instructions
│   ├── peerevaluator/
│   │   └── filter-interface.html    # Filter view for special access roles
│   ├── shared/
│   │   ├── error-page.html          # Error display template with debugging information
│   │   └── finalized-observation-email.html # Email template for finalized observations
│   └── staff/
│       └── rubric.html              # Main evaluation rubric interface
├── server/                          # Server-side JavaScript modules
│   ├── Constants.js               # Global constants and configuration (loads first)
│   ├── CLAUDE.md                    # Server-specific Claude instructions
│   ├── CacheManager.js              # Advanced caching system with versioning
│   ├── Code.js                      # Main orchestrator and entry point
│   ├── ObservationService.js        # Manages peer evaluation observations
│   ├── SessionManager.js            # User sessions and state persistence
│   ├── SheetService.js              # Data access layer for Google Sheets
│   ├── UserService.js               # User authentication and context creation
│   ├── Utils.js                     # Utility functions and constants
│   └── ValidationService.js         # Data validation and error handling
├── AGENTS.md                        # AI agent comprehensive guide
├── CLAUDE.md                        # Claude AI instructions
├── GEMINI.md                        # This file - Gemini AI instructions
├── appsscript.json                  # Google Apps Script manifest
├── global-tools-implementation-plan.md # Development planning document
└── performance-todo.md              # Performance optimization notes
```

### Main Components

- **server/Code.js**: Main orchestrator and entry point containing the `doGet()` function and server-side functions for AJAX
- **server/SessionManager.js**: Handles user sessions, role change detection, and state persistence
- **server/SheetService.js**: Data access layer for Google Sheets operations
- **server/UserService.js**: User authentication, validation, and context creation
- **server/ObservationService.js**: Manages peer evaluation observations using Observation_Data sheet as database, with folder-level sharing on finalization
- **server/CacheManager.js**: Advanced caching system with versioning and dependency management
- **server/ValidationService.js**: Data validation and error handling
- **server/Utils.js**: Utility functions and constants

### Key Features

1. **Multi-Role System**: Different roles see different rubric views and have different permissions
2. **Peer Evaluation**: Peer Evaluators can create, edit, and finalize observations of other staff
3. **PDF Export**: Observations are exported to styled PDF documents using Google's DocumentApp API
4. **Advanced Caching**: Sophisticated caching system with automatic invalidation
5. **Role Change Detection**: Automatic cache clearing when user roles change
6. **Assignment-Based Views**: Users see only assigned subdomains based on their role/year

### Data Structure

- **Staff Sheet**: Contains user information (Name, Email, Role, Year)
- **Settings Sheet**: Contains role-year mappings for subdomain assignments
- **Role-Specific Sheets**: Individual sheets for each role containing rubric data
- **Observation_Data Sheet**: Used as database for observation records with private file storage until finalization

## Code Development Guidelines

**=� CRITICAL: These guidelines are MANDATORY for every code change.**

### Pre-Development Code Analysis Protocol

Before implementing ANY new functionality, you MUST follow this analysis protocol:

#### Step 1: Comprehensive Search Strategy

Use multiple search approaches to find existing functionality:

```bash
# Primary search patterns
grep -r "functionName\|function_name\|FunctionName" .
grep -r "feature.*keyword\|keyword.*feature" .
grep -r "\.css-class\|#html-id" .
grep -r "onclick.*function\|addEventListener" .

# Secondary search patterns  
grep -ri "todo.*feature\|fixme.*feature\|hack.*feature" .
grep -r "deprecated\|obsolete\|unused" .
```

#### Step 2: Code Analysis Decision Tree

For EVERY piece of existing code found, categorize and act:

**=� Complete & Working Code**
-  Action: Extend/enhance existing implementation
- L Never: Create duplicate functionality

**=� Partial Implementation** 
-  Action: Complete existing code OR replace entirely
- L Never: Leave partial code when adding new code

**=4 Broken/Incomplete Code**
-  Action: Fix existing code OR replace with working version
- L Never: Work around broken code with duplicates

**� Duplicate Functions**
-  Action: Consolidate into single, comprehensive implementation
- L Never: Leave multiple functions doing the same thing

#### Step 3: Mandatory Cleanup Process

When implementing new functionality:

1. **= IDENTIFY**: All related existing code
2. **=� REMOVE**: Duplicates, dead code, commented sections
3. **=' CONSOLIDATE**: Multiple implementations into one
4. **( IMPLEMENT**: New/enhanced functionality
5. **>� VERIFY**: No conflicts or duplicates remain

### Implementation Patterns

####  CORRECT: Single Source of Truth
```javascript
// ONE comprehensive function handles all cases
function toggleSection(sectionType, elementId, options = {}) {
    // Handle evidence sections, look-fors, etc.
    // All toggle logic centralized here
}
```

#### L INCORRECT: Multiple Similar Functions
```javascript
// BAD: Multiple functions for similar purposes
function toggleEvidence(id) { /* ... */ }
function toggleLookFors(id) { /* ... */ }  
function toggleSection(id) { /* ... */ }
```

####  CORRECT: CSS Organization
```css
/* Consolidated styles for related functionality */
.toggle-section {
    /* Base styles */
}
.toggle-section.evidence { /* Evidence-specific */ }
.toggle-section.lookfors { /* Look-fors-specific */ }
```

#### L INCORRECT: Scattered CSS
```css
.evidence-toggle { /* ... */ }
.look-fors-toggle { /* ... */ }
.section-toggle { /* Similar styles scattered */ }
```

### Code Quality Requirements

#### Mandatory Quality Checks
- [ ] **Zero duplicate functions**
- [ ] **Zero unused CSS classes**
- [ ] **Zero commented-out code blocks**
- [ ] **Consistent naming conventions**
- [ ] **Complete functionality (no TODOs in production)**
- [ ] **Proper error handling**
- [ ] **Console logging for debugging**

#### Performance Requirements
- [ ] **Leverage existing caching system**
- [ ] **Minimize DOM queries**
- [ ] **Use efficient search patterns**
- [ ] **Avoid redundant API calls**

### Google Apps Script Specific Guidelines

#### Server-Client Communication
```javascript
// CORRECT: Use existing error handling patterns
google.script.run
    .withSuccessHandler(response => {
        if (response.success) {
            // Handle success
        } else {
            showToast('Error: ' + response.error);
        }
    })
    .withFailureHandler(error => {
        console.error('Server error:', error);
        showToast('Server error: ' + error.message);
    })
    .serverFunction(parameters);
```

#### Caching Integration
```javascript
// CORRECT: Use existing caching system from server/CacheManager.js
const cachedData = getCachedDataEnhanced('cache_key', params);
if (cachedData?.data) {
    return cachedData.data;
}
// ... fetch and cache new data
setCachedDataEnhanced('cache_key', params, data, ttl);
```

### Emergency Code Cleanup Protocol

If you discover conflicting/duplicate code during development:

1. **=� HALT**: Stop current implementation immediately
2. **=� INVENTORY**: List ALL related functions, CSS, HTML
3. **<� CHOOSE**: Select the most complete/correct version
4. **>� CLEANUP**: Remove ALL duplicates and incomplete versions
5. **<� REBUILD**: Create single, comprehensive implementation
6. **=, TEST**: Verify functionality works correctly
7. **=� DOCUMENT**: Explain cleanup in commit message

### Real-World Case Study: Evidence Section

**L What Went Wrong:**
- Failed to search for existing `toggleEvidenceSection()` function
- Added new complete function without removing partial one
- Created conflicting implementations
- Left incomplete CSS and HTML

** What Should Have Happened:**
1. **Search**: `grep -r "toggleEvidence\|evidence.*toggle" .`
2. **Find**: Partial `toggleEvidenceSection()` implementation  
3. **Analyze**: Function exists but incomplete
4. **Decide**: Replace incomplete function entirely
5. **Remove**: Old incomplete function
6. **Implement**: Complete new functionality
7. **Verify**: No duplicates or conflicts

### Testing and Validation

#### Pre-Commit Checklist
- [ ] Searched for existing functionality using multiple patterns
- [ ] Removed all duplicate/similar functions
- [ ] Cleaned up unused CSS and HTML
- [ ] Tested functionality thoroughly
- [ ] No console errors or warnings
- [ ] Performance is acceptable
- [ ] Documentation updated

#### Integration Testing
- [ ] New code works with existing caching system
- [ ] UI interactions work correctly
- [ ] Server-side functions respond properly
- [ ] No conflicts with other features
- [ ] Mobile/responsive design maintained

### Remember: Analysis First, Implementation Second

**The most important rule: NEVER implement new functionality without first performing comprehensive analysis of existing code. Prevention of duplicates is infinitely better than cleanup after the fact.**

## Key Constants and Configuration

### Environment Setup

The application requires these Script Properties to be set:
- `SHEET_ID`: The Google Sheets ID containing the rubric data

### Important Constants

```javascript
// User roles
AVAILABLE_ROLES = ['Teacher', 'Administrator', 'Peer Evaluator', 'Full Access']

// Special roles with enhanced permissions  
SPECIAL_ROLES = {
  ADMINISTRATOR: 'Administrator',
  PEER_EVALUATOR: 'Peer Evaluator', 
  FULL_ACCESS: 'Full Access'
}

// Observation years
OBSERVATION_YEARS = [1, 2, 3, 4, 5, 6]
PROB_YEAR_1 = 4  // P1 (Probationary Year 1)
PROB_YEAR_2 = 5  // P2 (Probationary Year 2)
PROB_YEAR_3 = 6  // P3 (Probationary Year 3)

// View modes
VIEW_MODES = {
  FULL: 'full',
  ASSIGNED: 'assigned'
}
```

### Cache Settings

The system uses sophisticated caching with TTL values:
- User data: 10 minutes
- Sheet data: 15 minutes  
- Role sheet data: 20 minutes

## Testing and Deployment

### Testing Process

1. Open the project in Google Apps Script Editor
2. Deploy as web app with "Execute as: User accessing the web app"
3. Test different user roles by updating the Staff sheet
4. Use `?debug=true` URL parameter for debug mode

### Common Debugging Functions

```javascript
// System status
testSheetConnectivity();
getUserStatistics();  
validateUserAccess('user@email.com');

// Cache debugging
debugCacheStatus();
clearAllCaches();

// Performance monitoring
logPerformanceMetrics(operation, time, metadata);
```

## Security and Best Practices

- Web app executes as "User accessing" for proper permissions
- Email validation prevents unauthorized access
- Role-based access controls throughout
- Observation materials remain private during draft phase, shared only upon finalization
- Folder-level sharing ensures consistent access control for all observation materials
- Peer evaluators maintain editor access for regeneration capabilities
- Never commit secrets or keys to repository
- Always use proper error handling and validation