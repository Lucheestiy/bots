/* ============================================
   Bots Command Center — Vision (Fast v2)
   Same UI, faster & more reliable behavior
   ============================================ */

const LS_PREFIX = "botsVision:";

function $(id) { return document.getElementById(id); }

// LocalStorage helpers
function lsGet(key, fallback = null) {
  try {
    const v = localStorage.getItem(LS_PREFIX + key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

function lsSet(key, value) {
  try { localStorage.setItem(LS_PREFIX + key, String(value)); } catch { /* ignore */ }
}

const state = {
  data: null,
  selectedUnit: null,
  visibleUnits: [],
  auto: true,
  autoTimer: null,
  refreshController: null,
  refreshing: false,
  renderScheduled: false,
  cards: new Map(), // unit -> { root, update(bot) }
  ui: {
    filter: "",
    show: "all",
    sort: "name",
    lang: "en",
    chartWindow: "30d",
  },
  confirm: {
    inited: false,
    resolve: null,
    lastFocus: null,
  },
  details: {
    inited: false,
    scrollLock: null,
    closeUi: {
      closing: false,
      startedAt: 0,
      timer: null,
    },
    unitDetails: {
      unit: null,
      payload: null,
      loading: false,
      error: "",
    },
    logs: {
      unit: null,
      raw: "",
      query: "",
      loading: false,
      lastParamsKey: "",
    },
    autoLoadLogs: lsGet("autoLoadLogs", "0") === "1",
  },
};

// URL helpers
function getUrlUnit() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    return String(params.get("unit") || "").trim();
  } catch {
    return "";
  }
}

function setUrlUnit(unit, { replace = false } = {}) {
  const nextUnit = String(unit || "").trim();
  if (nextUnit === getUrlUnit()) return;
  try {
    const url = new URL(window.location.href);
    if (nextUnit) url.searchParams.set("unit", nextUnit);
    else url.searchParams.delete("unit");
    const search = url.searchParams.toString();
    const next = `${url.pathname}${search ? "?" + search : ""}${url.hash || ""}`;
    const st = { __visionDetails: true, unit: nextUnit || null };
    if (replace) history.replaceState(st, "", next);
    else history.pushState(st, "", next);
  } catch { /* ignore */ }
}

function syncDetailsFromUrl() {
  const desired = getUrlUnit();
  if (!desired) {
    if (state.selectedUnit) closeDetails({ updateUrl: false });
    return;
  }
  if (!state.data) return;
  if (state.selectedUnit === desired) {
    const exists = Boolean((state.data.bots || []).some((b) => b.unit === desired));
    if (!exists) {
      closeDetails({ updateUrl: false });
      setUrlUnit("", { replace: true });
    }
    return;
  }
  const res = openDetails(desired, { updateUrl: false });
  if (res === false) {
    closeDetails({ updateUrl: false });
    setUrlUnit("", { replace: true });
  }
}

// I18N (kept compatible with v1 keys)
const I18N = {
  en: {
    app_title: "Bots Command Center",
    language: "Language",
    noscript: "JavaScript is required for this dashboard.",
    subtitle: "Real-time monitoring • Performance analytics • System control",
    refresh: "Refresh",
    auto_title: "Auto refresh",
    auto_on: "Auto",
    auto_off: "Auto",
    unknown: "unknown",
    scope_system: "system",
    scope_user: "user",
    meta_profile: "profile",
    meta_user: "user",
    meta_port: "port",
    meta_unit: "unit",
    bots: "Bots",
    filter_placeholder: "Search bots...",
    filter_aria: "Filter bots",
    show_all: "All bots",
    show_active: "Active only",
    show_issues: "With issues",
    sort_name: "Name",
    sort_tokens24h: "Tokens ↓",
    sort_cost24h: "Cost ↓",
    sort_errors24h: "Errors ↓",
    sort_uptime: "Uptime ↓",
    sort_activity: "Activity ↓",
    th_bot: "Bot",
    th_status: "Status",
    th_enabled: "Enabled",
    th_uptime: "Uptime",
    th_last_activity: "Last activity",
    th_tokens24h: "Tokens (24h)",
    th_cost24h: "Cost (24h)",
    th_errors24h: "Errors (24h)",
    th_actions: "Actions",
    close: "Close",
    closing: "Closing… {s}s",
    closed_in: "Closed in {s}s",
    nav_prev: "Previous",
    nav_next: "Next",
    usage_30d: "Usage History (30 days)",
    usage_7d: "Usage History (7 days)",
    legend_tokens_day: "Tokens/day",
    legend_cost_day: "Cost/day (USD)",
    systemd: "Systemd",
    unit_details: "Unit Details",
    usage_summary: "Usage Summary",
    last_error: "Last Error",
    providers: "Providers",
    recent_logs: "System Logs",
    load_logs: "Load logs",
    copy: "Copy",
    copy_link: "Copy link",
    copied: "Copied!",
    auto_load_logs: "Auto-load",
    auto_load_logs_title: "Automatically load logs when opening details",
    since_all: "All time",
    since_15m: "15 min",
    since_1h: "1 hour",
    since_6h: "6 hours",
    since_active: "Since active",
    lines_100: "100 lines",
    lines_200: "200 lines",
    lines_400: "400 lines",
    log_search_placeholder: "Search in logs...",
    log_search_aria: "Search logs",
    footer_tip: "Tip: use Stop/Start to power-cycle a bot like Docker.",
    confirm_title: "Confirm Action",
    cancel: "Cancel",
    confirm: "Confirm",
    do_it: "Do it",
    updated_prefix: "Updated: ",
    timezone_prefix: "Timezone: ",
    just_now: "just now",
    min_ago: "{n}m ago",
    hours_ago: "{n}h ago",
    days_ago: "{n}d ago",
    summary_bots: "Active Bots",
    summary_bots_sub: "of {total} total",
    summary_tokens24h: "Tokens (24h)",
    summary_tokens_sub: "{requests} requests",
    summary_cost24h: "Cost (24h)",
    summary_cost_sub: "USD estimated",
    summary_errors24h: "Errors (24h)",
    summary_errors_sub: "stopReason=error",
    action_stop: "Stop",
    action_restart: "Restart",
    action_start: "Start",
    action_enable: "Enable",
    action_disable: "Disable",
    action_details: "Details",
    confirm_msg: "{action} {unit}?",
    confirm_tip: "Tip: if a service is stuck in activating (auto-restart), use Stop to break the loop.",
    action_failed: "{pretty} failed: {error}",
    loading: "Loading...",
    logs_hint: "Click \"Load logs\" to view system logs.",
    logs_failed: "Failed to load logs: {error}",
    logs_no_matches: "No matches found.",
    unit_details_failed: "Failed to load unit details: {error}",
    load_api_failed: "Failed to load data: {error}",
    no_usage: "No usage data found for this bot.",
    no_errors: "No errors recorded.",
    no_logs: "(no logs)",
    tokens_word: "tokens",
    req_short: "req",
    err_short: "err",
    sd_unit: "Unit",
    sd_scope: "Scope",
    sd_load_state: "Load state",
    sd_status: "Status",
    sd_enabled: "Enabled",
    sd_active_since: "Active since",
    sd_pid: "PID",
    sd_restarts: "Restarts",
    sd_memory: "Memory",
    sd_cpu: "CPU",
    sd_gateway_port: "Gateway port",
    sd_profile: "Profile",
    sd_state_dir: "State dir",
    ud_fragment_path: "Fragment",
    ud_user: "User",
    ud_group: "Group",
    ud_workdir: "Workdir",
    ud_exec_start: "ExecStart",
    ud_env: "Environment",
    ud_env_hidden: "Hidden keys",
    us_tokens24h: "Tokens (24h)",
    us_cost24h: "Cost (24h)",
    us_tokens_all: "Tokens (all)",
    us_cost_all: "Cost (all)",
    us_sessions: "Sessions",
    us_last_activity: "Last activity",
    health: "Health Status",
    health_ok: "All systems operational",
    sync_claude_auth: "Sync Claude auth",
    sync_claude_auth_confirm: "Sync Claude auth and restart {unit}?",
    sync_claude_auth_failed: "Claude auth sync failed: {error}",
    status_online: "Online",
    status_offline: "Offline",
    status_warning: "Warning",
    empty_title: "No bots found",
    empty_description: "Try adjusting your filters or search query.",
    status_live: "Live",
    status_connecting: "Connecting...",
    status_error: "Error",
    toast_action_ok: "Action completed successfully",
    toast_auth_ok: "Auth synced and bot restarted",
    toast_clipboard_failed: "Clipboard unavailable",
  },
  ru: {
    app_title: "Командный Центр Ботов",
    language: "Язык",
    noscript: "Для работы панели нужен JavaScript.",
    subtitle: "Мониторинг в реальном времени • Аналитика • Управление",
    refresh: "Обновить",
    auto_title: "Автообновление",
    auto_on: "Авто",
    auto_off: "Авто",
    unknown: "неизвестно",
    scope_system: "система",
    scope_user: "пользователь",
    meta_profile: "профиль",
    meta_user: "пользователь",
    meta_port: "порт",
    meta_unit: "юнит",
    bots: "Боты",
    filter_placeholder: "Поиск...",
    filter_aria: "Фильтр ботов",
    show_all: "Все боты",
    show_active: "Только активные",
    show_issues: "С проблемами",
    sort_name: "Имя",
    sort_tokens24h: "Токены ↓",
    sort_cost24h: "Стоимость ↓",
    sort_errors24h: "Ошибки ↓",
    sort_uptime: "Аптайм ↓",
    sort_activity: "Активность ↓",
    th_bot: "Бот",
    th_status: "Статус",
    th_enabled: "Автозапуск",
    th_uptime: "Аптайм",
    th_last_activity: "Активность",
    th_tokens24h: "Токены (24ч)",
    th_cost24h: "Стоимость (24ч)",
    th_errors24h: "Ошибки (24ч)",
    th_actions: "Действия",
    close: "Закрыть",
    closing: "Закрытие… {s}с",
    closed_in: "Закрыто за {s}с",
    nav_prev: "Пред",
    nav_next: "След",
    usage_30d: "Использование (30 дней)",
    usage_7d: "Использование (7 дней)",
    legend_tokens_day: "Токены/день",
    legend_cost_day: "Стоимость/день (USD)",
    systemd: "Systemd",
    unit_details: "Детали юнита",
    usage_summary: "Сводка",
    last_error: "Последняя ошибка",
    providers: "Провайдеры",
    recent_logs: "Логи",
    load_logs: "Загрузить",
    copy: "Копировать",
    copy_link: "Копировать ссылку",
    copied: "Скопировано!",
    auto_load_logs: "Авто",
    auto_load_logs_title: "Автоматически загружать логи при открытии",
    since_all: "Все время",
    since_15m: "15 мин",
    since_1h: "1 час",
    since_6h: "6 часов",
    since_active: "С запуска",
    lines_100: "100 строк",
    lines_200: "200 строк",
    lines_400: "400 строк",
    log_search_placeholder: "Поиск в логах...",
    log_search_aria: "Поиск по логам",
    footer_tip: "Подсказка: используйте «Остановить/Запустить» для перезапуска бота.",
    confirm_title: "Подтвердите действие",
    cancel: "Отмена",
    confirm: "Подтвердить",
    do_it: "Выполнить",
    updated_prefix: "Обновлено: ",
    timezone_prefix: "Часовой пояс: ",
    just_now: "только что",
    min_ago: "{n}м назад",
    hours_ago: "{n}ч назад",
    days_ago: "{n}д назад",
    summary_bots: "Активные боты",
    summary_bots_sub: "из {total}",
    summary_tokens24h: "Токены (24ч)",
    summary_tokens_sub: "{requests} запросов",
    summary_cost24h: "Стоимость (24ч)",
    summary_cost_sub: "USD (оценка)",
    summary_errors24h: "Ошибки (24ч)",
    summary_errors_sub: "stopReason=error",
    action_stop: "Остановить",
    action_restart: "Перезапустить",
    action_start: "Запустить",
    action_enable: "Включить",
    action_disable: "Отключить",
    action_details: "Детали",
    confirm_msg: "{action} {unit}?",
    confirm_tip: "Подсказка: если сервис застрял в «activating», нажмите «Остановить».",
    action_failed: "Не удалось выполнить «{pretty}»: {error}",
    loading: "Загрузка...",
    logs_hint: "Нажмите «Загрузить» для просмотра логов.",
    logs_failed: "Не удалось загрузить логи: {error}",
    logs_no_matches: "Нет совпадений.",
    unit_details_failed: "Не удалось загрузить детали: {error}",
    load_api_failed: "Не удалось загрузить данные: {error}",
    no_usage: "Нет данных об использовании.",
    no_errors: "Ошибок не зафиксировано.",
    no_logs: "(нет логов)",
    tokens_word: "токенов",
    req_short: "запр",
    err_short: "ошиб",
    sd_unit: "Юнит",
    sd_scope: "Область",
    sd_load_state: "Загрузка",
    sd_status: "Статус",
    sd_enabled: "Автозапуск",
    sd_active_since: "Активен с",
    sd_pid: "PID",
    sd_restarts: "Перезапуски",
    sd_memory: "Память",
    sd_cpu: "CPU",
    sd_gateway_port: "Порт шлюза",
    sd_profile: "Профиль",
    sd_state_dir: "Папка состояния",
    ud_fragment_path: "Файл",
    ud_user: "Пользователь",
    ud_group: "Группа",
    ud_workdir: "Папка",
    ud_exec_start: "ExecStart",
    ud_env: "Окружение",
    ud_env_hidden: "Скрытые ключи",
    us_tokens24h: "Токены (24ч)",
    us_cost24h: "Стоимость (24ч)",
    us_tokens_all: "Токены (всего)",
    us_cost_all: "Стоимость (всего)",
    us_sessions: "Сессии",
    us_last_activity: "Активность",
    health: "Состояние",
    health_ok: "Все системы работают нормально",
    sync_claude_auth: "Синхр. Claude auth",
    sync_claude_auth_confirm: "Синхронизировать Claude auth и перезапустить {unit}?",
    sync_claude_auth_failed: "Ошибка синхронизации: {error}",
    status_online: "Онлайн",
    status_offline: "Офлайн",
    status_warning: "Внимание",
    empty_title: "Боты не найдены",
    empty_description: "Попробуйте изменить фильтры или поисковый запрос.",
    status_live: "Live",
    status_connecting: "Подключение...",
    status_error: "Ошибка",
    toast_action_ok: "Действие выполнено",
    toast_auth_ok: "Auth синхронизирован, бот перезапущен",
    toast_clipboard_failed: "Буфер обмена недоступен",
  },
};

function normalizeLang(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "";
  if (s === "ru" || s.startsWith("ru-")) return "ru";
  return "en";
}

function t(key, vars = null) {
  const lang = normalizeLang(state.ui.lang) || "en";
  let s = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
  if (vars && typeof s === "string") {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}

function applyI18n() {
  document.documentElement.lang = normalizeLang(state.ui.lang) || "en";
  document.title = t("app_title");
  const titleEl = $("pageTitle");
  if (titleEl && !state.data) titleEl.textContent = t("app_title");
  const subtitleEl = $("subtitle");
  if (subtitleEl) subtitleEl.textContent = t("subtitle");

  const autoBtn = $("autoBtn");
  if (autoBtn) autoBtn.title = t("auto_title");

  const closeBtn = $("closeDetailBtn");
  if (closeBtn && !state.details.closeUi.closing) {
    closeBtn.textContent = t("close");
  }
}

function setLanguage(lang) {
  const next = normalizeLang(lang) || "en";
  state.ui.lang = next;
  lsSet("lang", next);
  applyI18n();
  const sel = $("langSelect");
  if (sel) sel.value = next;
  scheduleRenderBots();
  if (state.selectedUnit) {
    const bot = findBot(state.selectedUnit);
    if (bot) renderDetails(bot, { unitChanged: false });
  }
}

function isIOSDevice() {
  try {
    const ua = String(navigator.userAgent || "");
    if (/(iPad|iPhone|iPod)/i.test(ua)) return true;
    // iPadOS 13+ can report as Mac; detect touch.
    const platform = String(navigator.platform || "");
    const touchPoints = Number(navigator.maxTouchPoints || 0);
    return platform === "MacIntel" && touchPoints > 1;
  } catch {
    return false;
  }
}

// Format helpers
function fmtInt(n) {
  if (!Number.isFinite(n)) return "-";
  return Math.round(n).toLocaleString();
}

function fmtMoneyUsd(n) {
  if (!Number.isFinite(n)) return "-";
  return "$" + n.toFixed(n >= 10 ? 0 : n >= 1 ? 2 : 4);
}

function fmtBytes(n) {
  if (!Number.isFinite(n) || n < 0) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  const fixed = i === 0 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(fixed)} ${units[i]}`;
}

function fmtSeconds(s) {
  if (!Number.isFinite(s) || s < 0) return "-";
  const sec = Math.floor(s);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const isRu = normalizeLang(state.ui.lang) === "ru";
  const u = isRu ? { d: "д", h: "ч", m: "м" } : { d: "d", h: "h", m: "m" };
  if (d > 0) return `${d}${u.d} ${h}${u.h}`;
  if (h > 0) return `${h}${u.h} ${m}${u.m}`;
  return `${m}${u.m}`;
}

function fmtIso(iso) {
  if (!iso) return "-";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function relativeTime(iso) {
  if (!iso) return "";
  const timeMs = new Date(iso).getTime();
  if (!Number.isFinite(timeMs)) return "";
  const diff = Math.max(0, Date.now() - timeMs);
  const min = Math.floor(diff / 60000);
  if (min < 1) return t("just_now");
  if (min < 60) return t("min_ago", { n: min });
  const h = Math.floor(min / 60);
  if (h < 48) return t("hours_ago", { n: h });
  return t("days_ago", { n: Math.floor(h / 24) });
}

function updateClock() {
  const el = $("timeDisplay");
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Toast notifications
function showToast(message, type = "info") {
  const container = $("toastContainer");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(20px)";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Health helpers
function getHealthIssues(bot) {
  const h = bot && bot.health;
  return h && Array.isArray(h.issues) ? h.issues : [];
}

function worstHealthSeverity(issues) {
  let rank = 0;
  for (const it of (issues || [])) {
    const sev = String(it && it.severity || "").toLowerCase();
    if (sev === "error") rank = Math.max(rank, 2);
    else if (sev === "warn") rank = Math.max(rank, 1);
  }
  return rank;
}

function pickPrimaryIssue(issues) {
  const arr = Array.isArray(issues) ? issues : [];
  if (!arr.length) return null;
  for (const it of arr) {
    if (String(it && it.severity || "").toLowerCase() === "error") return it;
  }
  return arr[0];
}

function getStatusInfo(bot) {
  const issues = getHealthIssues(bot);
  const sev = worstHealthSeverity(issues);
  const activeState = String(bot && bot.systemd && bot.systemd.activeState || "");
  const subState = String(bot && bot.systemd && bot.systemd.subState || "");

  if (sev >= 2 || (activeState !== "active" && activeState !== "activating")) {
    return { class: "offline", text: t("status_offline") };
  }
  if (sev >= 1 || subState !== "running") {
    return { class: "warning", text: t("status_warning") };
  }
  return { class: "online", text: t("status_online") };
}

function getUsageWindow(bot, win) {
  return bot.usage && bot.usage.windows && bot.usage.windows[win] ? bot.usage.windows[win] : {};
}

function getBotLastActivityMs(bot) {
  const iso = bot.usage ? bot.usage.lastActivityAt : null;
  if (!iso) return 0;
  const tm = new Date(iso).getTime();
  return Number.isFinite(tm) ? tm : 0;
}

function botMatchesFilter(bot, q) {
  const s = String(q || "").trim().toLowerCase();
  if (!s) return true;
  const hay = [
    bot.displayName, bot.unit, bot.telegramHandle, bot.type,
    bot.profile, bot.gatewayPort, bot.scope, bot.user,
  ].filter(Boolean).join(" ").toLowerCase();
  return hay.includes(s);
}

function botHasIssues(bot) {
  const usage24 = getUsageWindow(bot, "24h") || {};
  const active = String(bot.systemd && bot.systemd.activeState || "");
  const sub = String(bot.systemd && bot.systemd.subState || "");
  return active !== "active" || (active === "active" && sub !== "running") ||
    (usage24.errors || 0) > 0 || (bot.systemd && bot.systemd.nRestarts || 0) > 0 ||
    getHealthIssues(bot).length > 0;
}

function findBot(unit) {
  if (!state.data || !Array.isArray(state.data.bots)) return null;
  return state.data.bots.find((b) => b.unit === unit) || null;
}

function setConnectionStatus(mode) {
  const statusEl = $("connectionStatus");
  if (!statusEl) return;
  const textEl = statusEl.querySelector(".status-text");
  if (mode === "connecting") {
    statusEl.classList.add("connecting");
    if (textEl) textEl.textContent = t("status_connecting");
  } else if (mode === "live") {
    statusEl.classList.remove("connecting");
    if (textEl) textEl.textContent = t("status_live");
  } else if (mode === "error") {
    statusEl.classList.remove("connecting");
    if (textEl) textEl.textContent = t("status_error");
  }
}

function scheduleRenderBots() {
  if (state.renderScheduled) return;
  state.renderScheduled = true;
  requestAnimationFrame(() => {
    state.renderScheduled = false;
    if (state.data) renderBots(state.data);
    if (state.selectedUnit) updateNavButtons();
  });
}

function setText(el, value) {
  if (!el) return;
  const next = String(value ?? "");
  if (el.textContent !== next) el.textContent = next;
}

function setCardSelected(unit, selected) {
  const card = unit ? state.cards.get(unit) : null;
  if (!card || !card.root || !card.root.isConnected) return;
  card.root.classList.toggle("selected", Boolean(selected));
}

function createBotCard(unit) {
  const root = document.createElement("div");
  root.className = "bot-card";
  root.dataset.unit = unit;
  root.innerHTML = `
    <div class="bot-header">
      <div>
        <div class="bot-name"></div>
        <div class="bot-meta"></div>
        <div class="bot-issue" hidden></div>
      </div>
      <div class="bot-status online">
        <span class="status-indicator"></span>
        <span class="status-text"></span>
      </div>
    </div>
    <div class="bot-stats">
      <div class="bot-stat">
        <div class="bot-stat-value" data-field="tokens">-</div>
        <div class="bot-stat-label">Tokens</div>
      </div>
      <div class="bot-stat">
        <div class="bot-stat-value" data-field="cost">-</div>
        <div class="bot-stat-label">Cost</div>
      </div>
      <div class="bot-stat">
        <div class="bot-stat-value" data-field="activity">-</div>
        <div class="bot-stat-label">Activity</div>
      </div>
    </div>
    <div class="bot-actions">
      <button class="btn btn-danger action-btn" data-action="stop"></button>
      <button class="btn btn-secondary action-btn" data-action="restart"></button>
      <button class="btn btn-success action-btn" data-action="start"></button>
      <button class="btn btn-secondary action-btn" data-action="details"></button>
    </div>
  `;

  const els = {
    name: root.querySelector(".bot-name"),
    meta: root.querySelector(".bot-meta"),
    issue: root.querySelector(".bot-issue"),
    statusWrap: root.querySelector(".bot-status"),
    statusText: root.querySelector(".bot-status .status-text"),
    tokens: root.querySelector('[data-field="tokens"]'),
    cost: root.querySelector('[data-field="cost"]'),
    activity: root.querySelector('[data-field="activity"]'),
    stopBtn: root.querySelector('button[data-action="stop"]'),
    restartBtn: root.querySelector('button[data-action="restart"]'),
    startBtn: root.querySelector('button[data-action="start"]'),
    detailsBtn: root.querySelector('button[data-action="details"]'),
  };

  function update(bot) {
    if (!bot) return;
    const isSelected = state.selectedUnit === bot.unit;
    root.classList.toggle("selected", Boolean(isSelected));

    // Status class
    const status = getStatusInfo(bot);
    root.classList.remove("status-online", "status-offline", "status-warning");
    root.classList.add(`status-${status.class}`);
    if (els.statusWrap) {
      els.statusWrap.classList.remove("online", "offline", "warning");
      els.statusWrap.classList.add(status.class);
    }
    setText(els.statusText, status.text);

    // Name + meta
    setText(els.name, bot.displayName || bot.unit);

    const metaParts = [];
    if (bot.telegramHandle) metaParts.push(bot.telegramHandle);
    if (bot.type) metaParts.push(bot.type);
    if (bot.profile) metaParts.push(`${t("meta_profile")}:${bot.profile}`);
    if (bot.scope === "user") metaParts.push(bot.user || t("scope_user"));
    if (bot.gatewayPort) metaParts.push(`${t("meta_port")}:${bot.gatewayPort}`);
    setText(els.meta, metaParts.join(" • "));

    // Issues
    const issues = getHealthIssues(bot);
    const primaryIssue = pickPrimaryIssue(issues);
    if (els.issue) {
      const msg = primaryIssue ? String(primaryIssue.message || primaryIssue.key || "") : "";
      els.issue.hidden = !msg;
      setText(els.issue, msg);
    }

    // Stats
    const usage24 = getUsageWindow(bot, "24h") || {};
    setText(els.tokens, fmtInt(usage24.tokens));
    setText(els.cost, fmtMoneyUsd(usage24.costUSD));
    const lastAct = bot.usage ? bot.usage.lastActivityAt : null;
    setText(els.activity, relativeTime(lastAct) || "-");

    // Actions (create once, hide/show)
    const activeState = String(bot.systemd && bot.systemd.activeState || "");
    const canStop = activeState === "active" || activeState === "activating" || activeState === "deactivating";
    if (els.stopBtn) els.stopBtn.hidden = !canStop;
    if (els.restartBtn) els.restartBtn.hidden = !canStop;
    if (els.startBtn) els.startBtn.hidden = canStop;

    // Labels (cheap; keeps language switching correct)
    setText(els.stopBtn, t("action_stop"));
    setText(els.restartBtn, t("action_restart"));
    setText(els.startBtn, t("action_start"));
    setText(els.detailsBtn, t("action_details"));
  }

  return { root, update };
}

// Rendering
function renderHeader(data) {
  const rawTitle = String((data && data.title) || "").trim();
  const title = rawTitle && rawTitle !== I18N.en.app_title ? rawTitle : t("app_title");
  $("pageTitle").textContent = title;
  document.title = title;
  $("updatedAt").textContent = t("updated_prefix") + fmtIso(data.generatedAt);
  $("relativeTime").textContent = relativeTime(data.generatedAt);
  $("tzLabel").textContent = t("timezone_prefix") + (data.timezone || "-");
}

function renderSummary(data) {
  const s = data.totals || {};
  $("statBots").textContent = fmtInt(s.botsActive);
  $("statBotsSub").textContent = t("summary_bots_sub", { total: fmtInt(s.botsTotal) });
  $("statTokens").textContent = fmtInt(s.tokens24h);
  $("statTokensSub").textContent = t("summary_tokens_sub", { requests: fmtInt(s.requests24h) });
  $("statCost").textContent = fmtMoneyUsd(s.cost24h);
  $("statErrors").textContent = fmtInt(s.errors24h);
}

function renderBots(data) {
  const grid = $("botsGrid");
  const emptyState = $("emptyState");
  const bots = Array.isArray(data.bots) ? data.bots : [];

  const filtered = bots.filter((bot) => {
    if (!botMatchesFilter(bot, state.ui.filter)) return false;
    if (state.ui.show === "active") return (bot.systemd && bot.systemd.activeState) === "active";
    if (state.ui.show === "issues") return botHasIssues(bot);
    return true;
  });

  const sortMode = state.ui.sort || "name";
  filtered.sort((A, B) => {
    const ua = getUsageWindow(A, "24h") || {};
    const ub = getUsageWindow(B, "24h") || {};
    if (sortMode === "tokens24h_desc") return (ub.tokens || 0) - (ua.tokens || 0);
    if (sortMode === "cost24h_desc") return (ub.costUSD || 0) - (ua.costUSD || 0);
    if (sortMode === "errors24h_desc") return (ub.errors || 0) - (ua.errors || 0);
    if (sortMode === "uptime_desc") return (B.systemd.uptimeSeconds || 0) - (A.systemd.uptimeSeconds || 0);
    if (sortMode === "last_activity_desc") return getBotLastActivityMs(B) - getBotLastActivityMs(A);
    const an = String(A.displayName || A.unit || "").toLowerCase();
    const bn = String(B.displayName || B.unit || "").toLowerCase();
    return an < bn ? -1 : an > bn ? 1 : 0;
  });

  state.visibleUnits = filtered.map((b) => b.unit);
  $("visibleCount").textContent = `${filtered.length}/${bots.length}`;

  if (filtered.length === 0) {
    grid.hidden = true;
    emptyState.hidden = false;
    return;
  }
  grid.hidden = false;
  emptyState.hidden = true;

  const frag = document.createDocumentFragment();
  for (const bot of filtered) {
    let card = state.cards.get(bot.unit);
    if (!card) {
      card = createBotCard(bot.unit);
      state.cards.set(bot.unit, card);
    }
    card.update(bot);
    frag.appendChild(card.root);
  }
  grid.replaceChildren(frag);

  // Prune cards for removed units (keeps memory bounded)
  const live = new Set(bots.map((b) => b.unit));
  for (const unit of Array.from(state.cards.keys())) {
    if (!live.has(unit)) state.cards.delete(unit);
  }
}

// API helpers
async function apiPost(path) {
  const r = await fetch(path, { method: "POST" });
  const text = await r.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch { /* ignore */ }
  if (!r.ok) {
    if (payload && payload.error) throw new Error(payload.error);
    throw new Error(text || `HTTP ${r.status}`);
  }
  return payload || {};
}

function actionLabel(action) {
  return t(`action_${action}`) || String(action || "");
}

async function doAction(unit, action) {
  const pretty = `${actionLabel(action)} ${unit}`;
  const dangerActions = new Set(["stop", "restart", "disable"]);
  const confirmMsg = `${t("confirm_msg", { action: actionLabel(action), unit })}\n\n${t("confirm_tip")}`;

  const confirmed = await showConfirm(confirmMsg, {
    confirmLabel: dangerActions.has(action) ? t("do_it") : t("confirm"),
    confirmClass: dangerActions.has(action) ? "btn-danger" : "btn-primary",
  });
  if (!confirmed) return;

  try {
    await apiPost(`/api/units/${encodeURIComponent(unit)}/${encodeURIComponent(action)}`);
    showToast(t("toast_action_ok"), "success");
    await refresh();
    if (state.selectedUnit === unit) {
      const bot = findBot(unit);
      if (bot) renderDetails(bot, { unitChanged: false });
    }
  } catch (e) {
    showToast(t("action_failed", { pretty, error: String(e.message || e) }), "error");
  }
}

async function syncClaudeAuthAndRestart(unit) {
  const confirmed = await showConfirm(t("sync_claude_auth_confirm", { unit }), {
    confirmLabel: t("do_it"),
    confirmClass: "btn-success",
  });
  if (!confirmed) return;

  try {
    await apiPost("/api/claude/sync");
    await apiPost(`/api/units/${encodeURIComponent(unit)}/restart`);
    showToast(t("toast_auth_ok"), "success");
    await refresh();
    if (state.selectedUnit === unit) {
      const bot = findBot(unit);
      if (bot) renderDetails(bot, { unitChanged: false });
    }
  } catch (e) {
    showToast(t("sync_claude_auth_failed", { error: String(e.message || e) }), "error");
  }
}

// Confirm modal
function showConfirm(message, { confirmLabel = null, confirmClass = "btn-danger" } = {}) {
  if (!state.confirm.inited) initConfirmUi();
  const modal = $("confirmModal");
  const okBtn = $("confirmOkBtn");
  const cancelBtn = $("confirmCancelBtn");
  const msgEl = $("confirmMessage");
  const titleEl = $("confirmTitle");

  if (!modal) return Promise.resolve(confirm(message));

  titleEl.textContent = t("confirm_title");
  msgEl.textContent = String(message || "");
  okBtn.textContent = String(confirmLabel || t("confirm"));
  okBtn.className = `btn ${confirmClass}`.trim();

  state.confirm.lastFocus = document.activeElement;
  modal.hidden = false;
  cancelBtn.focus();

  return new Promise((resolve) => { state.confirm.resolve = resolve; });
}

function closeConfirm(result) {
  $("confirmModal").hidden = true;
  const resolve = state.confirm.resolve;
  state.confirm.resolve = null;
  if (resolve) resolve(Boolean(result));
  const last = state.confirm.lastFocus;
  state.confirm.lastFocus = null;
  try { if (last && last.focus) last.focus(); } catch { /* ignore */ }
}

function initConfirmUi() {
  if (state.confirm.inited) return;
  $("confirmModal").addEventListener("click", (e) => {
    if (e.target === $("confirmModal") || e.target === $("confirmBackdrop")) closeConfirm(false);
  });
  $("confirmCancelBtn").addEventListener("click", () => closeConfirm(false));
  $("confirmOkBtn").addEventListener("click", () => closeConfirm(true));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("confirmModal").hidden) closeConfirm(false);
  });
  state.confirm.inited = true;
}

// Detail panel
function lockMainScroll() {
  if (state.details.scrollLock) return;
  const body = document.body;
  const html = document.documentElement;
  const y = window.scrollY || 0;
  state.details.scrollLock = {
    y,
    htmlOverflow: html.style.overflow,
    bodyOverflow: body.style.overflow,
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyLeft: body.style.left,
    bodyRight: body.style.right,
    bodyWidth: body.style.width,
  };

  html.style.overflow = "hidden";
  body.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.top = `-${y}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
}

function unlockMainScroll() {
  const lock = state.details.scrollLock;
  if (!lock) return;
  const body = document.body;
  const html = document.documentElement;
  html.style.overflow = lock.htmlOverflow || "";
  body.style.overflow = lock.bodyOverflow || "";
  body.style.position = lock.bodyPosition || "";
  body.style.top = lock.bodyTop || "";
  body.style.left = lock.bodyLeft || "";
  body.style.right = lock.bodyRight || "";
  body.style.width = lock.bodyWidth || "";
  state.details.scrollLock = null;
  try { window.scrollTo(0, lock.y || 0); } catch { /* ignore */ }
}

function initDetailsUi() {
  if (state.details.inited) return;
  $("detailBackdrop").addEventListener("pointerdown", () => closeDetails());
  $("detailBackdrop").addEventListener(
    "touchmove",
    (e) => {
      // Prevent scroll gestures on the backdrop from moving the underlying page.
      e.preventDefault();
    },
    { passive: false }
  );
  $("detailPanel").addEventListener("click", (e) => {
    if (e.target === $("detailPanel") || e.target === $("detailBackdrop")) closeDetails();
  });
  const closeBtn = $("closeDetailBtn");
  if (closeBtn) {
    closeBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      closeDetailsFromButton();
    });
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      closeDetailsFromButton();
    });
  }
  $("detailPrevBtn").addEventListener("click", () => navigateDetails(-1));
  $("detailNextBtn").addEventListener("click", () => navigateDetails(1));

  // Logs UI: bind once, keep state across refreshes.
  $("loadLogsBtn").addEventListener("click", () => loadLogsForSelected());
  $("copyLogsBtn").addEventListener("click", async () => {
    const text = state.details.logs.raw || $("logsPre").textContent || "";
    try {
      await navigator.clipboard.writeText(text);
      showToast(t("copied"), "success");
    } catch {
      showToast(t("toast_clipboard_failed"), "error");
    }
  });
  $("autoLoadLogs").addEventListener("change", () => {
    state.details.autoLoadLogs = Boolean($("autoLoadLogs").checked);
    lsSet("autoLoadLogs", state.details.autoLoadLogs ? "1" : "0");
    if (state.details.autoLoadLogs) loadLogsForSelected();
  });
  $("logSearchInput").addEventListener("input", () => {
    state.details.logs.query = $("logSearchInput").value;
    scheduleRenderLogs();
  });
  $("logSince").addEventListener("change", () => {
    if (state.details.autoLoadLogs) loadLogsForSelected();
  });
  $("logLines").addEventListener("change", () => {
    if (state.details.autoLoadLogs) loadLogsForSelected();
  });

  // Chart window
  $("chartWindow").addEventListener("change", () => {
    state.ui.chartWindow = $("chartWindow").value;
    lsSet("chartWindow", state.ui.chartWindow);
    const bot = state.selectedUnit ? findBot(state.selectedUnit) : null;
    if (bot) renderUsageCharts(bot);
  });

  // Keyboard
  document.addEventListener("keydown", (e) => {
    if ($("detailPanel").hidden) return;
    if (!$("confirmModal").hidden) return;
    if (e.key === "Escape") closeDetails();
    if (e.key === "ArrowLeft") navigateDetails(-1);
    if (e.key === "ArrowRight") navigateDetails(1);
  });

  state.details.inited = true;
}

