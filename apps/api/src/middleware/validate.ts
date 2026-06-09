import { ZodSchema, ZodError } from 'zod';

export interface ValidationError {
  field: string;
  message: string;
}

export function formatZodErrors(error: ZodError): ValidationError[] {
  return error.errors.map((e) => ({
    field: e.path.join('.'),
    message: e.message
  }));
}

/**
 * Validate a request body against a Zod schema.
 * Returns parsed data on success, or null + error details on failure.
 */
export function validateBody<T>(
  schema: ZodSchema<T>,
  body: unknown
):
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      errors: ValidationError[];
    } {
  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: formatZodErrors(result.error) };
}

/**
 * Validate URL query parameters against a Zod schema.
 * Converts string values to appropriate types (numbers, booleans, etc.).
 */
export function validateQuery<T>(
  schema: ZodSchema<T>,
  url: URL
):
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      errors: ValidationError[];
    } {
  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  const result = schema.safeParse(params);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: formatZodErrors(result.error) };
}
