import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { finished } from "node:stream/promises";
import type { ExperienceApplicationRecord } from "@bluecup/types";

const FOREST = "#0F3D32";
const OCEAN = "#2AABB8";
const GRAY = "#444444";
const CONTENT_WIDTH = 455;

const FONT = {
  title: 19,
  section: 13,
  body: 11.5,
  field: 11,
  secondary: 10.5,
  footer: 9.5,
  headerBrand: 11.5,
  headerMeta: 10
} as const;

const SPACING = {
  paragraph: 10,
  section: 18,
  field: 6,
  signature: 16
} as const;

const TRANSPORT_LABELS: Record<string, string> = {
  vessel: "EmbarcaciÃ³n",
  aircraft: "Aeronave",
  both: "EmbarcaciÃ³n y aeronave",
  none: "Sin transporte propio"
};

const EXPERIENCE_LABELS: Record<string, string> = {
  yacht: "Yates",
  fishing: "Pesca deportiva",
  surf: "Surf",
  dive: "Buceo",
  wedding: "Bodas",
  agency: "Agencias",
  private: "Experiencia privada"
};

const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  incompleto: "Incompleto"
};

function display(value: unknown): string {
  if (value == null || value === "") return "â€”";
  return String(value);
}

function formatLongDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "long" }).format(date);
}

type Layout = {
  contentX: number;
  contentWidth: number;
  paragraph: (text: string, options?: PDFKit.Mixins.TextOptions) => void;
  sectionTitle: (text: string) => void;
  field: (label: string, value: unknown) => void;
  gap: (size?: number) => void;
};

function createLayout(doc: PDFKit.PDFDocument): Layout {
  const contentWidth = CONTENT_WIDTH;
  const contentX = (doc.page.width - contentWidth) / 2;

  const paragraph = (text: string, options?: PDFKit.Mixins.TextOptions) => {
    doc.text(text, contentX, doc.y, {
      width: contentWidth,
      lineGap: 4,
      paragraphGap: 6,
      ...options
    });
  };

  const sectionTitle = (text: string) => {
    doc
      .font("Helvetica-Bold")
      .fontSize(FONT.section)
      .fillColor(FOREST)
      .text(text, contentX, doc.y, { width: contentWidth, lineGap: 3 });
  };

  const field = (label: string, value: unknown) => {
    doc
      .font("Helvetica-Bold")
      .fontSize(FONT.field)
      .fillColor(FOREST)
      .text(`${label}: `, contentX, doc.y, {
        width: contentWidth,
        continued: true,
        lineGap: 3
      });
    doc.font("Helvetica").fillColor(GRAY).text(display(value), { lineGap: 3 });
    doc.y += SPACING.field;
  };

  const gap = (size: number = 10): void => {
    doc.y += size;
  };

  return { contentX, contentWidth, paragraph, sectionTitle, field, gap };
}

function drawHeader(doc: PDFKit.PDFDocument, layout: Layout, folio: string) {
  const { contentX, contentWidth } = layout;
  const headerTop = 52;
  const leftWidth = contentWidth * 0.48;
  const rightWidth = contentWidth * 0.48;
  const rightX = contentX + contentWidth - rightWidth;

  doc
    .strokeColor(OCEAN)
    .lineWidth(1.2)
    .moveTo(contentX, headerTop - 8)
    .lineTo(contentX + contentWidth, headerTop - 8)
    .stroke();

  doc
    .font("Helvetica-Bold")
    .fontSize(FONT.headerBrand)
    .fillColor(FOREST)
    .text("LAS MARÃAS EXPERIENCE", contentX, headerTop, { width: leftWidth, lineGap: 2 });

  doc
    .font("Helvetica")
    .fontSize(FONT.headerMeta)
    .fillColor(GRAY)
    .text("MR Lucky Eventos y MÃ¡s", contentX, doc.y, { width: leftWidth, lineGap: 2 })
    .text("CoordinaciÃ³n de Ingreso y Experiencias Privadas")
    .text("Reserva de la BiÃ³sfera Islas MarÃ­as");

  doc
    .font("Helvetica-Bold")
    .fontSize(FONT.headerBrand)
    .fillColor(FOREST)
    .text("Licencia de CoordinaciÃ³n de Ingreso", rightX, headerTop, {
      width: rightWidth,
      align: "right",
      lineGap: 2
    })
    .text("a la Reserva de la BiÃ³sfera Islas MarÃ­as", { align: "right" });

  doc
    .font("Helvetica")
    .fontSize(FONT.headerMeta)
    .fillColor(GRAY)
    .text(`Folio: ${folio}`, { align: "right" });

  doc.y = Math.max(doc.y, headerTop + 72) + SPACING.section;
}

