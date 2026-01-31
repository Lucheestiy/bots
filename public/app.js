/* global fetch */

const state = {
  data: null,
  selectedUnit: null,
  visibleUnits: [],
  auto: true,
  timer: null,
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
    lastFocus: null,
    logsUnit: null,
    logsRaw: "",
    logQuery: "",
    unitDetailsUnit: null,
    unitDetails: null,
    unitDetailsLoading: false,
    unitDetailsError: "",
    autoLoadLogs: lsGet("autoLoadLogs", "0") === "1",
  },
};

const LS_PREFIX = "botsDashboard:";

function $(id) {
  return document.getElementById(id);
}

function getUrlUnit() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    return String(params.get("unit") || "").trim();
  } catch {
    return "";
  }
}

function ensureDetailsHistorySeeded(unit) {
  const desired = String(unit || "").trim();
  if (!desired) return;
  // If we already manage this session history entry, don't touch it.
  if (history.state && history.state.__botsDetails) return;

  try {
    const url = new URL(window.location.href);
    const detailsSearch = url.searchParams.toString();
    const detailsUrl = `${url.pathname}${detailsSearch ? "?" + detailsSearch : ""}${url.hash || ""}`;

    url.searchParams.delete("unit");
    const baseSearch = url.searchParams.toString();
    const baseUrl = `${url.pathname}${baseSearch ? "?" + baseSearch : ""}${url.hash || ""}`;

    history.replaceState({ __botsDetails: true, unit: null }, "", baseUrl);
    history.pushState({ __botsDetails: true, unit: desired }, "", detailsUrl);
  } catch { /* ignore */ }
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
    const st = { __botsDetails: true, unit: nextUnit || null };
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

  ensureDetailsHistorySeeded(desired);

  if (state.selectedUnit === desired) {
    // If the unit disappeared from config, close and clear the URL param.
    const exists = Boolean(state.data && (state.data.bots || []).some(b => b.unit === desired));
    if (state.data && !exists) {
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

function lsGet(key, fallback = null) {
  try {
    const v = localStorage.getItem(LS_PREFIX + key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(LS_PREFIX + key, String(value));
  } catch { /* ignore */ }
}

const I18N = {
  en: {
    app_title: "Bots Dashboard",
    language: "Language",
    noscript: "JavaScript is required for this dashboard.",
    subtitle: "Status • Tokens • Cost • Logs • Controls",
    refresh: "Refresh",
    auto_title: "Auto refresh",
    auto_on: "Auto: On",
    auto_off: "Auto: Off",
    unknown: "unknown",
    scope_system: "system",
    scope_user: "user",
    meta_profile: "profile",
    meta_user: "user",
    meta_port: "port",
    meta_unit: "unit",
    bots: "Bots",
    filter_placeholder: "Filter bots…",
    filter_aria: "Filter bots",
    show_all: "Show: All",
    show_active: "Show: Active",
    show_issues: "Show: Issues",
    sort_name: "Sort: Name",
    sort_tokens24h: "Sort: Tokens (24h) ↓",
    sort_cost24h: "Sort: Cost (24h) ↓",
    sort_errors24h: "Sort: Errors (24h) ↓",
    sort_uptime: "Sort: Uptime ↓",
    sort_activity: "Sort: Activity ↓",
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
    nav_prev: "Prev",
    nav_next: "Next",
    usage_30d: "Usage (last 30 days)",
    usage_7d: "Usage (last 7 days)",
    legend_tokens_day: "Tokens/day",
    legend_cost_day: "Cost/day (USD)",
    systemd: "Systemd",
    unit_details: "Unit details",
    usage_summary: "Usage summary",
    last_error: "Last error",
    providers: "Providers",
    recent_logs: "Recent logs",
    load_logs: "Load logs",
    copy: "Copy",
    copy_link: "Copy link",
    copied: "Copied",
    auto_load_logs: "Auto",
    auto_load_logs_title: "Automatically load logs when opening details",
    since_all: "All",
    since_15m: "15m",
    since_1h: "1h",
    since_6h: "6h",
    since_active: "Since active",
    lines_100: "100 lines",
    lines_200: "200 lines",
    lines_400: "400 lines",
    log_search_placeholder: "Search logs…",
    log_search_aria: "Search logs",
    footer_tip: "Tip: use Stop/Start to “docker-like” power-cycle a bot.",
    confirm_title: "Confirm action",
    cancel: "Cancel",
    confirm: "Confirm",
    do_it: "Do it",
    updated_prefix: "Updated: ",
    timezone_prefix: "Timezone: ",
    just_now: "just now",
    min_ago: "{n}m ago",
    hours_ago: "{n}h ago",
    days_ago: "{n}d ago",
    summary_bots: "Bots",
    summary_bots_sub: "{active} active",
    summary_tokens24h: "Tokens (24h)",
    summary_tokens_sub: "{requests} requests",
    summary_cost24h: "Cost (24h)",
    summary_cost_sub: "USD (from transcripts)",
    summary_errors24h: "Errors (24h)",
    summary_errors_sub: "stopReason=error",
    action_stop: "Stop",
    action_restart: "Restart",
    action_start: "Start",
    action_enable: "Enable",
    action_disable: "Disable",
    action_details: "Details",
    confirm_msg: "Confirm: {action} {unit}",
    confirm_tip: "Tip: if a service is stuck in “activating (auto-restart)”, use Stop to break the loop.",
    action_failed: "{pretty} failed: {error}",
    loading: "Loading…",
    logs_hint: "Click “Load logs”.",
    logs_failed: "Failed to load logs: {error}",
    logs_no_matches: "No matches.",
    unit_details_failed: "Failed to load unit details: {error}",
    load_api_failed: "Failed to load /api/bots: {error}",
    no_usage: "No transcript usage found for this bot.",
    no_errors: "No errors recorded in transcripts.",
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
    ud_env: "Env",
    ud_env_hidden: "Hidden env keys",
    us_tokens24h: "Tokens (24h)",
    us_cost24h: "Cost (24h)",
    us_tokens_all: "Tokens (all)",
    us_cost_all: "Cost (all)",
    us_sessions: "Sessions",
    us_last_activity: "Last activity",
    health: "Health",
    health_ok: "No health issues detected.",
    sync_claude_auth: "Sync Claude auth",
    sync_claude_auth_confirm: "Sync Claude auth and restart {unit}?",
    sync_claude_auth_failed: "Claude auth sync failed: {error}",
  },
  ru: {
    app_title: "Панель ботов",
    language: "Язык",
    noscript: "Для работы панели нужен JavaScript.",
    subtitle: "Статус • Токены • Стоимость • Логи • Управление",
    refresh: "Обновить",
    auto_title: "Автообновление",
    auto_on: "Авто: Вкл",
    auto_off: "Авто: Выкл",
    unknown: "неизвестно",
    scope_system: "система",
    scope_user: "пользователь",
    meta_profile: "профиль",
    meta_user: "пользователь",
    meta_port: "порт",
    meta_unit: "unit",
    bots: "Боты",
    filter_placeholder: "Фильтр…",
    filter_aria: "Фильтр ботов",
    show_all: "Показать: Все",
    show_active: "Показать: Активные",
    show_issues: "Показать: С проблемами",
    sort_name: "Сортировка: Имя",
    sort_tokens24h: "Сортировка: Токены (24ч) ↓",
    sort_cost24h: "Сортировка: Стоимость (24ч) ↓",
    sort_errors24h: "Сортировка: Ошибки (24ч) ↓",
    sort_uptime: "Сортировка: Аптайм ↓",
    sort_activity: "Сортировка: Активность ↓",
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
    copy_link: "Скопировать ссылку",
    copied: "Скопировано",
    auto_load_logs: "Авто",
    auto_load_logs_title: "Автоматически загружать логи при открытии",
    since_all: "Все",
    since_15m: "15м",
    since_1h: "1ч",
    since_6h: "6ч",
    since_active: "С запуска",
    lines_100: "100 строк",
    lines_200: "200 строк",
    lines_400: "400 строк",
    log_search_placeholder: "Поиск по логам…",
    log_search_aria: "Поиск по логам",
    footer_tip: "Подсказка: используйте «Остановить/Запустить», чтобы перезапустить бота как в docker.",
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
    summary_bots: "Боты",
    summary_bots_sub: "{active} активных",
    summary_tokens24h: "Токены (24ч)",
    summary_tokens_sub: "{requests} запросов",
    summary_cost24h: "Стоимость (24ч)",
    summary_cost_sub: "USD (из транскриптов)",
    summary_errors24h: "Ошибки (24ч)",
    summary_errors_sub: "stopReason=error",
    action_stop: "Остановить",
    action_restart: "Перезапустить",
    action_start: "Запустить",
    action_enable: "Включить",
    action_disable: "Отключить",
    action_details: "Детали",
    confirm_msg: "Подтверждение: {action} {unit}",
    confirm_tip: "Подсказка: если сервис застрял в «activating (auto-restart)», нажмите «Остановить», чтобы прервать цикл.",
    action_failed: "Не удалось выполнить «{pretty}»: {error}",
    loading: "Загрузка…",
    logs_hint: "Нажмите «Загрузить».",
    logs_failed: "Не удалось загрузить логи: {error}",
    logs_no_matches: "Нет совпадений.",
    unit_details_failed: "Не удалось загрузить детали юнита: {error}",
    load_api_failed: "Не удалось загрузить /api/bots: {error}",
    no_usage: "Транскрипты для этого бота не найдены.",
    no_errors: "Ошибок в транскриптах нет.",
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
    ud_env: "Env",
    ud_env_hidden: "Скрытые env ключи",
    us_tokens24h: "Токены (24ч)",
    us_cost24h: "Стоимость (24ч)",
    us_tokens_all: "Токены (всего)",
    us_cost_all: "Стоимость (всего)",
    us_sessions: "Сессии",
    us_last_activity: "Активность",
    health: "Здоровье",
    health_ok: "Проблем не обнаружено.",
    sync_claude_auth: "Синхр. Claude auth",
    sync_claude_auth_confirm: "Синхронизировать Claude auth и перезапустить {unit}?",
    sync_claude_auth_failed: "Ошибка синхронизации Claude auth: {error}",
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

  for (const el of document.querySelectorAll("[data-i18n]")) {
    const key = el.getAttribute("data-i18n");
    if (!key) continue;
    if (el.id === "logsPre" && el.dataset.logsLoaded === "1") continue;
    el.textContent = t(key);
  }

  for (const el of document.querySelectorAll("[data-i18n-title]")) {
    const key = el.getAttribute("data-i18n-title");
    if (!key) continue;
    el.title = t(key);
  }

  for (const el of document.querySelectorAll("[data-i18n-placeholder]")) {
    const key = el.getAttribute("data-i18n-placeholder");
    if (!key) continue;
    el.placeholder = t(key);
  }

  for (const el of document.querySelectorAll("[data-i18n-aria-label]")) {
    const key = el.getAttribute("data-i18n-aria-label");
    if (!key) continue;
    el.setAttribute("aria-label", t(key));
  }
}

const SYSTEMD_I18N = {
  activeState: {
    ru: {
      active: "активен",
      inactive: "не активен",
      failed: "ошибка",
      activating: "запуск",
      deactivating: "остановка",
      reloading: "перезагрузка",
      maintenance: "обслуживание",
    },
  },
  subState: {
    ru: {
      running: "работает",
      dead: "остановлен",
      exited: "завершён",
      failed: "ошибка",
      "auto-restart": "авто-перезапуск",
      start: "запуск",
      "start-pre": "подготовка запуска",
      stop: "остановка",
      "stop-sigterm": "остановка (SIGTERM)",
      "stop-sigkill": "остановка (SIGKILL)",
      reload: "перезагрузка",
      listening: "ожидание",
      waiting: "ожидание",
    },
  },
  unitFileState: {
    ru: {
      enabled: "включён",
      "enabled-runtime": "включён (runtime)",
      disabled: "отключён",
      static: "статический",
      indirect: "косвенный",
      masked: "замаскирован",
      generated: "сгенерирован",
      linked: "linked",
      "linked-runtime": "linked (runtime)",
    },
  },
};

function _i18nMapLookup(section, raw) {
  const value = String(raw || "").trim();
  if (!value) return t("unknown");
  const lang = normalizeLang(state.ui.lang) || "en";
  const key = value.toLowerCase();
  const bucket = SYSTEMD_I18N[section] || {};
  const map = bucket[lang] || bucket.en || null;
  if (map && map[key]) return map[key];
  return value;
}

function systemdActiveLabel(activeState) {
  return _i18nMapLookup("activeState", activeState);
}

function systemdSubLabel(subState) {
  return _i18nMapLookup("subState", subState);
}

function unitFileStateLabel(unitFileState) {
  return _i18nMapLookup("unitFileState", unitFileState);
}

function setLanguage(lang) {
  const next = normalizeLang(lang) || "en";
  state.ui.lang = next;
  lsSet("lang", next);
  applyI18n();
  // Re-render dynamic UI bits with localized strings.
  setAuto(state.auto);
  if (state.data) {
    renderHeader(state.data);
    renderSummary(state.data);
    renderBotsTable(state.data);
    if (state.selectedUnit) {
      const still = (state.data.bots || []).find(b => b.unit === state.selectedUnit);
      if (still) renderDetails(still);
    }
  }
}

function showConfirm(message, { confirmLabel = null, confirmClass = "btnDanger" } = {}) {
  if (!state.confirm.inited) initConfirmUi();
  const modal = $("confirmModal");
  const overlay = $("confirmOverlay");
  const okBtn = $("confirmOkBtn");
  const cancelBtn = $("confirmCancelBtn");
  const msgEl = $("confirmMessage");

  // Fallback: if modal missing, use browser confirm (may be blocked by popup suppression).
  if (!modal || !overlay || !okBtn || !cancelBtn || !msgEl) {
    return Promise.resolve(confirm(message)); // eslint-disable-line no-alert
  }

  if (state.confirm.resolve) {
    // If something else is already awaiting confirmation, cancel it.
    try { state.confirm.resolve(false); } catch { /* ignore */ }
    state.confirm.resolve = null;
  }

  state.confirm.lastFocus = document.activeElement;

  msgEl.textContent = String(message || "");
  okBtn.textContent = String(confirmLabel || t("confirm"));
  okBtn.className = `btn ${confirmClass}`.trim();

  modal.hidden = false;
  cancelBtn.focus();

  return new Promise(resolve => {
    state.confirm.resolve = resolve;
  });
}

function closeConfirm(result) {
  const modal = $("confirmModal");
  if (modal) modal.hidden = true;

  const resolve = state.confirm.resolve;
  state.confirm.resolve = null;
  if (resolve) resolve(Boolean(result));

  const last = state.confirm.lastFocus;
  state.confirm.lastFocus = null;
  try {
    if (last && typeof last.focus === "function") last.focus();
  } catch { /* ignore */ }
}

function initConfirmUi() {
  if (state.confirm.inited) return;
  const modal = $("confirmModal");
  const overlay = $("confirmOverlay");
  const okBtn = $("confirmOkBtn");
  const cancelBtn = $("confirmCancelBtn");
  if (!modal || !overlay || !okBtn || !cancelBtn) return;

  // Robust outside-click close:
  // - On some browsers, a full-screen overlay can end up "on top" and swallow clicks.
  // - We make the overlay non-interactive in CSS and treat clicks on the modal backdrop as cancel.
  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target === overlay) closeConfirm(false);
  });
  cancelBtn.addEventListener("click", () => closeConfirm(false));
  okBtn.addEventListener("click", () => closeConfirm(true));

  document.addEventListener("keydown", (e) => {
    if (modal.hidden) return;
    if (e.key === "Escape") closeConfirm(false);
  });

  state.confirm.inited = true;
}

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
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const fixed = i === 0 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(fixed)} ${units[i]}`;
}

function fmtSeconds(s) {
  if (!Number.isFinite(s) || s < 0) return "-";
  const sec = Math.floor(s);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const u = normalizeLang(state.ui.lang) === "ru" ? { d: "д", h: "ч", m: "м" } : { d: "d", h: "h", m: "m" };
  if (d > 0) return `${d}${u.d} ${h}${u.h}`;
  if (h > 0) return `${h}${u.h} ${m}${u.m}`;
  return `${m}${u.m}`;
}

function fmtIso(iso) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function relativeTime(iso) {
  if (!iso) return "";
  const timeMs = new Date(iso).getTime();
  if (!Number.isFinite(timeMs)) return "";
  const now = Date.now();
  const diff = Math.max(0, now - timeMs);
  const min = Math.floor(diff / 60000);
  if (min < 1) return t("just_now");
  if (min < 60) return t("min_ago", { n: min });
  const h = Math.floor(min / 60);
  if (h < 48) return t("hours_ago", { n: h });
  const d = Math.floor(h / 24);
  return t("days_ago", { n: d });
}

function setError(msg) {
  const el = $("errors");
  if (!msg) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

function getHealthIssues(bot) {
  const h = bot && bot.health;
  const issues = h && Array.isArray(h.issues) ? h.issues : [];
  return issues;
}

function worstHealthSeverity(issues) {
  // 0=ok, 1=warn, 2=error
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

function statusDotClass(bot) {
  const issues = getHealthIssues(bot);
  const sev = worstHealthSeverity(issues);
  if (sev >= 2) return "bad";
  if (sev >= 1) return "warn";

  const activeState = String(bot && bot.systemd && bot.systemd.activeState || "");
  const subState = String(bot && bot.systemd && bot.systemd.subState || "");
  if (activeState === "active" && subState === "running") return "good";
  if (activeState === "active") return "warn";
  if (activeState === "activating") return "warn";
  return "bad";
}

function renderSummary(data) {
  const s = data.totals || {};
  const div = $("summary");
  div.innerHTML = "";

  const cards = [
    { label: t("summary_bots"), value: fmtInt(s.botsTotal), sub: t("summary_bots_sub", { active: fmtInt(s.botsActive) }) },
    { label: t("summary_tokens24h"), value: fmtInt(s.tokens24h), sub: t("summary_tokens_sub", { requests: fmtInt(s.requests24h) }) },
    { label: t("summary_cost24h"), value: fmtMoneyUsd(s.cost24h), sub: t("summary_cost_sub") },
    { label: t("summary_errors24h"), value: fmtInt(s.errors24h), sub: t("summary_errors_sub") },
  ];

  for (const c of cards) {
    const el = document.createElement("div");
    el.className = "pill";
    el.innerHTML = `
      <div class="pillLabel">${c.label}</div>
      <div class="pillValue">${c.value}</div>
      <div class="pillSub">${c.sub || ""}</div>
    `;
    div.appendChild(el);
  }
}

function makeActionBtn(label, klass, onClick) {
  const b = document.createElement("button");
  b.className = `btn ${klass || ""}`.trim();
  b.textContent = label;
  b.addEventListener("click", (e) => {
    try { e.stopPropagation(); } catch { /* ignore */ }
    onClick(e);
  });
  return b;
}

async function apiPost(path) {
  const r = await fetch(path, { method: "POST" });
  const text = await r.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch { /* ignore */ }
  if (!r.ok) {
    if (payload && payload.error) throw new Error(payload.error);
    if (payload && payload.result) {
      const code = payload.result.exitCode;
      const stderr = String(payload.result.stderr || "").trim();
      const stdout = String(payload.result.stdout || "").trim();
      const msg = stderr || stdout || `exit ${code}`;
      throw new Error(`exit ${code}: ${msg}`);
    }
    throw new Error(text || `HTTP ${r.status}`);
  }
  return payload || {};
}

function getUsageWindow(bot, win) {
  return bot.usage && bot.usage.windows && bot.usage.windows[win] ? bot.usage.windows[win] : {};
}

function getBotLastActivityMs(bot) {
  const iso = bot.usage ? bot.usage.lastActivityAt : null;
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function botMatchesFilter(bot, q) {
  const s = String(q || "").trim().toLowerCase();
  if (!s) return true;
  const hay = [
    bot.displayName,
    bot.unit,
    bot.telegramHandle,
    bot.type,
    bot.profile,
    bot.gatewayPort,
    bot.scope,
    bot.user,
  ].filter(Boolean).join(" ").toLowerCase();
  return hay.includes(s);
}

function botHasIssues(bot) {
  const usage24 = getUsageWindow(bot, "24h") || {};
  const errors24 = Number(usage24.errors) || 0;
  const active = String(bot.systemd && bot.systemd.activeState || "");
  const sub = String(bot.systemd && bot.systemd.subState || "");
  const restarts = Number(bot.systemd && bot.systemd.nRestarts) || 0;
  const healthIssues = getHealthIssues(bot);
  const hasHealthIssues = healthIssues.length > 0;
  return active !== "active" || (active === "active" && sub !== "running") || errors24 > 0 || restarts > 0 || hasHealthIssues;
}

function actionLabel(action) {
  if (action === "stop") return t("action_stop");
  if (action === "restart") return t("action_restart");
  if (action === "start") return t("action_start");
  if (action === "enable") return t("action_enable");
  if (action === "disable") return t("action_disable");
  return String(action || "");
}

async function doAction(unit, action) {
  const pretty = `${actionLabel(action)} ${unit}`;
  const dangerActions = new Set(["stop", "restart", "disable"]);
  const okActions = new Set(["start", "enable"]);
  const confirmClass = dangerActions.has(action) ? "btnDanger" : okActions.has(action) ? "btnGood" : "";

  const confirmMsg = `${t("confirm_msg", { action: actionLabel(action), unit })}\n\n${t("confirm_tip")}`;
  const confirmed = await showConfirm(confirmMsg, {
    confirmLabel: dangerActions.has(action) ? t("do_it") : t("confirm"),
    confirmClass: confirmClass || "btnDanger",
  });
  if (!confirmed) return;

  setError("");
  try {
    await apiPost(`/api/units/${encodeURIComponent(unit)}/${encodeURIComponent(action)}`);
    await refresh();
    if (state.selectedUnit === unit) {
      openDetails(unit);
    }
  } catch (e) {
    setError(t("action_failed", { pretty, error: String(e && (e.message || e) || "") }));
  }
}

async function syncClaudeAuthAndRestart(unit) {
  const confirmed = await showConfirm(t("sync_claude_auth_confirm", { unit }), {
    confirmLabel: t("do_it"),
    confirmClass: "btnGood",
  });
  if (!confirmed) return;

  setError("");
  try {
    await apiPost("/api/claude/sync");
    await apiPost(`/api/units/${encodeURIComponent(unit)}/restart`);
    await refresh();
    if (state.selectedUnit === unit) {
      openDetails(unit);
    }
  } catch (e) {
    setError(t("sync_claude_auth_failed", { error: String(e && (e.message || e) || "") }));
  }
}

function renderBotsTable(data) {
  const tbody = $("botsTbody");
  tbody.innerHTML = "";

  const bots = Array.isArray(data.bots) ? data.bots : [];
  const items = bots.map((bot, idx) => ({ bot, idx }));

  const filtered = items.filter(({ bot }) => {
    if (!botMatchesFilter(bot, state.ui.filter)) return false;
    const show = state.ui.show;
    if (show === "active") return (bot.systemd && bot.systemd.activeState) === "active";
    if (show === "issues") return botHasIssues(bot);
    return true;
  });

  const sortMode = state.ui.sort || "name";
  const cmp = (a, b) => {
    const A = a.bot;
    const B = b.bot;
    const ua = getUsageWindow(A, "24h") || {};
    const ub = getUsageWindow(B, "24h") || {};
    if (sortMode === "tokens24h_desc") return (Number(ub.tokens) || 0) - (Number(ua.tokens) || 0);
    if (sortMode === "cost24h_desc") return (Number(ub.costUSD) || 0) - (Number(ua.costUSD) || 0);
    if (sortMode === "errors24h_desc") return (Number(ub.errors) || 0) - (Number(ua.errors) || 0);
    if (sortMode === "uptime_desc") return (Number(B.systemd && B.systemd.uptimeSeconds) || 0) - (Number(A.systemd && A.systemd.uptimeSeconds) || 0);
    if (sortMode === "last_activity_desc") return getBotLastActivityMs(B) - getBotLastActivityMs(A);
    const an = String(A.displayName || A.unit || "").toLowerCase();
    const bn = String(B.displayName || B.unit || "").toLowerCase();
    if (an < bn) return -1;
    if (an > bn) return 1;
    return 0;
  };

  filtered.sort((a, b) => {
    const d = cmp(a, b);
    return d !== 0 ? d : a.idx - b.idx;
  });

  state.visibleUnits = filtered.map(({ bot }) => bot.unit);
  updateDetailsNavButtons();

  const countEl = $("visibleCount");
  if (countEl) {
    countEl.textContent = `${filtered.length}/${bots.length}`;
  }

  for (const { bot } of filtered) {
    const tr = document.createElement("tr");
    tr.classList.add("rowClickable");
    if (state.selectedUnit === bot.unit) tr.classList.add("rowSelected");

    const usage24 = getUsageWindow(bot, "24h") || {};
    const lastAct = bot.usage ? bot.usage.lastActivityAt : null;

    const issues = getHealthIssues(bot);
    const primaryIssue = pickPrimaryIssue(issues);
    const primaryMsg = primaryIssue ? String(primaryIssue.message || primaryIssue.key || "") : "";
    const primarySev = primaryIssue ? String(primaryIssue.severity || "").toLowerCase() : "";

    const dotClass = statusDotClass(bot);
    const statusLabel = `${systemdActiveLabel(bot.systemd.activeState)}${bot.systemd.subState ? " (" + systemdSubLabel(bot.systemd.subState) + ")" : ""}`;
    const issueHtml = primaryMsg
      ? `<div class="issueLine ${primarySev === "error" ? "bad" : "warn"}">${escapeHtml(primaryMsg)}</div>`
      : "";

    const nameParts = [];
    nameParts.push(`<div class="providerName">${escapeHtml(bot.displayName || bot.unit)}</div>`);
    const meta = [];
    if (bot.telegramHandle) meta.push(bot.telegramHandle);
    if (bot.type) meta.push(bot.type);
    if (bot.profile) meta.push(`${t("meta_profile")}:${bot.profile}`);
    if (bot.scope === "user") meta.push(bot.user ? `${t("meta_user")}:${bot.user}` : t("scope_user"));
    if (bot.gatewayPort) meta.push(`${t("meta_port")}:${bot.gatewayPort}`);
    meta.push(`${t("meta_unit")}:${bot.unit}`);
    if (meta.length) nameParts.push(`<div class="providerMeta">${escapeHtml(meta.join(" • "))}</div>`);

    const actionsTd = document.createElement("td");
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "actions";

    const activeState = bot.systemd.activeState;
    const canStop = activeState === "active" || activeState === "activating" || activeState === "deactivating";
    if (canStop) {
      actionsDiv.appendChild(makeActionBtn(t("action_stop"), "btnDanger", () => doAction(bot.unit, "stop")));
      actionsDiv.appendChild(makeActionBtn(t("action_restart"), "", () => doAction(bot.unit, "restart")));
    } else {
      actionsDiv.appendChild(makeActionBtn(t("action_start"), "btnGood", () => doAction(bot.unit, "start")));
    }

    const ufs = String(bot.systemd.unitFileState || "").toLowerCase();
    const canDisable = ufs.startsWith("enabled");
    const canEnable = ufs === "disabled" || ufs === "indirect";
    if (canDisable) actionsDiv.appendChild(makeActionBtn(t("action_disable"), "btnDanger", () => doAction(bot.unit, "disable")));
    if (canEnable) actionsDiv.appendChild(makeActionBtn(t("action_enable"), "btnGood", () => doAction(bot.unit, "enable")));

    actionsDiv.appendChild(makeActionBtn(t("action_details"), "btnDetails", () => toggleDetails(bot.unit)));
    actionsTd.appendChild(actionsDiv);

    const errors24 = Number(usage24.errors) || 0;
    const restarts = Number(bot.systemd.nRestarts) || 0;
    if (bot.systemd.activeState !== "active") tr.classList.add("rowBad");
    else if (worstHealthSeverity(issues) >= 2) tr.classList.add("rowBad");
    else if (errors24 > 0 || restarts > 0 || bot.systemd.subState !== "running" || worstHealthSeverity(issues) >= 1) tr.classList.add("rowWarn");

    tr.innerHTML = `
      <td>${nameParts.join("")}</td>
      <td><span class="statusDot ${dotClass}"></span>${escapeHtml(statusLabel)}${issueHtml}</td>
      <td>${escapeHtml(unitFileStateLabel(bot.systemd.unitFileState) || "-")}</td>
      <td>${fmtSeconds(bot.systemd.uptimeSeconds)}</td>
      <td title="${escapeHtml(lastAct || "")}">${escapeHtml(relativeTime(lastAct) || "-")}</td>
      <td class="num">${fmtInt(usage24.tokens)}</td>
      <td class="num">${fmtMoneyUsd(usage24.costUSD)}</td>
      <td class="num">${fmtInt(usage24.errors)}</td>
    `;
    tr.appendChild(actionsTd);
    tbody.appendChild(tr);

    tr.addEventListener("click", (e) => {
      const target = e.target;
      if (target && target.closest && target.closest("button")) return;
      toggleDetails(bot.unit);
    });
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeRegExp(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getChartTooltipEl() {
  let el = $("chartTooltip");
  if (el) return el;
  el = document.createElement("div");
  el.id = "chartTooltip";
  el.className = "chartTooltip";
  el.hidden = true;
  document.body.appendChild(el);
  return el;
}

function hideChartTooltip() {
  const el = $("chartTooltip");
  if (el) el.hidden = true;
}

function showChartTooltip(clientX, clientY, text) {
  const el = getChartTooltipEl();
  el.textContent = String(text || "");
  el.hidden = false;

  const pad = 12;
  let left = clientX + pad;
  let top = clientY + pad;

  // Keep within viewport.
  const r = el.getBoundingClientRect();
  if (left + r.width + 8 > window.innerWidth) left = clientX - r.width - pad;
  if (top + r.height + 8 > window.innerHeight) top = clientY - r.height - pad;

  el.style.left = `${Math.max(8, left)}px`;
  el.style.top = `${Math.max(8, top)}px`;
}

function initChartHover(canvas) {
  if (!canvas || canvas._hoverInited) return;
  canvas._hoverInited = true;
  canvas.addEventListener("mouseleave", hideChartTooltip);
  canvas.addEventListener("mousemove", (e) => {
    const meta = canvas._barChart;
    if (!meta || !Array.isArray(meta.values) || !meta.values.length) return hideChartTooltip();
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const x = (e.clientX - rect.left) * scaleX;
    const pad = Number(meta.pad) || 8;
    const innerW = canvas.width - pad * 2;
    const n = meta.values.length;
    const barW = innerW / (n || 1);
    const idx = Math.floor((x - pad) / barW);
    if (idx < 0 || idx >= n) return hideChartTooltip();

    const label = (meta.labels && meta.labels[idx]) ? meta.labels[idx] : String(idx + 1);
    const value = meta.values[idx] || 0;
    const title = String(meta.title || "").trim();
    const fmt = typeof meta.format === "function" ? meta.format : (v) => String(v);
    const msg = title ? `${label}\n${title}: ${fmt(value)}` : `${label}\n${fmt(value)}`;
    showChartTooltip(e.clientX, e.clientY, msg);
  });
}

function resizeCanvasToDisplaySize(canvas) {
  if (!canvas || typeof canvas.getBoundingClientRect !== "function") return;
  const rect = canvas.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) return;
  const dpr = window.devicePixelRatio || 1;
  const nextW = Math.max(1, Math.floor(rect.width * dpr));
  const nextH = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== nextW) canvas.width = nextW;
  if (canvas.height !== nextH) canvas.height = nextH;
}

function drawBars(canvas, values, color, { labels = null, title = "", format = null } = {}) {
  if (!canvas) return;
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const pad = 8;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  const vals = Array.isArray(values) && values.length ? values : [0];
  const labs = Array.isArray(labels) && labels.length === vals.length ? labels : null;
  const n = vals.length;
  const max = Math.max(1, ...vals);

  ctx.fillStyle = "rgba(159,176,195,0.18)";
  ctx.fillRect(pad, pad, innerW, innerH);

  const barW = innerW / n;
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const v = vals[i] || 0;
    const bh = (v / max) * innerH;
    const x = pad + i * barW;
    const y = pad + (innerH - bh);
    ctx.fillRect(x + 1, y, Math.max(1, barW - 2), bh);
  }

  canvas._barChart = {
    pad,
    values: vals,
    labels: labs,
    title: String(title || ""),
    format,
  };
  initChartHover(canvas);
}

function renderUsageCharts(bot) {
  const titleEl = $("usageChartTitle");
  const windowSel = $("chartWindow");

  const mode = state.ui.chartWindow === "7d" ? "7d" : "30d";
  if (windowSel) windowSel.value = mode;
  if (titleEl) titleEl.textContent = mode === "7d" ? t("usage_7d") : t("usage_30d");

  const dailyAll = (bot.usage && bot.usage.daily30d) ? bot.usage.daily30d : [];
  const daily = mode === "7d" ? dailyAll.slice(-7) : dailyAll;

  let labels = null;
  let tokens = [0];
  let cost = [0];
  if (daily.length) {
    labels = daily.map(d => d.date || "");
    tokens = daily.map(d => d.tokens || 0);
    cost = daily.map(d => d.costUSD || 0);
  }

  drawBars($("tokensChart"), tokens, "#5eead4", { labels, title: t("legend_tokens_day"), format: (v) => fmtInt(v) });
  drawBars($("costChart"), cost, "#60a5fa", { labels, title: t("legend_cost_day"), format: (v) => fmtMoneyUsd(v) });
}

function renderSystemdBox(bot) {
  const el = $("systemdBox");
  if (!el) return;
  const sd = bot.systemd || {};

  const rows = [];
  const pushRow = (k, vHtml) => rows.push(`<div class="infoRow"><span class="k">${escapeHtml(k)}</span><span class="v">${vHtml}</span></div>`);

  pushRow(t("sd_unit"), `<code>${escapeHtml(bot.unit)}</code>`);
  pushRow(
    t("sd_scope"),
    escapeHtml(bot.scope === "user" ? `${t("scope_user")}${bot.user ? ":" + bot.user : ""}` : t("scope_system"))
  );
  if (sd.loadState) pushRow(t("sd_load_state"), escapeHtml(sd.loadState));
  pushRow(
    t("sd_status"),
    escapeHtml(`${systemdActiveLabel(sd.activeState)}${sd.subState ? " (" + systemdSubLabel(sd.subState) + ")" : ""}`)
  );
  pushRow(t("sd_enabled"), escapeHtml(unitFileStateLabel(sd.unitFileState) || "-"));

  const up = Number(sd.uptimeSeconds) || 0;
  if (up > 0) {
    const d = new Date(Date.now() - up * 1000);
    pushRow(t("sd_active_since"), escapeHtml(d.toLocaleString()));
  } else if (sd.activeEnterTimestamp) {
    pushRow(t("sd_active_since"), escapeHtml(sd.activeEnterTimestamp));
  }

  pushRow(t("sd_pid"), escapeHtml(sd.mainPid ? String(sd.mainPid) : "-"));
  pushRow(t("sd_restarts"), escapeHtml(fmtInt(sd.nRestarts)));
  pushRow(t("sd_memory"), escapeHtml(fmtBytes(sd.memoryCurrentBytes)));

  const cpuNs = Number(sd.cpuUsageNSec) || 0;
  if (cpuNs > 0) {
    const cpuSeconds = cpuNs / 1_000_000_000;
    const avgPct = up > 0 ? (cpuSeconds / up) * 100 : 0;
    const pctStr = avgPct > 0 ? `${avgPct.toFixed(avgPct >= 10 ? 0 : 1)}% avg • ` : "";
    pushRow(t("sd_cpu"), escapeHtml(`${pctStr}${fmtSeconds(cpuSeconds)}`));
  }

  if (bot.gatewayPort) pushRow(t("sd_gateway_port"), `<code>${escapeHtml(bot.gatewayPort)}</code>`);
  if (bot.profile) pushRow(t("sd_profile"), escapeHtml(bot.profile));
  if (bot.stateDir) pushRow(t("sd_state_dir"), `<code>${escapeHtml(bot.stateDir)}</code>`);

  el.innerHTML = rows.join("");
}

function makeCopyBtn(label, getText) {
  const b = document.createElement("button");
  b.className = "btn btnSecondary";
  b.textContent = label;
  b.addEventListener("click", async (e) => {
    try { e.stopPropagation(); } catch { /* ignore */ }
    const text = typeof getText === "function" ? getText() : String(getText || "");
    if (!String(text || "").trim()) return;
    const before = b.textContent;
    try {
      await copyToClipboard(text);
      b.textContent = t("copied");
      setTimeout(() => { b.textContent = before; }, 800);
    } catch { /* ignore */ }
  });
  return b;
}

function renderUnitDetailsBox() {
  const el = $("unitDetailsBox");
  if (!el) return;

  const err = String(state.details.unitDetailsError || "").trim();
  if (err) {
    el.textContent = t("unit_details_failed", { error: err });
    el.classList.add("muted");
    return;
  }

  const payload = state.details.unitDetails;
  if (!payload) {
    el.textContent = t("loading");
    el.classList.add("muted");
    return;
  }
  el.classList.remove("muted");

  const rows = [];
  const pushRow = (k, vHtml) => rows.push(`<div class="infoRow"><span class="k">${escapeHtml(k)}</span><span class="v">${vHtml}</span></div>`);

  const fragment = payload.fragmentPath || "";
  const sd = payload.systemd || {};
  const unitFile = payload.unitFile || {};

  if (fragment) pushRow(t("ud_fragment_path"), `<code>${escapeHtml(fragment)}</code>`);
  if (sd.user) pushRow(t("ud_user"), escapeHtml(sd.user));
  if (sd.group) pushRow(t("ud_group"), escapeHtml(sd.group));

  const wd = unitFile.workingDirectory || "";
  if (wd) pushRow(t("ud_workdir"), `<code>${escapeHtml(wd)}</code>`);

  const execStart = unitFile.execStart || "";
  const env = unitFile.env || {};
  const shownEnv = env.shown || {};
  const hiddenEnvKeys = env.hiddenKeys || [];

  const parts = [rows.join("")];

  if (execStart) {
    parts.push(`<div class="infoRow"><span class="k">${escapeHtml(t("ud_exec_start"))}</span><span class="v"></span></div>`);
    parts.push(`<pre class="miniCode">${escapeHtml(execStart)}</pre>`);
  }

  const shownEntries = Object.entries(shownEnv || {});
  if (shownEntries.length) {
    parts.push(`<div class="infoRow"><span class="k">${escapeHtml(t("ud_env"))}</span><span class="v"></span></div>`);
    const lines = shownEntries.map(([k, v]) => `${k}=${v}`);
    parts.push(`<pre class="miniCode">${escapeHtml(lines.join("\n"))}</pre>`);
  }

  if (Array.isArray(hiddenEnvKeys) && hiddenEnvKeys.length) {
    parts.push(`<div class="infoRow"><span class="k">${escapeHtml(t("ud_env_hidden"))}</span><span class="v"><code>${escapeHtml(hiddenEnvKeys.join(", "))}</code></span></div>`);
  }

  el.innerHTML = parts.filter(Boolean).join("");
}

function renderUnitDetailsActions() {
  const el = $("unitDetailsActions");
  if (!el) return;
  el.innerHTML = "";

  const payload = state.details.unitDetails;
  if (!payload) return;

  const fragment = payload.fragmentPath || "";
  const unitFile = payload.unitFile || {};
  const wd = unitFile.workingDirectory || "";
  const execStart = unitFile.execStart || "";

  el.appendChild(makeCopyBtn(`${t("copy")} ${t("sd_unit")}`, () => String(payload.unit || "")));
  if (fragment) el.appendChild(makeCopyBtn(`${t("copy")} ${t("ud_fragment_path")}`, () => fragment));
  if (wd) el.appendChild(makeCopyBtn(`${t("copy")} ${t("ud_workdir")}`, () => wd));
  if (execStart) el.appendChild(makeCopyBtn(`${t("copy")} ${t("ud_exec_start")}`, () => execStart));
}

async function loadUnitDetails(unit) {
  const u = String(unit || "").trim();
  if (!u) return;
  if (state.details.unitDetailsLoading) return;
  if (state.details.unitDetailsUnit !== u) return;

  state.details.unitDetailsLoading = true;
  state.details.unitDetailsError = "";
  renderUnitDetailsBox();
  renderUnitDetailsActions();

  try {
    const r = await fetch(`/api/units/${encodeURIComponent(u)}/details`, { cache: "no-store" });
    const payload = await r.json();
    if (!r.ok) throw new Error(payload.error || `HTTP ${r.status}`);
    if (state.details.unitDetailsUnit !== u) return;
    state.details.unitDetails = payload;
    state.details.unitDetailsError = "";
  } catch (e) {
    if (state.details.unitDetailsUnit !== u) return;
    state.details.unitDetails = null;
    state.details.unitDetailsError = String(e && (e.message || e) || "");
  } finally {
    if (state.details.unitDetailsUnit === u) {
      state.details.unitDetailsLoading = false;
      renderUnitDetailsBox();
      renderUnitDetailsActions();
    }
  }
}

function ensureUnitDetails(unit) {
  const u = String(unit || "").trim();
  if (!u) return;

  if (state.details.unitDetailsUnit !== u) {
    state.details.unitDetailsUnit = u;
    state.details.unitDetails = null;
    state.details.unitDetailsError = "";
    state.details.unitDetailsLoading = false;
  }

  renderUnitDetailsBox();
  renderUnitDetailsActions();
  if (!state.details.unitDetails && !state.details.unitDetailsLoading && !state.details.unitDetailsError) {
    loadUnitDetails(u);
  }
}

function renderUsageSummary(bot) {
  const el = $("usageSummary");
  if (!el) return;

  const usage = bot.usage || null;
  const win24 = usage ? (usage.windows && usage.windows["24h"]) || {} : {};
  const all = usage ? usage.allTime || {} : {};

  const pills = [
    {
      label: t("us_tokens24h"),
      value: fmtInt(win24.tokens),
      sub: `${fmtInt(win24.requests)} ${t("req_short")} • ${fmtInt(win24.errors)} ${t("err_short")}`,
    },
    {
      label: t("us_cost24h"),
      value: fmtMoneyUsd(win24.costUSD),
      sub: "USD",
    },
    {
      label: t("us_tokens_all"),
      value: fmtInt(all.tokens),
      sub: `${fmtInt(all.requests)} ${t("req_short")} • ${fmtInt(all.errors)} ${t("err_short")}`,
    },
    {
      label: t("us_cost_all"),
      value: fmtMoneyUsd(all.costUSD),
      sub: "USD",
    },
  ];

  if (usage) {
    const files = usage.sessionsFiles;
    const bytes = usage.sessionsBytes;
    pills.push({
      label: t("us_sessions"),
      value: fmtInt(files),
      sub: fmtBytes(bytes),
    });
    pills.push({
      label: t("us_last_activity"),
      value: relativeTime(usage.lastActivityAt) || "-",
      sub: fmtIso(usage.lastActivityAt),
    });
  }

  el.innerHTML = pills.map(p => `
    <div class="miniPill">
      <div class="miniLabel">${escapeHtml(p.label)}</div>
      <div class="miniValue">${escapeHtml(p.value)}</div>
      <div class="miniSub">${escapeHtml(p.sub || "")}</div>
    </div>
  `).join("");
}

function renderLastError(bot) {
  const el = $("lastErrorBox");
  if (!el) return;
  const usage = bot.usage || null;
  const last = usage ? usage.lastError : null;
  if (!last) {
    el.textContent = t("no_errors");
    el.classList.add("muted");
    return;
  }
  const ts = last.timestamp || "";
  const msg = last.message || "error";
  el.textContent = `${fmtIso(ts)} • ${msg}`;
  el.classList.remove("muted");
}

function renderHealth(bot) {
  const el = $("healthBox");
  const actionsEl = $("healthActions");
  if (!el) return;

  if (actionsEl) actionsEl.innerHTML = "";

  const issues = getHealthIssues(bot);
  if (!issues.length) {
    el.textContent = t("health_ok");
    el.classList.add("muted");
    return;
  }
  el.classList.remove("muted");

  const parts = [];
  for (const it of issues) {
    const msg = String(it && (it.message || it.key) || "issue");
    const sev = String(it && it.severity || "").toLowerCase();
    const cls = sev === "error" ? "bad" : "warn";
    const ts = it && it.timestamp ? fmtIso(it.timestamp) : "";
    const hint = String(it && it.hint || "");
    const meta = [ts, hint].filter(Boolean).join(" • ");
    parts.push(`
      <div class="healthIssue ${cls}">
        <div class="healthIssueTitle">${escapeHtml(msg)}</div>
        <div class="healthIssueMeta">${escapeHtml(meta)}</div>
      </div>
    `);
  }
  el.innerHTML = parts.join("");

  const needsClaudeFix = issues.some(it => String(it && it.key || "") === "anthropic_oauth_refresh_failed");
  const needsRestart = issues.some(it => {
    const k = String(it && it.key || "");
    return k === "backend_binary_unavailable" || k === "addr_in_use";
  });

  if (actionsEl) {
    if (needsClaudeFix) {
      actionsEl.appendChild(makeActionBtn(t("sync_claude_auth"), "btnGood", () => syncClaudeAuthAndRestart(bot.unit)));
    }
    if (needsRestart) {
      actionsEl.appendChild(makeActionBtn(t("action_restart"), "", () => doAction(bot.unit, "restart")));
    }
  }
}

async function copyToClipboard(text) {
  const s = String(text || "");
  if (!s) return;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(s);
      return;
    }
  } catch { /* ignore */ }
  const ta = document.createElement("textarea");
  ta.value = s;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy"); // eslint-disable-line no-restricted-syntax
  ta.remove();
}

function navigateDetails(delta) {
  const units = Array.isArray(state.visibleUnits) ? state.visibleUnits : [];
  const cur = state.selectedUnit;
  if (!cur || !units.length) return;
  const idx = units.indexOf(cur);
  if (idx < 0) return;
  const step = delta < 0 ? -1 : 1;
  const nextIdx = idx + step;
  if (nextIdx < 0 || nextIdx >= units.length) return;
  openDetails(units[nextIdx]);
}

function updateDetailsNavButtons() {
  const prevBtn = $("detailPrevBtn");
  const nextBtn = $("detailNextBtn");
  if (!prevBtn || !nextBtn) return;
  const units = Array.isArray(state.visibleUnits) ? state.visibleUnits : [];
  const cur = state.selectedUnit;
  const idx = cur ? units.indexOf(cur) : -1;
  prevBtn.disabled = idx <= 0;
  nextBtn.disabled = idx < 0 || idx >= units.length - 1;
}

function enabledChipClass(unitFileState) {
  const ufs = String(unitFileState || "").trim().toLowerCase();
  if (!ufs) return "";
  if (ufs.startsWith("enabled")) return "good";
  if (ufs === "disabled" || ufs === "masked") return "bad";
  if (ufs === "static" || ufs === "indirect" || ufs === "generated") return "warn";
  return "";
}

function renderDetailsMeta(bot) {
  const metaEl = $("detailMetaLine");
  if (!metaEl) return;

  const sd = bot.systemd || {};
  const chips = [];
  const push = (text, { klass = "", mono = false } = {}) => {
    const s = String(text || "").trim();
    if (!s) return;
    chips.push({ text: s, klass: String(klass || "").trim(), mono: Boolean(mono) });
  };

  if (bot.telegramHandle) push(bot.telegramHandle);
  if (bot.type) push(bot.type);
  if (bot.profile) push(`${t("meta_profile")}:${bot.profile}`);
  if (bot.scope === "user") push(bot.user ? `${t("meta_user")}:${bot.user}` : t("scope_user"));
  if (bot.gatewayPort) push(`${t("meta_port")}:${bot.gatewayPort}`, { mono: true });
  push(`${t("meta_unit")}:${bot.unit}`, { mono: true });

  const statusLabel = `${systemdActiveLabel(sd.activeState)}${sd.subState ? " (" + systemdSubLabel(sd.subState) + ")" : ""}`;
  if (statusLabel) push(statusLabel, { klass: statusDotClass(bot) });

  const enabled = unitFileStateLabel(sd.unitFileState);
  if (enabled) push(enabled, { klass: enabledChipClass(sd.unitFileState) });

  if (Number.isFinite(sd.uptimeSeconds) && sd.uptimeSeconds > 0) push(fmtSeconds(sd.uptimeSeconds));
  const lastAct = bot.usage ? bot.usage.lastActivityAt : null;
  if (lastAct) push(relativeTime(lastAct));

  metaEl.innerHTML = chips.map((c) => {
    const cls = ["metaChip", c.klass].filter(Boolean).join(" ");
    const inner = c.mono ? `<code>${escapeHtml(c.text)}</code>` : escapeHtml(c.text);
    return `<span class="${cls}" title="${escapeHtml(c.text)}">${inner}</span>`;
  }).join("");
}

function renderDetails(bot) {
  $("detailTitle").textContent = bot.displayName || bot.unit;
  const sd = bot.systemd || {};
  renderDetailsMeta(bot);

  const actionsEl = $("detailActions");
  const closeBtn = $("closeDetailBtn");
  if (actionsEl && closeBtn) {
    for (const child of Array.from(actionsEl.children)) {
      if (child !== closeBtn) child.remove();
    }

    const insertBeforeClose = (btn) => actionsEl.insertBefore(btn, closeBtn);

    const navUnits = Array.isArray(state.visibleUnits) ? state.visibleUnits : [];
    const navIdx = navUnits.indexOf(bot.unit);
    const hasPrev = navIdx > 0;
    const hasNext = navIdx >= 0 && navIdx < navUnits.length - 1;
    const prevBtn = makeActionBtn(`← ${t("nav_prev")}`, "btnSecondary", () => navigateDetails(-1));
    prevBtn.id = "detailPrevBtn";
    prevBtn.disabled = !hasPrev;
    const nextBtn = makeActionBtn(`${t("nav_next")} →`, "btnSecondary", () => navigateDetails(1));
    nextBtn.id = "detailNextBtn";
    nextBtn.disabled = !hasNext;
    insertBeforeClose(prevBtn);
    insertBeforeClose(nextBtn);

    const activeState = sd.activeState;
    const canStop = activeState === "active" || activeState === "activating" || activeState === "deactivating";
    if (canStop) {
      insertBeforeClose(makeActionBtn(t("action_stop"), "btnDanger", () => doAction(bot.unit, "stop")));
      insertBeforeClose(makeActionBtn(t("action_restart"), "", () => doAction(bot.unit, "restart")));
    } else {
      insertBeforeClose(makeActionBtn(t("action_start"), "btnGood", () => doAction(bot.unit, "start")));
    }

    const ufs = String(sd.unitFileState || "").toLowerCase();
    const canDisable = ufs.startsWith("enabled");
    const canEnable = ufs === "disabled" || ufs === "indirect";
    if (canDisable) insertBeforeClose(makeActionBtn(t("action_disable"), "btnDanger", () => doAction(bot.unit, "disable")));
    if (canEnable) insertBeforeClose(makeActionBtn(t("action_enable"), "btnGood", () => doAction(bot.unit, "enable")));

    insertBeforeClose(makeCopyBtn(t("copy_link"), () => window.location.href));
  }

  const modal = $("detailModal");
  if (modal) modal.hidden = false;
  document.body.classList.add("modalOpen");

  renderHealth(bot);
  renderSystemdBox(bot);
  ensureUnitDetails(bot.unit);
  renderUsageSummary(bot);
  renderLastError(bot);

  renderUsageCharts(bot);

  const providers = bot.usage && bot.usage.byProvider ? bot.usage.byProvider : {};
  const list = $("providersList");
  list.innerHTML = "";

  const entries = Object.entries(providers).sort((a, b) => (b[1].tokens || 0) - (a[1].tokens || 0));
  if (!entries.length) {
    list.innerHTML = `<div class="muted">${escapeHtml(t("no_usage"))}</div>`;
  } else {
    for (const [provider, st] of entries) {
      const row = document.createElement("div");
      row.className = "providerRow";
      const modelParts = [];
      if (st.models) {
        const models = Object.entries(st.models).sort((a, b) => (b[1].tokens || 0) - (a[1].tokens || 0)).slice(0, 4);
        for (const [m, ms] of models) {
          modelParts.push(`${m} (${fmtInt(ms.tokens)} ${t("tokens_word")})`);
        }
      }
      row.innerHTML = `
        <div>
          <div class="providerName">${escapeHtml(provider)}</div>
          <div class="providerMeta">${escapeHtml(modelParts.join(" • ") || "")}</div>
        </div>
        <div class="providerNums">
          <div>${fmtInt(st.tokens)} ${escapeHtml(t("tokens_word"))}</div>
          <div class="muted">${fmtMoneyUsd(st.costUSD)} • ${fmtInt(st.requests)} ${escapeHtml(t("req_short"))} • ${fmtInt(st.errors)} ${escapeHtml(t("err_short"))}</div>
        </div>
      `;
      list.appendChild(row);
    }
  }

  state.details.logsUnit = bot.unit;
  state.details.logsRaw = "";
  state.details.logQuery = "";

  const logsPre = $("logsPre");
  logsPre.dataset.logsLoaded = "0";
  logsPre.textContent = t("logs_hint");

  const searchInput = $("logSearchInput");
  if (searchInput) {
    searchInput.value = "";
    searchInput.oninput = () => {
      state.details.logQuery = searchInput.value || "";
      if (logsPre.dataset.logsLoaded === "1") renderLogsView();
    };
  }

  const autoLogsCheckbox = $("autoLoadLogs");
  if (autoLogsCheckbox) {
    autoLogsCheckbox.checked = state.details.autoLoadLogs;
    autoLogsCheckbox.onchange = () => {
      state.details.autoLoadLogs = autoLogsCheckbox.checked;
      lsSet("autoLoadLogs", autoLogsCheckbox.checked ? "1" : "0");
      if (state.details.autoLoadLogs && logsPre.dataset.logsLoaded === "0") {
        loadLogs(bot.unit);
      }
    };
  }

  $("loadLogsBtn").onclick = () => loadLogs(bot.unit);
  $("copyLogsBtn").onclick = async () => {
    const btn = $("copyLogsBtn");
    const before = btn ? btn.textContent : "";
    try {
      await copyToClipboard(state.details.logsRaw || $("logsPre").textContent || "");
      if (btn) btn.textContent = t("copied");
      setTimeout(() => { if (btn) btn.textContent = before || t("copy"); }, 800);
    } catch { /* ignore */ }
  };

  if (state.details.autoLoadLogs) {
    loadLogs(bot.unit);
  }
}

function renderLogsView() {
  const logsPre = $("logsPre");
  if (!logsPre) return;
  const raw = String(state.details.logsRaw || "");
  if (!raw) {
    logsPre.textContent = t("no_logs");
    return;
  }

  const q = String(state.details.logQuery || "").trim();
  const qLower = q.toLowerCase();
  const lines = raw.split(/\r?\n/);
  const shown = q ? lines.filter(ln => String(ln || "").toLowerCase().includes(qLower)) : lines;
  if (q && !shown.length) {
    logsPre.textContent = t("logs_no_matches");
    return;
  }

  const qRe = q ? new RegExp(escapeRegExp(q), "gi") : null;
  const badRe = /\b(error|fatal|exception|traceback)\b/ig;
  const warnRe = /\b(warn|warning)\b/ig;

  const out = shown.map((ln) => {
    let s = escapeHtml(ln);
    if (qRe) s = s.replace(qRe, m => `<mark class="logMatch">${m}</mark>`);
    s = s.replace(badRe, m => `<span class="logSevBad">${m}</span>`);
    s = s.replace(warnRe, m => `<span class="logSevWarn">${m}</span>`);
    return s;
  }).join("\n");

  if (!out) {
    logsPre.textContent = t("no_logs");
    return;
  }
  logsPre.innerHTML = out;
}

async function loadLogs(unit) {
  const lines = parseInt($("logLines").value, 10) || 200;
  const since = String(($("logSince") && $("logSince").value) || "").trim();
  const logsPre = $("logsPre");
  state.details.logsUnit = unit;
  state.details.logsRaw = "";
  logsPre.dataset.logsLoaded = "1";
  logsPre.textContent = t("loading");
  try {
    const qs = new URLSearchParams();
    qs.set("lines", String(lines));
    if (since) qs.set("since", since);
    const r = await fetch(`/api/units/${encodeURIComponent(unit)}/logs?${qs.toString()}`);
    const payload = await r.json();
    if (!r.ok) throw new Error(payload.error || `HTTP ${r.status}`);
    state.details.logsRaw = String(payload.logs || "");
    renderLogsView();
  } catch (e) {
    state.details.logsRaw = "";
    logsPre.textContent = t("logs_failed", { error: String(e && (e.message || e) || "") });
  }
}

function initDetailsUi() {
  if (state.details.inited) return;
  const modal = $("detailModal");
  const overlay = $("detailOverlay");
  if (!modal || !overlay) return;

  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target === overlay) closeDetails();
  });

  document.addEventListener("keydown", (e) => {
    if (!modal || modal.hidden) return;
    const confirmModal = $("confirmModal");
    if (confirmModal && !confirmModal.hidden) return;
    if (e.key === "Escape") closeDetails();

    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target;
    const tag = String(target && target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || (target && target.isContentEditable)) return;
    const key = String(e.key || "").toLowerCase();
    if (key === "arrowleft" || key === "k") {
      e.preventDefault();
      navigateDetails(-1);
    } else if (key === "arrowright" || key === "j") {
      e.preventDefault();
      navigateDetails(1);
    }
  });

  state.details.inited = true;
}

function openDetails(unit, { updateUrl = true } = {}) {
  if (!state.details.inited) initDetailsUi();
  if (!state.data) return null;
  const bot = (state.data && state.data.bots || []).find(b => b.unit === unit);
  if (!bot) return false;

  const modal = $("detailModal");
  const wasOpen = Boolean(modal && !modal.hidden);
  if (modal && modal.hidden) state.details.lastFocus = document.activeElement;

  state.selectedUnit = unit;
  renderDetails(bot);
  if (state.data) renderBotsTable(state.data);
  if (updateUrl) setUrlUnit(unit, { replace: wasOpen });
  const closeBtn = $("closeDetailBtn");
  if (closeBtn) closeBtn.focus();
  return true;
}

function closeDetails({ updateUrl = true } = {}) {
  if (updateUrl && getUrlUnit()) {
    // Prefer "real" back navigation, so Back/Forward works naturally and we don't
    // create duplicate history entries. Deep-links are handled by seeding a base
    // entry via ensureDetailsHistorySeeded().
    try { history.back(); } catch { /* ignore */ }
    return;
  }

  const modal = $("detailModal");
  if (modal) modal.hidden = true;
  document.body.classList.remove("modalOpen");

  state.selectedUnit = null;
  if (state.data) renderBotsTable(state.data);

  const last = state.details.lastFocus;
  state.details.lastFocus = null;
  try {
    if (last && typeof last.focus === "function") last.focus();
  } catch { /* ignore */ }
}

function toggleDetails(unit) {
  const modal = $("detailModal");
  const isOpen = Boolean(modal && !modal.hidden && state.selectedUnit === unit);
  if (isOpen) return closeDetails();
  return openDetails(unit);
}

function renderHeader(data) {
  const rawTitle = String((data && data.title) || "").trim();
  const title = rawTitle && rawTitle !== I18N.en.app_title ? rawTitle : t("app_title");

  $("pageTitle").textContent = title || t("app_title");
  document.title = title || t("app_title");

  $("updatedAt").textContent = `${t("updated_prefix")}${fmtIso(data.generatedAt)}`;
  $("relativeTime").textContent = relativeTime(data.generatedAt);
  $("tzLabel").textContent = `${t("timezone_prefix")}${data.timezone || "-"}`;
}

async function refresh() {
  setError("");
  try {
    const r = await fetch("/api/bots", { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    state.data = data;

    renderHeader(data);

    renderSummary(data);
    renderBotsTable(data);

    if (state.selectedUnit) {
      const still = (data.bots || []).find(b => b.unit === state.selectedUnit);
      if (still) renderDetails(still);
      else closeDetails({ updateUrl: true });
    }
    syncDetailsFromUrl();
  } catch (e) {
    setError(t("load_api_failed", { error: String(e && (e.message || e) || "") }));
  }
}

function setAuto(on) {
  state.auto = on;
  $("autoBtn").textContent = on ? t("auto_on") : t("auto_off");
  $("autoBtn").className = `btn ${on ? "btnSecondary" : ""}`.trim();
  lsSet("auto", on ? "1" : "0");
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  if (on) state.timer = setInterval(refresh, 30000);
}

window.addEventListener("DOMContentLoaded", () => {
  initConfirmUi();
  $("refreshBtn").addEventListener("click", refresh);
  $("autoBtn").addEventListener("click", () => setAuto(!state.auto));
  $("closeDetailBtn").addEventListener("click", closeDetails);
  window.addEventListener("popstate", syncDetailsFromUrl);

  const langSelect = $("langSelect");
  const storedLang = normalizeLang(lsGet("lang", ""));
  const browserLang = normalizeLang((navigator && navigator.language) || "");
  state.ui.lang = storedLang || browserLang || "en";
  lsSet("lang", state.ui.lang);
  if (langSelect) langSelect.value = state.ui.lang;
  applyI18n();
  if (langSelect) {
    langSelect.addEventListener("change", () => setLanguage(langSelect.value));
  }

  const filterInput = $("filterInput");
  const showSelect = $("showSelect");
  const sortSelect = $("sortSelect");
  const chartWindowSelect = $("chartWindow");

  state.ui.filter = lsGet("filter", "") || "";
  state.ui.show = lsGet("show", "all") || "all";
  state.ui.sort = lsGet("sort", "name") || "name";
  state.ui.chartWindow = lsGet("chartWindow", "30d") || "30d";
  if (state.ui.chartWindow !== "7d" && state.ui.chartWindow !== "30d") state.ui.chartWindow = "30d";

  if (filterInput) filterInput.value = state.ui.filter;
  if (showSelect) showSelect.value = state.ui.show;
  if (sortSelect) sortSelect.value = state.ui.sort;
  if (chartWindowSelect) chartWindowSelect.value = state.ui.chartWindow;

  if (chartWindowSelect) {
    chartWindowSelect.addEventListener("change", () => {
      state.ui.chartWindow = (chartWindowSelect.value === "7d") ? "7d" : "30d";
      lsSet("chartWindow", state.ui.chartWindow);
      if (state.selectedUnit && state.data) {
        const bot = (state.data.bots || []).find(b => b.unit === state.selectedUnit);
        if (bot) renderUsageCharts(bot);
      }
    });
  }

  if (filterInput) {
    filterInput.addEventListener("input", () => {
      state.ui.filter = filterInput.value || "";
      lsSet("filter", state.ui.filter);
      if (state.data) renderBotsTable(state.data);
    });
  }
  if (showSelect) {
    showSelect.addEventListener("change", () => {
      state.ui.show = showSelect.value || "all";
      lsSet("show", state.ui.show);
      if (state.data) renderBotsTable(state.data);
    });
  }
  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      state.ui.sort = sortSelect.value || "name";
      lsSet("sort", state.ui.sort);
      if (state.data) renderBotsTable(state.data);
    });
  }

  const autoStored = lsGet("auto", "1");
  setAuto(autoStored !== "0");
  refresh();
});