function resetCloseButtonUi() {
  const ui = state.details.closeUi;
  if (ui.timer) clearInterval(ui.timer);
  ui.timer = null;
  ui.closing = false;
  ui.startedAt = 0;

  const btn = $("closeDetailBtn");
  if (btn) {
    btn.disabled = false;
    btn.textContent = t("close");
  }
}

function startCloseButtonTimer(startedAt) {
  const ui = state.details.closeUi;
  ui.startedAt = startedAt;
  const btn = $("closeDetailBtn");
  if (!btn) return;
  btn.disabled = true;

  const update = () => {
    const s = (performance.now() - ui.startedAt) / 1000;
    btn.textContent = t("closing", { s: s.toFixed(1) });
  };

  update();
  if (ui.timer) clearInterval(ui.timer);
  ui.timer = setInterval(update, 100);
}

function stopCloseButtonTimer(elapsedMs) {
  const ui = state.details.closeUi;
  if (ui.timer) clearInterval(ui.timer);
  ui.timer = null;
  ui.closing = false;
  ui.startedAt = 0;

  const btn = $("closeDetailBtn");
  if (btn) {
    btn.disabled = false;
    btn.textContent = t("close");
  }

  if (Number.isFinite(elapsedMs)) {
    showToast(t("closed_in", { s: (elapsedMs / 1000).toFixed(1) }), "info");
  }
}

