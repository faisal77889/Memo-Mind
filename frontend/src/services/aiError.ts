/**
 * Utilities for intercepting and transforming raw AI backend errors into 
 * user-friendly, professional notifications.
 */

export type AiErrorType = 'rate_limit' | 'context_length' | 'quota' | 'auth' | 'general';

export interface SanitizedAiResult {
  displayContent: string;
  isError: boolean;
  errorType?: AiErrorType;
}

/**
 * Detects if a raw streamed chunk or accumulated content contains backend AI error details,
 * and converts it into a human-friendly message so users never see raw JSON/Python stack traces.
 */
export function sanitizeAiStreamContent(raw: string): SanitizedAiResult {
  if (!raw) return { displayContent: '', isError: false };

  // Check if raw text contains an error signature
  const hasErrorToken =
    raw.includes('[Error generating response:') ||
    raw.includes('rate_limit_exceeded') ||
    raw.includes('Error code: 429') ||
    raw.includes('tokens per minute') ||
    raw.includes('OTPM') ||
    raw.includes('TPM') ||
    raw.includes('insufficient_quota') ||
    raw.includes('context_length_exceeded');

  if (!hasErrorToken) {
    return { displayContent: raw, isError: false };
  }

  // Check if there was valid text preceding the error
  // e.g. "Here is the syllabus... \n\n[Error generating response: ...]"
  const errorStartIndex = raw.indexOf('[Error generating response:');
  const validPrecedingText =
    errorStartIndex > 0 ? raw.substring(0, errorStartIndex).trim() : '';

  // Determine error category
  let errorNotice = '';
  let errorType: AiErrorType = 'general';

  if (
    raw.includes('rate_limit_exceeded') ||
    raw.includes('Error code: 429') ||
    raw.includes('tokens per minute') ||
    raw.includes('OTPM') ||
    raw.includes('TPM') ||
    raw.includes('Limit 1000')
  ) {
    errorType = 'rate_limit';
    errorNotice =
      '⚠️ AI Rate Limit Reached: The model temporarily reached its output token limit for this minute. Please wait a few moments and try asking a more specific or concise question.';
  } else if (raw.includes('context_length_exceeded') || raw.includes('maximum context length')) {
    errorType = 'context_length';
    errorNotice =
      '⚠️ Context Window Exceeded: The retrieved documents exceed the model’s context capacity. Try asking a more targeted query with specific keywords.';
  } else if (raw.includes('insufficient_quota') || raw.includes('quota exceeded')) {
    errorType = 'quota';
    errorNotice =
      '⚠️ Service Quota Reached: The AI provider quota has been reached for this billing cycle. Please check back later.';
  } else if (raw.includes('invalid_api_key') || raw.includes('401') || raw.includes('Unauthorized')) {
    errorType = 'auth';
    errorNotice =
      '⚠️ AI Configuration Error: Authentication with the language model failed. Please verify the AI API key configuration in the backend.';
  } else {
    errorType = 'general';
    errorNotice =
      '⚠️ Temporary AI Processing Error: The model encountered an unexpected issue while generating this answer. Please try again in a few moments.';
  }

  if (validPrecedingText) {
    // Keep the good partial answer and append a polite notice
    return {
      displayContent: `${validPrecedingText}\n\n---\n*${errorNotice}*`,
      isError: true,
      errorType,
    };
  }

  return {
    displayContent: errorNotice,
    isError: true,
    errorType,
  };
}
