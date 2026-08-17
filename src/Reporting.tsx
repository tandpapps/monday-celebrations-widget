import { useEffect, useMemo, useState } from "react";
import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

const HR_BOARD_ID = 5099059636;
const LEAVE_BOARD_ID = 5091696146;

const HR = {
  department: "dropdown_mm4ky8en",
  position: "text_mm4kzj52",
  manager: "multiple_person_mm4kzcth",
  startDate: "date_mm4kbtht",
  location: "dropdown_mm4kk268",
  employmentType: "dropdown_mm4k2zrk",
  probationEnd: "date_mm4kwjbx",
  status: "color_mm5zh84a",
  relationToLeave: "board_relation_mm64w1yx",
};

const LEAVE = {
  relationToHr: "board_relation_mm64vycx",
  positionMirror: "lookup_mm64awrp",
  employee: "person",
  department: "dropdown_mm0gjq4j",
  timeline: "timerange_mm63zfet",
  previousBalance: "numeric_mm1r7j05",
  currentBalance: "numeric_mm1rcqfy",
  totalLeave: "lookup_mm1rr74b",
  actualBalance: "formula_mm1rkg2g",
  approver: "multiple_person_mm0gp5hr",
  replacement: "lookup_mm1vwk88",
};

type ColumnValue = {
  id: string;
  text: string;
  value: string | null;
};

type MondayItem = {
  id: string;
  name: string;
  group?: { id: string; title: string };
  column_values: ColumnValue[];
};

type HrEmployee = {
  id: string;
  name: string;
  department: string;
  position: string;
  manager: string;
  startDate: string;
  location: string;
  employmentType: string;
  probationEnd: string;
  status: string;
  leaveItemIds: string[];
  collaborationType: "Εσωτερικός" | "Εξωτερικός" | "Δοκιμαστική" | "Άλλο";
};

type LeaveEmployee = {
  id: string;
  name: string;
  hrItemIds: string[];
  department: string;
  position: string;
  timelineFrom: string;
  timelineTo: string;
  previousBalance: number | null;
  currentBalance: number | null;
  totalLeave: number | null;
  actualBalance: number | null;
  approver: string;
  replacement: string;
};

function getColumn(item: MondayItem, id: string) {
  return item.column_values.find((column) => column.id === id);
}

function parseLinkedIds(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const candidates = [parsed.linkedPulseIds, parsed.linkedItemIds, parsed.item_ids, parsed.itemIds];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate.map(String);
    }
  } catch {
    return [];
  }
  return [];
}

function parseDate(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value) as { date?: string };
    return parsed.date ?? "";
  } catch {
    return "";
  }
}

function parseTimeline(value: string | null | undefined): { from: string; to: string } {
  if (!value) return { from: "", to: "" };
  try {
    const parsed = JSON.parse(value) as { from?: string; to?: string };
    return { from: parsed.from ?? "", to: parsed.to ?? "" };
  } catch {
    return { from: "", to: "" };
  }
}

