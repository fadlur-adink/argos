# Google Apps Script Setup

To forward GitLab merge request emails to your local AI Reviewer Agent, follow these steps to configure the Google Apps Script companion.

## 1. Gmail Filter Setup

1. Open Gmail.
2. Create a filter to catch your GitLab merge request notifications. For example:
   - **From:** `gitlab@yourcompany.com` or `gitlab@gitlab.com`
   - **Subject includes:** `Merge request`
3. Action: Apply the label **GitLab/MRs**.

## 2. Deploy Apps Script

1. Go to [Google Apps Script](https://script.google.com/) and create a "New Project".
2. Name it "GitLab MR Forwarder".
3. Delete the default code and paste the contents of `scripts/google-apps-script.js`.
4. Update the configuration constants at the top of the file:
   - `WEBHOOK_URL`: Your local machine's exposed URL (you may need `ngrok` or similar to expose port 8000 to the internet).
   - `GMAIL_LABEL`: The label you created (e.g., `GitLab/MRs`).
5. Save the project (Ctrl+S or Cmd+S).

## 3. Set Up Automation Trigger

1. In the Apps Script editor, click the **Triggers** icon (looks like an alarm clock) on the left sidebar.
2. Click **Add Trigger** (bottom right).
3. Configure the trigger:
   - **Choose which function to run:** `processNewEmails`
   - **Select event source:** `Time-driven`
   - **Select type of time based trigger:** `Minutes timer`
   - **Select minute interval:** `Every minute`
4. Click Save. You will be prompted to grant permissions for the script to access your Gmail and connect to an external service. Follow the prompts to allow it.

## 4. Test It

1. Start your local server: `npm start`.
2. Find an old GitLab MR notification in Gmail, mark it as unread, and apply the `GitLab/MRs` label.
3. Wait up to one minute. You should see the request hit your local server, and the email in Gmail should be marked as read.
