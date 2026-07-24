import type { AssignmentInput } from "@/lib/assignments";

const drafts = new Map<string, AssignmentInput>();

export function getAssignmentDraft(key: string) {
  return drafts.get(key);
}

export function saveAssignmentDraft(key: string, draft: AssignmentInput) {
  drafts.set(key, draft);
}

export function clearAssignmentDraft(key: string) {
  drafts.delete(key);
}
