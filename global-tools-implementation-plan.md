# Global Observation Tools Implementation Plan

## Overview
Add three global tools above the rubric subdomains for peer evaluators: Record Audio, Record Video, and Script Editor. These tools will use browser APIs for free functionality.

## Key Corrections Based on Feedback

**PDF Generation**: Uses DocumentApp.create() and Google Docs API (not pdf-rubric.html template)
**Script Handling**: Script gets its own separate PDF export, with only a LINK included in main observation PDF
**Component Tagging**: Allow tagging script sections to auto-populate Notes fields for specific components

## 1. UI Implementation

### Global Tools Bar Location
Right after observation metadata editor (line 1245) and before domain sections

**Components**:
- **Record Audio Button**: MediaRecorder API for microphone
- **Record Video Button**: MediaRecorder API for camera  
- **Script Editor Button**: Opens rich-text modal for live note-taking
- **Live Transcription Toggle**: Optional Web Speech API integration

## 2. Script Editor Enhanced Features

### Rich Text Editor Modal
- Full-screen overlay with Quill.js editor
- **Component Tagging System**: Allow users to highlight text and tag it to specific components (e.g., "Domain 1a", "Domain 2c")
- **Auto-populate Integration**: Tagged script sections auto-populate into corresponding Notes text fields in the rubric
- **Draft Auto-save**: Continuous saving to observation data during editing
- **Export Controls**: Separate "Export Script as PDF" button

### Component Tagging UI
- Toolbar button in script editor: "Tag to Component"
- Dropdown showing all available components from current rubric
- Visual indicators (colored highlights/badges) for tagged text sections
- "Push to Notes" function to transfer tagged content to rubric Notes fields

## 3. Technical Implementation

### Audio/Video Recording
- Use `MediaRecorder API` (supported in Chrome, Firefox, Edge, Opera)
- Request `getUserMedia()` permissions for microphone/camera
- Record in WebM format (widely supported)
- Save recordings as Blob files and upload to observation folder
- Real-time recording status indicators

### Live Transcription (Optional)
- Use Web Speech API `SpeechRecognition` (free, browser-based)
- Real-time speech-to-text display in script editor
- Chrome/Edge support (server-based recognition)
- No external API keys required

## 4. File Management & Storage

### Recording Storage
- Audio: `audio-recording-TIMESTAMP.webm`
- Video: `video-recording-TIMESTAMP.webm`  
- Script: Stored as JSON in observation data + separate PDF export on finalization

### Enhanced Evidence System
- Extend existing `uploadMediaEvidence()` for recordings
- Add `scriptContent` field to observation object
- Add `componentTags` mapping for script-to-component relationships

## 5. PDF Generation Updates

### Main Observation PDF (via DocumentApp)
- Add "Global Media" section at top with links to:
  - Audio recordings (if any)
  - Video recordings (if any) 
  - Script PDF (if created)
- Modify existing `generatePDF()` function in Code.js

### Separate Script PDF Export
- New function: `generateScriptPDF()` 
- Export rich-text script content as formatted Google Doc → PDF
- Include component tags as section headers
- Only generated on observation finalization

## 6. Component Integration

### Auto-Population Logic
- When user tags script section to component, offer "Add to Notes" button
- Tagged content gets inserted into existing Notes Quill editor for that component
- Maintain script source highlighting when content is used in Notes
- Two-way sync: editing in Notes doesn't affect original script

## 7. Data Schema

### New Observation Fields
```javascript
{
  scriptContent: { /* Quill Delta format */ },
  componentTags: { 
    "componentId": [{ start: 0, end: 50, text: "..." }] 
  },
  globalRecordings: {
    audio: [{ url: "...", timestamp: "..." }],
    video: [{ url: "...", timestamp: "..." }]
  },
  scriptPdfUrl: null // Set on finalization
}
```

## 8. Browser Compatibility

### Supported Features
- MediaRecorder API: Chrome 47+, Firefox, Edge, Opera
- Web Speech API: Chrome, Edge (limited Safari support)
- Fallback messaging for unsupported browsers
- Progressive enhancement approach

## 9. Security & Privacy

### User Permissions
- Request microphone/camera permissions on first use
- Clear permission status indicators
- Secure HTTPS requirement for media APIs
- User control over recording start/stop