function parseNumber(text: string | undefined): number | null {
  if (!text?.trim()) return null;
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function collaborationType(groupTitle: string | undefined): HrEmployee["collaborationType"] {
  const title = (groupTitle ?? "").toLocaleUpperCase("el-GR");
  if (title.includes("ΕΞΩΤΕΡΙΚ")) return "Εξωτερικός";
  if (title.includes("ΔΟΚΙΜΑΣΤ")) return "Δοκιμαστική";
  if (title.includes("ΕΣΩΤΕΡΙΚ")) return "Εσωτερικός";
  return "Άλλο";
}

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("el-GR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatNumber(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("el-GR", { maximumFractionDigits: 1 }).format(value);
}

function daysUntil(value: string) {
  if (!value) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(`${value}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

function useReportingData() {
  const [hrItems, setHrItems] = useState<MondayItem[]>([]);
  const [leaveItems, setLeaveItems] = useState<MondayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const query = `
          query Reporting($hr: [ID!], $leave: [ID!]) {
            hr: boards(ids: $hr) {
              items_page(limit: 100) {
                items {
                  id
                  name
                  group { id title }
                  column_values(ids: [
                    "${HR.department}", "${HR.position}", "${HR.manager}",
                    "${HR.startDate}", "${HR.location}", "${HR.employmentType}",
                    "${HR.probationEnd}", "${HR.status}", "${HR.relationToLeave}"
                  ]) { id text value }
                }
              }
            }
            leave: boards(ids: $leave) {
              items_page(limit: 100) {
                items {
                  id
                  name
                  group { id title }
                  column_values(ids: [
                    "${LEAVE.relationToHr}", "${LEAVE.positionMirror}", "${LEAVE.employee}",
                    "${LEAVE.department}", "${LEAVE.timeline}", "${LEAVE.previousBalance}",
                    "${LEAVE.currentBalance}", "${LEAVE.totalLeave}", "${LEAVE.actualBalance}",
                    "${LEAVE.approver}", "${LEAVE.replacement}"
                  ]) { id text value }
                }
              }
            }
          }
        `;

        const response = await monday.api(query, {
          variables: { hr: [HR_BOARD_ID], leave: [LEAVE_BOARD_ID] },
        });

        setHrItems((response?.data?.hr?.[0]?.items_page?.items ?? []) as MondayItem[]);
        setLeaveItems((response?.data?.leave?.[0]?.items_page?.items ?? []) as MondayItem[]);
      } catch (err) {
        console.error(err);
        setError("Δεν ήταν δυνατή η φόρτωση των reporting δεδομένων από το monday.com.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const employees = useMemo<HrEmployee[]>(() => hrItems.map((item) => ({
    id: item.id,
    name: item.name,
    department: getColumn(item, HR.department)?.text || "—",
    position: getColumn(item, HR.position)?.text || "—",
    manager: getColumn(item, HR.manager)?.text || "—",
    startDate: parseDate(getColumn(item, HR.startDate)?.value),
    location: getColumn(item, HR.location)?.text || "—",
    employmentType: getColumn(item, HR.employmentType)?.text || "—",
    probationEnd: parseDate(getColumn(item, HR.probationEnd)?.value),
    status: getColumn(item, HR.status)?.text || "—",
    leaveItemIds: parseLinkedIds(getColumn(item, HR.relationToLeave)?.value),
    collaborationType: collaborationType(item.group?.title),
  })), [hrItems]);

  const leaveEmployees = useMemo<LeaveEmployee[]>(() => leaveItems.map((item) => {
    const timeline = parseTimeline(getColumn(item, LEAVE.timeline)?.value);
    return {
      id: item.id,
      name: item.name,
      hrItemIds: parseLinkedIds(getColumn(item, LEAVE.relationToHr)?.value),
      department: getColumn(item, LEAVE.department)?.text || "—",
      position: getColumn(item, LEAVE.positionMirror)?.text || "—",
      timelineFrom: timeline.from,
      timelineTo: timeline.to,
      previousBalance: parseNumber(getColumn(item, LEAVE.previousBalance)?.text),
      currentBalance: parseNumber(getColumn(item, LEAVE.currentBalance)?.text),
      totalLeave: parseNumber(getColumn(item, LEAVE.totalLeave)?.text),
      actualBalance: parseNumber(getColumn(item, LEAVE.actualBalance)?.text),
      approver: getColumn(item, LEAVE.approver)?.text || "—",
      replacement: getColumn(item, LEAVE.replacement)?.text || "—",
    };
  }), [leaveItems]);

  return { employees, leaveEmployees, loading, error };
}

function LoadingState({ error }: { error: string | null }) {
  return <main className="report-shell"><div className={`state ${error ? "error" : ""}`}>{error ?? "Φόρτωση reporting δεδομένων…"}</div></main>;
}

function ReportHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <header className="report-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="report-subtitle">{subtitle}</p>
      </div>
    </header>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="kpi-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function HrReporting() {
  const { employees, leaveEmployees, loading, error } = useReportingData();
  if (loading || error) return <LoadingState error={error} />;

  const active = employees.filter((employee) => employee.status === "ACTIVE" || employee.status === "PROBATION PERIOD");
  const internal = active.filter((employee) => employee.collaborationType === "Εσωτερικός" || employee.collaborationType === "Δοκιμαστική");
  const external = active.filter((employee) => employee.collaborationType === "Εξωτερικός");
  const probation = active
    .filter((employee) => employee.status === "PROBATION PERIOD" && employee.probationEnd)
    .sort((a, b) => a.probationEnd.localeCompare(b.probationEnd));

  const departmentCounts = Array.from(active.reduce((map, employee) => {
    const departments = employee.department.split(",").map((value) => value.trim()).filter(Boolean);
    for (const department of departments.length ? departments : ["Χωρίς τμήμα"]) {
      map.set(department, (map.get(department) ?? 0) + 1);
    }
    return map;
  }, new Map<string, number>())).sort((a, b) => b[1] - a[1]);

  const employmentCounts = Array.from(active.reduce((map, employee) => {
    map.set(employee.employmentType, (map.get(employee.employmentType) ?? 0) + 1);
    return map;
  }, new Map<string, number>())).sort((a, b) => b[1] - a[1]);

  const balanceByHrId = new Map<string, number | null>();
  for (const leave of leaveEmployees) {
    for (const hrId of leave.hrItemIds) balanceByHrId.set(hrId, leave.actualBalance);
  }

  return (
    <main className="report-shell">
      <ReportHeader eyebrow="WORKFORCE OVERVIEW" title="👥 HR Reporting" subtitle="Ενιαία εικόνα ανθρώπινου δυναμικού από το HR Employee Onboarding." />

      <section className="kpi-grid">
        <Kpi label="Ενεργό δυναμικό" value={active.length} hint="Active + Probation" />
        <Kpi label="Εσωτερικοί" value={internal.length} />
        <Kpi label="Εξωτερικοί" value={external.length} />
        <Kpi label="Σε δοκιμαστική" value={probation.length} />
      </section>

      <section className="report-grid two">
        <div className="report-panel">
          <h2>Headcount ανά Τμήμα</h2>
          <div className="metric-list">
            {departmentCounts.map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}</strong></div>)}
          </div>
        </div>
        <div className="report-panel">
          <h2>Headcount ανά Τύπο Απασχόλησης</h2>
          <div className="metric-list">
            {employmentCounts.map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}</strong></div>)}
          </div>
        </div>
      </section>

      <section className="report-panel">
        <h2>Παρακολούθηση Δοκιμαστικής Περιόδου</h2>
        {probation.length === 0 ? <p className="muted">Δεν υπάρχουν ενεργοί εργαζόμενοι σε δοκιμαστική περίοδο.</p> : (
          <div className="table-wrap"><table><thead><tr><th>Όνομα</th><th>Τμήμα</th><th>Θέση</th><th>Λήξη</th><th>Σε ημέρες</th></tr></thead><tbody>
            {probation.map((employee) => <tr key={employee.id}><td>{employee.name}</td><td>{employee.department}</td><td>{employee.position}</td><td>{formatDate(employee.probationEnd)}</td><td>{daysUntil(employee.probationEnd) ?? "—"}</td></tr>)}
          </tbody></table></div>
        )}
      </section>

      <section className="report-panel">
        <h2>Ενιαίος Πίνακας Δυναμικού</h2>
        <div className="table-wrap"><table><thead><tr><th>Όνομα</th><th>Τμήμα</th><th>Θέση</th><th>Τύπος</th><th>Employment</th><th>Manager</th><th>Start Date</th><th>Status</th><th>Υπόλοιπο</th></tr></thead><tbody>
          {active.map((employee) => <tr key={employee.id}><td>{employee.name}</td><td>{employee.department}</td><td>{employee.position}</td><td>{employee.collaborationType}</td><td>{employee.employmentType}</td><td>{employee.manager}</td><td>{formatDate(employee.startDate)}</td><td><span className={`status-pill ${employee.status === "ACTIVE" ? "active" : "probation"}`}>{employee.status}</span></td><td>{formatNumber(balanceByHrId.get(employee.id) ?? null)}</td></tr>)}
        </tbody></table></div>
      </section>
    </main>
  );
}

export function LeaveReporting() {
  const { employees, leaveEmployees, loading, error } = useReportingData();
  if (loading || error) return <LoadingState error={error} />;

  const activeHrIds = new Set(employees.filter((employee) => employee.status === "ACTIVE" || employee.status === "PROBATION PERIOD").map((employee) => employee.id));
  const eligible = leaveEmployees.filter((leave) => leave.hrItemIds.length === 0 || leave.hrItemIds.some((id) => activeHrIds.has(id)));

  const upcoming = eligible
    .filter((leave) => {
      const days = daysUntil(leave.timelineFrom);
      return days !== null && days >= 0 && days <= 30;
    })
    .sort((a, b) => a.timelineFrom.localeCompare(b.timelineFrom));

  const awayNow = eligible.filter((leave) => {
    if (!leave.timelineFrom || !leave.timelineTo) return false;
    const today = new Date().toISOString().slice(0, 10);
    return leave.timelineFrom <= today && leave.timelineTo >= today;
  });

  const lowBalance = [...eligible]
    .filter((leave) => leave.actualBalance !== null)
    .sort((a, b) => (a.actualBalance ?? 0) - (b.actualBalance ?? 0));

  return (
    <main className="report-shell">
      <ReportHeader eyebrow="LEAVE & COVERAGE" title="🏖️ Leave Reporting" subtitle="Άδειες, κάλυψη και υπόλοιπα από το board Αιτήματα Αδειών & Εγκρίσεων." />

      <section className="kpi-grid">
        <Kpi label="Απουσιάζουν τώρα" value={awayNow.length} />
        <Kpi label="Επόμενες 30 ημέρες" value={upcoming.length} />
        <Kpi label="Άτομα με στοιχεία αδείας" value={eligible.length} />
        <Kpi label="Χαμηλό/αρνητικό υπόλοιπο" value={lowBalance.filter((row) => (row.actualBalance ?? 999) <= 3).length} hint="≤ 3 ημέρες" />
      </section>

      <section className="report-panel">
        <h2>Ενεργές / Επερχόμενες Άδειες</h2>
        {upcoming.length === 0 && awayNow.length === 0 ? <p className="muted">Δεν υπάρχουν ενεργές ή επερχόμενες άδειες στο επόμενο 30ήμερο.</p> : (
          <div className="table-wrap"><table><thead><tr><th>Employee</th><th>Department</th><th>Από</th><th>Έως</th><th>Replacement</th><th>Approver</th><th>Υπόλοιπο</th></tr></thead><tbody>
            {[...awayNow, ...upcoming.filter((row) => !awayNow.some((current) => current.id === row.id))].map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.department}</td><td>{formatDate(row.timelineFrom)}</td><td>{formatDate(row.timelineTo)}</td><td>{row.replacement}</td><td>{row.approver}</td><td>{formatNumber(row.actualBalance)}</td></tr>)}
          </tbody></table></div>
        )}
      </section>

      <section className="report-panel">
        <h2>Πραγματικό Υπόλοιπο ανά Άτομο</h2>
        <div className="table-wrap"><table><thead><tr><th>Employee</th><th>Department</th><th>Position</th><th>Προηγ. Έτος</th><th>Τρέχον Έτος</th><th>Σύνολο Άδειας</th><th>Πραγματικό Υπόλοιπο</th></tr></thead><tbody>
          {lowBalance.map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.department}</td><td>{row.position}</td><td>{formatNumber(row.previousBalance)}</td><td>{formatNumber(row.currentBalance)}</td><td>{formatNumber(row.totalLeave)}</td><td className={(row.actualBalance ?? 999) < 0 ? "negative" : ""}>{formatNumber(row.actualBalance)}</td></tr>)}
        </tbody></table></div>
      </section>
    </main>
  );
}
