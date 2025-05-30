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
  
  return sheetId.trim();
}

/**
 * Test function to check if Sheet ID is working
 */
function testSheetAccess() {
  try {
    const sheetId = getSheetId();
    console.log('Testing Sheet ID:', sheetId);
    
    const spreadsheet = SpreadsheetApp.openById(sheetId);
    console.log('Spreadsheet opened successfully:', spreadsheet.getName());
    
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
 * Now with correct best practices cell mapping
 */
function getSheetData() {
  try {
    const sheetId = getSheetId();
    console.log('Using Sheet ID:', sheetId);
    
    const sheet = SpreadsheetApp.openById(sheetId).getSheetByName(SHEET_NAME);
    if (!sheet) {
      throw new Error(`Sheet "${SHEET_NAME}" not found`);
    }
    
    const data = sheet.getDataRange().getValues();
    console.log('Retrieved', data.length, 'rows of data');
    
    const result = {
      title: data[0][0] || "Danielson's Framework for Teaching",
      subtitle: data[1][0] || "Best practices aligned with 5D+ and PELSB lookfors",
      domain: data[2][0] || "Domain 1: Planning and Preparation",
      components: []
    };
    
    // Define the mapping of components to their best practices cells
    // Based on your description: 1a→7B, 1b→10B, 1c→13B, 1d→16B, 1e→19B, 1f→22B
    // In 0-indexed arrays: 1a→[6,1], 1b→[9,1], 1c→[12,1], 1d→[15,1], 1e→[18,1], 1f→[21,1]
    const bestPracticesMap = {
      '1a:': { row: 6, col: 1 },   // Row 7, Column B
      '1b:': { row: 9, col: 1 },   // Row 10, Column B  
      '1c:': { row: 12, col: 1 },  // Row 13, Column B
      '1d:': { row: 15, col: 1 },  // Row 16, Column B
      '1e:': { row: 18, col: 1 },  // Row 19, Column B
      '1f:': { row: 21, col: 1 }   // Row 22, Column B
    };
    
    // Parse components starting from row 5 (index 4)
    let i = 4;
    while (i < data.length) {
      const row = data[i];
      
      // Check if this is a component row (has component title with number and colon)
      if (row[0] && row[0].toString().match(/^\d[a-f]:/)) {
        const componentTitle = row[0].toString().trim();
        console.log(`Processing component: ${componentTitle}`);
        
        const component = {
          title: componentTitle,
          developing: row[1] || '',
          basic: row[2] || '',
          proficient: row[3] || '',
          distinguished: row[4] || '',
          bestPractices: []
        };
        
        // Extract just the component identifier (e.g., "1a:" from "1a: Applying Knowledge...")
        const componentId = componentTitle.substring(0, 3); // Gets "1a:", "1b:", etc.
        console.log(`Component ID extracted: "${componentId}" from "${componentTitle}"`);
        
        // Look up the best practices cell for this component
        const practicesLocation = bestPracticesMap[componentId];
        console.log(`Looking up practices location for "${componentId}":`, practicesLocation);
        
        if (practicesLocation && practicesLocation.row < data.length) {
          const practicesText = data[practicesLocation.row][practicesLocation.col];
          console.log(`Looking for best practices at row ${practicesLocation.row + 1}, column ${practicesLocation.col + 1} (${componentId})`);
          console.log(`Found text: "${practicesText}"`);
          
          if (practicesText && practicesText.toString().trim()) {
            // Split practices by line breaks/paragraphs
            const practices = practicesText.toString().trim()
              .split(/\r?\n|\r/) // Split on line breaks
              .map(practice => practice.trim()) // Clean up whitespace
              .filter(practice => practice.length > 0); // Remove empty lines
            
            component.bestPractices = practices;
            console.log(`Found ${component.bestPractices.length} practices for ${componentId}:`, component.bestPractices);
          } else {
            console.log(`No best practices text found for ${componentId} at expected location`);
          }
        } else {
          console.log(`No mapping found for component ID: "${componentId}"`);
          console.log('Available mapping keys:', Object.keys(bestPracticesMap));
        }
        
        result.components.push(component);
      }
      i++;
    }
    
    console.log('Parsed', result.components.length, 'components');
    result.components.forEach((comp, index) => {
      console.log(`Component ${index + 1}: ${comp.title} - ${comp.bestPractices.length} best practices`);
    });
    
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
  console.log('=== FINAL PARSED DATA ===');
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Debug function to check what components are being found
 */
function debugComponentTitles() {
  try {
    const sheetId = getSheetId();
    const sheet = SpreadsheetApp.openById(sheetId).getSheetByName(SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    
    console.log('=== COMPONENT TITLES FOUND ===');
    let i = 4;
    while (i < data.length) {
      const row = data[i];
      
      if (row[0] && row[0].toString().match(/^\d[a-f]:/)) {
        const componentTitle = row[0].toString().trim();
        const componentId = componentTitle.substring(0, 3);
        console.log(`Row ${i + 1}: Full title: "${componentTitle}"`);
        console.log(`         Component ID: "${componentId}"`);
      }
      i++;
    }
    
  } catch (error) {
    console.error('Error in debugComponentTitles:', error);
  }
}

/**
 * Debug function to check specific cells
 */
function debugBestPracticesCells() {
  try {
    const sheetId = getSheetId();
    const sheet = SpreadsheetApp.openById(sheetId).getSheetByName(SHEET_NAME);
    
    // Check the specific cells mentioned
    const cellsToCheck = [
      { name: '1a', row: 7, col: 2 },  // 7B (1-indexed)
      { name: '1b', row: 10, col: 2 }, // 10B  
      { name: '1c', row: 13, col: 2 }, // 13B
      { name: '1d', row: 16, col: 2 }, // 16B
      { name: '1e', row: 19, col: 2 }, // 19B
      { name: '1f', row: 22, col: 2 }  // 22B
    ];
    
    cellsToCheck.forEach(cell => {
      try {
        const value = sheet.getRange(cell.row, cell.col).getValue();
        console.log(`Cell ${cell.row}${String.fromCharCode(64 + cell.col)} (${cell.name} best practices): "${value}"`);
      } catch (e) {
        console.log(`Error reading cell ${cell.row}${String.fromCharCode(64 + cell.col)}: ${e}`);
      }
    });
    
  } catch (error) {
    console.error('Error in debugBestPracticesCells:', error);
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