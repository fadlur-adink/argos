export interface MergeRequestEvent {
  projectUrl: string;
  projectName: string;
  mrId: number;
  mrTitle: string;
  mrUrl: string;
  action: 'opened' | 'updated' | 'commented' | 'approved' | 'merged' | 'unknown';
  forceRetry?: boolean;
}

/**
 * Parses a GitLab notification email payload to extract MR details.
 * @param subject Email subject
 * @param body Email body (text or html)
 * @returns Parsed event or null if it cannot be parsed as a relevant MR event
 */
export function parseGitLabEmail(subject: string, body: string): MergeRequestEvent | null {
  // Safely decode percent-encoded strings to handle FireEye wrapped URLs
  // e.g. u=https%3A%2F%2Fgitlab.example.com%2F...
  const decodedBody = body.replace(/(%[0-9A-Fa-f]{2})+/g, match => {
    try {
      return decodeURIComponent(match);
    } catch {
      return match;
    }
  });

  // Extract MR URL from body. Typically looks like:
  // https://gitlab.com/group/project/-/merge_requests/123
  const urlRegex = /(https?:\/\/[^\/]+\/([a-zA-Z0-9_\-\.\/]+)\/-\/merge_requests\/(\d+))/;
  const urlMatch = urlRegex.exec(decodedBody);
  if (!urlMatch) {
    return null;
  }

  const mrUrl = urlMatch[1];
  const fullProjectPath = urlMatch[2]; // e.g. group/project
  const mrIdStr = urlMatch[3];
  const mrId = Number.parseInt(mrIdStr, 10);
  
  const projectUrl = mrUrl.split('/-/merge_requests')[0];
  
  // Extract project name from the path (last segment)
  const pathParts = fullProjectPath.split('/');
  const projectName = pathParts.at(-1) || 'unknown';

  // Try to extract title from subject. 
  // Common format: Project Name | MR Title (!123)
  // or: Re: Project Name | MR Title (!123)
  let mrTitle = "Unknown Title";
  const titleRegex = /\|\s*(.*?)\s*\(!\d+\)/;
  const titleMatch = titleRegex.exec(subject);
  if (titleMatch?.[1]) {
    mrTitle = titleMatch[1];
  } else {
    const fallbackRegex = /\|\s*(.*?)\s*\|/;
    const fallbackMatch = fallbackRegex.exec(subject);
    if (fallbackMatch?.[1]) {
      mrTitle = fallbackMatch[1];
    } else {
      mrTitle = subject.replace(/\[GitLab\]|Re:|Merge request|opened by.*|!\d+/ig, '').trim();
    }
  }

  let action: MergeRequestEvent['action'];
  const lowerBody = decodedBody.toLowerCase();
  
  if (lowerBody.includes('created a merge request') || lowerBody.includes('opened merge request')) {
    action = 'opened';
  } else if (lowerBody.includes('pushed new commits')) {
    action = 'updated';
  } else if (lowerBody.includes('was approved')) {
    action = 'approved';
  } else if (lowerBody.includes('was merged')) {
    action = 'merged';
  } else if (lowerBody.includes('comment') || lowerBody.includes('note')) {
    action = 'commented';
  } else {
    // default to updated if we aren't sure
    action = 'updated';
  }

  return {
    projectUrl,
    projectName,
    mrId,
    mrTitle,
    mrUrl,
    action
  };
}