function closeDetailsFromButton() {
  if ($("detailPanel").hidden) return;
  if (state.details.closeUi.closing) return;
  state.details.closeUi.closing = true;

  const startedAt = performance.now();
  startCloseButtonTimer(startedAt);

  // Allow the "Closing…" label to paint before heavy UI work.
  requestAnimationFrame(() => {
    closeDetails({ updateUrl: true });
    requestAnimationFrame(() => {
      const elapsed = performance.now() - startedAt;
      stopCloseButtonTimer(elapsed);
    });
  });
}

function updateNavButtons() {
  const units = state.visibleUnits;
  const idx = units.indexOf(state.selectedUnit);
  $("detailPrevBtn").disabled = idx <= 0;
  $("detailNextBtn").disabled = idx < 0 || idx >= units.length - 1;
}

function navigateDetails(delta) {
  const units = state.visibleUnits;
  const idx = units.indexOf(state.selectedUnit);
  const nextIdx = idx + delta;
  if (nextIdx >= 0 && nextIdx < units.length) openDetails(units[nextIdx]);
}

function openDetails(unit, { updateUrl = true } = {}) {
  if (!state.details.inited) initDetailsUi();
  if (!state.data) return null;
  const bot = findBot(unit);
  if (!bot) return false;

  const prevUnit = state.selectedUnit;
  if (prevUnit && prevUnit !== unit) setCardSelected(prevUnit, false);
  state.selectedUnit = unit;
  setCardSelected(unit, true);
  resetCloseButtonUi();

  $("detailPanel").hidden = false;
  lockMainScroll();
  renderDetails(bot, { unitChanged: prevUnit !== unit });
  if (updateUrl) setUrlUnit(unit);
  updateNavButtons();
  return true;
}

