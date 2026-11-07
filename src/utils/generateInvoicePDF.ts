import PDFDocument from "pdfkit";

export interface IInvoicePDFData {
  invoiceNumber: string;
  patientName?: string;
  patientId: string;
  tripId: string;
  baseFare: number;
  distanceCharge: number;
  waitingCharge: number;
  additionalCharges: number;
  totalAmount: number;
  currency: string;
  distanceKm?: number | null;
  paymentStatus: string;
  paymentMethod?: string | null;
  transactionId?: string | null;
  createdAt: Date;
}

export function generateInvoicePDF(data: IInvoicePDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const buffers: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    // Title / Header
    doc
      .fontSize(22)
      .fillColor("#0f766e") // Primary teal
      .text("LifeDispatch", 50, 50, { align: "left" });

    doc
      .fontSize(9)
      .fillColor("#64748b")
      .text("Emergency Medical Dispatch & Ambulance Service", 50, 78)
      .text("Government EMS Registration: #GOV-BD-EM-2026", 50, 90)
      .moveDown();

    // Invoice badge / number
    doc
      .fontSize(14)
      .fillColor("#1e293b")
      .text(`OFFICIAL RECEIPT: ${data.invoiceNumber}`, 50, 115);

    doc
      .fontSize(10)
      .fillColor(data.paymentStatus === "PAID" ? "#16a34a" : "#ca8a04")
      .text(`Status: ${data.paymentStatus}`, 450, 115, { align: "right" });

    doc.moveDown();

    // Divider line
    doc
      .strokeColor("#e2e8f0")
      .lineWidth(1)
      .moveTo(50, 140)
      .lineTo(550, 140)
      .stroke();

    // Meta Section
    const metaTop = 155;
    doc
      .fontSize(9)
      .fillColor("#64748b")
      .text("Date:", 50, metaTop)
      .fillColor("#1e293b")
      .text(new Date(data.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }), 110, metaTop);

    doc
      .fillColor("#64748b")
      .text("Patient:", 50, metaTop + 16)
      .fillColor("#1e293b")
      .text(data.patientName || data.patientId, 110, metaTop + 16);

    doc
      .fillColor("#64748b")
      .text("Trip Ref:", 330, metaTop)
      .fillColor("#1e293b")
      .text(data.tripId.slice(0, 18) + "...", 400, metaTop);

    if (data.transactionId) {
      doc
        .fillColor("#64748b")
        .text("Txn ID:", 330, metaTop + 16)
        .fillColor("#1e293b")
        .text(data.transactionId.slice(0, 22), 400, metaTop + 16);
    }

    if (data.paymentMethod) {
      doc
        .fillColor("#64748b")
        .text("Method:", 330, metaTop + 32)
        .fillColor("#1e293b")
        .text(data.paymentMethod, 400, metaTop + 32);
    }

    // Divider line
    const tableTop = 210;
    doc
      .strokeColor("#0f766e")
      .lineWidth(2)
      .moveTo(50, tableTop)
      .lineTo(550, tableTop)
      .stroke();

    // Table Header
    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor("#0f766e")
      .text("Clinical Service & Transport Item", 50, tableTop + 8)
      .text("Amount (BDT)", 450, tableTop + 8, { align: "right" });

    doc
      .strokeColor("#e2e8f0")
      .lineWidth(1)
      .moveTo(50, tableTop + 24)
      .lineTo(550, tableTop + 24)
      .stroke();

    // Table Rows
    let currentY = tableTop + 35;
    const addRow = (label: string, detail: string, amount: string) => {
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#1e293b")
        .text(label, 50, currentY);

      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#64748b")
        .text(detail, 50, currentY + 12);

      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#1e293b")
        .text(amount, 450, currentY, { align: "right" });

      currentY += 32;
    };

    doc.font("Helvetica");
    addRow(
      "Base Emergency Ambulance Dispatch",
      "Includes paramedic crew dispatch & initial pre-hospital triage",
      `${data.baseFare.toFixed(2)} BDT`
    );

    addRow(
      "Mileage Transport Surcharge",
      `Traveled distance: ${data.distanceKm ?? 0} km at standard tariff (35 BDT/km)`,
      `${data.distanceCharge.toFixed(2)} BDT`
    );

    if (data.waitingCharge > 0) {
      addRow(
        "On-Scene Waiting Charge",
        "Waiting time on-scene exceeding standard 15-minute grace period",
        `${data.waitingCharge.toFixed(2)} BDT`
      );
    }

    if (data.additionalCharges > 0) {
      addRow(
        "Additional Clinical Charges",
        "Specialized life-support supplies & medication",
        `${data.additionalCharges.toFixed(2)} BDT`
      );
    }

    // Total section
    doc
      .strokeColor("#cbd5e1")
      .lineWidth(1)
      .moveTo(50, currentY + 5)
      .lineTo(550, currentY + 5)
      .stroke();

    currentY += 15;
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor("#0f766e")
      .text("Total Settlement Amount:", 50, currentY);

    doc
      .fontSize(13)
      .text(`${data.totalAmount.toFixed(2)} ${data.currency || "BDT"}`, 420, currentY, { align: "right" });

    // Footer
    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor("#94a3b8")
      .text(
        "LifeDispatch Emergency Medical Coordination System • 24/7 Hotline: +880-9612-444999",
        50,
        680,
        { align: "center", width: 500 }
      )
      .text(
        "This document serves as an authentic electronic medical dispatch & ambulance transport receipt.",
        50,
        695,
        { align: "center", width: 500 }
      );

    doc.end();
  });
}

