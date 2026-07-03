/**
 * Google Apps Script to forward GitLab Merge Request notifications to Argos.
 * 
 * Setup:
 * 1. Create a filter in Gmail to label incoming GitLab MR emails (e.g., label: "GitLab/MRs").
 * 2. Create a new Google Apps Script project at https://script.google.com/
 * 3. Paste this code.
 * 4. Update the WEBHOOK_URL and GMAIL_LABEL.
 * 5. Set up a Time-driven trigger to run the `processNewEmails` function every minute.
 */

const WEBHOOK_URL = 'http://YOUR_SERVER_IP:8000/webhook';
const GMAIL_LABEL = 'GitLab/MRs'; // Change this to the label you use

function processNewEmails() {
  const label = GmailApp.getUserLabelByName(GMAIL_LABEL);
  if (!label) {
    console.error('Label not found: ' + GMAIL_LABEL);
    return;
  }

  // Get unread threads with this label
  const threads = label.getThreads(0, 10);
  
  for (let i = 0; i < threads.length; i++) {
    const messages = threads[i].getMessages();
    
    for (let j = 0; j < messages.length; j++) {
      const message = messages[j];
      
      if (message.isUnread()) {
        const payload = {
          messageId: message.getId(),
          subject: message.getSubject(),
          body: message.getPlainBody() || message.getBody()
        };

        const success = forwardToAgent(payload);
        
        if (success) {
          // Mark as read so we don't process it again
          message.markRead();
        }
      }
    }
  }
}

function forwardToAgent(payload) {
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(WEBHOOK_URL, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode === 202) {
      console.log('Successfully forwarded message: ' + payload.subject);
      return true;
    } else if (responseCode === 422 || responseCode === 400) {
      // The server rejected it (e.g. malformed or unconfigured project).
      // We return true so we mark it as read and don't get stuck in a loop.
      console.warn('Server rejected message (Code ' + responseCode + '): ' + payload.subject);
      return true;
    } else {
      console.error('Failed to forward. Server returned code ' + responseCode);
      return false; // Don't mark as read, retry later
    }
  } catch (error) {
    console.error('Error forwarding to agent: ' + error.toString());
    return false; // Connection failed, retry later
  }
}
