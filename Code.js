/**
 * Google Apps Script Web App for Danielson Framework - All Domains
 * Reads data from a single Google Sheet tab called "Teacher" with all domains
 */

// Domain configurations with their sheet names, ranges and subdomain counts
// All domains are now on a single "Teacher" sheet tab
const DOMAIN_CONFIGS = {
  1: {
    name: 'Domain 1: Planning and Preparation',
    sheetName: 'Teacher',
    startRow: 3,   // 1-indexed - Domain 1 starts at row 3
    endRow: 22,    // 1-indexed - estimated end row (adjust as needed)
    subdomains: ['1a:', '1b:', '1c:', '1d:', '1e:', '1f:']
  },
  2: {
    name: 'Domain 2: The Classroom Environment',
    sheetName: 'Teacher',
    startRow: 23,  // 1-indexed - Domain 2 starts at row 23
    endRow: 39,    // 1-indexed - estimated end row (adjust as needed)
    subdomains: ['2a:', '2b:', '2c:', '2d:', '2e:']
  },
  3: {
    name: 'Domain 3: Instruction',
    sheetName: 'Teacher',
    startRow: 40,  // 1-indexed - Domain 3 starts at row 40
    endRow: 56,    // 1-indexed - estimated end row (adjust as needed)
    subdomains: ['3a:', '3b:', '3c:', '3d:', '3e:']
  },
  4: {
    name: 'Domain 4: Professional Responsibilities',
    sheetName: 'Teacher',
    startRow: 57,  // 1-indexed - Domain 4 starts at row 57
    endRow: 76,    // 1-indexed - estimated end row (adjust as needed)
    subdomains: ['4a:', '4b:', '4c:', '4d:', '4e:', '4f:']
  }
};

/**
 * Gets the Sheet ID from Script Properties
 */
function getSheetId() {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!sheetId) {
    throw new Error('SHEET_ID not found in Script Properties. Please set it in the Apps Script editor.');
  }
  
  return sheetId.trim();
}

/**
 * Test function to check if Sheet ID is working and list all sheets
 */
function testSheetAccess() {
  try {
    const sheetId = getSheetId();
    console.log('Testing Sheet ID:', sheetId);
    
    const spreadsheet = SpreadsheetApp.openById(sheetId);
    console.log('Spreadsheet opened successfully:', spreadsheet.getName());
    
    const sheets = spreadsheet.getSheets();
    console.log('Found', sheets.length, 'sheets:');
    
    sheets.forEach((sheet, index) => {
      console.log(`  ${index + 1}. "${sheet.getName()}" - ${sheet.getLastRow()} rows`);
    });
    
    return 'Success - Found ' + sheets.length + ' sheets';
  } catch (error) {
    console.error('Error in testSheetAccess:', error);
    return 'Error: ' + error.toString();
  }
}

/**
 * Helper function to get a sheet by name
 */
function getSheetByName(spreadsheet, sheetName) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    console.warn(`Sheet "${sheetName}" not found. Available sheets:`, 
      spreadsheet.getSheets().map(s => s.getName()));
    return null;
  }
  return sheet;
}

/**
 * Main function to serve the web app
 */
function doGet(e) {
  try {
    const htmlTemplate = HtmlService.createTemplateFromFile('rubric');
    htmlTemplate.data = getAllDomainsData();
    
    const htmlOutput = htmlTemplate.evaluate()
      .setTitle('Danielson Framework - All Domains')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
    
    return htmlOutput;
  } catch (error) {
    console.error('Error in doGet:', error);
    
    const errorHtml = `
      <html>
        <body>
          <h2>Error Loading Application</h2>
          <p><strong>Error:</strong> ${error.toString()}</p>
          <p>Please check the following:</p>
          <ul>
            <li>Sheet ID is correctly set in Script Properties</li>
            <li>Sheet exists and is accessible</li>
            <li>The "Teacher" sheet tab exists</li>
            <li>All domain ranges are correct</li>
          </ul>
          <p><a href="#" onclick="window.location.reload()">Try Again</a></p>
        </body>
      </html>
    `;
    return HtmlService.createHtmlOutput(errorHtml);
  }
}

/**
 * Reads and parses data from all domains from the single "Teacher" sheet tab
 */