## 10. Styling Integration

### Design Consistency
- Match existing filter-interface design system
- Use established CSS variables and component patterns
- Mobile-responsive design for global tools bar
- Consistent button styling with existing nav elements

## 11. Detailed Phased Implementation Plan

### Phase 1: Global Tools Bar + Basic Recording Functionality

#### Objectives
- Create UI for global tools bar
- Implement basic audio/video recording
- Establish file storage infrastructure

#### Actionable Steps

**Step 1.1: Create Global Tools Bar UI**
- **File**: `filter-interface.html`
- **Location**: After line 1245 (observation metadata editor)
- **Action**: Add HTML structure for global tools bar
```html
<div class="global-tools-bar" id="globalToolsBar" style="display: none;">
    <div class="global-tools-container">
        <button class="global-tool-btn" id="recordAudioBtn" onclick="toggleAudioRecording()">
            🎤 Record Audio
        </button>
        <button class="global-tool-btn" id="recordVideoBtn" onclick="toggleVideoRecording()">
            📹 Record Video  
        </button>
        <button class="global-tool-btn" id="scriptEditorBtn" onclick="openScriptEditor()">
            📝 Script Editor
        </button>
    </div>
</div>
```

**Step 1.2: Add CSS Styling**
- **File**: `filter-interface.html` (within `<style>` section)
- **Location**: After existing global tools related CSS
- **Action**: Add responsive styling for global tools bar
```css
.global-tools-bar {
    background: var(--color-white);
    border-bottom: 2px solid var(--color-gray-border-medium);
    padding: 16px 24px;
    display: flex;
    justify-content: center;
}

.global-tools-container {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
}

.global-tool-btn {
    background: var(--color-blue-base);
    color: white;
    border: none;
    padding: 12px 20px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 600;
    transition: all 0.3s ease;
}

.global-tool-btn:hover {
    background: var(--color-blue-dark);
    transform: translateY(-1px);
}

.global-tool-btn.recording {
    background: var(--color-red-base);
    animation: pulse 1.5s infinite;
}

@keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.7; }
    100% { opacity: 1; }
}
```

**Step 1.3: Show Global Tools Bar for Evaluators**
- **File**: `filter-interface.html`
- **Function**: `generateInteractiveRubricHtml()` around line 1235
- **Action**: Add visibility logic for evaluators
```javascript
if (isEvaluator) {
    // Show global tools bar
    setTimeout(() => {
        const globalToolsBar = document.getElementById('globalToolsBar');
        if (globalToolsBar) {
            globalToolsBar.style.display = 'block';
        }
    }, 100);
}
```

**Step 1.4: Implement Basic Audio Recording**
- **File**: `filter-interface.html` (JavaScript section)
- **Location**: After existing functions
- **Action**: Add MediaRecorder functionality
```javascript
let audioRecorder = null;
let audioStream = null;
let isRecordingAudio = false;

async function toggleAudioRecording() {
    const btn = document.getElementById('recordAudioBtn');
    
    if (!isRecordingAudio) {
        try {
            audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioRecorder = new MediaRecorder(audioStream);
            
            const audioChunks = [];
            audioRecorder.ondataavailable = event => audioChunks.push(event.data);
            
            audioRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                uploadRecording(audioBlob, 'audio');
            };
            
            audioRecorder.start();
            isRecordingAudio = true;
            btn.textContent = '🛑 Stop Audio';
            btn.classList.add('recording');
            
        } catch (error) {
            showToast('Error accessing microphone: ' + error.message, false);
        }
    } else {
        audioRecorder.stop();
        audioStream.getTracks().forEach(track => track.stop());
        isRecordingAudio = false;
        btn.textContent = '🎤 Record Audio';
        btn.classList.remove('recording');
    }
}
```