function closeDetails({ updateUrl = true } = {}) {
  const hadUrlUnit = Boolean(getUrlUnit());
  const prevUnit = state.selectedUnit;
  $("detailPanel").hidden = true;
  unlockMainScroll();
  state.selectedUnit = null;
  if (prevUnit) setCardSelected(prevUnit, false);
  updateNavButtons();
  resetCloseButtonUi();

  if (updateUrl && hadUrlUnit) {
    try { setUrlUnit("", { replace: true }); } catch { /* ignore */ }
  }
}

function ensureLogsUnit(unit, { resetQuery = true } = {}) {
  if (state.details.logs.unit === unit) return;
  state.details.logs.unit = unit;
  state.details.logs.raw = "";
  state.details.logs.loading = false;
  state.details.logs.lastParamsKey = "";
  if (resetQuery) state.details.logs.query = "";

  $("logsPre").textContent = t("logs_hint");
  $("logSearchInput").value = state.details.logs.query;
  $("autoLoadLogs").checked = state.details.autoLoadLogs;
}

function ensureUnitDetailsUnit(unit) {
  if (state.details.unitDetails.unit === unit) return;
  state.details.unitDetails.unit = unit;
  state.details.unitDetails.payload = null;
  state.details.unitDetails.loading = false;
  state.details.unitDetails.error = "";
}

