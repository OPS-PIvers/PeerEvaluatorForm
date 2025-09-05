/**
 * Constants.js
 * Configuration constants and default settings for the Danielson Framework Multi-Role System
 */

/**
 * Sheet names used in the system
 */
const SHEET_NAMES = {
  STAFF: 'Staff',
  SETTINGS: 'Settings',
  TEACHER: 'Teacher',
  OBSERVATIONS: 'Observations',
  OBSERVATION_DATA: 'Observation_Data' // Added for consistency
};

const COLUMN_NAMES = {
    observationId: 'observationId',
    pdfUrl: 'pdfUrl',
    status: 'status',
    folderUrl: 'folderUrl'
};

/**
 * Column mappings for the Staff sheet
 */
const STAFF_COLUMNS = {
  NAME: 0,     // Column A: "Name" [LAST, FIRST]
  EMAIL: 1,    // Column B: "Email" [first.last@orono.k12.mn.us]
  ROLE: 2,     // Column C: "Role" 
  YEAR: 3,      // Column D: "Year"
  BUILDING: 4, // Column E: "Building"
  SUMMATIVE_YEAR: 5 // Column F: "Summative Year"
};

/**
 * Column mappings for the Settings sheet
 */
const SETTINGS_COLUMNS = {
  ROLE: 0,        // Column A: "Roles"
  YEAR_1: 1,      // Column B: Year 1 Domains
  YEAR_2: 2,      // Column C: Year 2 Domains  
  YEAR_3: 3       // Column D: Year 3 Domains
};

/**
 * Available roles in the system
 */
const AVAILABLE_ROLES = [
  'Teacher',
  'Nurse', 
  'Therapeutic Specialist',
  'Library/Media Specialist',
  'Counselor',
  'School Psychologist',
  'Instructional Specialist',
  'Early Childhood',
  'Parent Educator',
  'Social Worker',
  'Sp.Ed.',
  'Peer Evaluator',
  'Administrator',
  'Full Access'
];

/**
 * Default role configuration (Teacher - maintains backward compatibility)
 */
const DEFAULT_ROLE_CONFIG = {
  role: 'Teacher',
  sheetName: 'Teacher',
  title: "Danielson's Framework for Teaching",
  subtitle: "Best practices aligned with 5D+ and PELSB lookfors",
  domains: {
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
  }
};

/**
 * Legacy DOMAIN_CONFIGS for backward compatibility
 * Centralized from Code.js to maintain proper constants organization
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
 * Validation patterns for data integrity
 */
const VALIDATION_PATTERNS = {
  EMAIL: /^[a-zA-Z0-9]+(?:[._%+-][a-zA-Z0-9]+)*@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
  COMPONENT_ID: /^[1-4][a-fA-F]:/, // Matches patterns like "1a:", "2b:", etc.
  SUBDOMAIN_PATTERN: /^[1-4][a-fA-F]:/,
  SUBDOMAIN_LIST: /^[1-4][a-fA-F](,\s*[1-4][a-fA-F])*$/ // Matches "1a, 1c, 1f"
};

/**
 * Error messages for consistent user communication
 */
const ERROR_MESSAGES = {
  SHEET_ID_MISSING: 'SHEET_ID not found in Script Properties. Please set it in the Apps Script editor.',
  SHEET_NOT_FOUND: 'Required sheet not found. Please check your spreadsheet configuration.',
  USER_NOT_FOUND: 'User not found in Staff sheet. Using default Teacher rubric.',
  INVALID_ROLE: 'Invalid role specified. Using default Teacher rubric.',
  STAFF_SHEET_MISSING: 'Staff sheet not found. All users will see the Teacher rubric.',
  SETTINGS_SHEET_MISSING: 'Settings sheet not found. All domains will be visible.',
  INVALID_EMAIL: 'Invalid email format detected.',
  DATA_PARSING_ERROR: 'Error parsing sheet data. Please check data format.',
  ROLE_SHEET_MISSING: 'Role-specific sheet not found. Using Teacher rubric as fallback.',
  PERMISSION_DENIED: 'Permission denied. You do not have the required role to perform this action.'
};

/**
 * Cache settings for performance optimization
 */
const FOUR_HOURS_IN_SECONDS = 14400; // 4 hours = 4 * 60 * 60 seconds

