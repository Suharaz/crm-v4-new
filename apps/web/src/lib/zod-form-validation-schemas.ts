import { z } from 'zod';

// Phone: Vietnamese format — starts with 0, 10-11 digits total
const phoneVN = z
  .string()
  .min(1, 'Vui lòng nhập số điện thoại')
  .regex(/^0\d{9,10}$/, 'Số điện thoại không hợp lệ (phải bắt đầu bằng 0, gồm 10-11 chữ số)');

const emailOptional = z
  .string()
  .optional()
  .refine(val => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), 'Email không hợp lệ');

// Lead form
export const leadSchema = z.object({
  phone: phoneVN,
  name: z.string().max(100, 'Họ tên không được vượt quá 100 ký tự').optional(),
  email: emailOptional,
  sourceId: z.string().optional(),
  productId: z.string().optional(),
});

export type LeadFormValues = z.infer<typeof leadSchema>;

// Customer form
export const customerSchema = z.object({
  phone: phoneVN,
  name: z.string().min(1, 'Vui lòng nhập họ tên'),
  email: emailOptional,
  assignedUserId: z.string().optional(),
  assignedDepartmentId: z.string().optional(),
});

export type CustomerFormValues = z.infer<typeof customerSchema>;

// User form (create)
export const userCreateSchema = z.object({
  email: z
    .string()
    .min(1, 'Vui lòng nhập email')
    .email('Email không hợp lệ'),
  password: z
    .string()
    .min(8, 'Mật khẩu phải có ít nhất 8 ký tự'),
  name: z.string().min(1, 'Vui lòng nhập họ tên'),
  phone: z
    .string()
    .optional()
    .refine(val => !val || /^0\d{9,10}$/.test(val), 'Số điện thoại không hợp lệ'),
  role: z.string().min(1, 'Vui lòng chọn vai trò'),
  departmentId: z.string().optional(),
  teamId: z.string().optional(),
  employeeLevelId: z.string().optional(),
});

// User form (edit — password optional)
export const userEditSchema = userCreateSchema.extend({
  password: z
    .string()
    .optional()
    .refine(val => !val || val.length >= 8, 'Mật khẩu phải có ít nhất 8 ký tự'),
});

export type UserCreateFormValues = z.infer<typeof userCreateSchema>;
export type UserEditFormValues = z.infer<typeof userEditSchema>;

// Product form
export const productSchema = z.object({
  name: z.string().min(1, 'Vui lòng nhập tên sản phẩm'),
  price: z
    .string()
    .min(1, 'Vui lòng nhập giá')
    .refine(val => !isNaN(Number(val)) && Number(val) > 0, 'Giá phải lớn hơn 0'),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  vatRate: z.string().optional(),
});

export type ProductFormValues = z.infer<typeof productSchema>;

// Order form
export const orderSchema = z.object({
  customerId: z.string({ error: 'Vui lòng chọn khách hàng' }).min(1, 'Vui lòng chọn khách hàng'),
  amount: z
    .string()
    .min(1, 'Vui lòng nhập số tiền')
    .refine(val => !isNaN(Number(val)) && Number(val) > 0, 'Số tiền phải lớn hơn 0'),
  productId: z.string().optional(),
  notes: z.string().optional(),
});

export type OrderFormValues = z.infer<typeof orderSchema>;

// Task form
export const taskSchema = z.object({
  title: z.string().min(1, 'Vui lòng nhập tiêu đề công việc'),
  description: z.string().optional(),
  dueDate: z
    .string()
    .optional()
    .refine(val => !val || !isNaN(Date.parse(val)), 'Ngày không hợp lệ'),
  priority: z.string().optional(),
  remindAt: z
    .string()
    .optional()
    .refine(val => !val || !isNaN(Date.parse(val)), 'Thời gian nhắc nhở không hợp lệ'),
  assignedTo: z.string().optional(),
});

export type TaskFormValues = z.infer<typeof taskSchema>;

// Settings — generic name-required schema
export const settingsNameSchema = z.object({
  name: z.string().min(1, 'Vui lòng nhập tên'),
});

export type SettingsNameFormValues = z.infer<typeof settingsNameSchema>;

// Helper: parse Zod errors into flat field error map
export function parseZodErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const rawKey = issue.path[0];
    if (rawKey === undefined || rawKey === null) continue;
    const key = String(rawKey);
    if (!errors[key]) {
      errors[key] = issue.message;
    }
  }
  return errors;
}
