import { asyncHandler } from '../../lib/async-handler.js';
import { respond } from '../../lib/response.js';
import type {
  CreateDepartmentInput,
  DepartmentParams,
  ListDepartmentsQuery,
  PatchDepartmentInput,
} from './schema.js';
import * as service from './service.js';

/*
 * Thin handlers: guards (RBAC → validate → resource) already ran in routes.ts
 * per §9.4; business rules live in the service (§9.3).
 */

// GET /departments — active list for any authenticated account; admin filters.
export const list = asyncHandler(async (req, res) => {
  const query = req.query as unknown as ListDepartmentsQuery;
  const { departments, total } = await service.listDepartments(query, req.user!.role);
  respond(res, 200, {
    departments,
    pagination: { page: query.page, limit: query.limit, total },
  });
});

// GET /departments/:departmentId — detail (404 when unknown).
export const show = asyncHandler(async (req, res) => {
  const { departmentId } = req.params as DepartmentParams;
  respond(res, 200, { department: await service.getDepartment(departmentId) });
});

// POST /departments — administrator defines a department.
export const create = asyncHandler(async (req, res) => {
  const input = req.body as CreateDepartmentInput;
  respond(res, 201, { department: await service.createDepartment(req.user!.id, input) });
});

// PATCH /departments/:departmentId — rename / re-code / archive / reactivate.
export const patch = asyncHandler(async (req, res) => {
  const { departmentId } = req.params as DepartmentParams;
  const input = req.body as PatchDepartmentInput;
  respond(res, 200, { department: await service.patchDepartment(departmentId, input) });
});
