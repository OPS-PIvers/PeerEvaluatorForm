/**
 * PdfService.js
 * Handles all PDF generation, styling, and Google Drive saving operations
 * for the Danielson Framework Multi-Role System.
 */

const PdfService = (function() {
  'use strict';

  /**
   * Regenerates the PDF for a finalized observation.
   * @param {string} observationId The ID of the observation to regenerate PDF for.
   * @returns {Object} A response object with success status and PDF URL.
   */
  function regenerateObservationPdf(observationId) {
      try {
          setupObservationSheet();
          const userContext = createUserContext();
          if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR) {
              return { success: false, error: ERROR_MESSAGES.PERMISSION_DENIED };
          }

          const observation = getObservationById(observationId);
          if (!observation) {
              return { success: false, error: 'Observation not found.' };
          }
          if (observation.observerEmail !== userContext.email) {
              return { success: false, error: 'Permission denied. You did not create this observation.' };
          }
          if (observation.status !== OBSERVATION_STATUS.FINALIZED) {
              return { success: false, error: 'PDF can only be regenerated for finalized observations.' };
          }

          debugLog('Starting PDF regeneration', { observationId, requestedBy: userContext.email });

          const pdfResult = _generateAndSavePdf(observationId, userContext);
          const pdfStatus = pdfResult.success ? 'generated' : 'failed';

          const updateResult = _updatePdfStatusInSheet(observationId, pdfStatus, pdfResult.pdfUrl);
          if (!updateResult.success) {
              console.error(`Failed to update PDF status in sheet during regeneration: ${updateResult.error}`);
              debugLog('PDF status update failed during regeneration', { observationId, error: updateResult.error });
          }

          if (pdfResult.success) {
              debugLog('PDF successfully regenerated', { observationId, pdfUrl: pdfResult.pdfUrl });
              return { success: true, pdfUrl: pdfResult.pdfUrl };
          } else {
              debugLog('PDF regeneration failed', { observationId, error: pdfResult.error });
              return { success: false, error: pdfResult.error };
          }
      } catch (error) {
          console.error(`Error regenerating PDF for observation ${observationId}:`, error);
          return { success: false, error: 'An unexpected error occurred while regenerating the PDF.' };
      }
  }

  /**
   * Generates and saves a PDF for an observation to Google Drive.
   * This is a private helper function.
   * @param {string} observationId The ID of the observation to export.
   * @param {object} userContext The user context object.
   * @returns {Object} A response object with success status and PDF URL.
   * @private
   */
  function _updatePdfStatusInSheet(observationId, pdfStatus, pdfUrl = null) {
      debugLog('Starting PDF status update in sheet', { observationId, pdfStatus, pdfUrl: pdfUrl ? 'provided' : 'null' });

      try {
          const spreadsheet = openSpreadsheet();
          const sheet = getSheetByName(spreadsheet, SHEET_NAMES.OBSERVATION_DATA);
          if (!sheet) {
              console.error(`Sheet '${SHEET_NAMES.OBSERVATION_DATA}' not found. Cannot update PDF status.`);
              return { success: false, error: 'Observation sheet not found' };
          }

          const row = findObservationRow(sheet, observationId);
          if (row === -1) {
              console.error(`Observation ${observationId} not found. Cannot update PDF status.`);
              return { success: false, error: 'Observation not found in sheet' };
          }

          const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
          const pdfStatusCol = headers.indexOf('pdfStatus') + 1;
          const pdfUrlCol = headers.indexOf('pdfUrl') + 1;
          const lastModifiedCol = headers.indexOf('lastModifiedAt') + 1;

          debugLog('PDF column positions found', {
              observationId,
              pdfStatusCol: pdfStatusCol > 0 ? pdfStatusCol : 'MISSING',
              pdfUrlCol: pdfUrlCol > 0 ? pdfUrlCol : 'MISSING',
              lastModifiedCol: lastModifiedCol > 0 ? lastModifiedCol : 'available'
          });

          // Check if required columns exist
          if (pdfStatusCol === 0) {
              console.error('pdfStatus column not found in observation sheet');
              return { success: false, error: 'pdfStatus column missing from sheet' };
          }
          if (pdfUrl && pdfUrlCol === 0) {
              console.error('pdfUrl column not found in observation sheet');
              return { success: false, error: 'pdfUrl column missing from sheet' };
          }

          // Update the columns
          let updatesCount = 0;
          if (pdfStatusCol > 0) {
              sheet.getRange(row, pdfStatusCol).setValue(pdfStatus);
              updatesCount++;
          }
          if (pdfUrl && pdfUrlCol > 0) {
              sheet.getRange(row, pdfUrlCol).setValue(pdfUrl);
              updatesCount++;
          }
          if (lastModifiedCol > 0) {
              sheet.getRange(row, lastModifiedCol).setValue(new Date().toISOString());
              updatesCount++;
          }

          SpreadsheetApp.flush();
          debugLog('PDF status update completed successfully', { observationId, updatesCount });

          // Manually clear the observation cache since we updated the sheet directly
          const cache = CacheService.getScriptCache();
          if (cache) {
              cache.remove('all_observations');
              debugLog('Cleared all_observations cache after PDF status update.', { observationId });
          }

          return { success: true, updatesCount };
      } catch (error) {
          console.error(`Error updating PDF status for observation ${observationId}:`, error);
          return { success: false, error: error.message };
      }
  }

  function _generateAndSavePdf(observationId, userContext) {
      debugLog('Starting PDF generation', { observationId });

      try {
          const observation = getObservationById(observationId);
          if (!observation) {
              debugLog('PDF generation failed: Observation not found', { observationId });
              return { success: false, error: 'Observation not found for PDF generation.' };
          }

          debugLog('Retrieved observation for PDF', { observationId, observedName: observation.observedName });

          const assignedSubdomains = getAssignedSubdomainsForRoleYear(observation.observedRole, observation.observedYear);
          debugLog('Retrieved assigned subdomains', { observationId, subdomainCount: assignedSubdomains ? assignedSubdomains.length : 'null' });

          const rubricData = getAllDomainsData(observation.observedRole, observation.observedYear, 'full', assignedSubdomains);

          if (rubricData.isError) {
              debugLog('PDF generation failed: Rubric data error', { observationId, error: rubricData.errorMessage });
              return { success: false, error: `Failed to load rubric data for PDF: ${rubricData.errorMessage}` };
          }

          debugLog('Retrieved rubric data for PDF', { observationId, domainCount: rubricData.domains ? rubricData.domains.length : 'null' });

          const docName = `Observation for ${observation.observedName} - ${new Date(observation.finalizedAt || Date.now()).toISOString().slice(0, 10)}`;

          // Generate PDF using DocumentApp for proper styling
          let pdfBlob;
          try {
              pdfBlob = _createStyledPdfDocument(observation, rubricData, docName);
              debugLog('Successfully generated styled PDF document', { observationId, blobSize: pdfBlob.getBytes().length });
          } catch (documentError) {
              debugLog('PDF generation failed: Document creation error', { observationId, error: documentError.message });
              return { success: false, error: `Failed to generate styled PDF: ${documentError.message}` };
          }

          // Create folder structure
          try {
              const obsFolder = getOrCreateObservationFolder(observationId);
              debugLog('Retrieved/created observation folder', { observationId, obsFolderId: obsFolder.getId() });

              // Use the already created styled PDF blob
              const pdfFile = obsFolder.createFile(pdfBlob).setName(docName + ".pdf");

              // PDF sharing will be handled at the folder level during finalization
              // Individual file permissions are not set here

              // Get file ID and construct direct view URL for better compatibility
              const fileId = pdfFile.getId();
              const originalUrl = pdfFile.getUrl();
              const directViewUrl = `https://drive.google.com/file/d/${fileId}/view`;

              debugLog('Successfully created PDF file (sharing handled at folder level)', {
                  observationId,
                  fileId: fileId,
                  originalUrl: originalUrl,
                  directViewUrl: directViewUrl
              });

              return { success: true, pdfUrl: directViewUrl };

          } catch (driveError) {
              debugLog('PDF generation failed: Drive error', { observationId, error: driveError.message });
              return { success: false, error: `Failed to save PDF to Drive: ${driveError.message}` };
          }

      } catch (error) {
          console.error(`Error generating PDF for observation ${observationId}:`, error);
          debugLog('PDF generation failed: Unexpected error', { observationId, error: error.message, stack: error.stack });
          return { success: false, error: 'An unexpected error occurred during PDF generation: ' + error.message };
      }
  }

  /**
   * Creates a styled PDF document using DocumentApp for proper color and formatting preservation.
   * @param {Object} observation The observation data
   * @param {Object} rubricData The rubric structure and content
   * @param {string} docName The document name
   * @returns {Blob} PDF blob for the styled document
   */
  function _createStyledPdfDocument(observation, rubricData, docName) {
      // Create a new Google Document
      const doc = DocumentApp.create(docName);
      const docId = doc.getId();
      const body = doc.getBody();

      // Clear any default content
      body.clear();

      // Add document header
      _addDocumentHeader(body, observation);

      // Track merge operations needed
      const mergeOperations = [];

      // Add rubric content and collect merge operations
      _addRubricContentWithMergeTracking(body, observation, rubricData, mergeOperations);

      // Save before applying merges
      doc.saveAndClose();

      // Apply all cell merges using Google Docs API
      if (mergeOperations.length > 0) {
          _applyTableCellMerges(docId, mergeOperations);
      }

      // Convert to PDF
      const docFile = DriveApp.getFileById(docId);
      const pdfBlob = docFile.getBlob().getAs('application/pdf');

      // Clean up - delete the temporary Google Doc
      DriveApp.getFileById(docId).setTrashed(true);

      return pdfBlob;
  }

  /**
   * Applies table cell merges using the Google Docs API
   * @param {string} docId The document ID
   * @param {Array} mergeOperations Array of merge operation objects
   */
  function _applyTableCellMerges(docId, mergeOperations) {
      if (!mergeOperations || mergeOperations.length === 0) {
          return;
      }

      try {
          // Get the document structure to find the actual table start locations
          const doc = Docs.Documents.get(docId);
          const tables = [];

          // Find all tables in the document
          function findTables(elements) {
              elements.forEach(element => {
                  if (element.table) {
                      tables.push({
                          startIndex: element.startIndex,
                          endIndex: element.endIndex,
                          table: element.table
                      });
                  } else if (element.paragraph && element.paragraph.elements) {
                      findTables(element.paragraph.elements);
                  }
              });
          }

          findTables(doc.body.content);

          if (tables.length === 0) {
              console.warn('No tables found in document for merging');
              return;
          }

          // Use the first table (our rubric table) for all merge operations
          const mainTable = tables[0];

          const requests = mergeOperations.map(operation => ({
              mergeTableCells: {
                  tableRange: {
                      columnSpan: operation.columnSpan,
                      rowSpan: operation.rowSpan || 1,
                      tableCellLocation: {
                          tableStartLocation: { index: mainTable.startIndex },
                          rowIndex: operation.rowIndex,
                          columnIndex: operation.columnIndex
                      }
                  }
              }
          }));

          Docs.Documents.batchUpdate({
              requests: requests
          }, docId);

          debugLog('Applied table cell merges', { docId, mergeCount: requests.length, tableStartIndex: mainTable.startIndex });

      } catch (error) {
          console.error('Failed to apply table cell merges:', error);
          debugLog('Table cell merge failed', { docId, error: error.message, mergeOperations });
          // Don't throw error - continue with unmerged cells rather than failing PDF generation
      }
  }

  /**
   * Adds the document header with observation details.
   * @param {Body} body The document body
   * @param {Object} observation The observation data
   */
  function _addDocumentHeader(body, observation) {
      // Title
      const title = body.appendParagraph(`Observation Report for ${observation.observedName}`);
      title.setHeading(DocumentApp.ParagraphHeading.HEADING1);
      title.getChild(0).asText().setFontSize(18).setBold(true).setForegroundColor('#2d3748');

      // Observation details
      const details = body.appendParagraph(
          `Role: ${observation.observedRole} | Year: ${observation.observedYear || 'N/A'}\n` +
          `Observer: ${observation.observerEmail}\n` +
          `Finalized on: ${observation.finalizedAt ? new Date(observation.finalizedAt).toLocaleString() : 'N/A'}`
      );
      details.getChild(0).asText().setFontSize(11).setForegroundColor('#4a5568');

      // Add Global Media section if any script PDF or recordings exist
      const hasScriptPdf = observation.scriptPdfUrl;
      const hasAudioRecordings = observation.globalRecordings && observation.globalRecordings.audio && observation.globalRecordings.audio.length > 0;
      const hasVideoRecordings = observation.globalRecordings && observation.globalRecordings.video && observation.globalRecordings.video.length > 0;

      if (hasScriptPdf || hasAudioRecordings || hasVideoRecordings) {
          body.appendParagraph(''); // Empty line
          
          const mediaHeader = body.appendParagraph('Global Media & Documentation');
          mediaHeader.setHeading(DocumentApp.ParagraphHeading.HEADING2);
          mediaHeader.getChild(0).asText().setFontSize(14).setBold(true).setForegroundColor('#2d3748');

          // Script PDF link
          if (hasScriptPdf) {
              const scriptParagraph = body.appendParagraph(`📝 Observation Script Document: ${observation.scriptPdfUrl}`);
              scriptParagraph.getChild(0).asText().setFontSize(11).setForegroundColor('#2563eb');
              scriptParagraph.setLinkUrl(observation.scriptPdfUrl);
          }

          // Audio recordings
          if (hasAudioRecordings) {
              observation.globalRecordings.audio.forEach((recording, index) => {
                  const audioParagraph = body.appendParagraph(`🎤 Audio Recording ${index + 1}: ${recording.url}`);
                  audioParagraph.getChild(0).asText().setFontSize(11).setForegroundColor('#059669');
                  audioParagraph.setLinkUrl(recording.url);
              });
          }

          // Video recordings
          if (hasVideoRecordings) {
              observation.globalRecordings.video.forEach((recording, index) => {
                  const videoParagraph = body.appendParagraph(`📹 Video Recording ${index + 1}: ${recording.url}`);
                  videoParagraph.getChild(0).asText().setFontSize(11).setForegroundColor('#dc2626');
                  videoParagraph.setLinkUrl(recording.url);
              });
          }

          body.appendParagraph(''); // Empty line after media section
      }

      // Add some spacing
      body.appendParagraph('').setSpacingAfter(10);
  }

  /**
   * Adds the rubric content by creating a single table for all observed components.
   * @param {DocumentApp.Body} body The document body.
   * @param {Object} observation The observation data.
   * @param {Object} rubricData The rubric structure and content.
   */
  function _addRubricContent(body, observation, rubricData) {
      const observedComponents = [];
      rubricData.domains.forEach(domain => {
          if (domain.components) {
              domain.components.forEach(component => {
                  // Handle both new unified structure and old separate structure for backward compatibility
                  let proficiency = null;
                  let componentData = null;

                  // Try new unified structure first
                  if (observation.observationData && observation.observationData[component.componentId]) {
                      componentData = observation.observationData[component.componentId];
                      proficiency = componentData.proficiency;
                  }
                  // Fallback to old structure if new structure doesn't have proficiency
                  else if (typeof observation.observationData?.[component.componentId] === 'string') {
                      proficiency = observation.observationData[component.componentId];
                  }

                  if (proficiency) {
                      observedComponents.push({
                          component: component,
                          domainName: domain.name,
                          proficiency: proficiency,
                          componentData: componentData // Pass the full component data for use in rendering
                      });
                  }
              });
          }
      });

      if (observedComponents.length === 0) {
          return;
      }

      const table = body.appendTable();
      table.setBorderWidth(0);

      observedComponents.forEach((item, index) => {
          _addObservationComponentRows(table, item.component, item.domainName, observation, item.proficiency, item.componentData);
          if (index < observedComponents.length - 1) {
              const spacerRow = table.appendTableRow();
              const spacerCell = spacerRow.appendTableCell('');
              const style = {};
              style[DocumentApp.Attribute.BORDER_WIDTH] = 0;
              spacerCell.setAttributes(style);
              spacerCell.setPaddingTop(12);
          }
      });
  }

  /**
   * Adds the rubric content by creating a single table for all observed components,
   * tracking merge operations for later application via Google Docs API.
   * @param {DocumentApp.Body} body The document body.
   * @param {Object} observation The observation data.
   * @param {Object} rubricData The rubric structure and content.
   * @param {Array} mergeOperations Array to collect merge operations that need to be applied.
   */
  function _addRubricContentWithMergeTracking(body, observation, rubricData, mergeOperations) {
      const observedComponents = [];
      rubricData.domains.forEach(domain => {
          if (domain.components) {
              domain.components.forEach(component => {
                  // Handle both new unified structure and old separate structure for backward compatibility
                  let proficiency = null;
                  let componentData = null;

                  // Try new unified structure first
                  if (observation.observationData && observation.observationData[component.componentId]) {
                      componentData = observation.observationData[component.componentId];
                      proficiency = componentData.proficiency;
                  }
                  // Fallback to old structure if new structure doesn't have proficiency
                  else if (typeof observation.observationData?.[component.componentId] === 'string') {
                      proficiency = observation.observationData[component.componentId];
                  }

                  if (proficiency) {
                      observedComponents.push({
                          component: component,
                          domainName: domain.name,
                          proficiency: proficiency,
                          componentData: componentData // Pass the full component data for use in rendering
                      });
                  }
              });
          }
      });

      if (observedComponents.length === 0) {
          return;
      }

      const table = body.appendTable();
      table.setBorderWidth(0);

      // Get the table start index for merge operations - need to find the actual character index
      const bodyElements = body.getNumChildren();
      let tableStartIndex = 0;
      for (let i = 0; i < bodyElements; i++) {
          const element = body.getChild(i);
          if (element === table) {
              // For Google Docs API, we need the character index, not element index
              // This is a rough approximation - the exact index will be calculated during merge
              tableStartIndex = i * 10; // Placeholder - will be refined in merge function
              break;
          }
      }

      observedComponents.forEach((item, index) => {
          // Calculate current row index before adding component rows
          const currentRowIndex = table.getNumRows();

          _addObservationComponentRowsWithMergeTracking(
              table,
              item.component,
              item.domainName,
              observation,
              item.proficiency,
              item.componentData,
              mergeOperations,
              tableStartIndex,
              currentRowIndex
          );

          if (index < observedComponents.length - 1) {
              const spacerRow = table.appendTableRow();
              const spacerCell = spacerRow.appendTableCell('');
              const style = {};
              style[DocumentApp.Attribute.BORDER_WIDTH] = 0;
              spacerCell.setAttributes(style);
              spacerCell.setPaddingTop(12);
          }
      });
  }

  /**
   * Adds a set of rows to the main report table for a single observed component.
   * @param {DocumentApp.Table} table The main report table.
   * @param {Object} component The component data.
   * @param {string} domainName The name of the parent domain.
   * @param {Object} observation The observation data.
   * @param {string} proficiency The selected proficiency level.
   * @param {Object} componentData The component-specific data from the unified structure (may be null for old structure).
   */
  function _addObservationComponentRows(table, component, domainName, observation, proficiency, componentData) {
      // Legacy function - now redirects to new merge tracking version
      const mergeOperations = [];
      const tableStartIndex = 0; // Will be ignored since we're not using merge operations here
      const currentRowIndex = table.getNumRows();

      _addObservationComponentRowsWithMergeTracking(
          table, component, domainName, observation, proficiency, componentData,
          mergeOperations, tableStartIndex, currentRowIndex
      );
  }

  /**
   * Adds a set of rows to the main report table for a single observed component,
   * tracking merge operations for later application via Google Docs API.
   * @param {DocumentApp.Table} table The main report table.
   * @param {Object} component The component data.
   * @param {string} domainName The name of the parent domain.
   * @param {Object} observation The observation data.
   * @param {string} proficiency The selected proficiency level.
   * @param {Object} componentData The component-specific data from the unified structure (may be null for old structure).
   * @param {Array} mergeOperations Array to collect merge operations that need to be applied.
   * @param {number} tableStartIndex The start index of the table in the document.
   * @param {number} baseRowIndex The base row index for this component within the table.
   */
  function _addObservationComponentRowsWithMergeTracking(table, component, domainName, observation, proficiency, componentData, mergeOperations, tableStartIndex, baseRowIndex) {
      // Calculate equal column widths (total 500px divided by 4 columns)
      const COLUMN_WIDTH = 125;

      /**
       * Creates a row with 4 cells and tracks a merge operation for later application
       */
      const createRowForMerging = (text, backgroundColor, fontSize = 12) => {
          const row = table.appendTableRow();
          const cells = [];

          // Create 4 cells
          for (let i = 0; i < 4; i++) {
              const cell = row.appendTableCell(i === 0 ? text : '');
              cell.setWidth(COLUMN_WIDTH);
              cells.push(cell);
          }

          // Style the first cell (which will become the merged cell)
          const primaryCell = cells[0];
          const style = {
              [DocumentApp.Attribute.BACKGROUND_COLOR]: backgroundColor,
              [DocumentApp.Attribute.FOREGROUND_COLOR]: COLORS.WHITE,
              [DocumentApp.Attribute.BOLD]: true,
              [DocumentApp.Attribute.FONT_SIZE]: fontSize
          };
          primaryCell.setAttributes(style);
          primaryCell.setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(12).setPaddingRight(12);

          // Track merge operation for this row
          const currentRowIndex = table.getNumRows() - 1;
          mergeOperations.push({
              tableStartIndex: tableStartIndex,
              rowIndex: currentRowIndex,
              columnIndex: 0,
              columnSpan: 4,
              rowSpan: 1
          });

          return primaryCell;
      };

      // Row 1: Domain header (to be merged)
      const domainCell = createRowForMerging(domainName, COLORS.DOMAIN_HEADER_BG);

      // Row 2: Subdomain header (to be merged)
      const subdomainCell = createRowForMerging(component.title, COLORS.COMPONENT_HEADER_BG, 11);

      // Row 3: Proficiency Titles (4 separate cells - no merge)
      const titlesRow = table.appendTableRow();
      PROFICIENCY_LEVELS.TITLES.forEach(level => {
          const cell = titlesRow.appendTableCell(level);
          cell.setWidth(COLUMN_WIDTH);
          cell.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
          cell.setBackgroundColor(COLORS.PROFICIENCY_HEADER_BG);
          cell.setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(6).setPaddingRight(6);

          const style = {};
          style[DocumentApp.Attribute.BOLD] = true;
          style[DocumentApp.Attribute.FONT_SIZE] = 10;
          style[DocumentApp.Attribute.FOREGROUND_COLOR] = COLORS.PROFICIENCY_TEXT;
          cell.setAttributes(style);
      });

      // Row 4: Proficiency Descriptions (4 separate cells - no merge)
      const descriptionsRow = table.appendTableRow();
      PROFICIENCY_LEVELS.KEYS.forEach(key => {
          const cell = descriptionsRow.appendTableCell(component[key] || '');
          cell.setWidth(COLUMN_WIDTH);
          cell.setPaddingTop(12).setPaddingBottom(12).setPaddingLeft(8).setPaddingRight(8);

          const style = {};
          style[DocumentApp.Attribute.FONT_SIZE] = 9;

          // Highlight the selected proficiency level
          if (proficiency === key) {
              style[DocumentApp.Attribute.BACKGROUND_COLOR] = COLORS.SELECTED_PROFICIENCY_BG;
              style[DocumentApp.Attribute.FOREGROUND_COLOR] = COLORS.SELECTED_PROFICIENCY_TEXT;
              style[DocumentApp.Attribute.BOLD] = true;
          } else {
              style[DocumentApp.Attribute.FOREGROUND_COLOR] = COLORS.PROFICIENCY_TEXT;
          }
          cell.setAttributes(style);
      });

      // Row 5: Best Practices Header (to be merged)
      const bestPracticesHeaderCell = createRowForMerging('Best Practices aligned with 5D+ and PELSB Standards', COLORS.ROYAL_BLUE, 10);

      // Row 6: Look-fors Content (to be merged)
      const lookforsRow = table.appendTableRow();
      const lookforsCells = [];
      for (let i = 0; i < 4; i++) {
          const cell = lookforsRow.appendTableCell('');
          cell.setWidth(COLUMN_WIDTH);
          lookforsCells.push(cell);
      }

      // Style the look-fors cell and populate content
      const lookforsCell = lookforsCells[0];
      lookforsCell.setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(20).setPaddingRight(12);

      // Track merge operation for look-fors row
      const lookforsRowIndex = table.getNumRows() - 1;
      mergeOperations.push({
          tableStartIndex: tableStartIndex,
          rowIndex: lookforsRowIndex,
          columnIndex: 0,
          columnSpan: 4,
          rowSpan: 1
      });

      // Extract look-fors from unified observationData structure
      let checkedLookFors = [];
      if (componentData && componentData.lookfors) {
          checkedLookFors = componentData.lookfors;
      }

      // Remove the default empty paragraph and add content properly
      const lookforsDefaultParagraph = lookforsCell.getChild(0).asParagraph();

      if (checkedLookFors.length > 0) {
          // Remove the default paragraph to avoid mixing paragraph/list formatting
          lookforsDefaultParagraph.removeFromParent();
          
          // Add all look-fors as consistent paragraphs with manual bullets
          checkedLookFors.forEach(lookfor => {
              const paragraph = lookforsCell.appendParagraph(`• ${lookfor}`);
              paragraph.setSpacingBefore(0).setSpacingAfter(0).setLineSpacing(1);
          });
      } else {
          lookforsDefaultParagraph.setText('No best practices selected.');
          lookforsDefaultParagraph.setItalic(true);
          lookforsDefaultParagraph.setSpacingBefore(0).setSpacingAfter(0).setLineSpacing(1);
      }

      // Row 7: Notes & Evidence Header (to be merged)
      const notesHeaderCell = createRowForMerging('Notes & Evidence', COLORS.NOTES_EVIDENCE_HEADER_BG, 10);

      // Row 8: Notes and Evidence Content (to be merged)
      const notesRow = table.appendTableRow();
      const notesCells = [];
      for (let i = 0; i < 4; i++) {
          const cell = notesRow.appendTableCell('');
          cell.setWidth(COLUMN_WIDTH);
          notesCells.push(cell);
      }

      // Style the notes cell and populate content
      const notesAndEvidenceCell = notesCells[0];
      notesAndEvidenceCell.setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(12).setPaddingRight(12);

      // Track merge operation for notes row
      const notesRowIndex = table.getNumRows() - 1;
      mergeOperations.push({
          tableStartIndex: tableStartIndex,
          rowIndex: notesRowIndex,
          columnIndex: 0,
          columnSpan: 4,
          rowSpan: 1
      });

      // Handle both new unified structure and old separate structure for notes and evidence
      let notes = null;
      let evidence = null;

      if (componentData && componentData.notes) {
          notes = componentData.notes;
      } else if (observation.observationNotes?.[component.componentId]) {
          notes = observation.observationNotes[component.componentId];
      }

      if (componentData && componentData.evidence) {
          evidence = componentData.evidence;
      } else if (observation.evidenceLinks?.[component.componentId]) {
          evidence = observation.evidenceLinks[component.componentId];
      }

      // Use the default paragraph for the first content, then append additional content
      const notesDefaultParagraph = notesAndEvidenceCell.getChild(0).asParagraph();
      notesDefaultParagraph.setSpacingBefore(0).setSpacingAfter(0).setLineSpacing(1);

      let hasContent = false;

      if (notes) {
          // Use the default paragraph for notes header, then add content
          notesDefaultParagraph.setText('Observation Notes:');
          notesDefaultParagraph.setBold(true);
          addHtmlContentToDoc(notesAndEvidenceCell, notes);
          hasContent = true;
      }

      if (evidence && evidence.length > 0) {
          if (notes) {
              // Add spacing between notes and evidence
              const spacerPara = notesAndEvidenceCell.appendParagraph('');
              spacerPara.setSpacingBefore(0).setSpacingAfter(0).setSpacingBefore(10);
          } else {
              // Use default paragraph for evidence header
              notesDefaultParagraph.setText('Evidence:');
              notesDefaultParagraph.setBold(true);
          }
          _addEvidenceSection(notesAndEvidenceCell, evidence);
          hasContent = true;
      }

      if (!hasContent) {
          notesDefaultParagraph.setText('No notes or evidence provided.');
          notesDefaultParagraph.setItalic(true);
      }
  }


  /**
   * Adds a best practices section with royal blue styling.
   * @param {Body} body The document body
   * @param {Array} bestPractices Array of best practice strings
   */
  function _addBestPracticesSection(body, bestPractices) {
      const practicesHeader = body.appendParagraph('Best Practices aligned with 5D+ and PELSB Standards');
      practicesHeader.getChild(0).asText()
          .setFontSize(10)
          .setBold(true)
          .setForegroundColor('#ffffff')
          .setBackgroundColor('#3182ce');
      practicesHeader.setSpacingBefore(5).setSpacingAfter(3);

      bestPractices.forEach(practice => {
          const practiceItem = body.appendParagraph(`• ${practice}`);
          practiceItem.getChild(0).asText().setFontSize(9).setForegroundColor('#4a5568');
          practiceItem.setIndentFirstLine(20).setSpacingAfter(2);
          practiceItem.setBackgroundColor('#f8fafc');
      });
  }

  /**
   * Adds an evidence section to a container element (Body or TableCell).
   * @param {DocumentApp.ContainerElement} container The container to add the evidence to.
   * @param {Array} evidence Array of evidence objects
   */
  function _addEvidenceSection(container, evidence) {
      const evidenceHeader = container.appendParagraph('Evidence:');
      evidenceHeader.setBold(true);
      evidenceHeader.setSpacingBefore(0).setSpacingAfter(0).setLineSpacing(1);

      evidence.forEach(item => {
          // Create the paragraph with the bullet point and item name.
          const evidenceItem = container.appendParagraph(`• ${item.name}`);
          const textElement = evidenceItem.getChild(0).asText();

          // Style the text.
          textElement.setFontSize(9).setForegroundColor(COLORS.ROYAL_BLUE);

          // Apply paragraph styling with consistent spacing
          evidenceItem.setIndentFirstLine(20);
          evidenceItem.setSpacingBefore(0).setSpacingAfter(0).setLineSpacing(1);

          // If a URL exists, make the item name a clickable hyperlink.
          if (item.url) {
              // The link should cover the item name, regardless of bullet or prefix.
              const text = textElement.getText();
              const nameStart = text.indexOf(item.name);
              if (nameStart !== -1) {
                  textElement.setLinkUrl(nameStart, nameStart + item.name.length - 1, item.url);
              }
          }
      });
  }

  function processPdfForFinalization(observationId, userContext) {
    const pdfResult = _generateAndSavePdf(observationId, userContext);
    const pdfStatus = pdfResult.success ? 'generated' : 'failed';
    const updateResult = _updatePdfStatusInSheet(observationId, pdfStatus, pdfResult.pdfUrl);

    if (!updateResult.success) {
        console.error(`Failed to update PDF status in sheet during finalization: ${updateResult.error}`);
        debugLog('PDF status update failed during finalization', { observationId, error: updateResult.error });
    }

    const result = {
        success: pdfResult.success,
        observationId: observationId,
        pdfStatus: pdfStatus,
    };

    if (!pdfResult.success) {
        result.pdfError = pdfResult.error;
    }

    return result;
  }


  // Public API
  return {
    regenerateObservationPdf: regenerateObservationPdf,
    processPdfForFinalization: processPdfForFinalization
  };
})();
