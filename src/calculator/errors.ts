import ClientError from "../http/api/clientError.js";

export class CalculatorError extends ClientError {
  constructor(message: string, status = 400) {
    super(message, status);
  }
}

export class FileNotFoundError extends CalculatorError {
  constructor(fileDescription: string) {
    super(`cannot find ${fileDescription} file`, 404);
  }
}

export class ResourceNotFoundError extends CalculatorError {
  constructor(resource: string) {
    super(`${resource} not found`, 404);
  }
}
