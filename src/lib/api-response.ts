export function apiSuccess<T>(data: T, message?: string) {
  return Response.json({ success: true, data, message });
}

export function apiError(message: string, status = 400) {
  return Response.json({ success: false, error: message }, { status });
}
