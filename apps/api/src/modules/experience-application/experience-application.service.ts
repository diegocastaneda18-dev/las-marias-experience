import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import type {

  CreateExperienceApplicationPayload,

  CreateExperienceApplicationResponse,

  ExperienceApplicationDocument,

  ExperienceApplicationRecord,

  ExperienceDocumentStatus

} from "@bluecup/types";

import { randomUUID } from "node:crypto";

import { readFile } from "node:fs/promises";

import {

  ALLOWED_DOCUMENT_MIME_TYPES,

  ALLOWED_DOCUMENT_TYPES,

  MAX_DOCUMENT_SIZE_BYTES

} from "./document.constants";

import { getExperienceStorageDriver, getExperienceWebBaseUrl } from "./config/experience.config";
import { logExperienceSupabase } from "./lib/experience-supabase-log";

import { ExperienceApplicationEmailService } from "./experience-application-email.service";

import { FolioService } from "./folio.service";

import type { CreateExperienceApplicationDto } from "./dto/create-experience-application.dto";

import {

  EXPERIENCE_APPLICATION_REPOSITORY,

  type ExperienceApplicationRepository

} from "./repositories/experience-application.repository";

import {

  EXPERIENCE_STORAGE,

  type ExperienceStorage

} from "./storage/experience-storage.interface";

import {
  buildDocumentRelativePath,
  buildLicenseRelativePath
} from "./storage/experience-storage-paths";



function safeFileName(name: string): string {

  return name

    .normalize("NFD")

    .replace(/[\u0300-\u036f]/g, "")

    .replace(/[^a-zA-Z0-9._-]/g, "-")

    .replace(/-+/g, "-")

    .slice(0, 120);

}



@Injectable()

export class ExperienceApplicationService {

  constructor(

    @Inject(EXPERIENCE_APPLICATION_REPOSITORY)

    private readonly repository: ExperienceApplicationRepository,

    @Inject(EXPERIENCE_STORAGE)

    private readonly storage: ExperienceStorage,

    private readonly folioService: FolioService,

    private readonly emailService: ExperienceApplicationEmailService

  ) {}



  async create(dto: CreateExperienceApplicationDto): Promise<CreateExperienceApplicationResponse> {

    if (!dto.termsAccepted) {

      throw new BadRequestException("Debe aceptar los términos y condiciones.");

    }



    const signature = dto.responsibleSignature.trim();

    if (signature.length < 2) {

      throw new BadRequestException("La firma / nombre del responsable es requerida.");

    }



    if (dto.itinerary.departureDate) {

      const arrival = new Date(dto.itinerary.arrivalDate);

      const departure = new Date(dto.itinerary.departureDate);

      if (departure < arrival) {

        throw new BadRequestException("La fecha de salida no puede ser anterior a la de ingreso.");

      }

    }



    const payload = this.toPayload(dto);

    const now = new Date().toISOString();

    const folio = await this.folioService.nextFolio(new Date(payload.itinerary.arrivalDate));



    const record: ExperienceApplicationRecord = {

      ...payload,

      id: randomUUID(),

      folio,

      status: "recibida",

      internalNote: null,

      documents: [],

      createdAt: now,

      updatedAt: now

    };



    const created = await this.repository.create(record);

    void this.emailService.sendAfterCreate(created);



    return {

      id: created.id,

      folio: created.folio,

      status: created.status,

      createdAt: created.createdAt,

      applicant: {

        fullName: record.applicant.fullName,

        email: record.applicant.email

      },

      itinerary: {

        arrivalDate: record.itinerary.arrivalDate,

        departureDate: record.itinerary.departureDate ?? null

      }

    };

  }



  async getByFolio(folio: string): Promise<ExperienceApplicationRecord | null> {

    return this.repository.findByFolio(folio);

  }



  async list(): Promise<ExperienceApplicationRecord[]> {

    return this.repository.list();

  }



  async updateStatus(

    folio: string,

    status: ExperienceApplicationRecord["status"],

    internalNote?: string | null,

    adminOverride?: boolean

  ) {

    const existing = await this.repository.findByFolio(folio);

    if (!existing) {

      throw new BadRequestException(`Solicitud ${folio} no encontrada.`);

    }



    const requiresDocumentValidation = status === "aprobada" || status === "licencia_emitida";

    if (requiresDocumentValidation) {

      const documents = existing.documents ?? [];

      const hasBlockingDocuments = documents.some(

        (doc) => doc.status === "pendiente" || doc.status === "rechazado" || doc.status === "incompleto"

      );



      if (hasBlockingDocuments && !adminOverride) {

        throw new BadRequestException(

          "No se puede aprobar esta solicitud hasta validar todos los documentos del expediente."

        );

      }



      if (adminOverride && !internalNote?.trim()) {

        throw new BadRequestException(

          "Se requiere una nota interna para aprobación bajo criterio administrativo."

        );

      }

    }



    const updated = await this.repository.updateStatus(folio, status, internalNote);

    if (!updated) {

      throw new BadRequestException(`Solicitud ${folio} no encontrada.`);

    }

    return {

      folio: updated.folio,

      status: updated.status,

      internalNote: updated.internalNote ?? null,

      updatedAt: updated.updatedAt

    };

  }



