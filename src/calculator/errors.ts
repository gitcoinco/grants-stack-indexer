export class CalculatorError extends Error {
  constructor(message?: string) {
    super(message);
  }
}

export class FileNotFoundError extends CalculatorError {
  constructor(fileDescription: string) {
    super(`cannot find ${fileDescription} file`);
  }
}

export class ResourceNotFoundError extends CalculatorError {
  constructor(resource: string) {
    super(`${resource} not found`);
  }
}

export class OverridesColumnNotFoundError extends CalculatorError {
  constructor(column: string) {
    super(`cannot find column ${column} in the overrides file`);
  }
}

export class OverridesInvalidRowError extends CalculatorError {
  constructor(row: number, message: string) {
    super(`Row ${row} in the overrides file is invalid: ${message}`);
  }
}
