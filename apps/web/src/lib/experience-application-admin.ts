import type {
  ExperienceApplicationDocument,
  ExperienceApplicationRecord,
  ExperienceApplicationStatus,
  ExperienceDocumentStatus,
  ExperienceTransportType,
  UpdateExperienceApplicationStatusResponse,
  UpdateExperienceDocumentStatusResponse
} from "@bluecup/types";
import {
  ADMIN_FORBIDDEN_MESSAGE,
  ADMIN_UNAUTHORIZED_MESSAGE,
  getAdminAuthHeaders,
  isAdminAuthenticated
} from "./admin-auth";
import { getPublicApiBaseUrl } from "./env";

const ADMIN_PROXY_BASE = "/api/admin/experience-applications";

export const EXPERIENCE_APPLICATION_STATUSES: ExperienceApplicationStatus[] = [
  "recibida",
  "en_revision",
  "informacion_incompleta",
  "aprobada",
  "rechazada",
  "licencia_emitida"
];

export const STATUS_LABELS: Record<ExperienceApplicationStatus, string> = {
  recibida: "Recibida",
  en_revision: "En revisión",
  informacion_incompleta: "Información incompleta",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  licencia_emitida: "Licencia emitida"
};

export const DOCUMENT_STATUS_LABELS: Record<ExperienceDocumentStatus, string> = {
  pendiente: "Pendiente",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  incompleto: "Incompleto"
};

export const DOCUMENT_STATUS_STYLES: Record<ExperienceDocumentStatus, string> = {
  pendiente: "border-sky-200 bg-sky-50 text-sky-800",
  aprobado: "border-emerald-200 bg-emerald-50 text-emerald-800",
  rechazado: "border-rose-200 bg-rose-50 text-rose-800",
  incompleto: "border-amber-200 bg-amber-50 text-amber-800"
};

export const BLOCKING_DOCUMENT_STATUSES: ExperienceDocumentStatus[] = [
  "pendiente",
  "rechazado",
  "incompleto"
];

export const APPROVAL_BLOCKED_MESSAGE =
  "No se puede aprobar esta solicitud hasta validar todos los documentos del expediente.";

export function hasBlockingDocuments(documents: ExperienceApplicationDocument[] | undefined): boolean {
  return (documents ?? []).some((doc) => BLOCKING_DOCUMENT_STATUSES.includes(doc.status));
}

export const TRANSPORT_TYPE_LABELS: Record<ExperienceTransportType, string> = {
  none: "Sin transporte propio",
  vessel: "Embarcación",
  aircraft: "Aeronave",
  both: "Embarcación y aeronave"
};

export const EXPERIENCE_TYPE_LABELS: Record<string, string> = {
  yacht: "Yates",
  fishing: "Pesca deportiva",
  surf: "Surf",
  dive: "Buceo",
  wedding: "Bodas",
  agency: "Agencias",
  private: "Experiencia privada"
};

const ADMIN_NETWORK_ERROR =
  "No se pudo conectar con la API. Verifica que la API y el panel web estén encendidos.";

export class AdminUnauthorizedError extends Error {
  readonly status = 401;

  constructor(message: string = ADMIN_UNAUTHORIZED_MESSAGE) {
    super(message);
    this.name = "AdminUnauthorizedError";
  }
}

export class AdminForbiddenError extends Error {
  readonly status = 403;

  constructor(message: string = ADMIN_FORBIDDEN_MESSAGE) {
    super(message);
    this.name = "AdminForbiddenError";
  }
}

export function isAdminForbiddenError(error: unknown): error is AdminForbiddenError {
  return error instanceof AdminForbiddenError;
}

export function isAdminUnauthorizedError(error: unknown): error is AdminUnauthorizedError {
  return error instanceof AdminUnauthorizedError;
}

export function displayText(value: string | number | null | undefined): string {
  if (value == null) return "—";
  const text = String(value).trim();
  return text || "—";
}

export function formatExperienceTypes(types: string[] | null | undefined): string {
  if (!types?.length) return "—";
  return types.map((t) => EXPERIENCE_TYPE_LABELS[t] ?? t).join(", ");
}

