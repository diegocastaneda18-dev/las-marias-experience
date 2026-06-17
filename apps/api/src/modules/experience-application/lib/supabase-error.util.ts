type SupabaseErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

export function formatSupabaseError(error: SupabaseErrorLike | null | undefined): string {
  if (!error) return "Error desconocido de Supabase";
  return error.message || error.details || error.hint || error.code || "Error desconocido de Supabase";
}

export function logSupabaseFailure(
  action: string,
  error: SupabaseErrorLike | null | undefined,
  extra?: Record<string, unknown>
): void {
  console.error(`[Experience Supabase] ${action} failed`, {
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    code: error?.code,
    ...extra
  });
}
