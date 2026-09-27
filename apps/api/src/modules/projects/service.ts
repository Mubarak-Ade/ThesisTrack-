import { findProjectById } from './repository.js';
import type { ProjectRow } from './types.js';

/** Business-layer entry point for fetching a project (validates id shape). */
export function getProjectById(id: string): Promise<ProjectRow | undefined> {
  return findProjectById(id);
}
