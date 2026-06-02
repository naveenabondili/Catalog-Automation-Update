export class AuditLogger {
  constructor() {
    this.logs = [];
  }

  log(action, details, status = "success") {
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      details,
      status
    };
    this.logs.push(entry);
    console.log(`[AUDIT] ${action}:`, details);
  }

  error(action, details, error) {
    this.log(action, details, "error");
    console.error(`[ERROR] ${action}:`, error.message);
  }

  getLogs() {
    return this.logs;
  }

  exportLogs() {
    return JSON.stringify(this.logs, null, 2);
  }
}

export const auditLogger = new AuditLogger();