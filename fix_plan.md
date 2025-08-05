# Plan to Enable Editing for Peer Evaluators

## 1. The Problem

The current implementation prevents users with the "Peer Evaluator" role from editing proficiency levels and uploading media. This is because the `createFilteredUserContext` function in `UserService.js` generates a user context that lacks the necessary permissions, treating them as read-only viewers.

## 2. The Solution

The fix involves modifying the `createFilteredUserContext` function to grant editing permissions to Peer Evaluators. This will be achieved by:

1.  **Adding an `isEvaluator` flag:** A new property, `isEvaluator`, will be added to the user context object. This flag will be set to `true` if the requesting user is a "Peer Evaluator."
2.  **Updating the front-end logic:** The JavaScript in `rubric.html` will be modified to check for the `isEvaluator` flag. If the flag is true, the code will proceed to render the editing controls, including the media upload buttons and selectable proficiency level cells.

## 3. Implementation Steps

1.  **Modify `UserService.js`:**
    *   In the `createFilteredUserContext` function, add a check to see if `requestingRole` is equal to `SPECIAL_ROLES.PEER_EVALUATOR`.
    *   If it is, add `isEvaluator: true` to the returned context object.

2.  **Modify `rubric.html`:**
    *   Locate the JavaScript responsible for rendering the proficiency levels and media upload features.
    *   Wrap the execution of this code in a conditional that checks for `userContext.isEvaluator === true`.

This plan will ensure that Peer Evaluators have the appropriate permissions to perform their evaluation duties while maintaining the security and integrity of the system for other roles.