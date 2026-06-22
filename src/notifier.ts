import { execFile } from "child_process";
import { logger } from "./logger";

const defaultNotifLogo = process.env.NOTIF_LOGO_PATH || "";

/**
 * Sends a Windows desktop notification from within WSL.
 * Uses the BurntToast PowerShell module.
 * Note: The windowsImagePath must be an absolute Windows path (e.g. C:\\...)
 */
export async function sendDesktopNotification(
  title: string,
  message: string,
  targetUri?: string,
  windowsImagePath?: string,
): Promise<void> {
  return new Promise((resolve) => {
    const safeTitle = title.replace(/'/g, "''");
    const safeMessage = message.replace(/'/g, "''");
    
    const imagePath = windowsImagePath || defaultNotifLogo;
    const safeImagePath = imagePath.replace(/\\/g, "\\\\");

    // Build the PowerShell command lines
    const psCommands = [
      "Import-Module BurntToast",
      `$Text1 = New-BTText -Content '${safeTitle}'`,
      `$Text2 = New-BTText -Content '${safeMessage}'`,
      `$Image = New-BTImage -Source '${safeImagePath}' -AppLogoOverride`,
      "$Binding = New-BTBinding -Children $Text1, $Text2 -AppLogoOverride $Image",
      "$Visual = New-BTVisual -BindingGeneric $Binding"
    ];

    if (targetUri) {
      psCommands.push(`$Content = New-BTContent -Visual $Visual -Launch '${targetUri}' -ActivationType Protocol`);
    } else {
      psCommands.push("$Content = New-BTContent -Visual $Visual");
    }

    psCommands.push("Submit-BTNotification -Content $Content");

    const psCommand = psCommands.join("; ");

    // execFile completely avoids the shell escaping mess
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psCommand],
      (error) => {
        if (error) {
          logger.error(
            `Error triggering Windows notification: ${error.message}`,
          );
        } else {
          logger.debug("Clickable Windows notification sent successfully via BurntToast");
        }
        resolve(); // Always resolve so it doesn't block the pipeline
      },
    );
  });
}
