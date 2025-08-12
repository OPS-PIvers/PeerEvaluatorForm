# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Google Apps Script (GAS) web application called "Peer Evaluator Form" that implements a multi-role Danielson Framework rubric system for educational evaluation. The system supports different user roles including Teachers, Administrators, Peer Evaluators, and Full Access users, each with different permissions and views of the evaluation rubric.

## Core Architecture

### Main Components

- **Code.js**: Main orchestrator and entry point containing the `doGet()` function and server-side functions for AJAX
- **SessionManager.js**: Handles user sessions, role change detection, and state persistence
- **SheetService.js**: Data access layer for Google Sheets operations
- **UserService.js**: User authentication, validation, and context creation
- **ObservationService.js**: Manages peer evaluation observations using Observation_Data sheet as database
- **CacheManager.js**: Advanced caching system with versioning and dependency management
- **ValidationService.js**: Data validation and error handling
- **Utils.js**: Utility functions and constants
- **Constants.js**: Global constants including sheet names, roles, cache settings, and validation patterns

### HTML Templates

- **rubric.html**: Main evaluation rubric interface with look-fors checkboxes and rich-text notes
- **filter-interface.html**: Filter view for special access roles (Administrator, Peer Evaluator, Full Access)
- **error-page.html**: Error display template with debugging information
- **pdf-rubric.html**: Template for generating PDF observation reports
- **finalized-observation-email.html**: Email template for finalized observations

### Development Notes

- **lookfors-todo.md**: Development notes for look-fors functionality
- **observation-notes-todo.md**: Development notes for observation notes
- **performance-todo.md**: Performance optimization notes

### Key Features

1. **Multi-Role System**: Different roles see different rubric views and have different permissions
2. **Peer Evaluation**: Peer Evaluators can create, edit, and finalize observations of other staff
3. **PDF Export**: Observations can be exported to styled PDF documents in Google Drive
4. **Advanced Caching**: Sophisticated caching system with automatic invalidation
5. **Role Change Detection**: Automatic cache clearing when user roles change
6. **Assignment-Based Views**: Users see only assigned subdomains based on their role/year

### Data Structure

- **Staff Sheet**: Contains user information (Name, Email, Role, Year)
- **Settings Sheet**: Contains role-year mappings for subdomain assignments
- **Role-Specific Sheets**: Individual sheets for each role containing rubric data
- **PropertiesService**: Used as database for observation records

## Common Development Tasks

### Testing the Application

Since this is a Google Apps Script web app, testing requires deployment:

1. Open the project in Google Apps Script Editor
2. Deploy as web app with "Execute as: User accessing the web app"
3. Test different user roles by updating the Staff sheet
4. Use `?debug=true` URL parameter for debug mode

### Cache Management

The system uses an advanced caching system. To clear all caches:

```javascript
forceCleanAllCaches();
```

To clear caches for a specific user:

```javascript
clearUserCaches('user@email.com');
```

### Role Management

To add a new role:
1. Add to `AVAILABLE_ROLES` constant in Constants.js
2. Create corresponding sheet with rubric data
3. Add role-year mappings in Settings sheet
4. Update validation logic if needed

### Observation System

Observations are managed through ObservationService.js:
- Stored in PropertiesService as JSON
- Associated files stored in Google Drive folder structure
- Support for media evidence upload
- PDF export functionality

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
OBSERVATION_YEARS = [1, 2, 3]
PROBATIONARY_OBSERVATION_YEAR = 1

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

## Google Apps Script Specific Notes

### Deployment Process

1. Set up Google Sheets with proper structure
2. Configure Script Properties (SHEET_ID)
3. Deploy as web app with proper permissions
4. Test with different user accounts

### Trigger Installation

The system can auto-detect role and rubric changes:

```javascript
installRoleChangeAutoTrigger(); // Install
checkAutoTriggerStatus();       // Check status
removeAutoTrigger();           // Remove
```

### Drive Integration

- Observations create folder structure: `Root Folder > User Folder > Observation Folder`
- PDF exports are generated using DocumentApp
- Media evidence uploads are handled through Drive API

### Security Considerations

- Web app executes as "User accessing" for proper permissions
- Email validation prevents unauthorized access
- Role-based access controls throughout
- Evidence files have view-only sharing permissions

## Error Handling

The system includes comprehensive error handling:
- Validation services for data integrity
- Graceful fallbacks for missing data
- Enhanced error pages with debugging info
- Performance metrics logging

## Performance Optimization

- Advanced caching system with dependencies
- Proactive cache warming
- Change detection to minimize unnecessary operations
- Bulk operations where possible

## Common Debugging

Use these functions for troubleshooting:

```javascript
// Check system status
testSheetConnectivity();
getUserStatistics();  
validateUserAccess('user@email.com');

// Cache debugging
debugCacheStatus();
clearAllCaches();

// Performance monitoring
logPerformanceMetrics(operation, time, metadata);
```

## Code Development Guidelines

**⚠️ CRITICAL: These guidelines MUST be followed for every feature addition, bug fix, or modification.**

### Pre-Development Analysis (MANDATORY)

Before implementing ANY new functionality, you MUST perform a comprehensive analysis of existing code:

#### 1. **Search for Existing Functionality**

Always search the codebase using multiple patterns to identify any existing or partial implementations:

