export interface WorkspaceCreateInput {
  name?: string;
  repoUrl?: string;
  startingRef?: string;
}

const FORM_CONTENT_TYPE = "application/x-www-form-urlencoded";

export function isFormSubmission(contentType: string | undefined): boolean {
  return contentType?.split(";", 1)[0]?.trim().toLowerCase() === FORM_CONTENT_TYPE;
}

export function parseWorkspaceCreateInput(
  raw: string,
  contentType: string | undefined,
): WorkspaceCreateInput {
  if (isFormSubmission(contentType)) {
    const form = new URLSearchParams(raw);
    return {
      name: form.get("name") ?? undefined,
      repoUrl: form.get("repoUrl") ?? undefined,
      startingRef: form.get("startingRef") ?? undefined,
    };
  }

  if (!raw.trim()) return {};
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SyntaxError("Request body must be an object");
  }
  return parsed as WorkspaceCreateInput;
}
