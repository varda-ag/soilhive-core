export function saveToken(token: string | undefined) {
  if (token) sessionStorage.setItem('token', token);
}

export function getToken() {
  return sessionStorage.getItem('token');
}

export function clearToken() {
  sessionStorage.removeItem('token');
}
