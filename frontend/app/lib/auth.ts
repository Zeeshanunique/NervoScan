const AUTH_TOKEN_KEY = "nervoscan_token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  
  // Also set as cookie for middleware
  document.cookie = `${AUTH_TOKEN_KEY}=${token}; path=/; max-age=86400; SameSite=Lax`;
}

export function clearStoredToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  
  // Also clear cookie
  document.cookie = `${AUTH_TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax`;
}
