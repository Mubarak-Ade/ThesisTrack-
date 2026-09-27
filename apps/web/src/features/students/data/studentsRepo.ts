/**
 * Students repository (spec §4): the only data import site for the Student
 * Management screen. Currently fixture-backed; a live endpoint drops in
 * behind this function without touching the screen.
 */
import { STUDENTS_FIXTURES } from './mock/fixtures';
import type { StudentSnapshot } from './types';

export async function getStudents(): Promise<StudentSnapshot> {
  return STUDENTS_FIXTURES;
}
