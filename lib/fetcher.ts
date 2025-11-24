/**
 * Shared fetcher utility for SWR
 *
 * Provides consistent fetch behavior across all components:
 * - Includes credentials for authenticated requests
 * - Throws on non-OK responses for SWR error handling
 * - Returns parsed JSON response
 */
export const fetcher = <T = unknown>(url: string): Promise<T> =>
  fetch(url, { credentials: 'include' }).then((res) => {
    if (!res.ok) {
      throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
    }
    return res.json();
  });