function renderDetails(bot, { unitChanged } = { unitChanged: false }) {
  $("detailTitle").textContent = bot.displayName || bot.unit;
  renderDetailsMeta(bot);
  renderQuickActions(bot);
  renderHealth(bot);
  renderSystemdBox(bot);
  renderUsageSummary(bot);
  renderLastError(bot);
  renderUsageCharts(bot);
  renderProviders(bot);

  if (unitChanged) {
    ensureUnitDetailsUnit(bot.unit);
    ensureLogsUnit(bot.unit);
  }

  ensureUnitDetails(bot.unit);
  if (state.details.autoLoadLogs && !state.details.logs.raw && !state.details.logs.loading) {
    loadLogsForSelected();
  } else {
    renderLogs();
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderDetailsMeta(bot) {
  const el = $("detailMetaLine");
  const chips = [];

  const status = getStatusInfo(bot);
  chips.push(`<span class="meta-tag ${status.class === "online" ? "good" : status.class === "offline" ? "bad" : "warn"}">${escapeHtml(status.text)}</span>`);
  if (bot.telegramHandle) chips.push(`<span class="meta-tag">${escapeHtml(bot.telegramHandle)}</span>`);
  if (bot.type) chips.push(`<span class="meta-tag">${escapeHtml(bot.type)}</span>`);
  if (bot.profile) chips.push(`<span class="meta-tag">${escapeHtml(t("meta_profile"))}:${escapeHtml(bot.profile)}</span>`);
  if (bot.gatewayPort) chips.push(`<span class="meta-tag"><code>${escapeHtml(t("meta_port"))}:${escapeHtml(bot.gatewayPort)}</code></span>`);
  chips.push(`<span class="meta-tag"><code>${escapeHtml(bot.unit)}</code></span>`);

  el.innerHTML = chips.join("");
}

function makeBtn(text, className, onClick) {
  const btn = document.createElement("button");
  btn.className = `btn ${className}`;
  btn.textContent = text;
  btn.addEventListener("click", onClick);
  return btn;
}

function renderQuickActions(bot) {
  const el = $("detailQuickActions");
  el.innerHTML = "";
  const sd = bot.systemd || {};
  const activeState = String(sd.activeState || "");
  const canStop = activeState === "active" || activeState === "activating" || activeState === "deactivating";

  if (canStop) {
    el.appendChild(makeBtn(t("action_stop"), "btn-danger", () => doAction(bot.unit, "stop")));
    el.appendChild(makeBtn(t("action_restart"), "btn-secondary", () => doAction(bot.unit, "restart")));
  } else {
    el.appendChild(makeBtn(t("action_start"), "btn-success", () => doAction(bot.unit, "start")));
  }

  const ufs = String(sd.unitFileState || "").toLowerCase();
  if (ufs.startsWith("enabled")) {
    el.appendChild(makeBtn(t("action_disable"), "btn-danger", () => doAction(bot.unit, "disable")));
  } else if (ufs === "disabled" || ufs === "indirect") {
    el.appendChild(makeBtn(t("action_enable"), "btn-success", () => doAction(bot.unit, "enable")));
  }

  el.appendChild(
    makeBtn(t("copy_link"), "btn-secondary", async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        showToast(t("copied"), "success");
      } catch {
        showToast(t("toast_clipboard_failed"), "error");
      }
    })
  );
}