const CACHE_SETTINGS = {
  USER_DATA_TTL: FOUR_HOURS_IN_SECONDS,      // 4 hours for user data - improves performance by reducing frequent spreadsheet reads
  ROLE_CONFIG_TTL: 600,                      // 10 minutes for role configurations
  SHEET_DATA_TTL: FOUR_HOURS_IN_SECONDS,     // 4 hours for sheet data - improves performance by reducing frequent spreadsheet reads
  DEFAULT_TTL: 300                           // Default cache time
};

/**
 * Master cache version - increment this when making major cache changes
 */
const CACHE_VERSION = '1.0.0';

/**
 * Cache dependency map - defines which caches depend on others
 */
const CACHE_DEPENDENCIES = {
  'staff_data': ['user_*', 'role_mappings'], // When staff_data changes, clear user and role caches
  'settings_data': ['role_sheet_*', 'domain_mappings'],
  'user_*': ['role_sheet_*'], // When any user data changes, clear role sheets
  'role_sheet_*': [] // Role sheets have no dependencies
};

/**
 * Performance and debugging settings
 */
const PERFORMANCE_SETTINGS = {
  MAX_EXECUTION_TIME: 25000,  // 25 seconds (Apps Script limit is 30s)
  ENABLE_PERFORMANCE_LOGGING: true,
  ENABLE_DEBUG_LOGGING: true,
  MAX_RETRY_ATTEMPTS: 3
};

/**
 * Component structure template for data validation
 */
const COMPONENT_TEMPLATE = {
  title: '',
  developing: '',
  basic: '',
  proficient: '',
  distinguished: '',
  bestPractices: []
};

/**
 * Domain structure template for data validation
 */
const DOMAIN_TEMPLATE = {
  number: 0,
  name: '',
  components: []
};

/**
 * String identifier for probationary status
 */
const PROBATIONARY_STATUS_STRING = 'probationary';

/**
 * Numeric representation for probationary observation year
 */
const PROBATIONARY_OBSERVATION_YEAR = 0;

/**
 * Default years for observation cycle
 */
const OBSERVATION_YEARS = [1, 2, 3, PROBATIONARY_OBSERVATION_YEAR];

/**
 * Special access roles that can filter and view other users' data
 */
const SPECIAL_ACCESS_ROLES = [
  'Peer Evaluator',
  'Administrator', 
  'Full Access'
];

/**
 * View modes for rubric display
 */
const VIEW_MODES = {
  FULL: 'full',
  ASSIGNED: 'assigned'
};

/**
 * Default best practices offset (for legacy Teacher sheet compatibility)
 */
const LEGACY_BEST_PRACTICES_OFFSET = {
  ROW_OFFSET: 4,    // Best practices are 4 rows below component
  COLUMN: 1,        // Column B (0-indexed)
  ROW_SPACING: 3    // Components are 3 rows apart
};

/**
 * HTML template settings
 */
const HTML_SETTINGS = {
  DEFAULT_TITLE: 'Danielson Framework - All Domains',
  VIEWPORT_META: 'width=device-width, initial-scale=1.0',
  AUTO_REFRESH_INTERVAL: 300000  // 5 minutes
};

/**
 * Regular expressions for content parsing
 */
const CONTENT_PATTERNS = {
  BEST_PRACTICES_HEADER: /best\s+practices/i,
  DOMAIN_HEADER: /^domain\s+[1-4]/i,
  COMPONENT_PATTERN: /^[1-4][a-f]:/,
  LINE_BREAKS: /\r?\n|\r/,
  EMPTY_LINES: /^\s*$/
};

/**
 * System metadata
 */
const SYSTEM_INFO = {
  VERSION: '2.1.0', // Version updated for new features
  NAME: 'Danielson Framework Multi-Role System',
  AUTHOR: 'Apps Script Multi-Role Implementation',
  LAST_UPDATED: new Date().toISOString()
};

/**
 * Template file paths for HTML templates
 */
const TEMPLATE_PATHS = {
  STAFF_RUBRIC: 'client/staff/rubric.html',
  PEER_EVALUATOR_FILTER: 'client/peerevaluator/filter-interface.html',
  SHARED_ERROR: 'client/shared/error-page.html',
  SHARED_EMAIL: 'client/shared/finalized-observation-email.html'
};

/**
 * UI and Log message strings for consistency
 */
