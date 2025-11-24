import { spawn } from 'child_process';

/**
 * Strict validation regex for ping targets
 * Allows:
 * - IPv4 addresses: 0-255.0-255.0-255.0-255
 * - Hostnames: alphanumeric with hyphens and dots (RFC 1123)
 */
const SAFE_TARGET_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$|^[0-9]{1,3}(\.[0-9]{1,3}){3}$/;

/**
 * Maximum length for a domain name per RFC 1035
 */
const MAX_TARGET_LENGTH = 253;

/**
 * Validate that a string is a safe ping target (IP or hostname)
 * Does NOT validate that IP octets are 0-255 (that's handled by isValidIPv4)
 */
export function isSafeTarget(target: string): boolean {
  if (!target || target.length > MAX_TARGET_LENGTH) {
    return false;
  }
  return SAFE_TARGET_REGEX.test(target);
}

/**
 * Validate that a string is a valid IPv4 address with octets 0-255
 */
export function isValidIPv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;

  return parts.every(part => {
    // Must be numeric string with no leading zeros (except "0" itself)
    if (!/^\d+$/.test(part)) return false;
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255 && String(num) === part;
  });
}

/**
 * Safely execute ping command without shell injection risk
 *
 * Uses spawn() with array arguments instead of exec() with template strings
 * to prevent command injection attacks.
 *
 * @param target - IP address or hostname to ping
 * @returns Promise resolving to { stdout } on success
 * @throws Error if target is invalid or ping fails
 */
export async function safePing(target: string): Promise<{ stdout: string }> {
  // Validate target contains only safe characters
  if (!isSafeTarget(target)) {
    throw new Error(`Invalid ping target: ${target}`);
  }

  return new Promise((resolve, reject) => {
    // Use spawn with array args to avoid shell interpretation
    // This prevents command injection even if validation were bypassed
    const proc = spawn('ping', ['-c', '1', '-W', '5', target]);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ping process: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout });
      } else {
        reject(new Error(`Ping failed with code ${code}: ${stderr || 'timeout or unreachable'}`));
      }
    });
  });
}
