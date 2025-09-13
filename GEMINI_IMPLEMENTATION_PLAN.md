# Gemini Transcription Implementation Plan

## Overview
Replace unreliable browser STT with Gemini 2.5 Flash-Lite transcription for recorded audio files.

## Phase 1: Server-Side Implementation

### 1.1 Add New Functions to `server/Code.js`

```javascript
/**
 * Transcribes audio file using Gemini 2.5 Flash-Lite API
 */
function transcribeAudioWithGemini(observationId, audioUrl) {
    // Implementation as provided in artifact
}

/**
 * Extracts component list for Gemini prompt
 */
function extractComponentsForPrompt(rubricData) {
    // Implementation as provided in artifact
}
```

### 1.2 Update Existing Functions
- **No modifications needed** to existing functions
- New functions are additive only

## Phase 2: Client-Side Implementation

### 2.1 Remove STT Code from `client/peerevaluator/filter-interface.html`

**Remove these variables:**
```javascript
// STT (Speech-to-Text) Variables - REMOVE ALL
let sttRecognitionInstance = null;
let sttIsRecording = false;
let sttIsInitializing = false;
let sttLastTranscriptIndex = 0;
let sttFinalTextEndPosition = null;
```

**Remove these functions:**
```javascript
// REMOVE ENTIRELY
function startSpeechRecognition()
function stopSpeechRecognition()
function cleanupSpeechRecognition()
function insertFinalTranscript()
// Plus all STT event handlers
```

**Remove STT button HTML:**
```html
<!-- REMOVE -->
<button id="sttBtn" class="btn btn-outline-secondary btn-sm">🎤</button>
```

### 2.2 Add Gemini Transcription Code

**Add new HTML button:**
```html
<button id="transcribeBtn" class="btn btn-outline-primary btn-sm" 
        title="Transcribe audio recording" style="display: none;">
    🎯 Transcribe Audio
</button>
```

**Add new JavaScript functions:**
```javascript
// Add all transcription functions as provided in artifact
let isTranscribing = false;
function initializeTranscribeButton()
function updateTranscribeButtonVisibility()
function showAudioSelectionModal()
function transcribeAudio()
function insertTranscriptionIntoScript()
```

### 2.3 Update Initialization Code

**Modify existing initialization:**
```javascript
// In initializeScriptEditor() or similar init function
// REMOVE: STT initialization
// ADD: initializeTranscribeButton();

// In loadObservationForEditing() or similar
// ADD: updateTranscribeButtonVisibility();
```

### 2.4 Update Window Unload Handler

**Remove STT cleanup from beforeunload:**
```javascript
window.addEventListener('beforeunload', function(e) {
    stopStateMonitoring();
    
    // REMOVE: STT-related code
    // if ((sttIsRecording || isScriptDirty) && scriptQuill && currentObservationId) {
    
    // KEEP: Script dirty check (but remove sttIsRecording check)
    if (isScriptDirty && scriptQuill && currentObservationId) {
        // ... existing backup logic
    }
    
    // REMOVE: cleanupSpeechRecognition();
});
```

## Phase 3: UI Integration

### 3.1 Button Placement
- Position transcribe button in script editor toolbar
- Show only when audio recordings exist
- Hide during transcription process

### 3.2 Modal Implementation
- Bootstrap modal for multiple audio file selection
- Clean, accessible interface
- Proper cleanup on close

### 3.3 Loading States
- Button disabled during transcription
- Progress indicator: "⏳ Transcribing..."
- Toast notifications for status updates

## Phase 4: Error Handling

### 4.1 Server-Side Errors
- Invalid audio file URL
- API failures
- Permission issues
- File access problems

### 4.2 Client-Side Errors
- Network failures
- Missing audio files
- Script editor issues
- Modal initialization problems

### 4.3 Fallback Behavior
- Graceful degradation when API unavailable
- Clear error messages to users
- Maintain existing script editor functionality

## Phase 5: Testing Strategy

### 5.1 Regression Testing
**Verify these continue working:**
- Script editor basic functionality (typing, formatting)
- Script saving and loading
- Component tagging system
- PDF export functionality
- Audio recording uploads
- Observation workflow

### 5.2 New Feature Testing
**Test scenarios:**
- Single audio file transcription
- Multiple audio file selection
- Large audio files (>30 minutes)
- Poor quality audio
- API failures
- Network interruptions
- Different user roles/permissions

### 5.3 Browser Compatibility
- Chrome (primary)
- Firefox
- Safari
- Edge

## Phase 6: Deployment Plan

### 6.1 Pre-Deployment
1. **Backup current version** of Apps Script project
2. **Test in development environment** with real audio files
3. **Verify API credentials** and quotas
4. **Check cost monitoring** setup

### 6.2 Deployment Steps
1. **Deploy server-side changes first**
2. **Test server functions** independently
3. **Deploy client-side changes**
4. **Verify end-to-end functionality**
5. **Monitor for errors** in execution transcript

### 6.3 Rollback Plan
**If issues arise:**
1. Revert client-side changes immediately
2. Keep server-side functions (they don't affect existing functionality)
3. Re-enable STT code if needed temporarily
4. Investigate and fix issues in development

## Phase 7: Monitoring & Optimization

### 7.1 Usage Monitoring
- Track transcription requests
- Monitor API costs
- Log error rates
- User feedback collection

### 7.2 Performance Optimization
- Audio file size limits
- Chunking for very long recordings
- Caching strategies for repeated transcriptions

## Risk Mitigation

### High-Risk Areas
1. **Script editor functionality** - Thoroughly test all existing features
2. **Audio file access** - Ensure proper Drive permissions
3. **API rate limits** - Monitor usage patterns
4. **Cost overruns** - Implement usage tracking

### Low-Risk Areas
1. **Server-side additions** - New functions don't affect existing code
2. **UI additions** - New button doesn't interfere with existing UI
3. **Observation workflow** - No changes to core observation process

## Success Criteria

### Must Have
- ✅ All existing functionality continues working
- ✅ Audio transcription works for single files
- ✅ Error handling prevents crashes
- ✅ No cost overruns

### Should Have
- ✅ Multiple audio file selection
- ✅ Component tagging in transcriptions
- ✅ Good user experience with loading states

### Nice to Have
- ✅ Transcription quality optimization
- ✅ Advanced error recovery
- ✅ Usage analytics

## Timeline Estimate
- **Phase 1-2**: 2-3 hours (core implementation)
- **Phase 3**: 1 hour (UI polish)
- **Phase 4**: 1 hour (error handling)
- **Phase 5**: 2-3 hours (testing)
- **Total**: 6-8 hours development + testing time

## Cost Impact
- **Gemini 2.5 Flash-Lite**: $0.30/1M audio tokens + $0.40/1M output tokens
- **Estimated monthly cost**: $2-4 for typical usage (100 employees, 3 observations/year)
- **Significant savings** vs current paid transcription services
