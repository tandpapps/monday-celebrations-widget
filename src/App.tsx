import { useEffect, useMemo, useState } from "react";
import mondaySdk from "monday-sdk-js";

type Celebration = {
  itemId: string;
  name: string;
  department: string;
  date: Date;
  type: "birthday" | "nameday";
};

type MondayItem = {
  id: string;
  name: string;
  column_values: Array<{
    id: string;
    text: string;
    value: string | null;
  }>;
};

type MondayContextWithBoard = {
  boardId?: number | string;
};

const monday = mondaySdk();
const FALLBACK_BOARD_ID = 5099059636;

const COL = {
  department: "dropdown_mm4ky8en",
  status: "color_mm5zh84a",
  birthdayDate: "date_mm6afzgy",
  nameDay: "text_mm5zhzt8",
};

const GREEK_MONTHS: Record<string, number> = {
  ΙΑΝΟΥΑΡΙΟΥ: 0,
  ΦΕΒΡΟΥΑΡΙΟΥ: 1,
  ΜΑΡΤΙΟΥ: 2,
  ΑΠΡΙΛΙΟΥ: 3,
  ΜΑΙΟΥ: 4,
  ΜΑΪΟΥ: 4,
  ΙΟΥΝΙΟΥ: 5,
  ΙΟΥΛΙΟΥ: 6,
  ΑΥΓΟΥΣΤΟΥ: 7,
  ΣΕΠΤΕΜΒΡΙΟΥ: 8,
  ΟΚΤΩΒΡΙΟΥ: 9,
  ΝΟΕΜΒΡΙΟΥ: 10,
  ΔΕΚΕΜΒΡΙΟΥ: 11,
};