```bash
# Search for function names (current and variations)
grep -r "functionName\|function_name\|FunctionName" .

# Search for CSS classes and IDs  
grep -r "\.class-name\|#element-id" .

# Search for HTML elements and attributes
grep -r "onclick.*functionName\|data-.*\|id.*element" .

# Search for JavaScript event handlers
grep -r "addEventListener\|onclick\|onchange\|toggle" .

# Search for related keywords and comments
grep -ri "feature.*name\|todo.*feature\|fixme.*feature" .
```

#### 2. **Analysis Decision Matrix**

For each piece of existing code found:

| Found Code Status | Action Required |
|------------------|----------------|
| **Complete & Working** | → Extend/modify existing code |
| **Partial Implementation** | → Complete existing code OR replace entirely |
| **Broken/Incomplete** | → Fix existing code OR replace entirely |
| **Duplicate Functions** | → Consolidate into single implementation |
| **No Existing Code** | → Create new implementation |

#### 3. **Cleanup Requirements** 

When adding new functionality, you MUST:

✅ **Remove ALL duplicate functions**  
✅ **Remove unused CSS styles**  
✅ **Remove commented-out code blocks**  
✅ **Update related documentation/comments**  
✅ **Ensure consistent naming conventions**  
✅ **Verify no dead code remains**

### Implementation Process

#### Step 1: Comprehensive Code Analysis
```bash
# Example: Before adding evidence section functionality
grep -r "evidence\|Evidence" .
grep -r "toggle.*section\|toggleSection" .
grep -r "\.evidence\|#evidence" .
grep -r "notes.*editor\|Editor" .
grep -r "quill\|Quill" .
```

#### Step 2: Document Findings
Create a mental or written inventory:
- Functions found: `toggleEvidenceSection()` (incomplete)
- CSS found: `.evidence-*` (missing)  
- HTML found: evidence section structure (present)
- JavaScript found: Quill editor init (partial)

#### Step 3: Make Implementation Decision
- **EXTEND**: Build upon existing partial implementation
- **REPLACE**: Remove old code and create new implementation  
- **REFACTOR**: Improve existing working code

#### Step 4: Execute with Cleanup
- Implement the solution
- Remove ALL duplicate/old functionality
- Test thoroughly
- Update documentation

### Code Integration Patterns

#### Pattern 1: Extending Existing Code
```javascript
// GOOD: Extend existing function
function existingToggleFunction(id) {
    // Add new functionality to existing function
    const element = document.getElementById(id);
    // ... enhanced logic
}

// BAD: Create duplicate function
function newToggleFunction(id) { /* duplicate logic */ }
```

#### Pattern 2: Replacing Incomplete Code
```javascript
// 1. REMOVE incomplete function:
// function toggleEvidenceSection(contentId) { /* incomplete */ }

// 2. REPLACE with complete implementation:
function toggleEvidenceSection(contentId) {
    // Complete, robust implementation
    // ... full functionality
}
```

#### Pattern 3: CSS Consolidation
```css
/* GOOD: Single, complete CSS section */
.evidence-section {
    /* All evidence-related styles here */
}

/* BAD: Scattered, duplicate styles */
.evidence { /* incomplete */ }
.evidence-section { /* duplicate */ }
```

### Common Mistakes to Avoid

#### ❌ **Anti-Pattern: Ignoring Existing Code**
```javascript
// WRONG: Adding new function without checking for existing
function newFeatureFunction() { /* ... */ }

// MISSED: Existing partial implementation
function featureFunction() { /* incomplete but exists */ }
```

#### ❌ **Anti-Pattern: Creating Duplicates**
```javascript
// WRONG: Multiple functions for same purpose
function toggleContent() { /* version 1 */ }
function toggleSection() { /* version 2 - duplicate! */ }

// RIGHT: Single, comprehensive function  
function toggleSection(type, id) { /* handles all cases */ }
```

#### ❌ **Anti-Pattern: Leaving Dead Code**
```javascript
// WRONG: Leaving old code commented out
// function oldToggleFunction() { /* old version */ }

// RIGHT: Remove completely and use version control for history
```

### Quality Assurance Checklist

Before submitting changes, verify:

- [ ] **No duplicate functions exist**
- [ ] **No unused CSS classes remain** 
- [ ] **No commented-out code blocks**
- [ ] **All related functionality is consolidated**
- [ ] **Function names are consistent and clear**
- [ ] **Documentation reflects current implementation**
- [ ] **All features work as expected**
- [ ] **No JavaScript console errors**

### Case Study: Evidence Section Issue

**What Went Wrong:**
1. ❌ Failed to search for existing `toggleEvidenceSection` function
2. ❌ Added new implementation without removing old one
3. ❌ Created duplicate, conflicting functionality
4. ❌ Left old CSS and HTML incomplete

**What Should Have Happened:**
1. ✅ Search: `grep -r "toggleEvidence\|evidence.*section" .`  
2. ✅ Find: Existing incomplete function
3. ✅ Analyze: Function present but incomplete
4. ✅ Decide: Replace incomplete function entirely
5. ✅ Implement: Complete functionality in single function
6. ✅ Cleanup: Remove old incomplete function
7. ✅ Verify: No duplicates remain

### Emergency Code Cleanup

If you discover duplicate/conflicting code:

1. **STOP** current implementation
2. **IDENTIFY** all related functions/code
3. **CHOOSE** the most complete/correct version
4. **REMOVE** all duplicates and incomplete versions  
5. **CONSOLIDATE** functionality into single implementation
6. **TEST** thoroughly
7. **DOCUMENT** the cleanup in commit message

### Remember: Prevention > Correction

**It is ALWAYS better to spend extra time analyzing existing code than to create conflicts that require emergency cleanup later.**