**Step 1.5: Implement Basic Video Recording**
- **File**: `filter-interface.html` (JavaScript section)
- **Action**: Similar to audio, but with video constraints
```javascript
let videoRecorder = null;
let videoStream = null;
let isRecordingVideo = false;

async function toggleVideoRecording() {
    const btn = document.getElementById('recordVideoBtn');
    
    if (!isRecordingVideo) {
        try {
            videoStream = await navigator.mediaDevices.getUserMedia({ 
                video: true, 
                audio: true 
            });
            videoRecorder = new MediaRecorder(videoStream);
            
            const videoChunks = [];
            videoRecorder.ondataavailable = event => videoChunks.push(event.data);
            
            videoRecorder.onstop = () => {
                const videoBlob = new Blob(videoChunks, { type: 'video/webm' });
                uploadRecording(videoBlob, 'video');
            };
            
            videoRecorder.start();
            isRecordingVideo = true;
            btn.textContent = '🛑 Stop Video';
            btn.classList.add('recording');
            
        } catch (error) {
            showToast('Error accessing camera: ' + error.message, false);
        }
    } else {
        videoRecorder.stop();
        videoStream.getTracks().forEach(track => track.stop());
        isRecordingVideo = false;
        btn.textContent = '📹 Record Video';
        btn.classList.remove('recording');
    }
}
```

**Step 1.6: Create Recording Upload Function**
- **File**: `filter-interface.html` (JavaScript section)
- **Action**: Handle file upload to Google Drive
```javascript
function uploadRecording(blob, type) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${type}-recording-${timestamp}.webm`;
    
    // Convert blob to base64
    const reader = new FileReader();
    reader.onload = function() {
        const base64Data = reader.result.split(',')[1];
        
        google.script.run
            .withSuccessHandler(function(result) {
                if (result.success) {
                    showToast(`${type} recording saved successfully!`, true);
                    // Add to global recordings list
                    addGlobalRecording(result.fileUrl, filename, type);
                } else {
                    showToast(`Error saving ${type} recording: ` + result.error, false);
                }
            })
            .withFailureHandler(function(error) {
                showToast(`Failed to save ${type} recording: ` + error.message, false);
            })
            .uploadGlobalRecording(currentObservationId, base64Data, filename, type);
    };
    reader.readAsDataURL(blob);
}
```

**Step 1.7: Add Server-Side Upload Function**
- **File**: `Code.js`
- **Location**: After existing upload functions
- **Action**: Create backend upload handler
```javascript
function uploadGlobalRecording(observationId, base64Data, filename, recordingType) {
    try {
        // Convert base64 to blob
        const binaryData = Utilities.base64Decode(base64Data);
        const blob = Utilities.newBlob(binaryData, 'video/webm', filename);
        
        // Create/get observation folder
        const folder = getOrCreateObservationFolder(observationId);
        
        // Save file
        const file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
        
        // Update observation data
        const observation = getObservationById(observationId);
        if (!observation.globalRecordings) {
            observation.globalRecordings = { audio: [], video: [] };
        }
        
        observation.globalRecordings[recordingType].push({
            url: file.getUrl(),
            filename: filename,
            timestamp: new Date().toISOString()
        });
        
        updateObservationInSheet(observation);
        
        return { success: true, fileUrl: file.getUrl() };
        
    } catch (error) {
        console.error('Error uploading global recording:', error);
        return { success: false, error: error.message };
    }
}
```

#### Success Criteria for Phase 1
- [x] Global tools bar appears for evaluators in observation editing mode
- [x] Audio recording starts/stops with clear visual feedback
- [x] Video recording starts/stops with clear visual feedback
- [ ] Recorded files are successfully uploaded to observation folder
        - "Error saving audio recording: getOrCreateObservationFolder is not defined"
- [x] No errors in browser console during recording operations
- [x] Responsive design works on mobile devices
- [x] Permissions are properly requested and handled

---

### Phase 2: Script Editor with Rich Text Capabilities

#### Objectives
- Create full-screen script editor modal
- Integrate Quill.js for rich text editing
- Implement auto-save functionality

#### Actionable Steps

**Step 2.1: Create Script Editor Modal HTML**
- **File**: `filter-interface.html`
- **Location**: Before closing `</body>` tag
- **Action**: Add modal structure
```html
<div class="script-editor-modal" id="scriptEditorModal" style="display: none;">
    <div class="script-editor-container">
        <div class="script-editor-header">
            <h2>Observation Script Editor</h2>
            <div class="script-editor-controls">
                <button class="btn-secondary" onclick="closeScriptEditor()">Close</button>
                <button class="btn-primary" onclick="exportScriptPDF()">Export PDF</button>
            </div>
        </div>
        <div class="script-editor-toolbar" id="scriptToolbar">
            <!-- Quill toolbar will be inserted here -->
        </div>
        <div class="script-editor-content">
            <div id="scriptEditor"></div>
        </div>
    </div>
