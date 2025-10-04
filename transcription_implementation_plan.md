# AI Transcription Implementation Plan
## Peer Evaluator Form - Audio Transcription Feature

---

## Executive Summary

This document outlines the complete implementation plan for adding AI-powered transcription capabilities to the Peer Evaluator Form application. The implementation is divided into two phases:

- **Phase 1: Semi-Automated Workflow** - Advanced prompt builder + Gemini Gem (Quick win, no API costs)
- **Phase 2: Fully Automated Workflow** - Gemini Batch API integration (50% cost savings, zero user effort)

Both phases use the same advanced prompt builder UI, allowing seamless transition from manual to automated processing.

---

## Table of Contents

1. [Phase 1: Semi-Automated Implementation](#phase-1-semi-automated-implementation)
2. [Phase 2: Fully Automated Implementation](#phase-2-fully-automated-implementation)
3. [Testing & Validation](#testing--validation)
4. [Deployment Checklist](#deployment-checklist)
5. [Maintenance & Monitoring](#maintenance--monitoring)

---

# Phase 1: Semi-Automated Implementation

## Overview

**Goal:** Enable observers to quickly generate AI transcription prompts with context-aware information and open Gemini Gem for manual transcription.

**Timeline:** 4-6 hours (1 development session)

**User Flow:**
1. Observer clicks "Transcribe" button on audio file
2. Advanced prompt builder modal opens with customization options
3. Observer selects preferences (timestamps, subdomain highlighting, etc.)
4. Clicks "Copy Prompt & Open Gemini"
5. Prompt copied to clipboard, Gemini Gem opens in new tab
6. Observer pastes prompt, drags audio file into Gemini chat
7. Gemini generates transcript
8. Observer copies transcript back to Script Editor
9. Uses existing Auto-Tag feature to identify subdomain references

**Key Benefits:**
- ✅ Zero API costs (uses your existing Gemini Gem)
- ✅ Immediate availability (no trigger setup needed)
- ✅ Full user control over transcript quality
- ✅ Fast implementation (single development session)
- ✅ Validates workflow before investing in automation

---

## Implementation Steps

### Step 1: Create Transcription Prompt Builder Modal

**File:** `client/peerevaluator/filter-interface.html`

**Location:** After the existing audio modal section (around line 3500-4000)

**Action:** Add the following HTML structure:

```html
<!-- Transcription Prompt Builder Modal -->
<div class="transcription-modal-overlay" id="transcriptionPromptModal" style="display: none;">
    <div class="transcription-modal">
        <div class="transcription-modal-header">
            <h2>🎙️ AI Transcription Setup</h2>
            <button class="close-btn" onclick="closeTranscriptionPromptModal()">✕</button>
        </div>
        
        <div class="transcription-modal-body">
            <!-- Context Information Section -->
            <div class="prompt-section">
                <h3>📋 Observation Context</h3>
                <div class="checkbox-group">
                    <label>
                        <input type="checkbox" id="includeStaffInfo" checked>
                        Include staff member info (Name, Role, Year)
                    </label>
                    <label>
                        <input type="checkbox" id="includeAssignedAreas" checked>
                        Include assigned focus areas
                    </label>
                    <label>
                        <input type="checkbox" id="includeComponentTitles">
                        Include component titles for reference
                    </label>
                </div>
            </div>

            <!-- Speaker Labeling Section -->
            <div class="prompt-section">
                <h3>👥 Speaker Identification</h3>
                <div class="info-box">
                    Main speaker (teacher): <strong id="mainSpeakerLabel">[Staff Name]</strong><br>
                    Other speakers: Speaker 1, Speaker 2, etc.
                </div>
            </div>

            <!-- Formatting Preferences Section -->
            <div class="prompt-section">
                <h3>⚙️ Formatting Preferences</h3>
                <div class="checkbox-group">
                    <label>
                        <input type="checkbox" id="includeTimestamps" checked>
                        Include timestamps
                    </label>
                    <label>
                        <input type="checkbox" id="highlightSubdomains" checked>
                        Highlight subdomain mentions
                    </label>
                    <label>
                        <input type="checkbox" id="includeSummary">
                        Include post-transcription summary
                    </label>
                </div>
            </div>

            <!-- Custom Instructions Section -->
            <div class="prompt-section">
                <h3>📝 Additional Instructions (Optional)</h3>
                <textarea 
                    id="customInstructions" 
                    placeholder="Add any specific instructions (e.g., 'Focus on student engagement' or 'Note transitions between activities')..."
                    rows="3"
                ></textarea>
            </div>

            <!-- Preview Section -->
            <div class="prompt-section">
                <h3>👁️ Prompt Preview</h3>
                <div class="prompt-preview" id="promptPreview">
                    <!-- JavaScript will populate this -->
                </div>
            </div>
        </div>

        <div class="transcription-modal-footer">
            <div class="workflow-selection">
                <div class="workflow-option workflow-immediate">
                    <div class="workflow-header">
                        <span class="workflow-icon">⚡</span>
                        <span class="workflow-title">Need it now?</span>
                    </div>
                    <p class="workflow-description">Get your transcript in 2-3 minutes. You'll stay on Gemini to paste the prompt and upload your audio file.</p>
                    <button class="btn-copy-prompt" onclick="copyPromptAndOpenGemini()">
                        📋 Copy Prompt & Open Gemini
                    </button>
                </div>
            </div>
            
            <button class="btn-cancel" onclick="closeTranscriptionPromptModal()">Cancel</button>
        </div>
    </div>
</div>
```

**Success Criteria:**
- ✅ Modal renders correctly on all screen sizes
- ✅ No layout conflicts with existing modals
- ✅ All checkboxes are functional
- ✅ Preview updates in real-time
- ✅ Modal closes without errors

---

### Step 2: Add CSS Styling

**File:** `client/peerevaluator/filter-interface.html`

**Location:** In the existing `<style>` section (around line 500-1500)

**Action:** Add the following CSS:

```css
/* ============================================
   TRANSCRIPTION MODAL STYLES
   ============================================ */

.transcription-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    backdrop-filter: blur(4px);
}

.transcription-modal {
    background: white;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    width: 90%;
    max-width: 700px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    animation: modalSlideIn 0.3s ease-out;
}

@keyframes modalSlideIn {
    from {
        opacity: 0;
        transform: translateY(-20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.transcription-modal-header {
    padding: 20px 24px;
    border-bottom: 2px solid #e5e7eb;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 12px 12px 0 0;
}

.transcription-modal-header h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
}

.transcription-modal-header .close-btn {
    background: rgba(255, 255, 255, 0.2);
    border: none;
    color: white;
    font-size: 24px;
    cursor: pointer;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
}

.transcription-modal-header .close-btn:hover {
    background: rgba(255, 255, 255, 0.3);
}

.transcription-modal-body {
    padding: 24px;
    overflow-y: auto;
    flex: 1;
}

.transcription-modal-footer {
    padding: 24px;
    border-top: 2px solid #e5e7eb;
    background: #f9fafb;
    border-radius: 0 0 12px 12px;
}

.prompt-section {
    margin-bottom: 24px;
    padding-bottom: 20px;
    border-bottom: 1px solid #e5e7eb;
}

.prompt-section:last-child {
    border-bottom: none;
}

.prompt-section h3 {
    margin: 0 0 12px 0;
    font-size: 16px;
    font-weight: 600;
    color: #374151;
}

.checkbox-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.checkbox-group label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    padding: 8px;
    border-radius: 6px;
    transition: background 0.2s;
}

.checkbox-group label:hover {
    background: #f3f4f6;
}

.checkbox-group input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
}

.info-box {
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 8px;
    padding: 12px;
    color: #1e40af;
    font-size: 14px;
    line-height: 1.6;
}

#customInstructions {
    width: 100%;
    padding: 12px;
    border: 2px solid #d1d5db;
    border-radius: 8px;
    font-family: inherit;
    font-size: 14px;
    resize: vertical;
    transition: border-color 0.2s;
}

#customInstructions:focus {
    outline: none;
    border-color: #667eea;
}

.prompt-preview {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 16px;
    font-family: 'Courier New', monospace;
    font-size: 13px;
    line-height: 1.6;
    color: #374151;
    max-height: 200px;
    overflow-y: auto;
    white-space: pre-wrap;
}

.workflow-selection {
    margin-bottom: 16px;
}

.workflow-option {
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 12px;
    padding: 20px;
    transition: all 0.3s ease;
    border-left: 4px solid #f59e0b;
}

.workflow-option:hover {
    border-color: #667eea;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
    transform: translateY(-2px);
}

.workflow-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}

.workflow-icon {
    font-size: 24px;
}

.workflow-title {
    font-weight: 700;
    font-size: 16px;
    color: #1f2937;
}

.workflow-description {
    font-size: 13px;
    color: #6b7280;
    line-height: 1.5;
    margin-bottom: 16px;
}

.btn-copy-prompt {
    width: 100%;
    padding: 12px 20px;
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 14px;
}

.btn-copy-prompt:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(245, 158, 11, 0.4);
}

.btn-cancel {
    width: 100%;
    padding: 10px 20px;
    background: #e5e7eb;
    color: #4b5563;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-top: 12px;
}

.btn-cancel:hover {
    background: #d1d5db;
}

/* Responsive layout */
@media (max-width: 768px) {
    .transcription-modal {
        width: 95%;
        max-height: 90vh;
    }
    
    .transcription-modal-body {
        padding: 16px;
    }
}
```

**Success Criteria:**
- ✅ Modal is visually polished and professional
- ✅ Animations are smooth
- ✅ Responsive on mobile/tablet/desktop
- ✅ Colors match existing design system
- ✅ No CSS conflicts with existing styles

---

### Step 3: Add JavaScript Functions

**File:** `client/peerevaluator/filter-interface.html`

**Location:** In the existing `<script>` section (around line 4000-5000)

**Action:** Add the following JavaScript:

```javascript
// ============================================
// TRANSCRIPTION MODAL - PHASE 1
// ============================================

// Global state for transcription
let currentTranscriptionFile = null;
let currentTranscriptionObservation = null;

/**
 * Opens the advanced transcription prompt builder modal
 */
function openTranscriptionPromptBuilder(filename, observationId) {
    currentTranscriptionFile = filename;
    currentTranscriptionObservation = window.currentObservation;
    
    if (!currentTranscriptionObservation) {
        showToast('Unable to load observation details', false);
        return;
    }
    
    // Update main speaker label
    document.getElementById('mainSpeakerLabel').textContent = 
        currentTranscriptionObservation.observedName || 'Staff Member';
    
    // Show the modal
    document.getElementById('transcriptionPromptModal').style.display = 'flex';
    
    // Initial preview update
    updatePromptPreview();
    
    // Add listeners for real-time preview
    const checkboxes = document.querySelectorAll('#transcriptionPromptModal input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.addEventListener('change', updatePromptPreview);
    });
    
    document.getElementById('customInstructions').addEventListener('input', updatePromptPreview);
}

/**
 * Closes the transcription prompt builder modal
 */
function closeTranscriptionPromptModal() {
    document.getElementById('transcriptionPromptModal').style.display = 'none';
    currentTranscriptionFile = null;
    currentTranscriptionObservation = null;
}

/**
 * Builds the transcription prompt based on user selections
 */
function buildTranscriptionPrompt() {
    const obs = currentTranscriptionObservation;
    const includeStaffInfo = document.getElementById('includeStaffInfo').checked;
    const includeAssignedAreas = document.getElementById('includeAssignedAreas').checked;
    const includeComponentTitles = document.getElementById('includeComponentTitles').checked;
    const includeTimestamps = document.getElementById('includeTimestamps').checked;
    const highlightSubdomains = document.getElementById('highlightSubdomains').checked;
    const includeSummary = document.getElementById('includeSummary').checked;
    const customInstructions = document.getElementById('customInstructions').value.trim();
    
    let prompt = `Please transcribe this audio recording of a classroom observation.\n\n`;
    
    // Context Section
    if (includeStaffInfo || includeAssignedAreas) {
        prompt += `=== OBSERVATION CONTEXT ===\n`;
        
        if (includeStaffInfo) {
            prompt += `Staff Member: ${obs.observedName}\n`;
            prompt += `Role: ${obs.observedRole}\n`;
            prompt += `Year: Year ${obs.observedYear}\n`;
        }
        
        if (includeAssignedAreas) {
            const assignedSubdomains = getAssignedSubdomainsForPrompt();
            prompt += `Assigned Focus Areas: ${assignedSubdomains}\n`;
        }
        
        if (includeComponentTitles) {
            const componentTitles = getAssignedComponentTitles();
            if (componentTitles.length > 0) {
                prompt += `\nFocus Components:\n${componentTitles.join('\n')}\n`;
            }
        }
        
        prompt += `\n`;
    }
    
    // Transcription Instructions
    prompt += `=== TRANSCRIPTION INSTRUCTIONS ===\n`;
    prompt += `1. Speaker Identification:\n`;
    prompt += `   - Label the main speaker (teacher) as: "${obs.observedName}"\n`;
    prompt += `   - Label other speakers (students, visitors) as: Speaker 1, Speaker 2, etc.\n\n`;
    
    if (includeTimestamps) {
        prompt += `2. Include timestamps in format [MM:SS] for each speaker change\n\n`;
    }
    
    if (highlightSubdomains) {
        prompt += `3. When you identify moments related to the assigned focus areas (${getAssignedSubdomainsForPrompt()}), note them in your transcription with [FOCUS: 1a] or similar tags\n\n`;
    }
    
    prompt += `4. Maintain accurate speaker attribution and natural speech patterns\n\n`;
    
    if (includeSummary) {
        prompt += `5. After the transcription, provide:\n`;
        prompt += `   - A brief summary of the lesson\n`;
        prompt += `   - Key moments related to assigned focus areas\n`;
        prompt += `   - Notable teaching strategies observed\n\n`;
    }
    
    // Custom Instructions
    if (customInstructions) {
        prompt += `=== ADDITIONAL INSTRUCTIONS ===\n`;
        prompt += `${customInstructions}\n\n`;
    }
    
    // Footer instructions
    prompt += `=== NEXT STEPS ===\n`;
    prompt += `After receiving the transcription:\n`;
    prompt += `1. Copy the complete transcript\n`;
    prompt += `2. Return to the observation\n`;
    prompt += `3. Open the Script Editor\n`;
    prompt += `4. Paste the transcript - our auto-tagging system will identify and tag subdomain references\n`;
    
    return prompt;
}

/**
 * Updates the prompt preview in real-time
 */
function updatePromptPreview() {
    const prompt = buildTranscriptionPrompt();
    document.getElementById('promptPreview').textContent = prompt;
}

/**
 * Gets assigned subdomains as a formatted string
 */
function getAssignedSubdomainsForPrompt() {
    if (!window.rubricData || !window.rubricData.domains) {
        return 'Not specified';
    }
    
    const assigned = [];
    window.rubricData.domains.forEach(domain => {
        if (domain.components) {
            domain.components.forEach(component => {
                if (component.isAssigned) {
                    const match = component.componentId.match(/^(\d[a-f])/i);
                    if (match) {
                        assigned.push(match[1]);
                    }
                }
            });
        }
    });
    
    return assigned.length > 0 ? assigned.join(', ') : 'All areas';
}

/**
 * Gets assigned component titles for reference
 */
function getAssignedComponentTitles() {
    if (!window.rubricData || !window.rubricData.domains) {
        return [];
    }
    
    const titles = [];
    window.rubricData.domains.forEach(domain => {
        if (domain.components) {
            domain.components.forEach(component => {
                if (component.isAssigned) {
                    titles.push(`${component.componentId} ${component.title}`);
                }
            });
        }
    });
    
    return titles;
}

/**
 * Copy prompt to clipboard and open Gemini Gem
 */
function copyPromptAndOpenGemini() {
    const prompt = buildTranscriptionPrompt();
    
    navigator.clipboard.writeText(prompt).then(() => {
        // Open Gemini Gem in new tab
        window.open('https://gemini.google.com/gem/1KLwvj25ilNePNE2x3cyFCm3T5t0OCm36?usp=sharing', '_blank');
        
        // Close modal
        closeTranscriptionPromptModal();
        
        // Show detailed instructions
        showToast('✅ Prompt copied! Next steps:\n\n' +
                  '1. Paste the prompt in Gemini\n' +
                  '2. Upload/drag your audio file\n' +
                  '3. Wait for transcription\n' +
                  '4. Copy result back to Script Editor\n' +
                  '5. Use Auto-Tag to identify subdomains', 
                  true, 10000);
    }).catch(err => {
        showToast('Failed to copy prompt. Please try again.', false);
        console.error('Clipboard error:', err);
    });
}
```

**Success Criteria:**
- ✅ Modal opens without errors
- ✅ Prompt builds correctly with all selected options
- ✅ Preview updates in real-time as options change
- ✅ Clipboard copy works on all browsers
- ✅ Gemini Gem opens in new tab
- ✅ Toast notification provides clear instructions

---

### Step 4: Add Transcribe Button to Audio Files

**File:** `client/peerevaluator/filter-interface.html`

**Location:** Find the function that renders audio file lists (search for "globalRecordings" or "audio file" rendering code, likely around line 3500-4000)

**Action:** Add a "Transcribe" button next to each audio file. Look for HTML generation code like:

```javascript
// Find existing code that looks similar to this:
fileHtml += `
    <div class="file-item">
        <span class="file-name">${recording.filename}</span>
        <div class="file-actions">
            <!-- Existing buttons -->
            <button onclick="deleteFile('${recording.filename}')">Delete</button>
        </div>
    </div>
`;

// ADD the transcribe button:
fileHtml += `
    <div class="file-item">
        <span class="file-name">${recording.filename}</span>
        <div class="file-actions">
            <button class="btn-transcribe" 
                    onclick="openTranscriptionPromptBuilder('${recording.filename}', '${currentObservation.id}')"
                    title="Transcribe with AI">
                🎙️ Transcribe
            </button>
            <!-- Existing buttons -->
            <button onclick="deleteFile('${recording.filename}')">Delete</button>
        </div>
    </div>
`;
```

**Add button styling CSS:**

```css
.btn-transcribe {
    padding: 6px 12px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s ease;
    margin-right: 8px;
}

.btn-transcribe:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(102, 126, 234, 0.3);
}
```

**Success Criteria:**
- ✅ "Transcribe" button appears next to each audio file
- ✅ Button is visually distinct and professional
- ✅ Clicking button opens transcription modal
- ✅ Correct filename is passed to modal
- ✅ No conflicts with existing file action buttons

---

## Phase 1 Success Criteria

### Functional Requirements
- ✅ Transcription modal opens and closes without errors
- ✅ All checkboxes control prompt generation correctly
- ✅ Custom instructions field updates preview in real-time
- ✅ Speaker names are correctly populated from observation data
- ✅ Assigned subdomains are correctly identified and included
- ✅ Prompt is successfully copied to clipboard
- ✅ Gemini Gem opens in new tab with correct URL
- ✅ Instructions toast provides clear next steps

### User Experience Requirements
- ✅ Modal is responsive on all screen sizes (mobile, tablet, desktop)
- ✅ All interactions feel smooth and professional
- ✅ No layout conflicts with existing UI
- ✅ Error handling for clipboard failures
- ✅ Clear visual feedback for all user actions

### Technical Requirements
- ✅ No console errors on modal open/close
- ✅ No memory leaks from event listeners
- ✅ Code follows existing naming conventions
- ✅ Comments explain non-obvious logic
- ✅ Works in Chrome, Firefox, Safari, Edge

---

# Phase 2: Fully Automated Implementation

## Overview

**Goal:** Enable observers to queue audio files for automated transcription using Gemini Batch API with 50% cost savings.

**Timeline:** 8-12 hours (2-3 development sessions)

**Prerequisites:**
- ✅ Phase 1 is deployed and working
- ✅ GEMINI_API_KEY is set in Script Properties
- ✅ Google Cloud project is linked to Apps Script

**User Flow:**
1. Observer clicks "Transcribe" button on audio file
2. Same advanced prompt builder modal opens
3. Observer selects "Queue Batch Transcription" button
4. Job is created and queued
5. Time-based trigger processes queue every 15-30 minutes
6. Gemini Batch API processes the transcription
7. Transcript is saved as Google Doc in observation folder
8. Observer receives email notification with link
9. Observer can copy transcript to Script Editor or view in Drive

**Key Benefits:**
- ✅ 50% cost savings using Batch API
- ✅ Zero user effort after submission
- ✅ Email notifications keep observers informed
- ✅ Scales to handle multiple transcriptions
- ✅ No 6-minute timeout issues

---

## Implementation Steps

### Step 1: Update Modal for Dual-Path Selection

**File:** `client/peerevaluator/filter-interface.html`

**Location:** Replace the `transcription-modal-footer` section in Phase 1 code

**Action:** Update the footer to show both options:

```html
<div class="transcription-modal-footer">
    <div class="workflow-selection">
        <div class="workflow-option workflow-immediate">
            <div class="workflow-header">
                <span class="workflow-icon">⚡</span>
                <span class="workflow-title">Need it now?</span>
            </div>
            <p class="workflow-description">Get your transcript in 2-3 minutes. You'll stay on Gemini to paste the prompt and upload your audio file.</p>
            <button class="btn-copy-prompt" onclick="copyPromptAndOpenGemini()">
                📋 Copy Prompt & Open Gemini
            </button>
        </div>
        
        <div class="workflow-divider">OR</div>
        
        <div class="workflow-option workflow-batch">
            <div class="workflow-header">
                <span class="workflow-icon">🤖</span>
                <span class="workflow-title">Can wait?</span>
                <span class="cost-badge">50% cheaper</span>
            </div>
            <p class="workflow-description">
                Submit via Gemini Batch API for <strong>50% cost savings</strong>. 
                You'll get an email when complete (typically within <span id="batchWaitTime">30-60 minutes</span>). 
                Continue your work - no need to wait!
            </p>
            <button class="btn-batch-transcribe" onclick="autoTranscribeWithAPI()">
                🚀 Queue Batch Transcription (50% Off)
            </button>
        </div>
    </div>
    
    <button class="btn-cancel" onclick="closeTranscriptionPromptModal()">Cancel</button>
</div>
```

**Add CSS for new elements:**

```css
.workflow-selection {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 20px;
    align-items: center;
    margin-bottom: 16px;
}

.workflow-divider {
    font-weight: 700;
    color: #9ca3af;
    text-align: center;
    font-size: 14px;
}

.workflow-batch {
    border-left: 4px solid #10b981;
}

.cost-badge {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 700;
    margin-left: auto;
}

.btn-batch-transcribe {
    width: 100%;
    padding: 12px 20px;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 14px;
}

.btn-batch-transcribe:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
}

@media (max-width: 768px) {
    .workflow-selection {
        grid-template-columns: 1fr;
        grid-template-rows: auto auto auto;
    }
    
    .workflow-divider {
        margin: 10px 0;
    }
}
```

**Success Criteria:**
- ✅ Both workflow options display side by side
- ✅ Cost savings badge is visible
- ✅ Layout is responsive on mobile
- ✅ Visual hierarchy guides user to choose

---

### Step 2: Add Client-Side Batch API Functions

**File:** `client/peerevaluator/filter-interface.html`

**Location:** In the `<script>` section, after the Phase 1 functions

**Action:** Add the following JavaScript:

```javascript
/**
 * Auto-transcribe with Gemini Batch API
 */
function autoTranscribeWithAPI() {
    const prompt = buildTranscriptionPrompt();
    
    closeTranscriptionPromptModal();
    
    showToast('Submitting batch transcription job...', true, 2000);
    
    google.script.run
        .withSuccessHandler(function(result) {
            if (result.success) {
                showToast(
                    `✅ Batch job queued!\n\n` +
                    `📧 You'll receive an email when complete\n` +
                    `⏱️ Estimated wait: ${result.estimatedWaitMinutes} minute(s)\n` +
                    `💰 ${result.costSavings}\n\n` +
                    `Feel free to continue working - no need to wait around!`, 
                    true, 
                    12000
                );
                
                console.log('Transcription job created:', result.jobId);
            } else {
                showToast('❌ ' + result.error, false);
            }
        })
        .withFailureHandler(function(error) {
            console.error('Error creating transcription job:', error);
            showToast('❌ Error: ' + error.message, false);
        })
        .createTranscriptionJob(
            currentTranscriptionObservation.id,
            currentTranscriptionFile,
            prompt
        );
}
```

**Success Criteria:**
- ✅ Clicking batch button closes modal
- ✅ Server function is called successfully
- ✅ Success message shows job details
- ✅ Error handling displays helpful messages
- ✅ User can continue working immediately

---

### Step 3: Add Server-Side Job Creation Function

**File:** `server/Code.js`

**Location:** Add at the end of the file (around line 2000+)

**Action:** Add the following server functions:

```javascript
/**
 * Creates a transcription job for batch processing
 * Uses Gemini Batch API for 50% cost savings
 */