function renderHealth(bot) {
  const el = $("healthBox");
  const actionsEl = $("healthActions");
  const issues = getHealthIssues(bot);

  if (!issues.length) {
    el.innerHTML = `<div style="color:var(--accent-green)">${escapeHtml(t("health_ok"))}</div>`;
    actionsEl.innerHTML = "";
    return;
  }

  el.innerHTML = issues
    .map((it) => {
      const sev = String(it.severity || "").toLowerCase();
      const cls = sev === "error" ? "" : "warn";
      const meta = [it.timestamp ? fmtIso(it.timestamp) : "", it.hint || ""].filter(Boolean).join(" • ");
      return `<div class="health-issue ${cls}">
        <div class="health-issue-title">${escapeHtml(it.message || it.key || "")}</div>
        ${meta ? `<div class="health-issue-meta">${escapeHtml(meta)}</div>` : ""}
      </div>`;
    })
    .join("");

  actionsEl.innerHTML = "";
  if (issues.some((it) => String(it.key || "").includes("oauth_refresh_failed"))) {
    actionsEl.appendChild(makeBtn(t("sync_claude_auth"), "btn-success", () => syncClaudeAuthAndRestart(bot.unit)));
  }
}

function renderSystemdBox(bot) {
  const el = $("systemdBox");
  const sd = bot.systemd || {};
  const rows = [
    [t("sd_unit"), `<code>${escapeHtml(bot.unit)}</code>`],
    [t("sd_status"), `${escapeHtml(sd.activeState || "-")} ${sd.subState ? "(" + escapeHtml(sd.subState) + ")" : ""}`],
    [t("sd_uptime"), fmtSeconds(sd.uptimeSeconds)],
    [t("sd_restarts"), fmtInt(sd.nRestarts)],
    [t("sd_memory"), fmtBytes(sd.memoryCurrentBytes)],
    [t("sd_pid"), escapeHtml(sd.mainPid || "-")],
  ];
  if (bot.gatewayPort) rows.push([t("sd_gateway_port"), `<code>${escapeHtml(bot.gatewayPort)}</code>`]);
  if (bot.profile) rows.push([t("sd_profile"), escapeHtml(bot.profile)]);

  el.innerHTML = rows
    .map(
      ([k, v]) => `
    <div class="info-row">
      <span class="key">${escapeHtml(k)}</span>
      <span class="value">${v}</span>
    </div>
  `
    )
    .join("");
}

