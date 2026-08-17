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
  previousBalance: "numeric_mm1r7j05",
  currentBalance: "numeric_mm1rcqfy",
  approver: "multiple_person_mm0gp5hr",
};

const LEAVE_SUBITEM = {
  status: "status",
  startDate: "date_mm1rex0r",
  endDate: "date_mm1rt0nh",
  replacement: "multiple_person_mm1rv62m",
};

type ColumnValue = {
  id: string;
  text?: string | null;
  value?: string | null;
  linked_item_ids?: string[];
  number?: number | null;
  date?: string | null;
  label?: string | null;
};

type MondayItem = {
  id: string;
  name: string;
  group?: { id: string; title: string };
  column_values: ColumnValue[];
  subitems?: MondayItem[];
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

type LeavePeriod = {
  id: string;
  from: string;
  to: string;
  replacement: string;
};

type LeaveEmployee = {
  id: string;
  name: string;
  hrItemIds: string[];
  department: string;
  position: string;
  previousBalance: number | null;
  currentBalance: number | null;
  totalLeave: number;
  actualBalance: number | null;
  approver: string;
  periods: LeavePeriod[];
};

function getColumn(item: MondayItem, id: string) {
  return item.column_values.find((column) => column.id === id);
}

function linkedIds(column: ColumnValue | undefined): string[] {
  return (column?.linked_item_ids ?? []).map(String);
}

function columnDate(column: ColumnValue | undefined): string {
  if (column?.date) return column.date;
  if (!column?.value) return "";
  try {
    const parsed = JSON.parse(column.value) as { date?: string };
    return parsed.date ?? "";
  } catch {
    return "";
  }
}

function columnNumber(column: ColumnValue | undefined): number | null {
  if (typeof column?.number === "number" && Number.isFinite(column.number)) return column.number;
  const text = column?.text?.trim();
  if (!text) return null;
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function workdaysInclusive(from: string, to: string): number {
  if (!from || !to) return 0;
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function approvedPeriods(subitems: MondayItem[] | undefined): LeavePeriod[] {
  if (!subitems?.length) return [];
  return subitems.flatMap((subitem) => {
    const statusColumn = getColumn(subitem, LEAVE_SUBITEM.status);
    const status = (statusColumn?.label ?? statusColumn?.text ?? "").trim().toLocaleUpperCase("en-US");
    if (status !== "APPROVED") return [];

    const from = columnDate(getColumn(subitem, LEAVE_SUBITEM.startDate));
    const to = columnDate(getColumn(subitem, LEAVE_SUBITEM.endDate));
    if (!from || !to) return [];

    return [{
      id: subitem.id,
      from,
      to,
      replacement: getColumn(subitem, LEAVE_SUBITEM.replacement)?.text || "—",
    }];
  });
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

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
                  ]) {
                    id text value
                    ... on BoardRelationValue { linked_item_ids }
                    ... on DateValue { date }
                  }
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
                    "${LEAVE.department}", "${LEAVE.previousBalance}", "${LEAVE.currentBalance}",
                    "${LEAVE.approver}"
                  ]) {
                    id text value
                    ... on BoardRelationValue { linked_item_ids }
                    ... on NumbersValue { number }
                  }
                  subitems {
                    id
                    name
                    column_values(ids: [
                      "${LEAVE_SUBITEM.status}", "${LEAVE_SUBITEM.startDate}",
                      "${LEAVE_SUBITEM.endDate}", "${LEAVE_SUBITEM.replacement}"
                    ]) {
                      id text value
                      ... on StatusValue { label }
                      ... on DateValue { date }
                    }
                  }
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
    startDate: columnDate(getColumn(item, HR.startDate)),
    location: getColumn(item, HR.location)?.text || "—",
    employmentType: getColumn(item, HR.employmentType)?.text || "—",
    probationEnd: columnDate(getColumn(item, HR.probationEnd)),
    status: getColumn(item, HR.status)?.text || "—",
    leaveItemIds: linkedIds(getColumn(item, HR.relationToLeave)),
    collaborationType: collaborationType(item.group?.title),
  })), [hrItems]);

  const leaveEmployees = useMemo<LeaveEmployee[]>(() => leaveItems.map((item) => {
    const previousBalance = columnNumber(getColumn(item, LEAVE.previousBalance));
    const currentBalance = columnNumber(getColumn(item, LEAVE.currentBalance));
    const periods = approvedPeriods(item.subitems);
    const totalLeave = periods.reduce((sum, period) => sum + workdaysInclusive(period.from, period.to), 0);
    const actualBalance = previousBalance === null && currentBalance === null
      ? null
      : (previousBalance ?? 0) + (currentBalance ?? 0) - totalLeave;

    return {
      id: item.id,
      name: item.name,
      hrItemIds: linkedIds(getColumn(item, LEAVE.relationToHr)),
      department: getColumn(item, LEAVE.department)?.text || "—",
      position: getColumn(item, LEAVE.positionMirror)?.text || "—",
      previousBalance,
      currentBalance,
      totalLeave,
      actualBalance,
      approver: getColumn(item, LEAVE.approver)?.text || "—",
      periods,
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
  const eligible = leaveEmployees.filter((leave) => leave.hrItemIds.some((id) => activeHrIds.has(id)));
  const today = todayIso();

  const periodRows = eligible.flatMap((leave) => leave.periods.map((period) => ({
    ...period,
    employeeId: leave.id,
    employeeName: leave.name,
    department: leave.department,
    approver: leave.approver,
    actualBalance: leave.actualBalance,
  })));

  const awayNow = periodRows.filter((row) => row.from <= today && row.to >= today);
  const upcoming = periodRows
    .filter((row) => {
      const days = daysUntil(row.from);
      return days !== null && days >= 0 && days <= 30;
    })
    .sort((a, b) => a.from.localeCompare(b.from));

  const lowBalance = [...eligible]
    .filter((leave) => leave.actualBalance !== null)
    .sort((a, b) => (a.actualBalance ?? 0) - (b.actualBalance ?? 0));

  const visiblePeriods = [...awayNow, ...upcoming.filter((row) => !awayNow.some((current) => current.id === row.id))];

  return (
    <main className="report-shell">
      <ReportHeader eyebrow="LEAVE & COVERAGE" title="🏖️ Leave Reporting" subtitle="Άδειες, κάλυψη και υπόλοιπα από το board Αιτήματα Αδειών & Εγκρίσεων." />

      <section className="kpi-grid">
        <Kpi label="Απουσιάζουν τώρα" value={new Set(awayNow.map((row) => row.employeeId)).size} />
        <Kpi label="Επόμενες 30 ημέρες" value={upcoming.length} />
        <Kpi label="Άτομα με στοιχεία αδείας" value={eligible.length} />
        <Kpi label="Χαμηλό/αρνητικό υπόλοιπο" value={lowBalance.filter((row) => (row.actualBalance ?? 999) <= 3).length} hint="≤ 3 ημέρες" />
      </section>

      <section className="report-panel">
        <h2>Ενεργές / Επερχόμενες Άδειες</h2>
        {visiblePeriods.length === 0 ? <p className="muted">Δεν υπάρχουν εγκεκριμένες ενεργές ή επερχόμενες άδειες στο επόμενο 30ήμερο.</p> : (
          <div className="table-wrap"><table><thead><tr><th>Employee</th><th>Department</th><th>Από</th><th>Έως</th><th>Replacement</th><th>Approver</th><th>Υπόλοιπο</th></tr></thead><tbody>
            {visiblePeriods.map((row) => <tr key={row.id}><td>{row.employeeName}</td><td>{row.department}</td><td>{formatDate(row.from)}</td><td>{formatDate(row.to)}</td><td>{row.replacement}</td><td>{row.approver}</td><td>{formatNumber(row.actualBalance)}</td></tr>)}
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
