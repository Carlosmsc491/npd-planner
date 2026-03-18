/**
 * Calcula el rango de fechas dinámico: hoy -7 días hasta hoy +7 días
 * Usado para los filtros Ship Date y ETA From en la exportación de Traze
 */
export interface DateRange {
  from: string;       // "YYYY-MM-DD"
  to: string;         // "YYYY-MM-DDT23:59:59"
  fromDisplay: string; // "MM/DD/YYYY" para logs
  toDisplay: string;   // "MM/DD/YYYY" para logs
}

export function getWeekRange(): DateRange {
  const now  = new Date();
  const from = new Date(now);
  const to   = new Date(now);

  // ±30 days gives a wide enough window to catch shipments regardless of
  // whether they're inbound now, already received, or arriving soon.
  from.setDate(now.getDate() - 30);
  to.setDate(now.getDate() + 30);

  const fmtISO = (d: Date): string => d.toISOString().split('T')[0];
  const fmtDisplay = (d: Date): string => {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yy = d.getFullYear();
    return `${mm}/${dd}/${yy}`;
  };

  return {
    from:        fmtISO(from),
    to:          `${fmtISO(to)}T23:59:59`,
    fromDisplay: fmtDisplay(from),
    toDisplay:   fmtDisplay(to),
  };
}