export async function generateLicensePdfFile(
  record: ExperienceApplicationRecord,
  options: { outputPath: string; qrValidationUrl: string; issuedAt: string }
): Promise<void> {
  await mkdir(path.dirname(options.outputPath), { recursive: true });

  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 48, bottom: 56, left: 48, right: 48 }
  });
  const stream = createWriteStream(options.outputPath);
  doc.pipe(stream);

  const layout = createLayout(doc);
  drawHeader(doc, layout, record.folio);

  layout.sectionTitle("Asunto");
  layout.gap(6);
  layout.paragraph("Se emite licencia de coordinaciÃ³n de ingreso y egreso.", {
    align: "left",
    lineGap: 4
  });
  layout.gap(SPACING.section);

  layout.paragraph(
    `Lugar y fecha: Islas MarÃ­as / Puerto Vallarta / Guadalajara, a ${formatLongDate(options.issuedAt)}.`,
    { lineGap: 4 }
  );
  layout.gap(SPACING.paragraph);

  layout.paragraph(
    "Destinatario: A quien corresponda: CapitanÃ­a, administraciÃ³n, operador, autoridad revisora o personal de control de ingreso.",
    { lineGap: 4 }
  );
  layout.gap(SPACING.section);

  layout.paragraph(
    `Antecedente: Solicitud registrada en Las MarÃ­as Experience, folio ${record.folio}, capturada por ${record.applicant.fullName}, de fecha ${formatLongDate(record.createdAt)}.`,
    { lineGap: 4 }
  );
  layout.gap(SPACING.paragraph);

  doc
    .font("Helvetica")
    .fontSize(FONT.body)
    .fillColor(GRAY)
    .text(
      `Por medio de la presente, Las MarÃ­as Experience, operado por MR Lucky Eventos y MÃ¡s, hace constar la coordinaciÃ³n operativa de ingreso y egreso al ArchipiÃ©lago Islas MarÃ­as conforme al expediente digital ${record.folio}.`,
      layout.contentX,
      doc.y,
      { width: layout.contentWidth, align: "justify", lineGap: 4, paragraphGap: 6 }
    );
  layout.gap(SPACING.section);

  layout.sectionTitle("Se autoriza para efectos de coordinaciÃ³n operativa");
  layout.gap(SPACING.paragraph);

  const activities = record.activities.experienceTypes
    .map((type) => EXPERIENCE_LABELS[type] ?? type)
    .join(", ");

  layout.field("Solicitante", record.applicant.fullName);
  layout.field("Empresa", record.applicant.company);
  layout.field("Nacionalidad", record.applicant.nationality);
  layout.field("TelÃ©fono", record.applicant.phone);
  layout.field("Correo", record.applicant.email);
  layout.field("Tipo de ingreso", TRANSPORT_LABELS[record.transport.type] ?? record.transport.type);
  layout.field("EmbarcaciÃ³n / aeronave", record.transport.vesselName || record.transport.aircraftType);
  layout.field(
    "MatrÃ­cula / registro",
    record.transport.vesselRegistration || record.transport.aircraftRegistration
  );
  layout.field("Eslora (m)", record.transport.vesselLengthM);
  layout.field("Puerto/aeropuerto de entrada", record.itinerary.entryPort);
  layout.field("Puerto/aeropuerto de salida", record.itinerary.exitPort);
  layout.field("Fecha de ingreso", formatLongDate(record.itinerary.arrivalDate));
  layout.field(
    "Fecha de egreso",
    record.itinerary.departureDate ? formatLongDate(record.itinerary.departureDate) : "â€”"
  );
  layout.field("Personas a bordo", record.peopleOnBoard.total);
  layout.field("Actividades autorizadas", activities);
  layout.field("Hospedaje", record.lodging.preference);
  layout.field("Alimentos", record.food.dietaryRestrictions || record.food.preferences);
  layout.field("Observaciones", record.observations);

  layout.gap(SPACING.section);
  layout.sectionTitle("Condiciones operativas");
  layout.gap(SPACING.paragraph);

  layout.paragraph(
    "La presente licencia de coordinaciÃ³n no sustituye permisos, despachos, autorizaciones, inspecciones o determinaciones de autoridades competentes. El ingreso, permanencia y egreso quedan sujetos a la normatividad aplicable, lineamientos de la Reserva de la BiÃ³sfera Islas MarÃ­as, instrucciones del personal autorizado, condiciones meteorolÃ³gicas, validaciÃ³n documental y revisiÃ³n operativa correspondiente.",
    { align: "justify", lineGap: 4 }
  );
  layout.gap(SPACING.paragraph);
  layout.paragraph(
    "El solicitante manifiesta que la informaciÃ³n proporcionada es veraz y que las personas, embarcaciÃ³n, aeronave, documentos y actividades declaradas corresponden al expediente registrado.",
    { align: "justify", lineGap: 4 }
  );

  const documents = record.documents ?? [];
  if (documents.length > 0) {
    layout.gap(SPACING.section);
    layout.sectionTitle("Documentos integrados");
    layout.gap(SPACING.paragraph);

    doc.font("Helvetica").fontSize(FONT.field).fillColor(GRAY);
    for (const item of documents) {
      doc.text(
        `â€¢ ${item.label} â€” ${item.originalName} â€” ${DOCUMENT_STATUS_LABELS[item.status] ?? item.status}`,
        layout.contentX,
        doc.y,
        { width: layout.contentWidth, lineGap: 4, paragraphGap: 4 }
      );
      doc.y += 4;
    }
  }

  layout.gap(SPACING.signature);
  doc
    .font("Helvetica")
    .fontSize(FONT.body)
    .fillColor(GRAY)
    .text("Atentamente,", layout.contentX, doc.y, { width: layout.contentWidth, lineGap: 3 });
  doc
    .font("Helvetica-Bold")
    .fontSize(FONT.section)
    .fillColor(FOREST)
    .text("DirecciÃ³n de Operaciones", layout.contentX, doc.y, { width: layout.contentWidth });
  doc
    .font("Helvetica")
    .fontSize(FONT.body)
    .fillColor(GRAY)
    .text("Las MarÃ­as Experience", layout.contentX, doc.y, { width: layout.contentWidth })
    .text("MR Lucky Eventos y MÃ¡s");
  layout.gap(SPACING.paragraph);
  layout.paragraph("Copias: Expediente digital Â· Solicitante Â· Control operativo", {
    lineGap: 3
  });

  const qrBuffer = await QRCode.toBuffer(options.qrValidationUrl, { margin: 1, width: 128 });
  const qrSize = 78;
  doc.image(qrBuffer, layout.contentX + layout.contentWidth - qrSize, doc.page.height - 132, {
    width: qrSize
  });

  doc
    .font("Helvetica")
    .fontSize(FONT.footer)
    .fillColor(GRAY)
    .text(
      `Documento generado digitalmente. Folio: ${record.folio}. Fecha de emisiÃ³n: ${formatLongDate(options.issuedAt)}. PÃ¡gina 1 de 1.`,
      layout.contentX,
      doc.page.height - 46,
      { align: "center", width: layout.contentWidth, lineGap: 2 }
    );

  doc.end();
  await finished(stream);
}

