/**
 * Cloudflare Access JWT utilities
 * Handles authentication via Cloudflare Access with GitHub identity provider
 */
/**
 * Decode and validate Cloudflare Access JWT
 * Note: Cloudflare Access already validates the JWT before it reaches the Worker,
 * so we just decode it here (no signature verification needed)
 */
export function decodeCloudflareAccessJWT(jwt) {
    try {
        const parts = jwt.split('.');
        if (parts.length !== 3) {
            console.error('Invalid JWT format: expected 3 parts');
            return null;
        }
        // Decode payload (base64url)
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(base64));
        // Basic validation - email is required, name is optional
        if (!payload.email) {
            console.error('JWT missing required field: email');
            return null;
        }
        // If name is not present, derive it from email
        if (!payload.name) {
            console.log('JWT missing name field, deriving from email');
            payload.name = payload.email.split('@')[0]; // Use email username as fallback
        }
        // Check expiration
        if (payload.exp && payload.exp < Date.now() / 1000) {
            console.error('JWT expired');
            return null;
        }
        return payload;
    }
    catch (error) {
        console.error('Failed to decode Cloudflare Access JWT:', error);
        return null;
    }
}
/**
 * Extract user information from Cloudflare Access JWT header
 */
export function getUserFromAccessJWT(jwtHeader) {
    if (!jwtHeader) {
        return null;
    }
    const payload = decodeCloudflareAccessJWT(jwtHeader);
    if (!payload) {
        return null;
    }
    // Ensure name is always present - use email username as fallback
    const name = payload.name || payload.email.split('@')[0];
    return {
        email: payload.email,
        name: name,
    };
}
