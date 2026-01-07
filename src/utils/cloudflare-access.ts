/**
 * Cloudflare Access JWT utilities
 * Handles authentication via Cloudflare Access with GitHub identity provider
 */

export interface CloudflareAccessJWT {
  name: string;
  email: string;
  groups?: Array<{
    id: number;
    name: string;
    teams?: Array<{ name: string }>;
  }>;
  aud?: string[];
  iat?: number;
  exp?: number;
}

/**
 * Decode and validate Cloudflare Access JWT
 * Note: Cloudflare Access already validates the JWT before it reaches the Worker,
 * so we just decode it here (no signature verification needed)
 */
export function decodeCloudflareAccessJWT(jwt: string): CloudflareAccessJWT | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) {
      console.error('Invalid JWT format: expected 3 parts');
      return null;
    }
    
    // Decode payload (base64url)
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    
    // Basic validation
    if (!payload.email || !payload.name) {
      console.error('JWT missing required fields (email or name)');
      return null;
    }
    
    // Check expiration
    if (payload.exp && payload.exp < Date.now() / 1000) {
      console.error('JWT expired');
      return null;
    }
    
    return payload as CloudflareAccessJWT;
  } catch (error) {
    console.error('Failed to decode Cloudflare Access JWT:', error);
    return null;
  }
}

/**
 * Extract user information from Cloudflare Access JWT header
 */
export function getUserFromAccessJWT(jwtHeader: string | undefined): {
  email: string;
  name: string;
} | null {
  if (!jwtHeader) {
    return null;
  }
  
  const payload = decodeCloudflareAccessJWT(jwtHeader);
  if (!payload) {
    return null;
  }
  
  return {
    email: payload.email,
    name: payload.name,
  };
}
