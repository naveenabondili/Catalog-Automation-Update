import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

export function generateArtifactReport(requirementId, artifacts, catalogItem) {
  const fileName = `Report_${catalogItem.name}_${Date.now()}.pdf`;
  const filePath = path.join("./reports", fileName);

  if (!fs.existsSync("./reports")) {
    fs.mkdirSync("./reports", { recursive: true });
  }

  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(filePath));

  doc.fontSize(20).text("ServiceNow Artifact Report", { underline: true });
  doc.fontSize(12).text("\n");

  doc.fontSize(14).text("Catalog Item", { underline: true });
  doc.fontSize(11).text(`Name: ${catalogItem.name}`);
  doc.text(`ID: ${catalogItem.sys_id}`);
  doc.text(`Status: ${catalogItem.status}`);
  doc.text(`Description: ${catalogItem.short_description}`);
  doc.text("\n");

  if (artifacts.variableSet) {
    doc.fontSize(14).text("Variables", { underline: true });
    artifacts.variableSet.variables.forEach(v => {
      doc.fontSize(11).text(`- ${v.name} (${v.type}): ${v.label}`);
    });
    doc.text("\n");
  }

  if (artifacts.flow) {
    doc.fontSize(14).text("Workflow Steps", { underline: true });
    artifacts.flow.steps.forEach((s, i) => {
      doc.fontSize(11).text(`${i + 1}. ${s.name}`);
    });
    doc.text("\n");
  }

  if (artifacts.approval) {
    doc.fontSize(14).text("Approvals", { underline: true });
    doc.fontSize(11).text(`Approvers: ${artifacts.approval.approvers.join(", ")}`);
    doc.text("\n");
  }

  if (artifacts.testResult) {
    doc.fontSize(14).text("Test Results", { underline: true });
    doc.fontSize(11).text(`Status: ${artifacts.testResult.status}`);
    doc.text(`Steps Passed: ${artifacts.testResult.steps_passed}`);
    doc.text(`Steps Failed: ${artifacts.testResult.steps_failed}`);
    doc.text(`Duration: ${artifacts.testResult.duration_ms}ms`);
  }

  doc.end();
  return filePath;
}