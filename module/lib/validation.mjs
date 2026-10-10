export class AssistantError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function fail(code, message) {
  throw new AssistantError(code, message);
}

export function safeError(error) {
  return error instanceof AssistantError
    ? { code: error.code, message: error.message }
    : { code: 'FAILED', message: 'The operation failed. Check the local application and try again.' };
}

export function object(value, keys, required = keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID', 'Expected an object.');
  if (Object.keys(value).some(key => !keys.includes(key)) || required.some(key => !Object.hasOwn(value, key))) {
    fail('INVALID', 'Missing or unknown fields.');
  }
}

export function text(value, min, max) {
  if (typeof value !== 'string' || value.length < min || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) {
    fail('INVALID', 'Text is missing, too long, or contains control characters.');
  }
  return value;
}

export function integer(value, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) fail('INVALID', 'Number is outside the supported range.');
  return value;
}

export function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

export function stableJSON(value) {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}