const UI_STRINGS = {
  MENU_START: 'Start',
  MENU_FILTER_OBSERVATIONS: 'Filter Observations',
  HTML_TEMPLATE_RUBRIC: 'rubric',
  HTML_TEMPLATE_FILTER: 'filter-interface',
  HTML_TEMPLATE_ERROR: 'error-page',
  PAGE_TITLE_RUBRIC: 'Peer Evaluator Form',
  PAGE_TITLE_FILTER: 'Filter Observations',
  PAGE_TITLE_SELECT_VIEW: 'Select Rubric View',
  PAGE_TITLE_ERROR: 'Error',
  ERROR_ACCESS_DENIED: 'Access Denied',
  SUCCESS_OBSERVATION_FINALIZED: 'Observation finalized successfully.',
  LOG_ERROR_MISSING_COLUMNS: 'One or more required columns are missing in the Observations sheet.',
  LOG_INFO_SPECIAL_ACCESS_USER: 'Special access user detected - showing filter interface',
  LOG_ERROR_FATAL_DOGET: 'Fatal error in doGet:',
  LOG_CONTEXT_DOGET: 'doGet',
  REQUEST_ID_PREFIX: 'request'
};

/**
 * Contact settings
 */
const CONTACT_SETTINGS = {
  SUPPORT_EMAIL: 'admin@example.com'
};

/**
 * Auto-trigger system settings
 */
const AUTO_TRIGGER_SETTINGS = {
  ENABLED: true,
  MAX_PROCESSING_TIME: 10000, // 10 seconds max for trigger processing
  RETRY_ATTEMPTS: 2,
  LOG_ALL_EDITS: false, // Set to true for debugging
  BATCH_PROCESSING: true, // Process multiple role changes efficiently
  WARM_CACHE_ON_CHANGE: true // Pre-load new role data
};

/**
 * Trigger monitoring settings
 */
const TRIGGER_MONITORING = {
  LOG_SUCCESSFUL_CHANGES: true,
  LOG_IGNORED_EDITS: false, // Set to true for debugging
  ALERT_ON_ERRORS: true,
  TRACK_PERFORMANCE: true
};

/**
 * Validation error types for consistent error reporting
 */
const VALIDATION_ERROR_TYPES = {
  // General Configuration and Access
  CONFIGURATION_ERROR: 'configuration_error', // Generic configuration issue
  PERMISSION_ERROR: 'permission_error',       // Errors related to script/user permissions
  SHEET_ID_MISSING: 'sheet_id_missing',       // SHEET_ID not set in properties
  SPREADSHEET_NOT_FOUND: 'spreadsheet_not_found', // Cannot open spreadsheet by ID
  SHEET_NOT_FOUND: 'sheet_not_found',           // A required sheet (e.g., Staff, Settings) is missing

  // Data Integrity and Format
  DATA_CORRUPTION: 'data_corruption',     // General data format or integrity issue
  INVALID_EMAIL: 'invalid_email',         // Email format is incorrect
  INVALID_ROLE: 'invalid_role',           // Role is not in AVAILABLE_ROLES
  INVALID_YEAR: 'invalid_year',           // Year is not in OBSERVATION_YEARS
  MISSING_HEADER: 'missing_header',       // Expected header not found in a sheet
  UNEXPECTED_FORMAT: 'unexpected_format', // Data doesn't match expected structure

  // User and Role Specific
  MISSING_USER: 'missing_user',           // User not found in Staff sheet
  ROLE_SHEET_MISSING: 'role_sheet_missing', // Specific role sheet (e.g., Nurse) not found
  ROLE_CONFIG_INVALID: 'role_config_invalid', // Role configuration (e.g. in Settings) is bad

  // Cache and Session
  CACHE_ERROR: 'cache_error',             // Problem with caching service
  SESSION_ERROR: 'session_error',         // Problem with user session

  // Trigger and Automation
  TRIGGER_ERROR: 'trigger_error'          // Error within an automated trigger
};

/**
 * Validation severity levels
 */
const VALIDATION_SEVERITY = {
  CRITICAL: 'critical',    // System cannot function
  ERROR: 'error',          // Feature broken but system works
  WARNING: 'warning',      // Potential issue
  INFO: 'info'            // Informational only
};

/**
 * Session state constants
 */
