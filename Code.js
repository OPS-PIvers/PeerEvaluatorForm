/**
 * Google Apps Script Web App for Danielson Framework
 * Reads data from Google Sheet and generates styled HTML
 */

const SHEET_NAME = 'Domain 1: Planning and Preparation';

/**
 * Gets the Sheet ID from Script Properties
 */
function getSheetId() {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!sheetId) {
    throw new Error('SHEET_ID not found in Script Properties. Please set it in the Apps Script editor.');
  }
  
  // Trim whitespace and log for debugging
  const cleanSheetId = sheetId.trim();
  console.log('Retrieved Sheet ID:', cleanSheetId);
  console.log('Sheet ID length:', cleanSheetId.length);
  
  return cleanSheetId;
}

/**
 * Test function to check if Sheet ID is working
 */
function testSheetAccess() {
  try {
    const sheetId = getSheetId();
    console.log('Testing Sheet ID:', sheetId);
    
    // Try to open the spreadsheet
    const spreadsheet = SpreadsheetApp.openById(sheetId);
    console.log('Spreadsheet opened successfully:', spreadsheet.getName());
    
    // Try to get the specific sheet
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    if (sheet) {
      console.log('Sheet found:', SHEET_NAME);
      console.log('Sheet has', sheet.getLastRow(), 'rows');
    } else {
      console.log('Sheet not found:', SHEET_NAME);
      console.log('Available sheets:', spreadsheet.getSheets().map(s => s.getName()));
    }
    
    return 'Success';
  } catch (error) {
    console.error('Error in testSheetAccess:', error);
    return 'Error: ' + error.toString();
  }
}

/**
 * Main function to serve the web app
 */
function doGet(e) {
  try {
    const htmlTemplate = HtmlService.createTemplateFromFile('rubric');
    htmlTemplate.data = getSheetData();
    
    const htmlOutput = htmlTemplate.evaluate()
      .setTitle('Danielson Framework - Domain 1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
    
    return htmlOutput;
  } catch (error) {
    console.error('Error in doGet:', error);
    
    // Return a more detailed error page
    const errorHtml = `
      <html>
        <body>
          <h2>Error Loading Application</h2>
          <p><strong>Error:</strong> ${error.toString()}</p>
          <p>Please check the following:</p>
          <ul>
            <li>Sheet ID is correctly set in Script Properties</li>
            <li>Sheet exists and is accessible</li>
            <li>Sheet name matches exactly: "${SHEET_NAME}"</li>
          </ul>
          <p><a href="#" onclick="window.location.reload()">Try Again</a></p>
        </body>
      </html>
    `;
    return HtmlService.createHtmlOutput(errorHtml);
  }
}

/**
 * Reads and parses data from the Google Sheet
 */
function getSheetData() {
  try {
    const sheetId = getSheetId();
    console.log('Using Sheet ID:', sheetId);
    
    const spreadsheet = SpreadsheetApp.openById(sheetId);
    console.log('Opened spreadsheet:', spreadsheet.getName());
    
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    if (!sheet) {
      const availableSheets = spreadsheet.getSheets().map(s => s.getName());
      throw new Error(`Sheet "${SHEET_NAME}" not found. Available sheets: ${availableSheets.join(', ')}`);
    }
    
    const data = sheet.getDataRange().getValues();
    console.log('Retrieved', data.length, 'rows of data');
    
    const result = {
      title: data[0][0] || "Danielson's Framework for Teaching",
      subtitle: data[1][0] || "Best practices aligned with 5D+ and PELSB lookfors",
      domain: data[2][0] || "Domain 1: Planning and Preparation",
      components: []
    };
    
    // Parse components starting from row 5 (index 4)
    let i = 4;
    while (i < data.length) {
      const row = data[i];
      
      // Check if this is a component row (has component title with number and colon)
      if (row[0] && row[0].toString().match(/^\d[a-f]:/)) {
        const component = {
          title: row[0].toString().trim(), // Clean up any extra whitespace/tabs
          developing: row[1] || '',
          basic: row[2] || '',
          proficient: row[3] || '',
          distinguished: row[4] || '',
          bestPractices: []
        };
        
        // Look for best practices in subsequent rows
        i++; // Move to next row (should be "Best Practices Aligned..." header)
        if (i < data.length && data[i][0] && data[i][0].toString().includes('Best Practices')) {
          i++; // Move to the actual best practices content row
          if (i < data.length && data[i][1]) { // Check column B (index 1)
            const practicesText = data[i][1].toString().trim();
            console.log(`Processing practices for ${component.title}: "${practicesText}"`);
            
            if (practicesText) {
              // Split practices by line breaks/paragraphs
              const practices = practicesText
                .split(/\r?\n|\r/) // Split on line breaks (handles different line ending types)
                .map(practice => practice.trim()) // Clean up whitespace
                .filter(practice => practice.length > 0); // Remove empty lines
              
              component.bestPractices = practices;
              console.log(`Found ${component.bestPractices.length} practices:`, component.bestPractices);
            }
          }
        }
        
        result.components.push(component);
      }
      i++;
    }
    
    console.log('Parsed', result.components.length, 'components');
    return result;
  } catch (error) {
    console.error('Error reading sheet data:', error);
    return {
      title: "Error Loading Data",
      subtitle: "Please check the sheet configuration: " + error.toString(),
      domain: "Domain 1: Planning and Preparation",
      components: []
    };
  }
}

/**
 * Test function to debug data parsing
 */
function testDataParsing() {
  const data = getSheetData();
  console.log(JSON.stringify(data, null, 2));
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