</div>
```

**Step 2.2: Add Script Editor CSS**
- **File**: `filter-interface.html` (within `<style>` section)
- **Action**: Add modal and editor styling
```css
.script-editor-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
}

.script-editor-container {
    background: white;
    width: 95%;
    height: 90%;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.script-editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 2px solid var(--color-gray-border-medium);
}

.script-editor-content {
    flex: 1;
    padding: 20px;
    overflow: hidden;
}

#scriptEditor {
    height: 100%;
    border: 1px solid var(--color-gray-border-light);
    border-radius: 6px;
}
```

**Step 2.3: Initialize Quill Editor**
- **File**: `filter-interface.html` (JavaScript section)
- **Action**: Setup Quill instance with custom toolbar
```javascript
let scriptQuill = null;
let scriptContent = {};

function openScriptEditor() {
    const modal = document.getElementById('scriptEditorModal');
    modal.style.display = 'flex';
    
    if (!scriptQuill) {
        // Initialize Quill editor
        const toolbarOptions = [
            ['bold', 'italic', 'underline', 'strike'],
            ['blockquote', 'code-block'],
            [{ 'header': 1 }, { 'header': 2 }],
            [{ 'list': 'ordered'}, { 'list': 'bullet' }],
            [{ 'color': [] }, { 'background': [] }],
            ['clean']
        ];
        
        scriptQuill = new Quill('#scriptEditor', {
            theme: 'snow',
            modules: {
                toolbar: toolbarOptions
            }
        });
        
        // Load existing content
        loadScriptContent();
        
        // Auto-save on content change
        scriptQuill.on('text-change', function() {
            saveScriptContent();
        });
    }
}

function closeScriptEditor() {
    const modal = document.getElementById('scriptEditorModal');
    modal.style.display = 'none';
}
```

**Step 2.4: Implement Auto-Save**
- **File**: `filter-interface.html` (JavaScript section)
- **Action**: Save content to observation data
```javascript
function saveScriptContent() {
    if (!scriptQuill) return;
    
    const content = scriptQuill.getContents();
    scriptContent = content;
    
    // Save to server
    google.script.run
        .withSuccessHandler(function(result) {
            if (!result.success) {
                console.error('Failed to save script content:', result.error);
            }
        })
        .withFailureHandler(function(error) {
            console.error('Error saving script content:', error);
        })
        .updateObservationScript(currentObservationId, content);
}

function loadScriptContent() {
    google.script.run
        .withSuccessHandler(function(content) {
            if (content && scriptQuill) {
                scriptQuill.setContents(content);
                scriptContent = content;
            }
        })
        .withFailureHandler(function(error) {
            console.error('Error loading script content:', error);
        })
        .getObservationScript(currentObservationId);
}
```

**Step 2.5: Add Server-Side Script Functions**
- **File**: `Code.js`
- **Action**: Add backend script management
```javascript
function updateObservationScript(observationId, scriptContent) {
    try {
        const observation = getObservationById(observationId);
        observation.scriptContent = scriptContent;
        updateObservationInSheet(observation);
        return { success: true };
    } catch (error) {
        console.error('Error updating script content:', error);
        return { success: false, error: error.message };
    }
}

function getObservationScript(observationId) {
    try {
        const observation = getObservationById(observationId);
        return observation.scriptContent || null;
    } catch (error) {
        console.error('Error getting script content:', error);
        return null;
    }
}
```

#### Success Criteria for Phase 2
- [ ] Script editor modal opens full-screen with Quill editor
- [ ] Rich text formatting tools work correctly
- [ ] Content auto-saves without user intervention
- [ ] Content persists between sessions
- [ ] Modal closes properly without affecting main interface
- [ ] Editor is responsive and works on mobile

#### Testing Requirements
- Test all Quill formatting options
- Verify auto-save functionality
- Test content persistence across browser sessions
- Verify modal behavior on different screen sizes

---

### Phase 3: Component Tagging System + Auto-populate to Notes

#### Objectives
- Add component tagging to script editor
- Create visual indicators for tagged content
- Implement auto-populate functionality to Notes fields

#### Actionable Steps

**Step 3.1: Add Component Tagging UI to Script Editor**
- **File**: `filter-interface.html`
- **Location**: Update script editor toolbar
- **Action**: Add component tagging controls
```html
<!-- Add to script-editor-header -->
<div class="script-tagging-controls">
    <select id="componentSelector" class="tag-selector">
        <option value="">Select Component to Tag</option>
    </select>
    <button class="btn-tag" onclick="tagSelectedText()">Tag Selection</button>
    <button class="btn-tag" onclick="pushTaggedToNotes()">Push Tagged to Notes</button>