  async uploadDocument(

    folio: string,

    file: { buffer: Buffer; mimetype: string; originalname: string; size: number } | undefined,

    documentType: string,

    label: string

  ): Promise<ExperienceApplicationDocument> {

    if (!file?.buffer?.length) {

      throw new BadRequestException("Archivo requerido.");

    }



    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {

      throw new BadRequestException("El archivo supera el límite de 10 MB.");

    }



    if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(file.mimetype)) {

      throw new BadRequestException("Formato no permitido. Use PDF, JPG, PNG o WEBP.");

    }



    if (!ALLOWED_DOCUMENT_TYPES.includes(documentType)) {

      throw new BadRequestException("Tipo de documento no válido.");

    }



    const existing = await this.repository.findByFolio(folio);

    if (!existing) {

      throw new NotFoundException(`Solicitud ${folio} no encontrada.`);

    }



    const safeOriginal = safeFileName(file.originalname) || "document";

    const documentId = randomUUID();

    const storedFileName = `${documentId}-${safeOriginal}`;

    const relativePath = buildDocumentRelativePath(folio, documentId, safeOriginal);



    await this.storage.saveBinary(relativePath, file.buffer, file.mimetype);

    if (getExperienceStorageDriver() === "supabase") {

      logExperienceSupabase("upload document", { folio, documentId, relativePath });

    }



    const document: ExperienceApplicationDocument = {

      id: documentId,

      type: documentType,

      label: label.trim() || documentType,

      fileName: storedFileName,

      originalName: file.originalname,

      mimeType: file.mimetype,

      size: file.size,

      relativePath,

      uploadedAt: new Date().toISOString(),

      status: "pendiente",

      adminNote: ""

    };



    const updated = await this.repository.addDocument(folio, document);

    if (!updated) {

      throw new NotFoundException(`Solicitud ${folio} no encontrada.`);

    }



