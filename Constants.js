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
  TEACHER: 'Teacher'
};

/**
 * Column mappings for the Staff sheet
 */
const STAFF_COLUMNS = {
  NAME: 0,     // Column A: "Name" [LAST, FIRST]
  EMAIL: 1,    // Column B: "Email" [first.last@orono.k12.mn.us]
  ROLE: 2,     // Column C: "Role" 
  YEAR: 3      // Column D: "Year"
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
  'Sp.Ed.'
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
 * Validation patterns for data integrity
 */
const VALIDATION_PATTERNS = {
  EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  COMPONENT_ID: /^[1-4][a-f]:/, // Matches patterns like "1a:", "2b:", etc.
  SUBDOMAIN_PATTERN: /^[1-4][a-f]:/
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
  ROLE_SHEET_MISSING: 'Role-specific sheet not found. Using Teacher rubric as fallback.'
};

/**
 * Cache settings for performance optimization
 */
const CACHE_SETTINGS = {
  USER_DATA_TTL: 300,        // 5 minutes for user data
  ROLE_CONFIG_TTL: 600,      // 10 minutes for role configurations
  SHEET_DATA_TTL: 180,       // 3 minutes for sheet data
  DEFAULT_TTL: 300           // Default cache time
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
 * Default years for observation cycle
 */
const OBSERVATION_YEARS = [1, 2, 3];

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
  VERSION: '2.0.0',
  NAME: 'Danielson Framework Multi-Role System',
  AUTHOR: 'Apps Script Multi-Role Implementation',
  LAST_UPDATED: new Date().toISOString()
};