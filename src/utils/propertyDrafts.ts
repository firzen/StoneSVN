import { reactive } from 'vue'

// Shared by the commit inspector and property browser, including pending deletions.
export const propertyDrafts = reactive(new Map<string, Record<string, string>>())
export const propertyDraftKey = (workspace: string, file: string) => JSON.stringify([workspace, file])
