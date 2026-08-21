import type { SearchCriteria } from '../SearchCriteria.js'

/** Reads a role definition file (roles/*.md) into criteria. */
export interface RoleReader {
  read(path: string): Promise<{ criteria: SearchCriteria; context: string }>
}
