# GCP Project Linking Pre-Flight Checklist

**Date:** 2025-10-07
**GAS Project:** Peer Evaluator Form
**Purpose:** Safe linking of GCP project to GAS project

---

## Phase 1: GCP Project Preparation

### Step 1: Enable Required APIs

In your GCP Console (https://console.cloud.google.com), enable these APIs:

- [X] **Google Sheets API**
  - Navigate to: APIs & Services → Library
  - Search: "Google Sheets API"
  - Click: Enable

- [X] **Google Drive API**
  - Search: "Google Drive API"
  - Click: Enable
  - **Note:** Your GAS project uses Drive API v2

- [X] **Google Docs API**
  - Search: "Google Docs API"
  - Click: Enable

- [X] **Apps Script API**
  - Search: "Apps Script API"
  - Click: Enable

- [X] **Gmail API**
  - Search: "Gmail API"
  - Click: Enable

- [X] **Gemini API**
  - Search: "Gemini API" (for Gemini)
  - Click: Enable

### Step 2: Configure OAuth Consent Screen

Navigate to: APIs & Services → OAuth consent screen

#### Basic Configuration

- [X] **User Type:** Choose one:
  - Internal (Recommended for G Suite/Workspace - no verification needed)

- [X] **App name:** `Peer Evaluator Form` (or your preferred name)

- [X] **User support email:** Your admin email

- [X] **Developer contact email:** Your admin email

- [X] **Authorized domains:** Add your domain (e.g., `yourschool.edu`)

#### OAuth Scopes Configuration

Click "Add or Remove Scopes" and add ALL these scopes:

- [X] `https://www.googleapis.com/auth/script.webapp.deploy`
  - Description: Deploy web apps

- [X] `https://www.googleapis.com/auth/spreadsheets`
  - Description: View and manage Google Sheets

- [X] `https://www.googleapis.com/auth/userinfo.email`
  - Description: See your email address

- [X] `https://www.googleapis.com/auth/script.scriptapp`
  - Description: Run Apps Script functions

- [X] `https://www.googleapis.com/auth/drive`
  - Description: View and manage Google Drive files

- [X] `https://www.googleapis.com/auth/documents`
  - Description: View and manage Google Docs

- [X] `https://www.googleapis.com/auth/script.external_request`
  - Description: Connect to external services

- [X] `https://www.googleapis.com/auth/script.send_mail`
  - Description: Send email on your behalf

#### Test Users (if External + Testing)

If you chose "External" and are in Testing mode:

- [ ] Add your admin email as test user
- [ ] Add 2-3 test users from different roles (Teacher, Admin, Peer Evaluator)

### Step 3: Check Quotas

Navigate to: APIs & Services → Enabled APIs → [Each API] → Quotas

Review default quotas for:

- [X] **Sheets API:**
  - Read requests: 100/100 seconds (per user)
  - Write requests: 100/100 seconds (per user)
  - **Status:** Sufficient / Need increase

- [X] **Drive API:**
  - Queries: 1000/100 seconds (per user)
  - **Status:** Sufficient / Need increase

- [X] **Docs API:**
  - Read/Write requests: 600/60 seconds (per user)
  - **Status:** Sufficient / Need increase

- [X] **Gmail API:**
  - Send: 100/second (per user)
  - **Status:** Sufficient / Need increase

### Step 4: Note Your GCP Project Number

- [X] Navigate to: Home Dashboard
- [X] Copy your **Project Number** (not Project ID): 968674433533
- [ ] Keep this handy for linking step

---

## Phase 2: Pre-Linking Documentation

### Current GAS Project State

Document before making changes:

- [ ] **Current deployment URL:** https://script.google.com/a/macros/orono.k12.mn.us/s/AKfycbyLh4Wl1S7rIVDBIAOOYpg2aVmVY0VGoksAIWSCB_lzi0BebZEpYRNGwwEc-BICEFXMAw/exec
- [X] **Current version number:** v301 on Oct 6, 2025, 6:07 PM
- [X] **Last successful user session:** Oct 7, 2025, 8:05am

### Backup Current Configuration

- [X] Export `appsscript.json` (already in repo ✓)
- [ ] Note all Script Properties:
  ```
  SHEET_ID: 1c-J5D97JW0BiAW7Rpx4GVm0nha3rzbAii5YI_k_xK48
  AUTO_TRIGGER_INFO: {"triggerId":"-7619946037178938931","installedAt":1754481713784,"installedBy":"installRoleChangeAutoTrigger","version":"2.0","spreadsheetId":"1c-J5D97JW0BiAW7Rpx4GVm0nha3rzbAii5YI_k_xK48"}
  GEMINI_API_KEY: [hidden]
  MASTER_CACHE_VERSION: 1.0.0_1759779382357
  OBSERVATIONS_DATABASE: 
  SHEET_HASH_Counselor: 
  SHEET_HASH_Early Childhood: 
  SHEET_HASH_Instructional Specialist: 
  SHEET_HASH_Library/Media Specialist: 
  SHEET_HASH_Nurse: 
  SHEET_HASH_Peer Evaluator: 
  SHEET_HASH_School Psychologist: 
  SHEET_HASH_Settings: 
  SHEET_HASH_Social Worker: 
  SHEET_HASH_Sp.Ed.: 
  SHEET_HASH_Staff: 
  SHEET_HASH_Teacher: 
  SHEET_HASH_Therapeutic Specialist: 
  transcription_queue: ["e30de9e9-bebc-4d1f-b950-f79fbe45dfae"]
  ```
- [ ] Document installed triggers:
  - [ ] List all time-driven triggers
  - [ ] List all event-driven triggers
  - [ ] Note: These will NOT be affected by linking

---

## Phase 3: Linking Process

### Pre-Linking Final Checks

- [X] All APIs enabled in GCP? (Phase 1, Step 1)
- [X] OAuth consent screen configured? (Phase 1, Step 2)
- [X] All scopes added? (Phase 1, Step 2)
- [X] Quotas reviewed? (Phase 1, Step 3)
- [X] Project number ready? (Phase 1, Step 4)
- [X] Backup completed? (Phase 2)

### Timing Recommendation

- [ ] **Planned linking time:** _________________ (off-hours recommended)
- [ ] **Notify users?** Yes / No
- [ ] **Maintenance window:** _________________ (optional)

### Linking Steps

1. **Open GAS Editor:**
   - [ ] Go to: https://script.google.com
   - [ ] Open: Peer Evaluator Form project

2. **Navigate to Project Settings:**
   - [ ] Click: ⚙️ Project Settings (left sidebar)
   - [ ] Scroll to: "Google Cloud Platform (GCP) Project"

3. **Link Project:**
   - [ ] Click: "Change project"
   - [ ] Enter: Your GCP Project Number (from Phase 1, Step 4)
   - [ ] Click: "Set project"
   - [ ] Confirm: Success message appears

4. **Verify Link:**
   - [ ] Refresh page
   - [ ] Confirm: GCP Project Number is displayed
   - [ ] Note: You may see a warning about re-authorization - this is normal

---

## Phase 4: Post-Linking Testing

### Immediate Testing (As Admin)

Test these functions immediately after linking:

- [ ] **Basic Authentication:**
  - [ ] Open web app URL
  - [ ] Login prompt appears (if needed)
  - [ ] Authorization screen shows correct app name and scopes
  - [ ] Authorize and verify successful login

- [ ] **Core Functionality:**
  - [ ] Dashboard loads correctly
  - [ ] User role is detected correctly
  - [ ] Rubric data displays

- [ ] **Sheets Access:**
  - [ ] Test function: `testSheetConnectivity()` in Code.js
  - [ ] Verify: No errors in execution log

- [ ] **Drive Operations:**
  - [ ] Create test observation (as Peer Evaluator role)
  - [ ] Verify: Folder created in Drive
  - [ ] Upload test file
  - [ ] Verify: File appears

- [ ] **PDF Generation:**
  - [ ] Finalize test observation
  - [ ] Verify: PDF generated successfully
  - [ ] Open PDF and check formatting

- [ ] **Email Notifications:**
  - [ ] Finalize observation with email
  - [ ] Verify: Email sent and received
  - [ ] Check: Email formatting correct

- [ ] **Gemini API (if applicable):**
  - [ ] Test transcription function
  - [ ] Verify: API call succeeds
  - [ ] Check: Response is correct

### Test User Testing (Non-Admin)

- [ ] **Test User 1 (Teacher Role):**
  - Email: _________________
  - [ ] Can access web app
  - [ ] Re-authorization required? Yes / No
  - [ ] Dashboard loads
  - [ ] No errors in console

- [ ] **Test User 2 (Peer Evaluator Role):**
  - Email: _________________
  - [ ] Can access web app
  - [ ] Re-authorization required? Yes / No
  - [ ] Can create observation
  - [ ] Can finalize observation
  - [ ] No errors in console

- [ ] **Test User 3 (Administrator Role):**
  - Email: _________________
  - [ ] Can access web app
  - [ ] Re-authorization required? Yes / No
  - [ ] Filter interface works
  - [ ] No errors in console

### Error Monitoring

Monitor for 24-48 hours after linking:

- [ ] **Check Apps Script Logs:**
  - Navigate to: Apps Script Editor → Executions
  - Look for: Authorization errors, API quota errors

- [ ] **Check GCP Error Reporting:**
  - Navigate to: GCP Console → Error Reporting
  - Look for: New error patterns

- [ ] **Monitor User Reports:**
  - [ ] Set up monitoring channel (email, Slack, etc.)
  - [ ] Watch for authorization issues
  - [ ] Watch for functionality breaks

---

## Phase 5: Rollback Plan (If Needed)

### If Critical Issues Occur

1. **Unlink GCP Project:**
   - [ ] GAS Editor → Project Settings
   - [ ] Click: "Change project"
   - [ ] Select: "Default" or create new GCP project
   - [ ] Note: This reverts to GAS-managed default project

2. **User Re-Authorization:**
   - [ ] Users will need to re-authorize again
   - [ ] Send notification with instructions

3. **Investigate Issues:**
   - [ ] Review error logs
   - [ ] Check OAuth consent screen configuration
   - [ ] Verify all APIs are enabled
   - [ ] Check quota limits

4. **Fix and Retry:**
   - [ ] Address identified issues in GCP project
   - [ ] Wait 15-30 minutes for changes to propagate
   - [ ] Retry linking process

---

## Phase 6: Post-Linking Optimization

### After Successful Linking (Optional)

- [ ] **Set up Cloud Monitoring:**
  - Create alerts for quota thresholds
  - Monitor API usage patterns
  - Set up error notifications

- [ ] **Review and Optimize Quotas:**
  - Analyze usage after 1 week
  - Request quota increases if needed
  - Set up quota alerts

- [ ] **Service Account Setup (Optional):**
  - Create service account for backend operations
  - Grant necessary permissions
  - Update code to use service account where appropriate

- [ ] **Update Documentation:**
  - Note GCP project number in CLAUDE.md
  - Document any changes to deployment process
  - Update team documentation

---

## Troubleshooting Guide

### Common Issues and Solutions

#### Issue: "Authorization required" for all users

**Solution:**
- Check OAuth consent screen has all required scopes
- Verify app name matches deployment
- Ensure users are in test user list (if External + Testing)

#### Issue: "Access denied" errors

**Solution:**
- Verify all APIs are enabled
- Check IAM permissions
- Ensure service account (if used) has proper roles

#### Issue: Quota exceeded errors

**Solution:**
- Check quota usage in GCP Console
- Request quota increase
- Optimize code to reduce API calls

#### Issue: Gemini API not working

**Solution:**
- Verify Generative Language API is enabled
- Check API key is valid
- Verify quota for AI/ML APIs

---

## Sign-Off Checklist

Before considering linking complete:

- [ ] All Phase 4 tests passed
- [ ] No critical errors in logs (24-48 hours)
- [ ] No user-reported issues (24-48 hours)
- [ ] Rollback plan documented and understood
- [ ] Team notified of successful linking
- [ ] Documentation updated

---

## Notes and Observations

Use this space to document any issues, observations, or lessons learned:

```
Date: _________________
Issue/Observation:




Resolution:




```

---

## Contact Information

**If issues occur:**
- Project Owner: _________________
- GCP Admin: _________________
- Apps Script Support: https://support.google.com/apps-script

---

**Checklist Completed By:** _________________
**Date:** _________________
**Final Status:** Success / Partial Success / Rollback Required