function renderUsageSummary(bot) {
  const el = $("usageSummary");
  const usage = bot.usage || {};
  const win24 = (usage.windows && usage.windows["24h"]) || {};
  const all = usage.allTime || {};

  const stats = [
    { label: t("us_tokens24h"), value: fmtInt(win24.tokens), sub: fmtInt(win24.requests) + " " + t("req_short") },
    { label: t("us_cost24h"), value: fmtMoneyUsd(win24.costUSD), sub: "USD" },
    { label: t("us_tokens_all"), value: fmtInt(all.tokens), sub: fmtInt(all.requests) + " " + t("req_short") },
    { label: t("us_cost_all"), value: fmtMoneyUsd(all.costUSD), sub: "USD" },
  ];

  if (usage.sessionsFiles !== undefined) {
    stats.push({ label: t("us_sessions"), value: fmtInt(usage.sessionsFiles), sub: fmtBytes(usage.sessionsBytes) });
    stats.push({ label: t("us_last_activity"), value: relativeTime(usage.lastActivityAt) || "-", sub: fmtIso(usage.lastActivityAt) });
  }

  el.innerHTML = stats
    .map(
      (s) => `
    <div class="mini-stat">
      <div class="mini-stat-label">${escapeHtml(s.label)}</div>
      <div class="mini-stat-value">${escapeHtml(s.value)}</div>
      <div class="mini-stat-sub">${escapeHtml(s.sub)}</div>
    </div>
  `
    )
    .join("");
}

function renderLastError(bot) {
  const el = $("lastErrorBox");
  const usage = bot.usage || {};
  const last = usage.lastError;
  if (!last) {
    el.innerHTML = `<span class="muted">${escapeHtml(t("no_errors"))}</span>`;
    return;
  }
  el.textContent = `${fmtIso(last.timestamp)} • ${last.message || "error"}`;
}

// Charts
function drawBars(canvas, values, color) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = 8;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  ctx.clearRect(0, 0, w, h);

  const vals = Array.isArray(values) && values.length ? values : [0];
  const n = vals.length;
  const max = Math.max(1, ...vals);
  const barW = innerW / n;

  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fillRect(pad, pad, innerW, innerH);

  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const v = vals[i] || 0;
    const bh = (v / max) * innerH;
    ctx.fillRect(pad + i * barW + 1, pad + innerH - bh, Math.max(1, barW - 2), bh);
  }
}

function renderUsageCharts(bot) {
  const mode = state.ui.chartWindow === "7d" ? "7d" : "30d";
  $("chartWindow").value = mode;
  $("usageChartTitle").textContent = t(mode === "7d" ? "usage_7d" : "usage_30d");

  const dailyAll = bot.usage && bot.usage.daily30d ? bot.usage.daily30d : [];
  const daily = mode === "7d" ? dailyAll.slice(-7) : dailyAll;

  const tokens = daily.length ? daily.map((d) => d.tokens || 0) : [0];
  const cost = daily.length ? daily.map((d) => d.costUSD || 0) : [0];

  drawBars($("tokensChart"), tokens, "#a78bfa");
  drawBars($("costChart"), cost, "#60a5fa");
}

function renderProviders(bot) {
  const el = $("providersList");
  const providers = bot.usage && bot.usage.byProvider ? bot.usage.byProvider : {};
  const entries = Object.entries(providers).sort((a, b) => (b[1].tokens || 0) - (a[1].tokens || 0));

  if (!entries.length) {
    el.innerHTML = `<div class="muted">${escapeHtml(t("no_usage"))}</div>`;
    return;
  }

  el.innerHTML = entries
    .map(([name, st]) => {
      const models = st.models ? Object.entries(st.models).sort((a, b) => (b[1].tokens || 0) - (a[1].tokens || 0)).slice(0, 3) : [];
      const modelStr = models.map(([m, ms]) => `${m} (${fmtInt(ms.tokens)})`).join(" • ");
      return `
      <div class="provider-item">
        <div>
          <div class="provider-name">${escapeHtml(name)}</div>
          <div class="provider-models">${escapeHtml(modelStr)}</div>
        </div>
        <div class="provider-stats">
          <div>${escapeHtml(fmtInt(st.tokens))} ${escapeHtml(t("tokens_word"))}</div>
          <div class="muted">${escapeHtml(fmtMoneyUsd(st.costUSD))} • ${escapeHtml(fmtInt(st.requests))} ${escapeHtml(t("req_short"))}</div>
        </div>
      </div>
    `;
    })
    .join("");
}

// Unit details
function ensureUnitDetails(unit) {
  ensureUnitDetailsUnit(unit);
  renderUnitDetailsBox();
  if (!state.details.unitDetails.payload && !state.details.unitDetails.loading && !state.details.unitDetails.error) {
    loadUnitDetails(unit);
  }
}

async function loadUnitDetails(unit) {
  if (state.details.unitDetails.loading) return;
  state.details.unitDetails.loading = true;
  state.details.unitDetails.error = "";
  renderUnitDetailsBox();

  try {
    const r = await fetch(`/api/units/${encodeURIComponent(unit)}/details`, { cache: "no-store" });
    const payload = await r.json();
    if (!r.ok) throw new Error(payload.error || `HTTP ${r.status}`);
    if (state.details.unitDetails.unit === unit) {
      state.details.unitDetails.payload = payload;
    }
  } catch (e) {
    if (state.details.unitDetails.unit === unit) {
      state.details.unitDetails.error = String(e.message || e);
    }
  } finally {
    if (state.details.unitDetails.unit === unit) {
      state.details.unitDetails.loading = false;
      renderUnitDetailsBox();
    }
  }
}

function renderUnitDetailsBox() {
  const el = $("unitDetailsBox");
  const err = state.details.unitDetails.error;
  if (err) {
    el.innerHTML = `<span class="muted">${escapeHtml(t("unit_details_failed", { error: err }))}</span>`;
    return;
  }
  const payload = state.details.unitDetails.payload;
  if (!payload) {
    el.innerHTML = `<span class="muted">${escapeHtml(t("loading"))}</span>`;
    return;
  }

  const uf = payload.unitFile || {};
  const rows = [
    [t("ud_fragment_path"), payload.fragmentPath],
    [t("ud_user"), uf.user || (payload.systemd && payload.systemd.user)],
    [t("ud_group"), payload.systemd && payload.systemd.group],
    [t("ud_workdir"), uf.workingDirectory],
  ].filter(([_, v]) => v);

  let html = rows
    .map(
      ([k, v]) => `
    <div class="code-row">
      <span>${escapeHtml(k)}</span>
      <code>${escapeHtml(v)}</code>
    </div>
  `
    )
    .join("");

  if (uf.execStart) {
    html += `<div style="margin-top:12px;font-size:11px;color:var(--text-muted)">${escapeHtml(t("ud_exec_start"))}</div>
             <pre style="margin-top:4px">${escapeHtml(uf.execStart)}</pre>`;
  }

  el.innerHTML = html;
}

