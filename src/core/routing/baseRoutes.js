import { registerRoutes } from './routeRegistry.js'

/**
 * Layer 1 screens. Registered through the same registry that add-ons use, so there is one
 * way to contribute a route and the shell has no special case for base code.
 *
 * The permission on each entry mirrors the one the API enforces; hiding a route is a
 * courtesy, not a control.
 */
export function registerBaseRoutes() {
  registerRoutes([
    {
      path: '/',
      index: true,
      load: () => import('../../modules/home/HomeScreen.jsx'),
    },
    {
      path: '/hr/department',
      permission: 'hr.department.view',
      load: () => import('../../modules/department/DepartmentListScreen.jsx'),
    },
    {
      path: '/hr/department/:id',
      permission: 'hr.department.view',
      load: () => import('../../modules/department/DepartmentFormScreen.jsx'),
    },
    {
      path: '/hr/designation',
      permission: 'hr.designation.view',
      load: () => import('../../modules/designation/DesignationListScreen.jsx'),
    },
    {
      path: '/hr/designation/:id',
      permission: 'hr.designation.view',
      load: () => import('../../modules/designation/DesignationFormScreen.jsx'),
    },
    {
      path: '/hr/employee',
      permission: 'hr.employee.view',
      load: () => import('../../modules/employee/EmployeeListScreen.jsx'),
    },
    {
      path: '/hr/employee/:id',
      permission: 'hr.employee.view',
      load: () => import('../../modules/employee/EmployeeFormScreen.jsx'),
    },
    {
      path: '/hr/leave',
      permission: 'hr.leave.view',
      load: () => import('../../modules/leave/LeaveListScreen.jsx'),
    },
    {
      path: '/hr/leave/approval',
      permission: 'hr.leave.approve',
      load: () => import('../../modules/leave/LeaveApprovalScreen.jsx'),
    },
    {
      path: '/hr/leave/:id',
      permission: 'hr.leave.view',
      load: () => import('../../modules/leave/LeaveFormScreen.jsx'),
    },
    // One screen serves both paths: the register is the page, and a document opens in a
    // drawer over it. The :id form exists so a document can be linked to directly.
    {
      path: '/hr/documents',
      permission: 'hr.document.view',
      load: () => import('../../modules/documents/DocumentsCenterScreen.jsx'),
    },
    {
      path: '/hr/documents/:id',
      permission: 'hr.document.view',
      load: () => import('../../modules/documents/DocumentsCenterScreen.jsx'),
    },
    // Administrative screens. Reading a template or a field definition is not gated on
    // these — every form that renders one needs to, and each is already behind its own
    // screen's permission.
    {
      path: '/hr/print-designer',
      permission: 'admin.printTemplate',
      load: () => import('../../modules/printDesigner/PrintDesignerScreen.jsx'),
    },
    {
      path: '/hr/print-designer/:id',
      permission: 'admin.printTemplate',
      load: () => import('../../modules/printDesigner/PrintDesignerScreen.jsx'),
    },
    {
      path: '/hr/field-builder',
      permission: 'admin.customField',
      load: () => import('../../modules/fieldBuilder/FieldBuilderScreen.jsx'),
    },
  ])
}
