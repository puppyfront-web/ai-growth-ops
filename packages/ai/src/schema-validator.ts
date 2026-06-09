import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: false });

export function validateJsonSchema(
  data: unknown,
  schema: object
): { valid: boolean; errors?: string[] } {
  const validate = ajv.compile(schema);
  const valid = validate(data);
  if (!valid && validate.errors) {
    return {
      valid: false,
      errors: validate.errors.map((e) => `${e.instancePath} ${e.message}`)
    };
  }
  return { valid: true };
}

export function createSchemaValidator<T>(
  inputSchema: object,
  outputSchema: object
) {
  return {
    validateInput(data: unknown): T {
      const result = validateJsonSchema(data, inputSchema);
      if (!result.valid)
        throw new Error(
          `Input validation failed: ${result.errors?.join(', ')}`
        );
      return data as T;
    },
    validateOutput(data: unknown): T {
      const result = validateJsonSchema(data, outputSchema);
      if (!result.valid)
        throw new Error(
          `Output validation failed: ${result.errors?.join(', ')}`
        );
      return data as T;
    }
  };
}
