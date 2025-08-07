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
- **ObservationService.js**: Manages peer evaluation observations using PropertiesService as a database
- **CacheManager.js**: Advanced caching system with versioning and dependency management
- **ValidationService.js**: Data validation and error handling
- **Utils.js**: Utility functions and constants

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