const SESSION_CONSTANTS = {
  SESSION_DURATION: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  STATE_CHECK_INTERVAL: 5 * 60 * 1000,   // 5 minutes in milliseconds
  SESSION_KEY_PREFIX: 'session_',
  USER_STATE_PREFIX: 'user_state_',
  ROLE_HISTORY_PREFIX: 'role_history_'
};

/**
 * Special role types for filtering
 */
const SPECIAL_ROLE_TYPES = {
  ADMINISTRATOR: 'administrator',
  PEER_EVALUATOR: 'peer_evaluator',
  FULL_ACCESS: 'full_access'
};

/**
 * Names of roles that have special access permissions
 */
const SPECIAL_ROLES = {
  ADMINISTRATOR: 'Administrator',
  PEER_EVALUATOR: 'Peer Evaluator',
  FULL_ACCESS: 'Full Access'
};

const SPECIAL_ACTIONS = {
  VIEW_PROBATIONARY: 'view_probationary',
  VIEW_OWN_STAFF: 'view_own_staff',
  VIEW_ANY: 'view_any',
  FILTER_BY_ROLE: 'filter_by_role',
  FILTER_BY_YEAR: 'filter_by_year',
  FILTER_BY_STAFF: 'filter_by_staff',
  ADMIN_FUNCTIONS: 'admin_functions',
  GENERAL_ACCESS: 'general_access'
};

/**
 * Filter types for special roles
 */
const FILTER_TYPES = {
  ALL_STAFF: 'all',
  PROBATIONARY_ONLY: 'probationary',
  BY_ROLE: 'by_role',
  BY_YEAR: 'by_year',
  BY_STAFF_MEMBER: 'by_staff_member'
};

/**
 * UI text for view mode toggle
 */
const VIEW_MODE_TEXT = {
  FULL: 'View: Full Rubric',
  ASSIGNED: 'View: My Assigned Areas'
};

/**
 * Observation constants
 */
const OBSERVATION_STATUS = {
  DRAFT: 'Draft',
  FINALIZED: 'Finalized'
};

const DRIVE_FOLDER_INFO = {
  ROOT_FOLDER_NAME: 'Danielson Rubric Observations'
};

/**
 * Proficiency level constants
 */
const PROFICIENCY_LEVELS = {
  TITLES: ['Developing', 'Basic', 'Proficient', 'Distinguished'],
  KEYS: ['developing', 'basic', 'proficient', 'distinguished']
};

/**
 * Color constants for PDF styling
 */
const COLORS = {
  WHITE: '#ffffff',
  ROYAL_BLUE: '#3182ce', 
  DARK_GRAY: '#4a5568',
  LIGHT_BLUE_BG: '#dbeafe',
  COMPONENT_HEADER_BG: '#64748b',
  EVIDENCE_HEADER_BG: '#f8fafc',
  DOMAIN_HEADER_BG: '#7c9ac5',
  PROFICIENCY_HEADER_BG: '#e2e8f0',
  PROFICIENCY_TEXT: '#4a5568',
  SELECTED_PROFICIENCY_BG: '#dbeafe',
  SELECTED_PROFICIENCY_TEXT: '#1e40af',
  NOTES_EVIDENCE_HEADER_BG: '#4a5568'
};

/**
 * Script Editor settings
 */
const SCRIPT_EDITOR_SETTINGS = {
  DEBOUNCE_DELAY: 1500, // ms
  TOOLBAR_OPTIONS: [
    ['bold', 'italic', 'underline', 'strike'],
    ['blockquote', 'code-block'],
    [{ 'header': 1 }, { 'header': 2 }],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    [{ 'color': [] }, { 'background': [] }],
    ['clean']
  ],
  UI_STRINGS: {
    SAVING: 'Saving script...',
    SAVED: 'Script saved!',
    ERROR_SAVING: 'Error saving script: ',
    SERVER_ERROR: 'Server error while saving script: ',
    LOAD_ERROR: 'Could not load script: ',
    PDF_UNAVAILABLE: 'PDF export functionality will be available soon.'
  }
};

/**
 * Checks if a value represents a summative year (handles both boolean and string formats from Google Sheets)
 * @param {boolean|string} value The value to check (can be true, 'TRUE', false, 'FALSE', etc.)
 * @returns {boolean} True if the value represents a summative year
 */
function isSummativeYear(value) {
    return value === true || value === 'TRUE';
}