function getAllDomainsData() {
  try {
    const sheetId = getSheetId();
    console.log('Using Sheet ID:', sheetId);
    
    const spreadsheet = SpreadsheetApp.openById(sheetId);
    
    // Get the "Teacher" sheet (single sheet containing all domains)
    const teacherSheet = getSheetByName(spreadsheet, 'Teacher');
    if (!teacherSheet) {
      throw new Error('Teacher sheet not found - please make sure you have a sheet tab named "Teacher"');
    }
    
    const sheetData = teacherSheet.getDataRange().getValues();
    
    const result = {
      title: sheetData[0][0] || "Danielson's Framework for Teaching",
      subtitle: sheetData[1][0] || "Best practices aligned with 5D+ and PELSB lookfors",
      domains: []
    };
    
    // Process each domain from the single "Teacher" sheet
    Object.keys(DOMAIN_CONFIGS).forEach(domainNum => {
      const config = DOMAIN_CONFIGS[domainNum];
      console.log(`Processing ${config.name} from rows ${config.startRow} to ${config.endRow}`);
      
      const domainData = processDomainData(sheetData, parseInt(domainNum), config);
      result.domains.push(domainData);
      console.log(`Successfully processed ${config.name}`);
    });
    
    console.log('Processed', result.domains.length, 'domains from Teacher sheet');
    return result;
    
  } catch (error) {
    console.error('Error reading sheet data:', error);
    return {
      title: "Error Loading Data",
      subtitle: "Please check the sheet configuration: " + error.toString(),
      domains: []
    };
  }
}

/**
 * Process data for a specific domain from the sheet data
 */
function processDomainData(sheetData, domainNumber, config) {
  const domain = {
    number: domainNumber,
    name: config.name,
    components: []
  };
  
  // Create best practices mapping for this domain
  const bestPracticesMap = createBestPracticesMap(domainNumber, config);
  
  // Convert 1-indexed row numbers to 0-indexed for array access
  const startIdx = config.startRow - 1;
  const endIdx = config.endRow - 1;
  
  // Look for components within the domain range
  for (let i = startIdx; i <= endIdx && i < sheetData.length; i++) {
    const row = sheetData[i];
    
    // Check if this row contains a component for this domain
    if (row[0] && row[0].toString().match(new RegExp(`^${domainNumber}[a-f]:`))) {
      const componentTitle = row[0].toString().trim();
      console.log(`Processing component: ${componentTitle} at row ${i + 1}`);
      
      const component = {
        title: componentTitle,
        developing: row[1] || '',
        basic: row[2] || '',
        proficient: row[3] || '',
        distinguished: row[4] || '',
        bestPractices: []
      };
      
      // Extract component identifier (e.g., "1a:", "2b:", etc.)
      const componentId = componentTitle.substring(0, 3);
      console.log(`Component ID extracted: "${componentId}"`);
      
      // Look up best practices for this component
      const practicesLocation = bestPracticesMap[componentId];
      if (practicesLocation && practicesLocation.row < sheetData.length) {
        const practicesText = sheetData[practicesLocation.row][practicesLocation.col];
        console.log(`Looking for best practices at row ${practicesLocation.row + 1}, column ${practicesLocation.col + 1}`);
        
        if (practicesText && practicesText.toString().trim()) {
          const practices = practicesText.toString().trim()
            .split(/\r?\n|\r/)
            .map(practice => practice.trim())
            .filter(practice => practice.length > 0);
          
          component.bestPractices = practices;
          console.log(`Found ${component.bestPractices.length} practices for ${componentId}`);
        }
      }
      
      domain.components.push(component);
    }
  }
  
  console.log(`Domain ${domainNumber}: Found ${domain.components.length} components`);
  return domain;
}

/**
 * Create best practices mapping for a specific domain
 * Based on the pattern: each component's best practices are 4 rows below the component
 * and spaced 3 rows apart
 */
function createBestPracticesMap(domainNumber, config) {
  const map = {};
  const startRowIdx = config.startRow - 1; // Convert to 0-indexed
  
  // Calculate component positions based on domain structure
  // Assuming components start at the domain start row
  let componentRowIdx = startRowIdx;
  
  config.subdomains.forEach((subdomain, index) => {
    // Best practices are 4 rows after the component row
    const bestPracticesRowIdx = componentRowIdx + 4;
    
    map[subdomain] = {
      row: bestPracticesRowIdx,
      col: 1 // Column B (0-indexed)
    };
    
    console.log(`Mapping ${subdomain} -> row ${bestPracticesRowIdx + 1}, col B`);
    
    // Move to next component (typically 3 rows apart)
    componentRowIdx += 3;
  });
  
  return map;
}