    return document;

  }



  async updateDocumentStatus(

    folio: string,

    documentId: string,

    status: ExperienceDocumentStatus,

    adminNote?: string | null

  ): Promise<ExperienceApplicationDocument> {

    const updated = await this.repository.updateDocumentStatus(folio, documentId, status, adminNote);

    if (!updated) {

      throw new NotFoundException(`Documento ${documentId} no encontrado en solicitud ${folio}.`);

    }



    const record = await this.repository.findByFolio(folio);

    if (record) {

      void this.emailService.sendAfterDocumentReview(record, updated);

    }



    return updated;

  }



  async getDocumentFile(folio: string, documentId: string) {

    const record = await this.repository.findByFolio(folio);

    if (!record) {

      throw new NotFoundException(`Solicitud ${folio} no encontrada.`);

    }



    const document = record.documents?.find((d) => d.id === documentId);

    if (!document) {

      throw new NotFoundException(`Documento ${documentId} no encontrado.`);

    }



    const absolutePath = await this.storage.resolveAbsolutePath(document.relativePath);

    return { document, absolutePath };

  }



  async generateLicense(folio: string) {

    const record = await this.repository.findByFolio(folio);

    if (!record) {

      throw new NotFoundException(`Solicitud ${folio} no encontrada.`);

    }

    if (record.status !== "aprobada") {

      throw new BadRequestException("Solo se puede generar licencia para solicitudes aprobadas.");

    }



    const documents = record.documents ?? [];

    const hasBlockingDocuments = documents.some(

      (doc) => doc.status === "pendiente" || doc.status === "rechazado" || doc.status === "incompleto"

    );

    if (documents.length > 0 && hasBlockingDocuments) {

      throw new BadRequestException(

        "No se puede generar licencia hasta validar todos los documentos del expediente."

      );

    }



    const issuedAt = new Date().toISOString();

    const webBase = getExperienceWebBaseUrl();

    const qrValidationUrl = `${webBase}/validar-licencia/${encodeURIComponent(folio)}`;

    const relativePdfPath = buildLicenseRelativePath(folio);

    if (getExperienceStorageDriver() === "supabase") {

      logExperienceSupabase("generate license", { folio });

    }

    const absolutePdfPath = await this.storage.resolveWritablePath(relativePdfPath);



    const { generateLicensePdfFile } = await import("./license-pdf.generator");

    await generateLicensePdfFile(record, { outputPath: absolutePdfPath, qrValidationUrl, issuedAt });



    const pdfBuffer = await readFile(absolutePdfPath);

    await this.storage.saveBinary(relativePdfPath, pdfBuffer, "application/pdf");

    if (getExperienceStorageDriver() === "supabase") {

      logExperienceSupabase("save license PDF", { folio, relativePath: relativePdfPath });

    }



    const licenseUrl = `/api/admin/experience-applications/${folio}/license/download`;

    const updated = await this.repository.issueLicense(folio, {

      licenseIssuedAt: issuedAt,

      licensePdfPath: relativePdfPath,

      licenseUrl,

      qrValidationUrl

    });

    if (!updated) {

      throw new NotFoundException(`Solicitud ${folio} no encontrada.`);

    }



    void this.emailService.sendAfterLicenseIssued(updated);



    return {

      folio: updated.folio,

      status: updated.status,

      licenseIssuedAt: updated.licenseIssuedAt!,

      licenseUrl: updated.licenseUrl!,

      qrValidationUrl: updated.qrValidationUrl!

    };

  }



  async getLicenseFile(folio: string) {

    const record = await this.repository.findByFolio(folio);

    if (!record?.licensePdfPath) {

      throw new NotFoundException(`Licencia para ${folio} no encontrada.`);

    }



    const absolutePath = await this.storage.resolveAbsolutePath(record.licensePdfPath);

    return { absolutePath, fileName: `licencia-${folio}.pdf` };

  }



  async validateLicense(folio: string) {

    const record = await this.repository.findByFolio(folio);

    if (!record || record.status !== "licencia_emitida") {

      throw new NotFoundException(`Licencia ${folio} no encontrada o no emitida.`);

    }



    return {

      folio: record.folio,

      status: record.status,

      applicantName: record.applicant.fullName,

      transportType: record.transport.type,

      vesselName: record.transport.vesselName ?? null,

      aircraftRegistration: record.transport.aircraftRegistration ?? null,

      authorizedDates: {

        arrival: record.itinerary.arrivalDate,

        departure: record.itinerary.departureDate ?? null

      },

      authorizedActivities: record.activities.experienceTypes,

      licenseIssuedAt: record.licenseIssuedAt ?? null,

      message: "Documento registrado en sistema Las Marías Experience."

    };

  }



  private toPayload(dto: CreateExperienceApplicationDto): CreateExperienceApplicationPayload {

    const signature = dto.responsibleSignature.trim();

    return {

      applicant: {

        fullName: dto.applicant.fullName.trim(),

        email: dto.applicant.email.trim().toLowerCase(),

        phone: dto.applicant.phone.trim(),

        company: dto.applicant.company?.trim() || null,

        nationality: dto.applicant.nationality?.trim() || null

      },

      transport: {

        type: dto.transport.type,

        vesselName: dto.transport.vesselName?.trim() || null,

        vesselRegistration: dto.transport.vesselRegistration?.trim() || null,

        vesselLengthM: dto.transport.vesselLengthM ?? null,

        aircraftType: dto.transport.aircraftType?.trim() || null,

        aircraftRegistration: dto.transport.aircraftRegistration?.trim() || null,

        notes: dto.transport.notes?.trim() || null

      },

      itinerary: {

        arrivalDate: dto.itinerary.arrivalDate,

        departureDate: dto.itinerary.departureDate ?? null,

        entryPort: dto.itinerary.entryPort?.trim() || null,

        exitPort: dto.itinerary.exitPort?.trim() || null,

        summary: dto.itinerary.summary?.trim() || null

      },

      peopleOnBoard: {

        total: dto.peopleOnBoard.total,

        adults: dto.peopleOnBoard.adults ?? null,

        children: dto.peopleOnBoard.children ?? null,

        crew: dto.peopleOnBoard.crew ?? null,

        guestNames: dto.peopleOnBoard.guestNames?.trim() || null

      },

      activities: {

        experienceTypes: dto.activities.experienceTypes,

        items: dto.activities.items.map((item) => ({

          name: item.name.trim(),

          place: item.place?.trim() || null,

          latitude: item.latitude ?? null,

          longitude: item.longitude ?? null,

          scheduledDate: item.scheduledDate ?? null

        }))

      },

      lodging: {

        preference: dto.lodging.preference?.trim() || null,

        nights: dto.lodging.nights ?? null,

        rooms: dto.lodging.rooms ?? null,

        notes: dto.lodging.notes?.trim() || null

      },

      food: {

        dietaryRestrictions: dto.food.dietaryRestrictions?.trim() || null,

        preferences: dto.food.preferences?.trim() || null,

        specialRequests: dto.food.specialRequests?.trim() || null

      },

      requestedRoutes: dto.requestedRoutes.map((route) => ({

        name: route.name.trim(),

        from: route.from?.trim() || null,

        to: route.to?.trim() || null,

        coordinates: route.coordinates?.map((c) => ({

          latitude: c.latitude ?? null,

          longitude: c.longitude ?? null

        })),

        notes: route.notes?.trim() || null

      })),

      observations: dto.observations?.trim() || null,

      attachments: dto.attachments?.map((a) => ({

        fileName: a.fileName,

        url: a.url ?? null,

        mimeType: a.mimeType ?? null,

        sizeBytes: a.sizeBytes ?? null

      })),

      termsAccepted: dto.termsAccepted,

      responsibleSignature: signature,

      budgetRange: dto.budgetRange?.trim() || null

    };

  }

}


