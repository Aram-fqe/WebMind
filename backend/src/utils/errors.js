export class WebMindError extends Error {
  constructor(message, code = 'INTERNAL_ERROR', status = 500) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
  }
}

export class ExtractionError extends WebMindError {
  constructor(message, code = 'EXTRACTION_FAILED', status = 400) {
    super(message, code, status);
  }
}

export class ValidationError extends WebMindError {
  constructor(message, code = 'VALIDATION_ERROR', status = 400) {
    super(message, code, status);
  }
}
