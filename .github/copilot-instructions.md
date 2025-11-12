# Peer Evaluator Form - Google Apps Script Project

**ALWAYS follow these instructions first. Only search or gather additional context if the information here is incomplete or found to be in error.**

## Project Overview

This is a Google Apps Script (GAS) web application that implements a multi-role Danielson Framework rubric system for educational evaluation. The application runs on Google's servers, uses Google Sheets as a database, Google Drive for file storage, and serves HTML pages through Google Apps Script's HTML Service.

**Key Architecture**: Server-side JavaScript (.js files) + Client-side HTML (.html files) + Google Sheets (database) + Google Drive (file storage) + Google Apps Script services (caching, properties, etc.)

## Working Effectively

### Bootstrap and Setup
- **NEVER INSTALL npm packages** - This is a Google Apps Script project, not Node.js
- **DO NOT** look for package.json - GAS projects don't use npm
- **DO NOT** run typical web development build commands
- Install clasp CLI: `npm install -g @google/clasp` (takes 55 seconds, NEVER CANCEL)
- Verify installation: `clasp --version`
- Check project status: `clasp status` (takes ~1 second)

### Code Validation and Testing
- Validate JavaScript syntax: `for file in *.js; do node -c "$file" && echo "✓ $file OK" || echo "✗ $file error"; done` (takes ~0.4 seconds)
- Run the test suite: `node -e "const fs=require('fs'); const vm=require('vm'); const ctx=vm.createContext({console}); vm.runInContext(fs.readFileSync('Constants.js','utf8'),ctx); vm.runInContext(fs.readFileSync('Utils.js','utf8'),ctx); vm.runInContext(fs.readFileSync('Tests.js','utf8'),ctx); vm.runInContext('runAllTests();',ctx);"` (takes ~0.05 seconds)
- **Expected test result**: 2 failing tests for email validation edge cases - this is NORMAL behavior

### Development Workflow
- **NEVER try to run `npm start` or `npm run dev`** - GAS apps don't have local servers
- **NEVER build locally** - GAS handles compilation on Google's servers
- Deploy changes: `clasp push` (requires authentication, see Authentication section)
- Test in browser: Deploy as web app through Google Apps Script editor
- View logs: Use Google Apps Script editor's execution transcript

### Authentication (Important Limitations)
- `clasp` commands requiring Google authentication **WILL NOT WORK** in this environment
- `clasp push`, `clasp deploy`, `clasp pull` require Google OAuth - they WILL FAIL here
- **Authentication happens through GitHub Actions** - see `.github/workflows/clasp-deploy.yml`
- **DO NOT attempt clasp login** - it won't work in this sandboxed environment

### Project Structure
```
Key Files (16 tracked by clasp):
├── appsscript.json          # GAS manifest - defines scopes and web app settings
├── Code.js (2,082 lines)    # Main entry point with doGet() function
├── Constants.js (305 lines) # System constants and configuration (loads first)
├── Utils.js (525 lines)     # Utility functions including isValidEmail()
├── Tests.js (59 lines)      # Test suite - run locally for validation
├── CacheManager.js          # Advanced caching system with dependencies
├── SessionManager.js        # User session and role management
├── SheetService.js          # Data access layer for Google Sheets
├── UserService.js           # User authentication and validation  
├── ObservationService.js    # Peer evaluation observations (uses PropertiesService)
├── ValidationService.js     # Data validation and error handling
├── rubric.html (2,176 lines) # Main UI interface
├── filter-interface.html    # Special access role filtering interface
└── Other HTML templates     # Error pages, email templates

Configuration:
├── .clasp.json             # Clasp project configuration
├── .github/workflows/      # GitHub Actions for CI/CD
└── Documentation files     # CLAUDE.md, AGENTS.md, etc.
```

## Validation Scenarios

**ALWAYS run these validation steps after making changes:**

### 1. Syntax Validation
```bash
# Validate all JavaScript files (required - takes ~0.4 seconds)
for file in *.js; do node -c "$file" && echo "✓ $file syntax OK" || echo "✗ $file has syntax errors"; done
```

### 2. Test Execution  
```bash
# Run the complete test suite (required - takes ~0.05 seconds)
node -e "
const fs=require('fs'), vm=require('vm'), ctx=vm.createContext({console});
vm.runInContext(fs.readFileSync('Constants.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('Utils.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('Tests.js','utf8'),ctx);
vm.runInContext('runAllTests();',ctx);
"
```
**Expected output**: Tests run with 2 failing assertions (normal behavior for edge cases)