</div>
```

**Step 3.2: Populate Component Selector**
- **File**: `filter-interface.html` (JavaScript section)
- **Action**: Load available components into selector
```javascript
function populateComponentSelector() {
    const selector = document.getElementById('componentSelector');
    selector.innerHTML = '<option value="">Select Component to Tag</option>';
    
    // Get current rubric data
    if (window.currentRubricData && window.currentRubricData.domains) {
        window.currentRubricData.domains.forEach(domain => {
            domain.components.forEach(component => {
                const option = document.createElement('option');
                option.value = component.componentId;
                option.textContent = `${domain.name}: ${component.title}`;
                selector.appendChild(option);
            });
        });
    }
}
```

**Step 3.3: Implement Text Selection Tagging**
- **File**: `filter-interface.html` (JavaScript section)
- **Action**: Tag selected text with component
```javascript
let componentTags = {};

function tagSelectedText() {
    if (!scriptQuill) return;
    
    const range = scriptQuill.getSelection();
    if (!range || range.length === 0) {
        showToast('Please select text to tag', false);
        return;
    }
    
    const componentId = document.getElementById('componentSelector').value;
    if (!componentId) {
        showToast('Please select a component', false);
        return;
    }
    
    // Apply visual formatting to tagged text
    scriptQuill.formatText(range.index, range.length, 'background', '#e3f2fd');
    scriptQuill.formatText(range.index, range.length, 'color', '#1565c0');
    
    // Store tag information
    const tagData = {
        componentId: componentId,
        start: range.index,
        length: range.length,
        text: scriptQuill.getText(range.index, range.length),
        timestamp: new Date().toISOString()
    };
    
    if (!componentTags[componentId]) {
        componentTags[componentId] = [];
    }
    componentTags[componentId].push(tagData);
    
    // Save tags to server
    saveComponentTags();
    
    showToast('Text tagged successfully', true);
}
```

**Step 3.4: Implement Push to Notes**
- **File**: `filter-interface.html` (JavaScript section)
- **Action**: Transfer tagged content to Notes fields
```javascript
function pushTaggedToNotes() {
    const componentId = document.getElementById('componentSelector').value;
    if (!componentId) {
        showToast('Please select a component', false);
        return;
    }
    
    const tags = componentTags[componentId];
    if (!tags || tags.length === 0) {
        showToast('No tagged content for this component', false);
        return;
    }
    
    // Get the notes editor for this component
    const notesEditor = window.notesEditors && window.notesEditors[componentId];
    if (!notesEditor) {
        showToast('Notes editor not found for this component', false);
        return;
    }
    
    // Combine all tagged text for this component
    let combinedText = tags.map(tag => tag.text).join('\n\n');
    
    // Get current notes content
    const currentContent = notesEditor.root.innerHTML;
    const newContent = currentContent + '\n\n' + combinedText;
    
    // Update notes editor
    notesEditor.root.innerHTML = newContent;
    
    // Trigger save
    setTimeout(() => {
        const event = new Event('input', { bubbles: true });
        notesEditor.root.dispatchEvent(event);
    }, 100);
    
    showToast('Tagged content added to component notes', true);
}
```

**Step 3.5: Add Visual Tag Indicators**
- **File**: `filter-interface.html` (CSS section)
- **Action**: Style for tagged content
```css
.tagged-content {
    background: linear-gradient(120deg, #e3f2fd 0%, #bbdefb 100%);
    border-left: 4px solid #1565c0;
    padding: 2px 4px;
    margin: 1px 0;
    border-radius: 3px;
}

.tag-indicator {
    display: inline-block;
    background: #1565c0;
    color: white;
    font-size: 0.7rem;
    padding: 1px 4px;
    border-radius: 2px;
    margin-left: 4px;
}
```

**Step 3.6: Server-Side Tag Management**
- **File**: `Code.js`
- **Action**: Store and retrieve component tags
```javascript
function saveComponentTags(observationId, componentTags) {
    try {
        const observation = getObservationById(observationId);
        observation.componentTags = componentTags;
        updateObservationInSheet(observation);
        return { success: true };
    } catch (error) {
        console.error('Error saving component tags:', error);
        return { success: false, error: error.message };
    }
}

function getComponentTags(observationId) {
    try {
        const observation = getObservationById(observationId);
        return observation.componentTags || {};
    } catch (error) {
        console.error('Error getting component tags:', error);
        return {};
    }
}
```

#### Success Criteria for Phase 3
- [ ] Component selector populates with current rubric components
- [ ] Text selection and tagging works correctly
- [ ] Tagged text has visual indicators
- [ ] Push to Notes transfers content correctly
- [ ] Tags persist between script editor sessions
- [ ] No conflicts with existing Notes functionality

#### Testing Requirements
- Test tagging across different text selections
- Verify component selector accuracy
- Test push to Notes with existing content
- Verify tag persistence and recovery

---

### Phase 4: Separate Script PDF Export on Finalization

#### Objectives
- Create script PDF export functionality
- Generate separate PDF for script content
- Link script PDF in main observation PDF

#### Actionable Steps

**Step 4.1: Add Script PDF Export Function**
- **File**: `Code.js`
- **Location**: After existing PDF functions
- **Action**: Create script-specific PDF generator
```javascript
function generateScriptPDF(observationId) {
    try {
        const observation = getObservationById(observationId);
        if (!observation || !observation.scriptContent) {
            return { success: false, error: 'No script content found' };
        }
        
        // Create document
        const docName = `Script - ${observation.observedName} - ${observation.observationDate || 'No Date'}`;
        const doc = DocumentApp.create(docName);
        const body = doc.getBody();
        
        // Add title
        const title = body.appendParagraph('Observation Script');
        title.setHeading(DocumentApp.ParagraphHeading.HEADING1);
        
        // Add metadata
        body.appendParagraph(`Observer: ${observation.observerName || 'Unknown'}`);
        body.appendParagraph(`Observed: ${observation.observedName || 'Unknown'}`);
        body.appendParagraph(`Date: ${observation.observationDate || 'No Date'}`);
        body.appendParagraph(''); // Empty line
        
        // Convert Quill content to document text
        if (observation.scriptContent.ops) {
            observation.scriptContent.ops.forEach(op => {
                if (op.insert && typeof op.insert === 'string') {
                    const text = op.insert;
                    if (text.trim()) {
                        const paragraph = body.appendParagraph(text);
                        
                        // Apply formatting if available
                        if (op.attributes) {
                            const style = {};
                            if (op.attributes.bold) style[DocumentApp.Attribute.BOLD] = true;
                            if (op.attributes.italic) style[DocumentApp.Attribute.ITALIC] = true;
                            if (op.attributes.underline) style[DocumentApp.Attribute.UNDERLINE] = true;
                            
                            paragraph.setAttributes(style);
                        }
                    }
                }
            });
        }
        
        // Save and get PDF
        doc.saveAndClose();
        const docFile = DriveApp.getFileById(doc.getId());
        const pdfBlob = docFile.getBlob().getAs('application/pdf');
        
        // Create PDF file in observation folder
        const folder = getOrCreateObservationFolder(observationId);
        const pdfFile = folder.createFile(pdfBlob);
        pdfFile.setName(`Script-${docName}.pdf`);
        
        // Set sharing permissions
        pdfFile.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
        
        // Clean up temporary document
        DriveApp.getFileById(doc.getId()).setTrashed(true);
        
        return { 
            success: true, 
            pdfUrl: pdfFile.getUrl(),
            pdfId: pdfFile.getId()
        };
        
    } catch (error) {
        console.error('Error generating script PDF:', error);
        return { success: false, error: error.message };
    }
}
```

**Step 4.2: Integrate Script PDF into Main Observation PDF**
- **File**: `Code.js`
- **Function**: `_createStyledPDFDocument()` around line 870
- **Action**: Add script PDF link section
```javascript
// Add after metadata section, before domains
if (observation.scriptPdfUrl) {
    body.appendParagraph(''); // Empty line
    const scriptSection = body.appendParagraph('Observation Script');
    scriptSection.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    
    const scriptLink = body.appendParagraph('📝 View Script Document: ' + observation.scriptPdfUrl);
    scriptLink.setLinkUrl(observation.scriptPdfUrl);
    
    body.appendParagraph(''); // Empty line
}
```

**Step 4.3: Auto-Generate Script PDF on Finalization**
- **File**: `Code.js`
- **Function**: `finalizeObservation()` around line 350
- **Action**: Generate script PDF during finalization
```javascript
// Add before main PDF generation
if (observation.scriptContent) {
    debugLog('Generating script PDF', { observationId });
    const scriptPdfResult = generateScriptPDF(observationId);
    
    if (scriptPdfResult.success) {
        observation.scriptPdfUrl = scriptPdfResult.pdfUrl;
        observation.scriptPdfId = scriptPdfResult.pdfId;
        debugLog('Script PDF generated successfully', { observationId, scriptPdfUrl: scriptPdfResult.pdfUrl });
    } else {
        debugLog('Script PDF generation failed', { observationId, error: scriptPdfResult.error });
        // Continue with main PDF even if script PDF fails
    }
}
```

**Step 4.4: Add Export Button to Script Editor**
- **File**: `filter-interface.html` (JavaScript section)
- **Function**: `exportScriptPDF()`
- **Action**: Manual export functionality
```javascript
function exportScriptPDF() {
    if (!currentObservationId) {
        showToast('No observation context found', false);
        return;
    }
    
    // Save current content first
    saveScriptContent();
    
    // Generate PDF
    google.script.run
        .withSuccessHandler(function(result) {
            if (result.success) {
                showToast('Script PDF generated successfully!', true);
                // Open PDF in new tab
                window.open(result.pdfUrl, '_blank');
            } else {
                showToast('Error generating script PDF: ' + result.error, false);
            }
        })
        .withFailureHandler(function(error) {
            showToast('Failed to generate script PDF: ' + error.message, false);
        })
        .generateScriptPDF(currentObservationId);
}
```

#### Success Criteria for Phase 4
- [ ] Script PDF generates correctly with formatted content
- [ ] Script PDF link appears in main observation PDF
- [ ] Manual export works from script editor
- [ ] Auto-generation occurs during finalization
- [ ] PDF includes proper metadata and formatting
- [ ] Generated PDFs are stored in correct folders

#### Testing Requirements
- Test script PDF generation with various content types
- Verify link integration in main PDF
- Test manual export functionality
- Verify auto-generation during finalization process

---

### Phase 5: Web Speech API Transcription Integration

#### Objectives
- Add live transcription capability
- Integrate with script editor
- Provide fallback for unsupported browsers

#### Actionable Steps

**Step 5.1: Add Transcription Toggle to Global Tools**
- **File**: `filter-interface.html`
- **Location**: Update global tools bar HTML
- **Action**: Add transcription button
```html
<button class="global-tool-btn" id="transcriptionBtn" onclick="toggleTranscription()">
    🎙️ Live Transcription
</button>
```

**Step 5.2: Implement Speech Recognition**
- **File**: `filter-interface.html` (JavaScript section)
- **Action**: Add Web Speech API functionality
```javascript
let speechRecognition = null;
let isTranscribing = false;

function initializeSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        return false;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    speechRecognition = new SpeechRecognition();
    
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.lang = 'en-US';
    
    speechRecognition.onresult = function(event) {
        let interimTranscript = '';
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript + ' ';
            } else {
                interimTranscript += transcript;
            }
        }
        
        // Insert into script editor if open
        if (scriptQuill && finalTranscript) {
            const currentLength = scriptQuill.getLength();
            scriptQuill.insertText(currentLength - 1, finalTranscript);
        }
    };
    
    speechRecognition.onerror = function(event) {
        console.error('Speech recognition error:', event.error);
        showToast('Transcription error: ' + event.error, false);
        stopTranscription();
    };
    
    speechRecognition.onend = function() {
        if (isTranscribing) {
            // Restart if it stops unexpectedly
            speechRecognition.start();
        }
    };
    
    return true;
}

