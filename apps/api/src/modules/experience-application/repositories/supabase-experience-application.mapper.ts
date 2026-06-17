import type {
  ExperienceApplicationDocument,
  ExperienceApplicationRecord
} from "@bluecup/types";

export type ExperienceApplicationRow = {
  id: string;
  folio: string;
  status: ExperienceApplicationRecord["status"];
  applicant: ExperienceApplicationRecord["applicant"];
  transport: ExperienceApplicationRecord["transport"];
  itinerary: ExperienceApplicationRecord["itinerary"];
  people_on_board: ExperienceApplicationRecord["peopleOnBoard"];
  activities: ExperienceApplicationRecord["activities"];
  lodging: ExperienceApplicationRecord["lodging"];
  food: ExperienceApplicationRecord["food"];
  requested_routes: ExperienceApplicationRecord["requestedRoutes"];
  observations: string | null;
  attachments: ExperienceApplicationRecord["attachments"] | null;
  terms_accepted: boolean;
  responsible_signature: string;
  budget_range: string | null;
  internal_notes: string | null;
  license_issued_at: string | null;
  license_pdf_path: string | null;
  license_url: string | null;
  qr_validation_url: string | null;
  created_at: string;
  updated_at: string;
};

export type ExperienceDocumentRow = {
  id: string;
  application_folio: string;
  type: string;
  label: string;
  file_name: string;
  original_name: string;
  mime_type: string;
  size: number;
  storage_path: string;
  uploaded_at: string;
  status: ExperienceApplicationDocument["status"];
  admin_note: string | null;
  reviewed_at: string | null;
};

/** Row shape for INSERT — snake_case only, no client id (Supabase default gen_random_uuid()). */
export type ExperienceApplicationInsertRow = Omit<ExperienceApplicationRow, "id">;

export function recordToInsertRow(record: ExperienceApplicationRecord): ExperienceApplicationInsertRow {
  const now = record.createdAt || new Date().toISOString();
  return {
    folio: record.folio,
    status: record.status,
    applicant: record.applicant,
    transport: record.transport,
    itinerary: record.itinerary,
    people_on_board: record.peopleOnBoard,
    activities: record.activities,
    lodging: record.lodging,
    food: record.food,
    requested_routes: record.requestedRoutes,
    observations: record.observations ?? null,
    attachments: record.attachments ?? null,
    terms_accepted: record.termsAccepted,
    responsible_signature: record.responsibleSignature,
    budget_range: record.budgetRange ?? null,
    internal_notes: record.internalNote ?? null,
    license_issued_at: record.licenseIssuedAt ?? null,
    license_pdf_path: record.licensePdfPath ?? null,
    license_url: record.licenseUrl ?? null,
    qr_validation_url: record.qrValidationUrl ?? null,
    created_at: now,
    updated_at: record.updatedAt || now
  };
}

export function recordToRow(record: ExperienceApplicationRecord): ExperienceApplicationRow {
  const insertRow = recordToInsertRow(record);
  return {
    id: record.id,
    ...insertRow
  };
}

export function rowToRecord(
  row: ExperienceApplicationRow,
  documents: ExperienceApplicationDocument[] = []
): ExperienceApplicationRecord {
  return {
    id: row.id,
    folio: row.folio,
    status: row.status,
    applicant: row.applicant,
    transport: row.transport,
    itinerary: row.itinerary,
    peopleOnBoard: row.people_on_board,
    activities: row.activities,
    lodging: row.lodging,
    food: row.food,
    requestedRoutes: row.requested_routes,
    observations: row.observations,
    attachments: row.attachments ?? undefined,
    termsAccepted: row.terms_accepted,
    responsibleSignature: row.responsible_signature,
    budgetRange: row.budget_range,
    internalNote: row.internal_notes,
    documents,
    licenseIssuedAt: row.license_issued_at ?? undefined,
    licensePdfPath: row.license_pdf_path ?? undefined,
    licenseUrl: row.license_url ?? undefined,
    qrValidationUrl: row.qr_validation_url ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function documentToRow(
  folio: string,
  document: ExperienceApplicationDocument
): Omit<ExperienceDocumentRow, "application_folio"> & { application_folio: string } {
  return {
    id: document.id,
    application_folio: folio,
    type: document.type,
    label: document.label,
    file_name: document.fileName,
    original_name: document.originalName,
    mime_type: document.mimeType,
    size: document.size,
    storage_path: document.relativePath,
    uploaded_at: document.uploadedAt,
    status: document.status,
    admin_note: document.adminNote ?? null,
    reviewed_at: document.reviewedAt ?? null
  };
}

export function rowToDocument(row: ExperienceDocumentRow): ExperienceApplicationDocument {
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    fileName: row.file_name,
    originalName: row.original_name,
    mimeType: row.mime_type,
    size: row.size,
    relativePath: row.storage_path,
    uploadedAt: row.uploaded_at,
    status: row.status,
    adminNote: row.admin_note ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined
  };
}