export function formatEntryType(record: ExperienceApplicationRecord): string {
  const type = record.transport?.type;
  const base = type ? (TRANSPORT_TYPE_LABELS[type] ?? type) : "—";
  const port = record.itinerary?.entryPort?.trim();
  return port ? `${base} · ${port}` : base;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(d);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(d);
}

function normalizeApplicationsResponse(result: unknown): ExperienceApplicationRecord[] {
  if (Array.isArray(result)) {
    return result as ExperienceApplicationRecord[];
  }

  if (result && typeof result === "object") {
    const obj = result as {
      applications?: ExperienceApplicationRecord[];
      data?: ExperienceApplicationRecord[];
      items?: ExperienceApplicationRecord[];
    };
    return obj.applications ?? obj.data ?? obj.items ?? [];
  }

  return [];
}

function parseAdminError(result: unknown, status: number): string {
  if (result && typeof result === "object") {
    const errBody = result as { message?: string | string[]; error?: string };
    const msg = errBody.message;
    if (Array.isArray(msg)) return msg.join(". ");
    if (typeof msg === "string" && msg.trim()) return msg.trim();
    if (typeof errBody.error === "string" && errBody.error.trim()) return errBody.error.trim();
  }
  return `Error ${status}`;
}

async function adminProxyFetch<T>(proxyPath: string, init?: RequestInit): Promise<T> {
  if (!isAdminAuthenticated()) {
    throw new AdminUnauthorizedError();
  }

  const apiUrl = proxyPath.startsWith("/") ? proxyPath : `/${proxyPath}`;
  const authHeaders = getAdminAuthHeaders();

  let res: Response;
  try {
    res = await fetch(apiUrl, {
      ...init,
      headers: {
        ...authHeaders,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {})
      }
    });
  } catch (err) {
    console.error("Admin API network error", err);
    throw new Error(ADMIN_NETWORK_ERROR);
  }

  const result = await res.json().catch(() => null);

  if (res.status === 401) {
    throw new AdminUnauthorizedError(ADMIN_UNAUTHORIZED_MESSAGE);
  }

  if (res.status === 403) {
    throw new AdminForbiddenError(ADMIN_FORBIDDEN_MESSAGE);
  }

  if (!res.ok) {
    console.error("Admin API error", res.status, result);
    throw new Error(parseAdminError(result, res.status));
  }

  return result as T;
}