function createTranscriptionJob(observationId, filename, prompt) {
    try {
        const userContext = createUserContext();
        if (userContext.role !== SPECIAL_ROLES.PEER_EVALUATOR && 
            userContext.role !== SPECIAL_ROLES.ADMINISTRATOR) {
            return { success: false, error: ERROR_MESSAGES.PERMISSION_DENIED };
        }
        
        const observation = getObservationById(observationId);
        if (!observation) {
            return { success: false, error: 'Observation not found.' };
        }
        
        // Get audio file and check size
        const folder = getOrCreateObservationFolder(observationId);
        const files = folder.getFilesByName(filename);
        if (!files.hasNext()) {
            return { success: false, error: 'Audio file not found.' };
        }
        const audioFile = files.next();
        const fileSizeBytes = audioFile.getSize();
        const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);
        
        // Batch API has higher limits - check 50MB limit (with base64 overhead ~37MB source)
        if (fileSizeBytes > 37 * 1024 * 1024) {
            return { 
                success: false, 
                error: `File too large (${fileSizeMB}MB). Maximum size for batch transcription is 37MB. Please use the "Copy Prompt" option for larger files.`
            };
        }
        
        // Generate unique job ID
        const jobId = Utilities.getUuid();
        
        // Store job in Script Properties
        const jobData = {
            jobId: jobId,
            observationId: observationId,
            filename: filename,
            prompt: prompt,
            status: 'pending', // pending, processing, complete, failed
            createdAt: new Date().toISOString(),
            createdBy: userContext.email,
            fileSizeMB: fileSizeMB,
            fileId: audioFile.getId(),
            attempts: 0,
            batchJobName: null
        };
        
        const properties = PropertiesService.getScriptProperties();
        properties.setProperty('transcription_job_' + jobId, JSON.stringify(jobData));
        
        // Add to job queue
        let jobQueue = properties.getProperty('transcription_queue');
        jobQueue = jobQueue ? JSON.parse(jobQueue) : [];
        jobQueue.push(jobId);
        properties.setProperty('transcription_queue', JSON.stringify(jobQueue));
        
        debugLog('Batch transcription job created', { jobId, filename, fileSizeMB });
        
        const estimatedMinutes = Math.ceil(fileSizeMB / 2) + 15;
        
        return {
            success: true,
            jobId: jobId,
            status: 'pending',
            estimatedWaitMinutes: estimatedMinutes,
            message: `Batch transcription job queued. Estimated completion: ${estimatedMinutes} minutes`,
            costSavings: '50% cheaper using Batch API'
        };
        
    } catch (error) {
        console.error('Error creating batch transcription job:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Checks the status of a transcription job
 */
function checkTranscriptionJobStatus(jobId) {
    try {
        const properties = PropertiesService.getScriptProperties();
        const jobDataStr = properties.getProperty('transcription_job_' + jobId);
        
        if (!jobDataStr) {
            return { success: false, error: 'Job not found' };
        }
        
        const jobData = JSON.parse(jobDataStr);
        
        return {
            success: true,
            status: jobData.status,
            jobId: jobId,
            filename: jobData.filename,
            createdAt: jobData.createdAt,
            completedAt: jobData.completedAt,
            transcriptionUrl: jobData.transcriptionUrl,
            error: jobData.error,
            progress: jobData.progress || 'Waiting in queue...'
        };
        
    } catch (error) {
        console.error('Error checking job status:', error);
        return { success: false, error: error.message };
    }
}
```

**Success Criteria:**
- ✅ Job is created and stored in Script Properties
- ✅ Job ID is generated uniquely
- ✅ File size is validated
- ✅ Job is added to queue
- ✅ Appropriate response is returned to client
- ✅ Permission checks work correctly

---

### Step 4: Add Batch API Processing Functions

**File:** `server/Code.js`

**Location:** After the job creation functions

**Action:** Add the queue processor and API integration:

```javascript
/**
 * Processes transcription queue using Gemini Batch API
 * This runs on a time-based trigger (every 15-30 minutes)
 */
function processTranscriptionQueue() {
    const startTime = new Date().getTime();
    const MAX_EXECUTION_TIME = 5 * 60 * 1000; // 5 minutes buffer
    
    try {
        const properties = PropertiesService.getScriptProperties();
        let jobQueue = properties.getProperty('transcription_queue');
        
        if (!jobQueue) {
            debugLog('Transcription queue empty');
            return;
        }
        
        jobQueue = JSON.parse(jobQueue);
        if (jobQueue.length === 0) {
            debugLog('No pending transcription jobs');
            return;
        }
        
        const apiKey = properties.getProperty('GEMINI_API_KEY');
        if (!apiKey) {
            console.error('GEMINI_API_KEY not configured');
            return;
        }
        
        // Separate jobs by status
        const pendingJobs = [];
        const processingJobs = [];
        
        jobQueue.forEach(jobId => {
            const jobDataStr = properties.getProperty('transcription_job_' + jobId);
            if (!jobDataStr) {
                console.error('Job data not found:', jobId);
                return;
            }
            
            const jobData = JSON.parse(jobDataStr);
            
            if (jobData.status === 'pending') {
                pendingJobs.push({ jobId, jobData });
            } else if (jobData.status === 'processing' && jobData.batchJobName) {
                processingJobs.push({ jobId, jobData });
            }
        });
        
        debugLog('Queue status', {
            total: jobQueue.length,
            pending: pendingJobs.length,
            processing: processingJobs.length
        });
        
        // STEP 1: Check status of processing jobs
        for (const job of processingJobs) {
            try {
                const result = checkBatchJobStatus(job.jobData.batchJobName, apiKey);
                
                if (result.state === 'SUCCEEDED') {
                    completeBatchTranscription(job.jobId, job.jobData, result, apiKey);
                } else if (result.state === 'FAILED') {
                    job.jobData.status = 'failed';
                    job.jobData.error = result.error || 'Batch API processing failed';
                    properties.setProperty('transcription_job_' + job.jobId, JSON.stringify(job.jobData));
                    
                    jobQueue = jobQueue.filter(id => id !== job.jobId);
                    properties.setProperty('transcription_queue', JSON.stringify(jobQueue));
                    
                    sendTranscriptionNotification(job.jobData, false);
                }
            } catch (error) {
                console.error('Error checking batch job status:', error);
            }
        }
        
        // STEP 2: Submit pending jobs to Batch API
        if (pendingJobs.length > 0) {
            const jobsToSubmit = pendingJobs.slice(0, 5); // Process up to 5 per trigger
            
            for (const job of jobsToSubmit) {
                try {
                    const elapsedTime = new Date().getTime() - startTime;
                    if (elapsedTime > MAX_EXECUTION_TIME) {
                        debugLog('Approaching execution limit, stopping job submission');
                        break;
                    }
                    
                    const batchResult = submitToBatchAPI(job.jobId, job.jobData, apiKey);
                    
                    if (batchResult.success) {
                        job.jobData.status = 'processing';
                        job.jobData.batchJobName = batchResult.batchJobName;
                        job.jobData.submittedAt = new Date().toISOString();
                        properties.setProperty('transcription_job_' + job.jobId, JSON.stringify(job.jobData));
                        
                        debugLog('Job submitted to Batch API', {
                            jobId: job.jobId,
                            batchJobName: batchResult.batchJobName
                        });
                    } else {
                        job.jobData.attempts = (job.jobData.attempts || 0) + 1;
                        
                        if (job.jobData.attempts >= 3) {
                            job.jobData.status = 'failed';
                            job.jobData.error = batchResult.error;
                            properties.setProperty('transcription_job_' + job.jobId, JSON.stringify(job.jobData));
                            
                            jobQueue = jobQueue.filter(id => id !== job.jobId);
                            properties.setProperty('transcription_queue', JSON.stringify(jobQueue));
                            
                            sendTranscriptionNotification(job.jobData, false);
                        } else {
                            job.jobData.error = batchResult.error;
                            properties.setProperty('transcription_job_' + job.jobId, JSON.stringify(job.jobData));
                        }
                    }
                } catch (error) {
                    console.error('Error submitting job to Batch API:', error);
                }
            }
        }
        
    } catch (error) {
        console.error('Error in processTranscriptionQueue:', error);
    }
}

/**
 * Submits a transcription job to Gemini Batch API
 */
function submitToBatchAPI(jobId, jobData, apiKey) {
    try {
        const audioFile = DriveApp.getFileById(jobData.fileId);
        const audioBlob = audioFile.getBlob();
        const audioBytes = audioBlob.getBytes();
        const base64Audio = Utilities.base64Encode(audioBytes);
        const mimeType = audioFile.getMimeType();
        
        const model = 'gemini-flash-lite-latest';
        const batchApiUrl = `https://generativelanguage.googleapis.com/v1beta/batches?key=${apiKey}`;
        
        const payload = {
            requests: [
                {
                    model: `models/${model}`,
                    contents: [{
                        parts: [
                            { text: jobData.prompt },
                            {
                                inline_data: {
                                    mime_type: mimeType,
                                    data: base64Audio
                                }
                            }
                        ]
                    }],
                    generationConfig: {
                        temperature: 0.2,
                        topK: 40,
                        topP: 0.95,
                        maxOutputTokens: 8192
                    }
                }
            ]
        };
        
        const options = {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
        };
        
        debugLog('Submitting to Gemini Batch API', {
            jobId: jobId,
            model: model,
            filename: jobData.filename
        });
        
        const response = UrlFetchApp.fetch(batchApiUrl, options);
        const responseCode = response.getResponseCode();
        const responseText = response.getContentText();
        
        if (responseCode !== 200 && responseCode !== 201) {
            console.error('Batch API submission error:', responseCode, responseText);
            return { 
                success: false, 
                error: `Batch API error ${responseCode}` 
            };
        }
        
        const jsonResponse = JSON.parse(responseText);
        const batchJobName = jsonResponse.name;
        
        if (!batchJobName) {
            return {
                success: false,
                error: 'Batch API did not return job name'
            };
        }
        
        return {
            success: true,
            batchJobName: batchJobName
        };
        
    } catch (error) {
        console.error('Error submitting to Batch API:', error);
        return { 
            success: false, 
            error: error.message 
        };
    }
}

/**
 * Checks the status of a Gemini Batch API job
 */
function checkBatchJobStatus(batchJobName, apiKey) {
    try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/${batchJobName}?key=${apiKey}`;
        
        const options = {
            method: 'get',
            muteHttpExceptions: true
        };
        
        const response = UrlFetchApp.fetch(apiUrl, options);
        const responseCode = response.getResponseCode();
        const responseText = response.getContentText();
        
        if (responseCode !== 200) {
            console.error('Batch status check error:', responseCode, responseText);
            return { 
                state: 'UNKNOWN',
                error: `Status check error: ${responseCode}` 
            };
        }
        
        const jsonResponse = JSON.parse(responseText);
        
        return {
            state: jsonResponse.state,
            metadata: jsonResponse.metadata,
            results: jsonResponse.results,
            error: jsonResponse.error
        };
        
    } catch (error) {
        console.error('Error checking batch status:', error);
        return { 
            state: 'UNKNOWN',
            error: error.message 
        };
    }
}

/**
 * Completes a batch transcription job
 */
function completeBatchTranscription(jobId, jobData, batchResult, apiKey) {
    const lock = LockService.getScriptLock();
    
    try {
        lock.waitLock(10000);
        
        const properties = PropertiesService.getScriptProperties();
        
        if (!batchResult.results || batchResult.results.length === 0) {
            throw new Error('No results in batch response');
        }
        
        const result = batchResult.results[0];
        
        if (!result.response || !result.response.candidates || result.response.candidates.length === 0) {
            throw new Error('No transcription in batch result');
        }
        
        const transcriptionText = result.response.candidates[0].content.parts[0].text;
        
        if (!transcriptionText) {
            throw new Error('Empty transcription received');
        }
        
        const observation = getObservationById(jobData.observationId);
        if (!observation) {
            throw new Error('Observation not found');
        }
        
        // Save transcription to Google Doc
        const folder = getOrCreateObservationFolder(jobData.observationId);
        const docUrl = saveTranscriptionToDoc(folder, jobData.filename, transcriptionText, observation);
        
        // Update observation record
        if (!observation.transcriptions) {
            observation.transcriptions = [];
        }
        observation.transcriptions.push({
            audioFilename: jobData.filename,
            docUrl: docUrl,
            timestamp: new Date().toISOString(),
            transcribedBy: jobData.createdBy,
            jobId: jobId,
            method: 'batch_api'
        });
        updateObservationInSheet(observation);
        
        // Mark job as complete
        jobData.status = 'complete';
        jobData.completedAt = new Date().toISOString();
        jobData.transcriptionUrl = docUrl;
        jobData.transcriptionContent = transcriptionText;
        properties.setProperty('transcription_job_' + jobId, JSON.stringify(jobData));
        
        // Remove from queue
        let jobQueue = JSON.parse(properties.getProperty('transcription_queue') || '[]');
        jobQueue = jobQueue.filter(id => id !== jobId);
        properties.setProperty('transcription_queue', JSON.stringify(jobQueue));
        
        sendTranscriptionNotification(jobData, true);
        
        debugLog('Batch transcription completed', { 
            jobId, 
            docUrl,
            processingTime: calculateProcessingTime(jobData)
        });
        
    } catch (error) {
        console.error('Error completing batch transcription:', error);
        
        jobData.status = 'failed';
        jobData.error = error.message;
        PropertiesService.getScriptProperties().setProperty('transcription_job_' + jobId, JSON.stringify(jobData));
        
        let jobQueue = JSON.parse(PropertiesService.getScriptProperties().getProperty('transcription_queue') || '[]');
        jobQueue = jobQueue.filter(id => id !== jobId);
        PropertiesService.getScriptProperties().setProperty('transcription_queue', JSON.stringify(jobQueue));
        
        sendTranscriptionNotification(jobData, false);
        
    } finally {
        lock.releaseLock();
    }
}

/**
 * Saves transcription as Google Doc
 */
function saveTranscriptionToDoc(folder, audioFilename, transcriptionContent, observation) {
    try {
        const docTitle = `Transcript - ${audioFilename.replace(/\.[^/.]+$/, '')}`;
        const doc = DocumentApp.create(docTitle);
        const body = doc.getBody();
        
        // Header
        const header = body.appendParagraph('OBSERVATION TRANSCRIPTION');
        header.setHeading(DocumentApp.ParagraphHeading.HEADING1);
        header.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
        
        body.appendParagraph('');
        
        // Metadata
        body.appendParagraph('Audio File: ' + audioFilename).setBold(true);
        body.appendParagraph('Observed: ' + observation.observedName);
        body.appendParagraph('Date: ' + new Date().toLocaleDateString());
        body.appendParagraph('');
        
        body.appendHorizontalRule();
        body.appendParagraph('');
        
        // Transcription
        const transcriptPara = body.appendParagraph(transcriptionContent);
        transcriptPara.setSpacingBefore(10);
        transcriptPara.setSpacingAfter(10);
        
        doc.saveAndClose();
        
        // Move to observation folder
        const docFile = DriveApp.getFileById(doc.getId());
        folder.addFile(docFile);
        DriveApp.getRootFolder().removeFile(docFile);
        
        return docFile.getUrl();
        
    } catch (error) {
        console.error('Error saving transcription to doc:', error);
        throw error;
    }
}

/**
 * Sends email notification about transcription
 */
function sendTranscriptionNotification(jobData, success) {
    try {
        const observation = getObservationById(jobData.observationId);
        if (!observation) return;
        
        const subject = success 
            ? '✅ Transcription Complete - ' + jobData.filename
            : '❌ Transcription Failed - ' + jobData.filename;
        
        let body = `Hello,\n\n`;
        
        if (success) {
            body += `Your audio transcription is ready!\n\n`;
            body += `File: ${jobData.filename}\n`;
            body += `Observation: ${observation.observedName}\n`;
            body += `Processing time: ${calculateProcessingTime(jobData)}\n\n`;
            body += `💰 Processed using Gemini Batch API (50% cost savings)\n\n`;
            body += `View transcript: ${jobData.transcriptionUrl}\n\n`;
            body += `NEXT STEPS:\n`;
            body += `1. Open the transcript above\n`;
            body += `2. Copy the entire transcript\n`;
            body += `3. Open your observation and click "Open Script Editor"\n`;
            body += `4. Paste the transcript\n`;
            body += `5. Click "Auto-Tag Evidence" to automatically identify subdomain references\n\n`;
            body += `The auto-tag feature will find all mentions of subdomains (like 1a, 2b, 3c) and tag them to the correct components!`;
        } else {
            body += `Your audio transcription encountered an error.\n\n`;
            body += `File: ${jobData.filename}\n`;
            body += `Error: ${jobData.error}\n\n`;
            body += `Please try using the "Copy Prompt & Open Gemini" option for manual transcription.`;
        }
        
        body += `\n\n---\nPeer Evaluator System`;
        
        MailApp.sendEmail({
            to: jobData.createdBy,
            subject: subject,
            body: body
        });
        
    } catch (error) {
        console.error('Error sending notification:', error);
    }
}

/**
 * Helper to calculate processing time
 */
function calculateProcessingTime(jobData) {
    if (!jobData.submittedAt || !jobData.completedAt) {
        return 'Unknown';
    }
    
    const submitted = new Date(jobData.submittedAt);
    const completed = new Date(jobData.completedAt);
    const diffMinutes = Math.round((completed - submitted) / 60000);
    
    return `${diffMinutes} minutes`;
}
```

**Success Criteria:**
- ✅ Queue processor runs without errors
- ✅ Jobs are submitted to Batch API successfully
- ✅ Batch API responses are parsed correctly
- ✅ Transcriptions are saved as Google Docs
- ✅ Observation records are updated
- ✅ Email notifications are sent
- ✅ Failed jobs are handled gracefully
- ✅ Retry logic works for transient failures

---

### Step 5: Install Time-Based Trigger

**File:** `server/Code.js`

**Location:** Add trigger management functions

**Action:** Add these functions:

```javascript
/**
 * Installs the time-based trigger for batch transcription processing
 */
function installTranscriptionTrigger(frequency = 'moderate') {
    // Delete existing triggers
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
        if (trigger.getHandlerFunction() === 'processTranscriptionQueue') {
            ScriptApp.deleteTrigger(trigger);
        }
    });
    
    let trigger;
    
    switch(frequency) {
        case 'frequent':
            // Every 5 minutes
            trigger = ScriptApp.newTrigger('processTranscriptionQueue')
                .timeBased()
                .everyMinutes(5)
                .create();
            console.log('Trigger installed - FREQUENT (every 5 minutes)');
            break;
            
        case 'moderate':
            // Every 15 minutes (DEFAULT)
            trigger = ScriptApp.newTrigger('processTranscriptionQueue')
                .timeBased()
                .everyMinutes(15)
                .create();
            console.log('Trigger installed - MODERATE (every 15 minutes)');
            break;
            
        case 'relaxed':
            // Every 30 minutes
            trigger = ScriptApp.newTrigger('processTranscriptionQueue')
                .timeBased()
                .everyMinutes(30)
                .create();
            console.log('Trigger installed - RELAXED (every 30 minutes)');
            break;
            
        case 'hourly':
            // Every hour
            trigger = ScriptApp.newTrigger('processTranscriptionQueue')
                .timeBased()
                .everyHours(1)
                .create();
            console.log('Trigger installed - HOURLY');
            break;
            
        default:
            console.error('Invalid frequency. Use: frequent, moderate, relaxed, or hourly');
            return;
    }
    
    PropertiesService.getScriptProperties().setProperty('transcription_trigger_frequency', frequency);
}

/**
 * Uninstalls the transcription trigger
 */
function uninstallTranscriptionTrigger() {
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
        if (trigger.getHandlerFunction() === 'processTranscriptionQueue') {
            ScriptApp.deleteTrigger(trigger);
        }
    });
    console.log('Transcription trigger uninstalled');
}

/**
 * Cleans up old completed/failed jobs
 */
function cleanupOldTranscriptionJobs() {
    const properties = PropertiesService.getScriptProperties();
    const allProperties = properties.getProperties();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7); // Keep jobs for 7 days
    
    let cleanedCount = 0;
    
    for (const key in allProperties) {
        if (key.startsWith('transcription_job_')) {
            try {
                const jobData = JSON.parse(allProperties[key]);
                const jobDate = new Date(jobData.createdAt);
                
                if (jobDate < cutoffDate && (jobData.status === 'complete' || jobData.status === 'failed')) {
                    properties.deleteProperty(key);
                    cleanedCount++;
                }
            } catch (error) {
                console.error('Error cleaning up job:', key, error);
            }
        }
    }
    
    console.log(`Cleaned up ${cleanedCount} old transcription jobs`);
}
```

**Manual Setup Steps:**

1. Open Apps Script Editor
2. Run `installTranscriptionTrigger('moderate')` from the console
3. Grant necessary permissions
4. Verify trigger is created in Triggers menu

**Success Criteria:**
- ✅ Trigger is created successfully
- ✅ Trigger fires on schedule (check execution logs)
- ✅ Trigger can be uninstalled cleanly
- ✅ Cleanup function removes old jobs

---

## Phase 2 Success Criteria

### Functional Requirements
- ✅ Jobs are created and queued correctly
- ✅ Trigger processes queue on schedule
- ✅ Batch API receives requests successfully
- ✅ Batch API status is checked correctly
- ✅ Transcriptions are saved as Google Docs
- ✅ Observation records are updated
- ✅ Email notifications are sent
- ✅ Failed jobs retry up to 3 times
- ✅ Completed jobs are removed from queue

### User Experience Requirements
- ✅ Clear distinction between manual and batch options
- ✅ Informative success messages with wait times
- ✅ Email notifications are clear and actionable
- ✅ Cost savings are highlighted
- ✅ Error messages are helpful

### Technical Requirements
- ✅ No 6-minute timeout issues
- ✅ Script locks prevent race conditions
- ✅ Proper error handling at all stages
- ✅ API responses are validated
- ✅ Logs provide debugging information
- ✅ Uses correct model: `models/gemini-flash-lite-latest`
- ✅ 50% cost savings verified in usage reports

---

# Testing & Validation

## Phase 1 Testing

### Manual Testing Checklist

**Test Case 1: Modal Functionality**
- [ ] Open audio modal (View Recordings)
- [ ] Click "Transcribe" button on audio file
- [ ] Verify transcription modal opens
- [ ] Check all checkboxes toggle correctly
- [ ] Verify prompt preview updates in real-time
- [ ] Type in custom instructions
- [ ] Verify preview updates with custom text
- [ ] Close modal with X button
- [ ] Verify modal closes cleanly

**Test Case 2: Prompt Generation**
- [ ] Select various checkbox combinations
- [ ] Verify assigned subdomains appear in prompt
- [ ] Verify staff name appears as main speaker
- [ ] Verify role and year appear when selected
- [ ] Add custom instructions
- [ ] Verify custom instructions appear in prompt
- [ ] Check prompt is grammatically correct

**Test Case 3: Copy & Open Workflow**
- [ ] Click "Copy Prompt & Open Gemini"
- [ ] Verify prompt is copied to clipboard
- [ ] Verify Gemini Gem opens in new tab
- [ ] Verify correct Gem URL
- [ ] Verify toast notification appears
- [ ] Paste prompt in Gemini (manual)
- [ ] Upload audio file (manual)
- [ ] Verify Gemini generates transcript

**Test Case 4: Integration with Script Editor**
- [ ] Copy transcript from Gemini
- [ ] Open Script Editor in observation
- [ ] Paste transcript
- [ ] Click "Auto-Tag Evidence"
- [ ] Verify subdomains are identified and tagged
- [ ] Verify tags are saved correctly

### Browser Compatibility Testing

Test on:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Chrome (iOS/Android)
- [ ] Mobile Safari (iOS)

### Role Testing

Test with:
- [ ] Peer Evaluator account
- [ ] Administrator account
- [ ] Regular staff account (should not see feature)

---

## Phase 2 Testing

### Manual Testing Checklist

**Test Case 1: Job Creation**
- [ ] Open transcription modal
- [ ] Click "Queue Batch Transcription"
- [ ] Verify success message appears
- [ ] Verify job ID is generated
- [ ] Check Script Properties for job data
- [ ] Verify job is in queue

**Test Case 2: Trigger Processing**
- [ ] Wait for trigger to fire (15 minutes)
- [ ] Check execution logs
- [ ] Verify job status changed to "processing"
- [ ] Verify Batch API received request
- [ ] Check for any errors in logs

**Test Case 3: Completion**
- [ ] Wait for Batch API to complete
- [ ] Verify email notification received
- [ ] Click link in email
- [ ] Verify Google Doc was created
- [ ] Verify transcript content is correct
- [ ] Verify observation record was updated
- [ ] Verify job removed from queue

**Test Case 4: Error Handling**
- [ ] Submit job with corrupted audio file
- [ ] Verify failure notification received
- [ ] Verify job is marked as failed
- [ ] Verify retry logic (up to 3 attempts)
- [ ] Verify error messages are helpful

**Test Case 5: Multiple Jobs**
- [ ] Submit 5 jobs simultaneously
- [ ] Verify all jobs are queued
- [ ] Wait for trigger processing
- [ ] Verify jobs are processed in order
- [ ] Verify all complete successfully
- [ ] Verify all emails sent

### API Testing

- [ ] Verify correct model used: `models/gemini-flash-lite-latest`
- [ ] Check API usage in Google Cloud Console
- [ ] Verify 50% cost savings vs standard API
- [ ] Monitor API quota usage
- [ ] Test with various audio formats (MP3, WAV, M4A)
- [ ] Test with various file sizes (1MB, 10MB, 30MB)

### Performance Testing

- [ ] Measure trigger execution time
- [ ] Verify stays under 6-minute limit
- [ ] Monitor queue processing speed
- [ ] Check for memory leaks
- [ ] Verify cleanup function works

---

# Deployment Checklist

## Pre-Deployment (Development)

- [ ] All Phase 1 code is tested and working
- [ ] All Phase 2 code is tested and working
- [ ] No console errors
- [ ] Code follows naming conventions
- [ ] Comments explain complex logic
- [ ] GEMINI_API_KEY is set in Script Properties
- [ ] Test accounts verified functionality

## Deployment Steps

### Step 1: Backup Current Version
- [ ] Create backup copy of entire Apps Script project
- [ ] Document current version number
- [ ] Export current Script Properties (backup)

### Step 2: Deploy Phase 1
- [ ] Push code to Apps Script
- [ ] Deploy new version
- [ ] Test with Peer Evaluator test account
- [ ] Test with Administrator test account
- [ ] Monitor for 24 hours
- [ ] Gather user feedback

### Step 3: Deploy Phase 2 (After Phase 1 is Stable)
- [ ] Push additional server code
- [ ] Run `installTranscriptionTrigger('moderate')`
- [ ] Verify trigger is installed
- [ ] Submit test job
- [ ] Wait for completion
- [ ] Verify entire workflow
- [ ] Monitor for 1 week

### Step 4: Documentation
- [ ] Update user documentation
- [ ] Create internal training materials
- [ ] Document trigger frequency settings
- [ ] Document troubleshooting steps

## Post-Deployment Monitoring

### Week 1
- [ ] Monitor Apps Script execution logs daily
- [ ] Check for permission errors
- [ ] Verify Drive operations working
- [ ] Collect user feedback
- [ ] Monitor API usage and costs

### Week 2-4
- [ ] Monitor for edge cases
- [ ] Track usage statistics
- [ ] Adjust trigger frequency if needed
- [ ] Document any issues
- [ ] Optimize based on usage patterns

### Monthly
- [ ] Run `cleanupOldTranscriptionJobs()`
- [ ] Review API costs vs savings
- [ ] Check queue health
- [ ] Review error logs
- [ ] Update documentation

---

# Maintenance & Monitoring

## Regular Maintenance Tasks

### Daily
- [ ] Check Apps Script execution logs for errors
- [ ] Monitor queue length (should stay < 10)
- [ ] Verify email notifications are being sent

### Weekly
- [ ] Review failed jobs
- [ ] Check API quota usage
- [ ] Verify trigger is still installed
- [ ] Review user feedback

### Monthly
- [ ] Run cleanup function: `cleanupOldTranscriptionJobs()`
- [ ] Review cost savings report
- [ ] Update trigger frequency if needed
- [ ] Archive old job data

## Monitoring Commands

Run these in Apps Script console for status checks:

```javascript
// Check queue status
function checkQueueHealth() {
    const properties = PropertiesService.getScriptProperties();
    const queue = JSON.parse(properties.getProperty('transcription_queue') || '[]');
    
    console.log('Queue length:', queue.length);
    
    queue.forEach(jobId => {
        const jobData = JSON.parse(properties.getProperty('transcription_job_' + jobId));
        console.log(jobId + ':', jobData.status, '-', jobData.filename);
    });
}

// Check trigger status
function checkTriggerStatus() {
    const triggers = ScriptApp.getProjectTriggers();
    const transcriptionTrigger = triggers.find(t => t.getHandlerFunction() === 'processTranscriptionQueue');
    
    if (transcriptionTrigger) {
        console.log('Trigger installed');
        console.log('Type:', transcriptionTrigger.getEventType());
    } else {
        console.log('Trigger NOT installed');
    }
}

// View recent jobs
function viewRecentJobs(count = 10) {
    const properties = PropertiesService.getScriptProperties();
    const allProperties = properties.getProperties();
    const jobs = [];
    
    for (const key in allProperties) {
        if (key.startsWith('transcription_job_')) {
            jobs.push(JSON.parse(allProperties[key]));
        }
    }
    
    jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    jobs.slice(0, count).forEach(job => {
        console.log(`${job.filename} - ${job.status} - ${job.createdAt}`);
    });
}
```

## Troubleshooting Guide

### Issue: Jobs stuck in "pending"
**Symptoms:** Jobs never move to "processing"
**Solutions:**
1. Check if trigger is installed: `checkTriggerStatus()`
2. Check execution logs for errors
3. Verify GEMINI_API_KEY is set
4. Re-run trigger manually: `processTranscriptionQueue()`

### Issue: Batch API errors
**Symptoms:** Jobs fail with API errors
**Solutions:**
1. Check API key is valid
2. Verify quota hasn't been exceeded
3. Check file size (must be < 37MB)
4. Verify audio format is supported
5. Check Google Cloud Console for API issues

### Issue: No email notifications
**Symptoms:** Transcriptions complete but no emails
**Solutions:**
1. Check MailApp quota (100 emails/day free)
2. Verify email addresses are valid
3. Check spam folders
4. Review execution logs for email errors

### Issue: Trigger not firing
**Symptoms:** Queue not processing automatically
**Solutions:**
1. Reinstall trigger: `installTranscriptionTrigger('moderate')`
2. Check trigger limits (20 triggers max per user)
3. Verify no other triggers interfering
4. Check Apps Script project status

---

# Cost Analysis

## Estimated Costs (Gemini Batch API)

**Assumptions:**
- Average audio file: 20 minutes = ~30MB
- Input tokens: ~20,000 (audio + prompt)
- Output tokens: ~5,000 (transcript)

**Gemini Flash Lite Pricing (Batch API - 50% discount):**
- Input: ~$0.075 per 1M tokens → $0.00150 per transcription
- Output: ~$0.30 per 1M tokens → $0.00150 per transcription
- **Total per transcription: ~$0.003 (less than 1 cent)**

**Annual Projections:**

| Transcriptions/Year | Standard API Cost | Batch API Cost | Savings |
|---------------------|------------------|----------------|---------|
| 100 | $0.60 | $0.30 | $0.30 |
| 500 | $3.00 | $1.50 | $1.50 |
| 1,000 | $6.00 | $3.00 | $3.00 |
| 5,000 | $30.00 | $15.00 | $15.00 |

**ROI:**
- Implementation time: 12 hours @ $50/hr = $600
- Break-even: At 100 transcriptions/year, cost is negligible
- Primary value: **Time savings** for observers (30 min/transcription)
- 500 transcriptions = **250 hours saved** = $12,500 value

---

# Appendix

## File Locations Summary

### Client-Side Files
- **Primary file:** `client/peerevaluator/filter-interface.html`
  - HTML structure: Line ~3500-4000 (modal markup)
  - CSS styles: Line ~500-1500 (modal styles)
  - JavaScript: Line ~4000-5000 (modal functions)
  - Button integration: Line ~3500-4000 (audio file rendering)

### Server-Side Files
- **Primary file:** `server/Code.js`
  - Job creation: Line ~2000+ (`createTranscriptionJob`)
  - Queue processor: Line ~2100+ (`processTranscriptionQueue`)
  - Batch API functions: Line ~2300+ (API integration)
  - Trigger management: Line ~2600+ (`installTranscriptionTrigger`)
  - Notification: Line ~2700+ (`sendTranscriptionNotification`)

### Configuration
- **Script Properties:** 
  - `GEMINI_API_KEY` - Required for Phase 2
  - `transcription_queue` - Job queue array
  - `transcription_job_{id}` - Individual job data
  - `transcription_trigger_frequency` - Trigger setting

## Version History

| Version | Date | Changes | Phase |
|---------|------|---------|-------|
| 1.0 | TBD | Initial implementation - Prompt builder modal | Phase 1 |
| 2.0 | TBD | Batch API integration | Phase 2 |

## Support Contacts

- **Technical Issues:** [Your IT contact]
- **User Training:** [Your training contact]
- **API/Billing:** [Your admin contact]

---

**END OF IMPLEMENTATION PLAN**