function normalizeGreek(value: string) {
  return value
    .trim()
    .toLocaleUpperCase("el-GR")
    .replace(/Ά/g, "Α")
    .replace(/Έ/g, "Ε")
    .replace(/Ή/g, "Η")
    .replace(/Ί/g, "Ι")
    .replace(/Ό/g, "Ο")
    .replace(/Ύ/g, "Υ")
    .replace(/Ώ/g, "Ω");
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function endOfWeek(date: Date) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function annualDateForCurrentWindow(month: number, day: number, weekStart: Date, weekEnd: Date) {
  const candidateYears = [weekStart.getFullYear() - 1, weekStart.getFullYear(), weekEnd.getFullYear()];
  for (const year of candidateYears) {
    const candidate = new Date(year, month, day);
    candidate.setHours(12, 0, 0, 0);
    if (candidate >= weekStart && candidate <= weekEnd) return candidate;
  }
  return null;
}

function parseNameDays(text: string, weekStart: Date, weekEnd: Date) {
  if (!text.trim()) return [];
  return text
    .split("/")
    .map((part) => normalizeGreek(part))
    .map((part) => {
      const match = part.match(/(\d{1,2})\s+([Α-ΩΪΫ]+)/u);
      if (!match) return null;
      const day = Number(match[1]);
      const month = GREEK_MONTHS[match[2]];
      if (month === undefined) return null;
      return annualDateForCurrentWindow(month, day, weekStart, weekEnd);
    })
    .filter((value): value is Date => Boolean(value));
}

function getColumn(item: MondayItem, id: string) {
  return item.column_values.find((column) => column.id === id);
}

function parseBirthday(item: MondayItem, weekStart: Date, weekEnd: Date) {
  const column = getColumn(item, COL.birthdayDate);
  if (!column?.value) return null;

  try {
    const parsed = JSON.parse(column.value) as { date?: string };
    if (!parsed.date) return null;
    const [, month, day] = parsed.date.split("-").map(Number);
    return annualDateForCurrentWindow(month - 1, day, weekStart, weekEnd);
  } catch {
    return null;
  }
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("el-GR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function formatWeekRange(start: Date, end: Date) {
  const startText = new Intl.DateTimeFormat("el-GR", { day: "numeric", month: "long" }).format(start);
  const endText = new Intl.DateTimeFormat("el-GR", { day: "numeric", month: "long" }).format(end);
  return `${startText} – ${endText}`;
}

function isToday(date: Date) {
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

export default function App() {
  const [items, setItems] = useState<MondayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const weekStart = useMemo(() => startOfWeek(new Date()), []);
  const weekEnd = useMemo(() => endOfWeek(new Date()), []);

  useEffect(() => {
    async function load() {
      try {
        const contextResponse = await monday.get("context");
        const context = (contextResponse?.data ?? {}) as MondayContextWithBoard;
        const boardId = Number(context.boardId ?? FALLBACK_BOARD_ID);

        const query = `
          query Celebrations($boardId: [ID!]) {
            boards(ids: $boardId) {
              items_page(limit: 100) {
                items {
                  id
                  name
                  column_values(ids: [
                    "${COL.department}",
                    "${COL.status}",
                    "${COL.birthdayDate}",
                    "${COL.nameDay}"
                  ]) {
                    id
                    text
                    value
                  }
                }
              }
            }
          }
        `;

        const response = await monday.api(query, { variables: { boardId: [boardId] } });
        const boardItems = response?.data?.boards?.[0]?.items_page?.items ?? [];
        setItems(boardItems as MondayItem[]);
      } catch (err) {
        console.error(err);
        setError("Δεν ήταν δυνατή η φόρτωση των δεδομένων από το monday.com.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const celebrations = useMemo(() => {
    const result: Celebration[] = [];

    for (const item of items) {
      const status = normalizeGreek(getColumn(item, COL.status)?.text ?? "");
      if (!status || status === "CANCELLED") continue;
      if (status !== "ACTIVE" && status !== "PROBATION PERIOD") continue;

      const department = getColumn(item, COL.department)?.text || "—";
      const birthday = parseBirthday(item, weekStart, weekEnd);
      if (birthday) {
        result.push({ itemId: item.id, name: item.name, department, date: birthday, type: "birthday" });
      }

      const nameDayText = getColumn(item, COL.nameDay)?.text ?? "";
      for (const date of parseNameDays(nameDayText, weekStart, weekEnd)) {
        result.push({ itemId: item.id, name: item.name, department, date, type: "nameday" });
      }
    }

    return result.sort((a, b) => a.date.getTime() - b.date.getTime() || a.name.localeCompare(b.name, "el"));
  }, [items, weekStart, weekEnd]);

  const birthdays = celebrations.filter((item) => item.type === "birthday");
  const nameDays = celebrations.filter((item) => item.type === "nameday");

  if (loading) return <main className="shell"><div className="state">Φόρτωση celebrations…</div></main>;
  if (error) return <main className="shell"><div className="state error">{error}</div></main>;

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">THIS WEEK</p>
          <h1>🎉 Celebrations</h1>
          <p className="week-range">{formatWeekRange(weekStart, weekEnd)}</p>
        </div>
        <div className="summary">{celebrations.length} γεγονότα</div>
      </header>

      <div className="grid">
        <CelebrationSection icon="🎂" title="Γενέθλια αυτή την εβδομάδα" items={birthdays} emptyText="Δεν υπάρχουν γενέθλια αυτή την εβδομάδα." />
        <CelebrationSection icon="🎉" title="Γιορτές αυτή την εβδομάδα" items={nameDays} emptyText="Δεν υπάρχουν γιορτές αυτή την εβδομάδα." />
      </div>

      <EortologioToday />
    </main>
  );
}

function CelebrationSection({ icon, title, items, emptyText }: { icon: string; title: string; items: Celebration[]; emptyText: string }) {
  return (
    <section className="panel">
      <div className="panel-title"><span>{icon}</span><h2>{title}</h2></div>
      {items.length === 0 ? (
        <div className="empty">{emptyText}</div>
      ) : (
        <div className="cards">
          {items.map((item) => (
            <article className="card" key={`${item.type}-${item.itemId}-${item.date.toISOString()}`}>
              <div className="card-main">
                <div className="avatar">{item.name.charAt(0)}</div>
                <div>
                  <h3>{item.name}</h3>
                  <p>{item.department}</p>
                </div>
              </div>
              <div className="date-area">
                {isToday(item.date) && <span className="today">ΣΗΜΕΡΑ</span>}
                <span className="date">{formatDate(item.date)}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function EortologioToday() {
  const scriptUrl = "https://www.eortologio.gr/export_code/eortologio.php?fnt_clr=323338&tbl_wdth=100%25&tbl_brdrclr=FFFFFF&tbl_brd=0&td_bgclr=FFFFFF&tbl_cellpading=0&tbl_cellspacing=0&tbl_font=Arial&tbl_font_size=13&tbl_title_font_size=12&tbl_title_bgcolor=FFFFFF&tbl_title_font_color=676879&tbl_title=&morfi=3&what_day=1&ttl=0&fr1=0&fr2=0";

  const srcDoc = `<!doctype html>
<html lang="el">
<head>
<meta charset="utf-8" />
<style>
  html,body{margin:0;padding:0;background:transparent;color:#323338;font-family:Inter,Arial,sans-serif;overflow:hidden}
  .today-names{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  .today-name{display:inline-flex;align-items:center;padding:5px 9px;border-radius:999px;background:#fff;border:1px solid #e4e1ff;color:#3d3b67;font-size:12px;font-weight:600;line-height:1;white-space:nowrap}
</style>
</head>
<body>
<script src="${scriptUrl}"><\/script>
<script>
(function(){
  function cleanToken(value){
    return (value || '').replace(/\\s+/g, ' ').trim();
  }

  function isNoise(value){
    var text = cleanToken(value).toLowerCase();
    return !text ||
      text.indexOf('σήμερα ') === 0 ||
      text === 'σήμερα' ||
      text.indexOf('eortologio.gr') !== -1 ||
      text.indexOf('www.eortologio') !== -1 ||
      /^τρι\\s+\\d{1,2}\\s+/i.test(text) ||
      /^δευ\\s+\\d{1,2}\\s+/i.test(text) ||
      /^τετ\\s+\\d{1,2}\\s+/i.test(text) ||
      /^πεμ\\s+\\d{1,2}\\s+/i.test(text) ||
      /^παρ\\s+\\d{1,2}\\s+/i.test(text) ||
      /^σαβ\\s+\\d{1,2}\\s+/i.test(text) ||
      /^κυρ\\s+\\d{1,2}\\s+/i.test(text);
  }

  function extractNames(){
    var candidates = Array.from(document.querySelectorAll('td'))
      .map(function(cell){ return cleanToken(cell.textContent); })
      .filter(function(text){ return text.indexOf(',') !== -1; })
      .sort(function(a,b){ return b.length - a.length; });

    if (!candidates.length) return [];

    return candidates[0]
      .split(',')
      .map(cleanToken)
      .filter(function(name){ return !isNoise(name); })
      .filter(function(name, index, array){ return array.indexOf(name) === index; });
  }

  function render(){
    var names = extractNames();
    if (!names.length) return false;

    var wrap = document.createElement('div');
    wrap.className = 'today-names';

    names.forEach(function(name){
      var chip = document.createElement('span');
      chip.className = 'today-name';
      chip.textContent = name;
      wrap.appendChild(chip);
    });

    document.body.replaceChildren(wrap);
    return true;
  }

  var attempts = 0;
  var timer = setInterval(function(){
    attempts += 1;
    if (render() || attempts > 30) clearInterval(timer);
  }, 50);
})();
<\/script>
</body>
</html>`;

  return (
    <section className="external-namedays">
      <div className="external-namedays-title">
        <span>✨</span>
        <div>
          <h2>Σήμερα γιορτάζουν επίσης:</h2>
          <p>Ονόματα της ημέρας, ανεξάρτητα από την ομάδα μας.</p>
        </div>
      </div>
      <div className="external-namedays-frame-wrap">
        <iframe
          className="external-namedays-frame"
          title="Σήμερα γιορτάζουν επίσης"
          sandbox="allow-scripts"
          srcDoc={srcDoc}
        />
      </div>
    </section>
  );
}
