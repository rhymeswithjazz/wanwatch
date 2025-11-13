import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Safely extracts an error message from an unknown error type
 * Useful for catch blocks to properly handle error types
 *
 * @param error - The error object (can be of any type)
 * @returns A string representation of the error message
 *
 * @example
 * ```typescript
 * try {
 *   await someOperation();
 * } catch (error: unknown) {
 *   const message = getErrorMessage(error);
 *   console.error('Operation failed:', message);
 * }
 * ```
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error occurred';
}