/**
 * Test function to debug all domains data parsing
 */
function testAllDomainsDataParsing() {
  const data = getAllDomainsData();
  console.log('=== ALL DOMAINS PARSED DATA ===');
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Debug function to check component mapping for all domains
 */
function debugAllDomainComponents() {
  try {
    const sheetId = getSheetId();
    const spreadsheet = SpreadsheetApp.openById(sheetId);
    
    const teacherSheet = getSheetByName(spreadsheet, 'Teacher');
    if (!teacherSheet) {
      console.log('Teacher sheet not found!');
      return;
    }
    
    const sheetData = teacherSheet.getDataRange().getValues();
    
    Object.keys(DOMAIN_CONFIGS).forEach(domainNum => {
      const config = DOMAIN_CONFIGS[domainNum];
      console.log(`\n=== ${config.name} (Rows ${config.startRow}-${config.endRow}) ===`);
      
      const startIdx = config.startRow - 1;
      const endIdx = config.endRow - 1;
      
      for (let i = startIdx; i <= endIdx && i < sheetData.length; i++) {
        const row = sheetData[i];
        
        if (row[0] && row[0].toString().match(new RegExp(`^${domainNum}[a-f]:`))) {
          const componentTitle = row[0].toString().trim();
          console.log(`Row ${i + 1}: ${componentTitle}`);
        }
      }
    });
    
  } catch (error) {
    console.error('Error in debugAllDomainComponents:', error);
  }
}

/**
 * Debug function to check best practices cells for all domains
 */
function debugAllBestPracticesCells() {
  try {
    const sheetId = getSheetId();
    const spreadsheet = SpreadsheetApp.openById(sheetId);
    
    const teacherSheet = getSheetByName(spreadsheet, 'Teacher');
    if (!teacherSheet) {
      console.log('Teacher sheet not found!');
      return;
    }
    
    Object.keys(DOMAIN_CONFIGS).forEach(domainNum => {
      const config = DOMAIN_CONFIGS[domainNum];
      const bestPracticesMap = createBestPracticesMap(parseInt(domainNum), config);
      
      console.log(`\n=== ${config.name} Best Practices ===`);
      
      Object.keys(bestPracticesMap).forEach(componentId => {
        const location = bestPracticesMap[componentId];
        try {
          const value = teacherSheet.getRange(location.row + 1, location.col + 1).getValue();
          console.log(`${componentId} at ${location.row + 1}${String.fromCharCode(65 + location.col)}: "${value}"`);
        } catch (e) {
          console.log(`Error reading ${componentId}: ${e}`);
        }
      });
    });
    
  } catch (error) {
    console.error('Error in debugAllBestPracticesCells:', error);
  }
}

/**
 * Helper function to check Script Properties
 */
function checkScriptProperties() {
  const properties = PropertiesService.getScriptProperties().getProperties();
  console.log('All Script Properties:', properties);
  
  const sheetId = properties.SHEET_ID;
  if (sheetId) {
    console.log('SHEET_ID found:', sheetId);
    console.log('SHEET_ID length:', sheetId.length);
    console.log('SHEET_ID trimmed:', sheetId.trim());
  } else {
    console.log('SHEET_ID not found in properties');
  }
}

/**
 * Function to help verify the expected sheet structure
 */
function listExpectedSheetStructure() {
  console.log('Expected single sheet structure:');
  console.log('Sheet name: "Teacher"');
  console.log('\nDomain ranges in the Teacher sheet:');
  
  Object.keys(DOMAIN_CONFIGS).forEach(domainNum => {
    const config = DOMAIN_CONFIGS[domainNum];
    console.log(`${config.name}: Rows ${config.startRow}-${config.endRow}`);
  });
  
  // Also list actual sheets for comparison
  try {
    const sheetId = getSheetId();
    const spreadsheet = SpreadsheetApp.openById(sheetId);
    const sheets = spreadsheet.getSheets();
    
    console.log('\nActual sheets in spreadsheet:');
    sheets.forEach((sheet, index) => {
      console.log(`${index + 1}. "${sheet.getName()}" - ${sheet.getLastRow()} rows`);
    });
  } catch (error) {
    console.error('Error accessing spreadsheet:', error);
  }
}