/** Admin access verification for password mode. */
export async function verifyAdminAccess(password: string): Promise<boolean> {
  const res = await fetch(`${getPublicApiBaseUrl()}/api/admin/verify-access`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { ok?: boolean };
  return data.ok === true;
}

export async function fetchExperienceApplications(): Promise<ExperienceApplicationRecord[]> {
  const result = await adminProxyFetch<unknown>(ADMIN_PROXY_BASE);
  return normalizeApplicationsResponse(result);
}

export async function fetchExperienceApplicationByFolio(
  folio: string
): Promise<ExperienceApplicationRecord> {
  return adminProxyFetch<ExperienceApplicationRecord>(
    `${ADMIN_PROXY_BASE}/${encodeURIComponent(folio)}`
  );
}

export async function updateExperienceApplicationStatus(
  folio: string,
  payload: {
    status: ExperienceApplicationStatus;
    internalNote?: string | null;
    adminOverride?: boolean;
  }
): Promise<UpdateExperienceApplicationStatusResponse> {
  return adminProxyFetch<UpdateExperienceApplicationStatusResponse>(
    `${ADMIN_PROXY_BASE}/${encodeURIComponent(folio)}/status`,
    {
      method: "PATCH",
      body: JSON.stringify(payload)
    }
  );
}

export async function updateExperienceDocumentStatus(
  folio: string,
  documentId: string,
  payload: { status: ExperienceDocumentStatus; adminNote?: string | null }
): Promise<UpdateExperienceDocumentStatusResponse> {
  return adminProxyFetch<UpdateExperienceDocumentStatusResponse>(
    `${ADMIN_PROXY_BASE}/${encodeURIComponent(folio)}/documents/${encodeURIComponent(documentId)}/status`,
    {
      method: "PATCH",
      body: JSON.stringify(payload)
    }
  );
}

export async function downloadExperienceDocument(
  folio: string,
  document: ExperienceApplicationDocument
): Promise<void> {
  if (!isAdminAuthenticated()) {
    throw new AdminUnauthorizedError();
  }

  const url = `${ADMIN_PROXY_BASE}/${encodeURIComponent(folio)}/documents/${encodeURIComponent(document.id)}/download`;
  const authHeaders = getAdminAuthHeaders();

  let res: Response;
  try {
    res = await fetch(url, {
      headers: authHeaders
    });
  } catch (err) {
    console.error("Document download network error", err);
    throw new Error(ADMIN_NETWORK_ERROR);
  }

  if (res.status === 401) {
    throw new AdminUnauthorizedError(ADMIN_UNAUTHORIZED_MESSAGE);
  }

  if (res.status === 403) {
    throw new AdminForbiddenError(ADMIN_FORBIDDEN_MESSAGE);
  }

  if (!res.ok) {
    const result = await res.json().catch(() => null);
    throw new Error(parseAdminError(result, res.status));
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export async function generateExperienceApplicationLicense(folio: string) {
  if (!isAdminAuthenticated()) {
    throw new AdminUnauthorizedError();
  }

  const authHeaders = getAdminAuthHeaders();

  const response = await fetch(
    `${ADMIN_PROXY_BASE}/${encodeURIComponent(folio)}/license`,
    {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    }
  );

  const result = await response.json().catch(() => null);
  if (response.status === 401) {
    throw new AdminUnauthorizedError(ADMIN_UNAUTHORIZED_MESSAGE);
  }
  if (response.status === 403) {
    throw new AdminForbiddenError(ADMIN_FORBIDDEN_MESSAGE);
  }
  if (!response.ok) {
    throw new Error(
      (result as { message?: string } | null)?.message || "No se pudo generar la licencia PDF."
    );
  }

  return result;
}

export async function openExperienceApplicationLicense(folio: string): Promise<void> {
  if (!isAdminAuthenticated()) {
    throw new AdminUnauthorizedError();
  }

  const url = `${ADMIN_PROXY_BASE}/${encodeURIComponent(folio)}/license/download`;
  const authHeaders = getAdminAuthHeaders();

  let res: Response;
  try {
    res = await fetch(url, { headers: authHeaders });
  } catch (err) {
    console.error("License download network error", err);
    throw new Error(ADMIN_NETWORK_ERROR);
  }

  if (res.status === 401) {
    throw new AdminUnauthorizedError(ADMIN_UNAUTHORIZED_MESSAGE);
  }

  if (res.status === 403) {
    throw new AdminForbiddenError(ADMIN_FORBIDDEN_MESSAGE);
  }

  if (!res.ok) {
    const result = await res.json().catch(() => null);
    throw new Error(parseAdminError(result, res.status));
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export function openLicenseValidationPage(folio: string): void {
  window.open(
    `/validar-licencia/${encodeURIComponent(folio)}`,
    "_blank",
    "noopener,noreferrer"
  );
}

export const LICENSE_BLOCKED_MESSAGE =
  "No se puede generar licencia hasta validar todos los documentos del expediente.";

export type ApplicationFilters = {
  query: string;
  status: ExperienceApplicationStatus | "all";
  entryType: ExperienceTransportType | "all";
};

export function filterApplications(
  rows: ExperienceApplicationRecord[],
  filters: ApplicationFilters
): ExperienceApplicationRecord[] {
  const q = filters.query.trim().toLowerCase();

  return rows
    .filter((row) => {
      if (filters.status !== "all" && row.status !== filters.status) return false;

      if (filters.entryType !== "all") {
        const transportType = row.transport?.type;
        if (transportType !== filters.entryType) return false;
      }

      if (!q) return true;

      return [row.folio, row.applicant?.fullName, row.applicant?.email, row.applicant?.phone].some(
        (value) => (value ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
}
