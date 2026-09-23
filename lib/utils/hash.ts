/**
 * Utility to compute SHA-256 hex digests using standard Web Crypto API.
 */
export async function computeSHA256(data: string | Uint8Array | ArrayBuffer): Promise<string> {
    const buffer = typeof data === 'string'
        ? new TextEncoder().encode(data)
        : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer as any);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}