function toggleTranscription() {
    const btn = document.getElementById('transcriptionBtn');
    
    if (!speechRecognition && !initializeSpeechRecognition()) {
        showToast('Speech recognition not supported in this browser', false);
        return;
    }
    
    if (!isTranscribing) {
        try {
            speechRecognition.start();
            isTranscribing = true;
            btn.textContent = '🛑 Stop Transcription';
            btn.classList.add('recording');
            showToast('Live transcription started', true);
        } catch (error) {
            showToast('Error starting transcription: ' + error.message, false);
        }
    } else {
        stopTranscription();
    }
}

function stopTranscription() {
    if (speechRecognition) {
        speechRecognition.stop();
    }
    isTranscribing = false;
    const btn = document.getElementById('transcriptionBtn');
    btn.textContent = '🎙️ Live Transcription';
    btn.classList.remove('recording');
    showToast('Live transcription stopped', true);
}
```

**Step 5.3: Add Browser Support Detection**
- **File**: `filter-interface.html` (JavaScript section)
- **Action**: Check and display browser capabilities
```javascript
function checkBrowserSupport() {
    const capabilities = {
        mediaRecorder: typeof MediaRecorder !== 'undefined',
        speechRecognition: ('webkitSpeechRecognition' in window) || ('SpeechRecognition' in window),
        userMedia: navigator.mediaDevices && navigator.mediaDevices.getUserMedia
    };
    
    // Hide unsupported features
    if (!capabilities.mediaRecorder || !capabilities.userMedia) {
        const audioBtn = document.getElementById('recordAudioBtn');
        const videoBtn = document.getElementById('recordVideoBtn');
        if (audioBtn) audioBtn.style.display = 'none';
        if (videoBtn) videoBtn.style.display = 'none';
        showToast('Audio/Video recording not supported in this browser', false);
    }
    
    if (!capabilities.speechRecognition) {
        const transcriptionBtn = document.getElementById('transcriptionBtn');
        if (transcriptionBtn) transcriptionBtn.style.display = 'none';
    }
    
    return capabilities;
}

