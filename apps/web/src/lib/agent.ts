import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function resolveAgentCli(): string {
  return process.env.CURSOR_CLI_PATH?.trim() || "agent";
}

export function resolveAgentWorkspace(): string {
  return (
    process.env.AGENT_WORKSPACE?.trim() ||
    path.resolve(process.cwd(), "../../workspace")
  );
}

export function resolveMutexPath(): string {
  return process.env.AGENT_MUTEX_PATH?.trim() || "/var/lock/cursor-agent.lock";
}

export type MutexResult =
  | { ok: true; release: () => void }
  | { ok: false; error: string };

/** Non-blocking exclusive lock for host-wide single agent. */
export function tryAcquireAgentMutex(holder: string): MutexResult {
  const mutexPath = resolveMutexPath();
  try {
    fs.mkdirSync(path.dirname(mutexPath), { recursive: true });
  } catch {
    // ignore
  }

  try {
    const fd = fs.openSync(mutexPath, "wx");
    fs.writeFileSync(
      fd,
      JSON.stringify({ holder, pid: process.pid, at: new Date().toISOString() }),
    );
    fs.closeSync(fd);
    return {
      ok: true,
      release: () => {
        try {
          fs.unlinkSync(mutexPath);
        } catch {
          // ignore
        }
      },
    };
  } catch {
    let holderInfo = "unknown";
    try {
      holderInfo = fs.readFileSync(mutexPath, "utf8").trim();
    } catch {
      // ignore
    }
    return {
      ok: false,
      error: `Agent mutex busy (${mutexPath}): ${holderInfo}`,
    };
  }
}

export function offerFingerprint(input: {
  source: string;
  hotelId?: string | null;
  hotelName: string;
  fromCity: string;
  startDate: string;
  nights: number;
  adults: number;
  childrenAges: string;
}): string {
  const raw = [
    input.source.trim().toLowerCase(),
    (input.hotelId || input.hotelName).trim().toLowerCase(),
    input.fromCity.trim().toLowerCase(),
    input.startDate.slice(0, 10),
    String(input.nights),
    String(input.adults),
    input.childrenAges.replace(/\s+/g, ""),
  ].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

export function spawnTourAgent(
  prompt: string,
  jobId: string,
): { ok: true; pid: number } | { ok: false; error: string } {
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "CURSOR_API_KEY is not configured." };
  }

  const workspace = resolveAgentWorkspace();
  const cli = resolveAgentCli();
  const logsDir = path.join(workspace, "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  const logFile = path.join(logsDir, `${jobId}.log`);
  const promptFile = path.join(logsDir, `${jobId}.prompt.txt`);
  try {
    fs.writeFileSync(promptFile, prompt, "utf8");
  } catch {
    // best-effort; wrapper still embeds prompt
  }

  const portalUrl = (process.env.PORTAL_URL || "http://127.0.0.1:3001").replace(
    /\/$/,
    "",
  );
  const internalKey = process.env.INTERNAL_API_KEY?.trim() || "";

  const wrapper = `
set -euo pipefail
WORKSPACE=${JSON.stringify(workspace)}
LOG=${JSON.stringify(logFile)}
PROMPT_PATH=${JSON.stringify(promptFile)}
CLI=${JSON.stringify(cli)}
JOB_ID=${JSON.stringify(jobId)}
PORTAL=${JSON.stringify(portalUrl)}
KEY=${JSON.stringify(internalKey)}
PROMPT_FILE=$(mktemp)
cat > "$PROMPT_FILE" <<'PROMPT_EOF'
${prompt}
PROMPT_EOF
cp "$PROMPT_FILE" "$PROMPT_PATH" 2>/dev/null || true

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] starting tour agent job=$JOB_ID" >> "$LOG"
echo "[prompt] saved to $PROMPT_PATH" >> "$LOG"
set +e
"$CLI" -p --force --sandbox disabled --trust --approve-mcps --output-format stream-json --workspace "$WORKSPACE" < "$PROMPT_FILE" >> "$LOG" 2>&1
CODE=$?
set -e
rm -f "$PROMPT_FILE"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] exited code=$CODE" >> "$LOG"
if [ -n "$KEY" ]; then
  curl -sS -X POST "$PORTAL/api/internal/agent-exited" \\
    -H "Content-Type: application/json" \\
    -H "x-internal-key: $KEY" \\
    -d "{\\"jobId\\":\\"$JOB_ID\\",\\"exitCode\\":$CODE}" >/dev/null || true
fi
exit $CODE
`;

  try {
    const child = spawn("/bin/bash", ["-c", wrapper], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        CURSOR_API_KEY: apiKey,
      },
    });
    child.unref();
    if (!child.pid) {
      return { ok: false, error: "Failed to spawn Cursor CLI agent wrapper." };
    }
    return { ok: true, pid: child.pid };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to spawn Cursor CLI agent.";
    return { ok: false, error: message };
  }
}