// Logs (persist across refresh)
let logsRenderScheduled = false;
function scheduleRenderLogs() {
  if (logsRenderScheduled) return;
  logsRenderScheduled = true;
  requestAnimationFrame(() => {
    logsRenderScheduled = false;
    renderLogs();
  });
}

function escapeRegExp(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderLogs() {
  const raw = state.details.logs.raw;
  const unit = state.details.logs.unit;
  const isVisible = !$("detailPanel").hidden && state.selectedUnit && state.selectedUnit === unit;
  if (!isVisible) return;

  if (!raw) {
    $("logsPre").textContent = state.details.logs.loading ? t("loading") : t("logs_hint");
    return;
  }

  const q = String(state.details.logs.query || "").trim().toLowerCase();
  const lines = raw.split(/\r?\n/);
  const filtered = q ? lines.filter((l) => l.toLowerCase().includes(q)) : lines;

  if (q && !filtered.length) {
    $("logsPre").textContent = t("logs_no_matches");
    return;
  }

  const qre = q ? new RegExp(escapeRegExp(q), "gi") : null;
  const html = filtered
    .map((ln) => {
      let s = escapeHtml(ln);
      if (qre) s = s.replace(qre, (m) => `<mark>${m}</mark>`);
      s = s.replace(/\b(error|fatal|exception)\b/gi, '<span class="error">$&</span>');
      s = s.replace(/\b(warn|warning)\b/gi, '<span class="warn">$&</span>');
      return s;
    })
    .join("\n");

  $("logsPre").innerHTML = html;
}

async function loadLogsForSelected() {
  const unit = state.selectedUnit;
  if (!unit) return;
  if (state.details.logs.loading) return;

  ensureLogsUnit(unit, { resetQuery: false });

  const lines = parseInt($("logLines").value, 10) || 200;
  const since = $("logSince").value;
  const paramsKey = `${lines}|${since || ""}`;
  state.details.logs.lastParamsKey = paramsKey;
  state.details.logs.loading = true;
  renderLogs();

  try {
    const qs = new URLSearchParams();
    qs.set("lines", String(lines));
    if (since) qs.set("since", since);
    const r = await fetch(`/api/units/${encodeURIComponent(unit)}/logs?${qs}`);
    const payload = await r.json();
    if (!r.ok) throw new Error(payload.error);
    if (state.details.logs.unit === unit && state.details.logs.lastParamsKey === paramsKey) {
      state.details.logs.raw = String(payload.logs || "");
    }
  } catch (e) {
    $("logsPre").textContent = t("logs_failed", { error: String(e.message || e) });
  } finally {
    if (state.details.logs.unit === unit && state.details.logs.lastParamsKey === paramsKey) {
      state.details.logs.loading = false;
      renderLogs();
    }
  }
}

// Main
async function refresh() {
  if (state.refreshController) {
    try { state.refreshController.abort(); } catch { /* ignore */ }
  }
  const controller = new AbortController();
  state.refreshController = controller;

  setConnectionStatus("connecting");
  state.refreshing = true;

  try {
    const r = await fetch("/api/bots", { cache: "no-store", signal: controller.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    state.data = await r.json();

    renderHeader(state.data);
    renderSummary(state.data);
    renderBots(state.data);

    if (state.selectedUnit) {
      const bot = findBot(state.selectedUnit);
      if (bot) renderDetails(bot, { unitChanged: false });
      else closeDetails({ updateUrl: true });
    }
    syncDetailsFromUrl();

    setConnectionStatus("live");
  } catch (e) {
    if (e && e.name === "AbortError") return;
    setConnectionStatus("error");
    showToast(t("load_api_failed", { error: String(e.message || e) }), "error");
  } finally {
    if (state.refreshController === controller) state.refreshController = null;
    state.refreshing = false;
  }
}

function stopAuto() {
  if (state.autoTimer) clearTimeout(state.autoTimer);
  state.autoTimer = null;
}

async function autoTick() {
  if (!state.auto) return;
  if (document.hidden) {
    stopAuto();
    state.autoTimer = setTimeout(autoTick, 30000);
    return;
  }
  try { await refresh(); } finally {
    stopAuto();
    state.autoTimer = setTimeout(autoTick, 30000);
  }
}

function setAuto(on) {
  state.auto = Boolean(on);
  const btn = $("autoBtn");
  if (btn) {
    btn.textContent = t(state.auto ? "auto_on" : "auto_off");
    btn.classList.toggle("off", !state.auto);
    btn.classList.toggle("btn-toggle", state.auto);
  }
  lsSet("auto", state.auto ? "1" : "0");
  stopAuto();
  if (state.auto) state.autoTimer = setTimeout(autoTick, 30000);
}

// Init
window.addEventListener("DOMContentLoaded", () => {
  if (isIOSDevice()) {
    try { document.documentElement.classList.add("ios"); } catch { /* ignore */ }
  }
  initConfirmUi();

  window.addEventListener("popstate", () => {
    try { syncDetailsFromUrl(); } catch { /* ignore */ }
  });

  // Clock
  updateClock();
  setInterval(updateClock, 1000);

  // Controls
  $("refreshBtn").addEventListener("click", refresh);
  $("autoBtn").addEventListener("click", () => setAuto(!state.auto));

  // Event delegation for bot grid (no per-card listeners)
  $("botsGrid").addEventListener("click", (e) => {
    const btn = e.target.closest && e.target.closest(".action-btn");
    const card = e.target.closest && e.target.closest(".bot-card");
    if (!card) return;
    const unit = String(card.dataset.unit || "");
    if (!unit) return;

    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      const action = String(btn.dataset.action || "");
      if (!action) return;
      if (action === "details") openDetails(unit);
      else doAction(unit, action);
      return;
    }

    openDetails(unit);
  });

  // Language
  const storedLang = normalizeLang(lsGet("lang", ""));
  const browserLang = normalizeLang(navigator.language || "");
  state.ui.lang = storedLang || browserLang || "en";
  lsSet("lang", state.ui.lang);
  applyI18n();
  $("langSelect").value = state.ui.lang;
  $("langSelect").addEventListener("change", () => setLanguage($("langSelect").value));

  // Filter, show, sort
  state.ui.filter = lsGet("filter", "") || "";
  state.ui.show = lsGet("show", "all") || "all";
  state.ui.sort = lsGet("sort", "name") || "name";
  state.ui.chartWindow = lsGet("chartWindow", "30d") || "30d";

  $("filterInput").value = state.ui.filter;
  $("showSelect").value = state.ui.show;
  $("sortSelect").value = state.ui.sort;

  let filterDebounce = null;
  $("filterInput").addEventListener("input", () => {
    state.ui.filter = $("filterInput").value;
    lsSet("filter", state.ui.filter);
    if (filterDebounce) clearTimeout(filterDebounce);
    filterDebounce = setTimeout(() => scheduleRenderBots(), 30);
  });

  $("showSelect").addEventListener("change", () => {
    state.ui.show = $("showSelect").value;
    lsSet("show", state.ui.show);
    scheduleRenderBots();
  });

  $("sortSelect").addEventListener("change", () => {
    state.ui.sort = $("sortSelect").value;
    lsSet("sort", state.ui.sort);
    scheduleRenderBots();
  });

  // Handle resize for charts (debounced)
  let resizeDebounce = null;
  window.addEventListener("resize", () => {
    if (resizeDebounce) clearTimeout(resizeDebounce);
    resizeDebounce = setTimeout(() => {
      if (state.selectedUnit) {
        const bot = findBot(state.selectedUnit);
        if (bot) renderUsageCharts(bot);
      }
    }, 80);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.auto && !state.refreshing) refresh();
  });

  // Auto
  const autoStored = lsGet("auto", "1");
  setAuto(autoStored !== "0");

  // Initial load
  refresh();
});
