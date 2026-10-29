/** Public surface of the departments data layer — screens import from here. */
export * from './types';
export { mapDepartment, mapDepartmentRef, mapDepartmentsPage } from './mappers';
export {
  createDepartment,
  getDepartment,
  listDepartments,
  updateDepartment,
} from './departmentsRepo';