export function buildTourSearchPrompt(input: {
  jobId: string;
  requestId: string;
  adults: number;
  childrenAges: string;
  fromCity: string;
  countries: string;
  departFrom: string;
  departTo: string;
  nightsMin: number;
  nightsMax: number;
  seaRequired: boolean;
  visaFreeOnly: boolean;
  preferHot: boolean;
  rawBrief?: string | null;
}): string {
  const childrenLine = input.childrenAges.trim()
    ? input.childrenAges.trim()
    : "(нет — только взрослые)";
  const rawBriefBlock = input.rawBrief?.trim()
    ? `\nДоп. пожелания клиента:\n${input.rawBrief.trim()}\n`
    : "";

  return `MODE: nofaketours
Контекст: клиент — гражданин РФ, вылет ТОЛЬКО из России (город вылета ниже). Ищи пакетные туры (авиа + отель) у российских туроператоров/OTA. Цены в ₽. Интерфейсы сайтов — на русском («Купить», «Забронировать», «Вылет из», «ночей»).

Миссия: найти РЕАЛЬНЫЕ бронируемые пакетные туры. deepLink — URL страницы, где видны город вылета, даты, состав туристов, цена «перелёт+отель» И кнопка покупки/бронирования. Не поисковая выдача, не сетка отелей, не брошюра отеля.

jobId: ${input.jobId}
requestId: ${input.requestId}

взрослые: ${input.adults}
дети (возраст): ${childrenLine}
город вылета: ${input.fromCity}
страны (приоритет): ${input.countries}
даты вылета: ${input.departFrom} … ${input.departTo}
ночей: ${input.nightsMin}..${input.nightsMax}
море/пляж: ${input.seaRequired ? "обязательно" : "не обязательно"}
без визы / упрощённый въезд для граждан РФ: ${input.visaFreeOnly ? "только такие направления" : "можно с визой"}
горящие/скидка: ${input.preferHot ? "желательно" : "не важно"}
${rawBriefBlock}
Разрешённые OTA (только российские; в таком порядке):
1) Level.Travel — https://level.travel
2) Travelata — https://travelata.ru
3) Onlinetours — https://www.onlinetours.ru
Запрещено: Booking, Expedia, Kayak, Google Hotels, Skyscanner, TripAdvisor и любые не-РФ агрегаторы; не подменяй пакет отельным-only бронированием.
SaleTur (saletur.ru) — НЕ использовать: списки и /hotel/*.htm брошюры API отклонит.

Уровни autoLevel (обязательно при submit):
- L3: открыта страница бронирования/оффера; город вылета, даты, ночи, состав совпали; цена скопирована с ЭТОЙ страницы; видна «Купить»/«Забронировать».
- L2: страница бронируемая, но есть мелкая неуверенность (бейдж «море», виза, «горящий» не подтверждены явно) — укажи в autoNotes.
- L1: НЕ отправляй через submit. Либо продолжай поиск, либо mark_offer_rejected_auto.

Плейбук (browser):
A) Сначала MCP lookup_verified_offers с fromCity="${input.fromCity}" и странами из брифа.
   - Если есть свежие verified под бриф — можешь закончить раньше (finish awaiting_human), не дублируя те же fingerprint.
   - Отклонённые fingerprint не предлагай снова.
B) Открой OTA из списка по порядку. Выстави фильтры: вылет из «${input.fromCity}» (или явный синоним: Нижний Новгород↔Н.Новгород↔GOJ; Москва↔MOW; СПб↔LED и т.п.), страны, даты в окне, ночи ${input.nightsMin}–${input.nightsMax}, взрослые=${input.adults}, дети с указанными возрастами.
C) В выдаче кликни КОНКРЕТНЫЙ пакет → листай, пока не откроется карточка/checkout с городом вылета, датами, ценой и «Купить»/«Забронировать».
D) deepLink = URL из адресной строки ИМЕННО этой страницы (после навигации), не URL выдачи.
E) Сверь: вылет ≈ «${input.fromCity}»; даты в окне; ночи в диапазоне; состав совпал; есть перелёт (иначе reject-auto). Листинг vs страница: расхождение цены >15% → mark_offer_rejected_auto.
F) submit_offer_candidate только L2/L3 + autoNotes с цитатой: город, даты, ночи, цена ₽, что увидел на странице. source = имя OTA (Level.Travel / Travelata / Onlinetours). Макс. 5 офферов: разные отели, приоритет запрошенным странам, при прочих равных — дешевле / с «горящим» если preferHot.
G) Если submit вернул 422 — прочитай error, углубись до bookable URL или смени отель/OTA; не finish сразу.
H) Если OTA прячет bookable URL / капча / нет вылета из нужного города — пропусти OTA, не выдумывай URL списка.
I) finish_search_job: awaiting_human если есть кандидаты; failed + error если ни одного bookable после всех OTA.

Примеры формы deepLink (ориентиры, не копируй слепо):
- GOOD: level.travel страница отеля/пакета, где видны вылет, даты, цена пакета и покупка
- GOOD: travelata.ru страница тура с «Купить» и параметрами вылета
- GOOD: onlinetours.ru карточка конкретного тура/пакета к оформлению
- BAD: */search*, сетка отелей, saletur.ru/Турция/#&query=…, saletur …/hotel/Name.htm, страница без цены/кнопки покупки

Море/виза/горящий: если в брифе обязательно — проверь по тексту страницы или reject-auto / не сабмить. Если неясно при L2 — напиши «unknown: …» в autoNotes.
Человек в админке откроет каждый deepLink и подтвердит.`;
}