### 3. Project Structure Verification
```bash
# Verify all tracked files are present (required - takes ~1 second)  
clasp status
```
**Expected**: Shows exactly 16 tracked files, lists untracked documentation files

### 4. Configuration Validation
```bash
# Verify clasp configuration is valid JSON
cat .clasp.json | jq . > /dev/null && echo "✓ .clasp.json valid" || echo "✗ .clasp.json invalid"
cat appsscript.json | jq . > /dev/null && echo "✓ appsscript.json valid" || echo "✗ appsscript.json invalid"
```

## Core System Understanding

### Google Apps Script Architecture
- **Entry Point**: `doGet(e)` function in Code.js - handles ALL web requests
- **Database**: Google Sheets with Staff, Settings, and role-specific sheets  
- **File Storage**: Google Drive with structured folder system
- **Caching**: CacheService + PropertiesService for performance
- **Authentication**: Built into GAS - uses user's Google account automatically

### Key Features to Test When Changed
1. **Multi-Role System**: Users get different views based on Staff sheet role
2. **Peer Observations**: Peer Evaluators can create/edit observations of other staff
3. **PDF Export**: Observations export to styled PDFs using DocumentApp API
4. **Caching**: Automatic cache invalidation when sheets change
5. **Role Detection**: System detects role changes and clears caches

### Common Development Pitfalls
- **DO NOT** add Node.js imports (require, module.exports) - GAS doesn't support them
- **DO NOT** use modern ES6 features extensively - GAS uses V8 runtime with limitations  
- **DO NOT** try to run the app locally - it MUST run on Google's servers
- **ALWAYS** consider cache invalidation when changing data structures
- **ALWAYS** test with different user roles by modifying the Staff sheet

### Performance Expectations
- Code syntax validation: ~0.4 seconds for all files
- Test suite execution: ~0.05 seconds  
- Clasp status check: ~1 second
- **Complete validation workflow**: ~1.5 seconds total
- **NEVER CANCEL** any clasp operations - they complete quickly (~1 second each)

## CI/CD Integration

### GitHub Actions Workflow
- **Auto-deployment** on main branch push via `.github/workflows/clasp-deploy.yml`
- **Gemini PR reviews** for code quality
- **Authentication** handled through GitHub secrets:
  - `CLASPRC_JSON`: Google OAuth credentials
  - `DEPLOYMENT_ID`: GAS web app deployment ID

### Before Committing
- **ALWAYS** run the complete validation workflow (takes ~1.5 seconds total):
  1. Syntax validation: `for file in *.js; do node -c "$file"; done`
  2. Test suite: Use the test execution command above
  3. Project verification: `clasp status`
  4. Config validation: `jq . .clasp.json && jq . appsscript.json`
- **NO LINTING TOOLS** configured - rely on syntax validation only

## Troubleshooting

### Common Issues
1. **"VALIDATION_PATTERNS is not defined"**: Load Constants.js before Utils.js (file renamed with 0_ prefix to enforce load order)
2. **Clasp authentication errors**: Expected in this environment - ignore them
3. **Missing Sheet errors**: Normal - app uses fallbacks when sheets unavailable  
4. **Cache-related errors**: Clear with `forceCleanAllCaches()` function

### Debug Commands
```javascript
// In GAS editor console:
testSheetConnectivity();      // Test sheet access
debugCacheStatus();           // Check cache health  
clearAllCaches();             // Force cache clear
validateUserAccess('email');  // Test user permissions
```

### Project Stats
- **10 JavaScript files** (6,926 total lines)
- **5 HTML files** (3,249 total lines)  
- **16 files tracked by clasp**
- **V8 JavaScript runtime**
- **No external dependencies** (pure GAS)

## Quick Reference

**Key constants in Constants.js:**
- `AVAILABLE_ROLES`: List of user roles
- `SPECIAL_ROLES`: Admin, Peer Evaluator, Full Access  
- `VALIDATION_PATTERNS`: Email and component ID regex
- `SHEET_NAMES`: Names of Google Sheets used

**Main services:**
- `SheetService`: All Google Sheets operations
- `UserService`: User authentication and context
- `CacheManager`: Advanced caching with versioning
- `ObservationService`: Peer evaluation workflow
- `ValidationService`: Data validation and error handling

**Test execution reminder**: Always run the complete validation sequence above before considering your changes ready for commit.