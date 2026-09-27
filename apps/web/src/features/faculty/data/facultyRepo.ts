/**
 * Faculty repository (spec §4): the only data import site for the Faculty
 * Supervisors screen. Currently fixture-backed; a live endpoint drops in
 * behind this function without touching the screen.
 */
import { FACULTY_FIXTURES } from './mock/fixtures';
import type { FacultySnapshot } from './types';

export async function getFaculty(): Promise<FacultySnapshot> {
  return FACULTY_FIXTURES;
}