// Call on page load
document.addEventListener('DOMContentLoaded', function() {
    checkBrowserSupport();
});
```

**Step 5.4: Add Transcription Settings**
- **File**: `filter-interface.html`
- **Action**: Add language and settings options
```html
<!-- Add to script editor controls -->
<div class="transcription-settings" style="display: none;" id="transcriptionSettings">
    <select id="transcriptionLanguage">
        <option value="en-US">English (US)</option>
        <option value="en-GB">English (UK)</option>
        <option value="es-ES">Spanish</option>
        <option value="fr-FR">French</option>
    </select>
    <label>
        <input type="checkbox" id="autoInsertTranscription" checked>
        Auto-insert into script
    </label>
</div>
```

#### Success Criteria for Phase 5
- [ ] Live transcription works in supported browsers
- [ ] Transcribed text appears in script editor
- [ ] Browser support detection works correctly
- [ ] Unsupported features are hidden gracefully
- [ ] Language selection works properly
- [ ] No errors in unsupported browsers

#### Testing Requirements
- Test on Chrome, Edge, Firefox browsers
- Verify graceful degradation on Safari
- Test microphone permissions for transcription
- Verify transcription accuracy
- Test language selection functionality

---

## 12. Final Integration Testing

### Complete System Test
- [ ] All phases work together seamlessly
- [ ] No conflicts between recording and transcription
- [ ] Script content properly includes all features
- [ ] PDF generation includes all components
- [ ] Performance remains acceptable
- [ ] Mobile responsiveness maintained

### Rollback Plans
- Each phase should be implementable independently
- Feature flags can disable problematic features
- Graceful degradation for unsupported browsers
- Data integrity maintained throughout all phases

## 12. Cleanup Tasks

- [x] Remove unused `pdf-rubric.html` file
- [x] Update documentation references to reflect DocumentApp-based PDF generation
- [x] Clean up any unused template references in codebase

## Technical Notes

This implementation leverages 100% free browser APIs while maintaining the app's professional design and existing functionality patterns. The component tagging system provides a powerful way to connect script content directly to rubric evaluation areas, streamlining the observation process for peer evaluators.