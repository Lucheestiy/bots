/* global fetch */

const state = {
  data: null,
  prevData: null,
  selectedUnit: null,
  visibleUnits: [],
  auto: true,
  timer: null,
  batch: new Set(),
  pinned: new Set(JSON.parse(lsGet("pinned", "[]") || "[]")),
  viewCompact: lsGet("viewCompact", "0") === "1",
  viewGrid: lsGet("viewGrid", "0") === "1",
  connOnline: true,
  countdownTimer: null,
  countdownStart: 0,
  chipFilter: "all",
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
    followLogs: false,
    followTimer: null,
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
    bot_docs: "How This Bot Operates",
    bot_docs_missing: "No description configured for this bot.",
    bot_docs_how: "How it works",
    bot_docs_can: "Can",
    bot_docs_cannot: "Cannot",
    bot_docs_steps: "Operation flow",
    bot_docs_behind: "Behind the scenes",
    bot_docs_telegram: "What you'll notice in Telegram",
    bot_docs_best_for: "Best use cases",
    bot_docs_gateway_role: "What Clawdbot gateway does",
    bot_docs_runtime_active: "Which runtime is active",
    bot_docs_runtime_update: "If Clawdbot/OpenClaw is updated",
    bot_docs_runtime_model: "Runtime vs model",
    bot_docs_gateway_size: "How large a piece it is",
    bot_docs_gateway_replace: "Can it be replaced?",
    bot_docs_gateway_missing: "If the gateway were missing",
    bot_docs_skill_missing: "If a skill were missing",
    bot_docs_mcp_missing: "If MCP/tools were missing",
    bot_docs_bypass: "What bypassing looks like",
    bot_docs_examples: "Step-by-step examples",
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
    footer_tip: "Tip: use Stop/Start to \u201cdocker-like\u201d power-cycle a bot.",
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
    summary_cost_monthly: "~{monthly}/mo projected",
    summary_errors24h: "Errors (24h)",
    summary_errors_sub: "stopReason=error",
    action_stop: "Stop",
    action_restart: "Restart",
    action_start: "Start",
    action_enable: "Enable",
    action_disable: "Disable",
    action_details: "Details",
    confirm_msg: "Confirm: {action} {unit}",
    confirm_tip: "Tip: if a service is stuck in \u201cactivating (auto-restart)\u201d, use Stop to break the loop.",
    action_failed: "{pretty} failed: {error}",
    loading: "Loading…",
    logs_hint: "Click \u201cLoad logs\u201d.",
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
    toast_action_ok: "{action} {unit} — done",
    toast_action_fail: "{action} {unit} — failed",
    shortcuts_title: "Keyboard shortcuts",
    sc_open_details: "Open details / navigate",
    sc_close: "Close modal",
    sc_prev_next: "Previous / Next bot",
    sc_refresh: "Refresh data",
    sc_filter: "Focus filter",
    sc_shortcuts: "Show this help",
    sc_select_all: "Select / deselect all",
    batch_selected: "{n} selected",
    batch_start_all: "Start all",
    batch_stop_all: "Stop all",
    batch_restart_all: "Restart all",
    batch_confirm: "{action} {n} bots?",
    export_csv: "Export CSV",
    pin: "Pin",
    unpin: "Unpin",
    layout_table: "Table",
    layout_grid: "Grid",
    view_compact: "Compact",
    view_comfortable: "Comfortable",
    follow_logs: "Follow",
    follow_logs_title: "Auto-refresh logs every 5s",
    conn_online: "Connected",
    conn_offline: "Disconnected",
    legend_errors_day: "Errors/day",
    no_bots_match: "No bots match your filters.",
    log_matches: "{n} matches",
    data_from: "Data from {time}",
    fg_title: "Field Guide",
    fg_expand: "Expand",
    fg_collapse: "Collapse",
    fleet_health: "Fleet Health",
    chip_all: "All",
    chip_active: "Active",
    chip_inactive: "Inactive",
    chip_issues: "Issues",
    chip_clawdbot: "Clawdbot",
    chip_droid: "Droid",
    status_went_down: "{name} went down",
    status_came_up: "{name} came back up",
    status_restarting: "{name} is restarting",
    trend_up: "+{pct}%",
    trend_down: "{pct}%",
    insights_title: "Fleet Insights",
    insights_top_spender: "Top spender (24h)",
    insights_daily_avg: "Daily avg cost",
    insights_monthly_proj: "Monthly projection",
    insights_error_rate: "Error rate (24h)",
    insights_most_active: "Most active (24h)",
    insights_longest_uptime: "Longest uptime",
    insights_of_requests: "of {total} requests",
    notif_enable: "Notifications",
    notif_enabled: "Notifications enabled",
    notif_denied: "Notifications blocked by browser",
    sc_cmd_palette: "Command palette",
    cmd_search_placeholder: "Search bots, actions\u2026",
    cmd_no_results: "No results found",
    cmd_group_bots: "Bots",
    cmd_group_actions: "Actions",
    cmd_group_quick: "Quick Actions",
    cmd_refresh: "Refresh data",
    cmd_export: "Export CSV",
    cmd_notif: "Toggle notifications",
    cmd_filter: "Focus filter",
    cmd_shortcuts: "Keyboard shortcuts",
    cmd_compact: "Toggle compact view",
    cmd_stop: "Stop {name}",
    cmd_restart: "Restart {name}",
    cmd_start: "Start {name}",
    cmd_logs: "View logs for {name}",
    cmd_navigate: "navigate",
    cmd_select: "select",
    cmd_close: "close",
    strip_online: "{n}/{total} online",
    strip_spent: "spent today",
    strip_issues: "{n} issues",
    strip_no_issues: "No issues",
    strip_uptime: "fleet uptime",
    activity_heatmap: "24h Activity",
    activity_tokens: "{n} tokens",
    activity_requests: "{n} requests",
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
    bot_docs: "Как работает бот",
    bot_docs_missing: "Для этого бота описание не задано.",
    bot_docs_how: "Как работает",
    bot_docs_can: "Может",
    bot_docs_cannot: "Не может",
    bot_docs_steps: "Как проходит запрос",
    bot_docs_behind: "Что происходит внутри",
    bot_docs_telegram: "Что вы увидите в Telegram",
    bot_docs_best_for: "Когда этот бот подходит лучше всего",
    bot_docs_gateway_role: "Что делает Clawdbot gateway",
    bot_docs_runtime_active: "Какой runtime сейчас активен",
    bot_docs_runtime_update: "Что будет, если обновить Clawdbot/OpenClaw",
    bot_docs_runtime_model: "Runtime и модель — не одно и то же",
    bot_docs_gateway_size: "Насколько это большой кусок системы",
    bot_docs_gateway_replace: "Можно ли это заменить?",
    bot_docs_gateway_missing: "Если бы gateway не было",
    bot_docs_skill_missing: "Если бы не было skill",
    bot_docs_mcp_missing: "Если бы не было MCP/инструментов",
    bot_docs_bypass: "Как выглядит обход gateway на практике",
    bot_docs_examples: "Пошаговые примеры",
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
    summary_cost_monthly: "~{monthly}/мес прогноз",
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
    toast_action_ok: "{action} {unit} — готово",
    toast_action_fail: "{action} {unit} — ошибка",
    shortcuts_title: "Горячие клавиши",
    sc_open_details: "Открыть детали / навигация",
    sc_close: "Закрыть окно",
    sc_prev_next: "Предыдущий / Следующий бот",
    sc_refresh: "Обновить данные",
    sc_filter: "Фокус на фильтр",
    sc_shortcuts: "Показать подсказки",
    sc_select_all: "Выбрать / снять все",
    batch_selected: "{n} выбрано",
    batch_start_all: "Запустить все",
    batch_stop_all: "Остановить все",
    batch_restart_all: "Перезапустить все",
    batch_confirm: "{action} {n} ботов?",
    export_csv: "Экспорт CSV",
    pin: "Закрепить",
    unpin: "Открепить",
    layout_table: "Таблица",
    layout_grid: "Сетка",
    view_compact: "Компактный",
    view_comfortable: "Обычный",
    follow_logs: "Следить",
    follow_logs_title: "Обновлять логи каждые 5с",
    conn_online: "Подключено",
    conn_offline: "Отключено",
    legend_errors_day: "Ошибки/день",
    no_bots_match: "Нет ботов по вашему фильтру.",
    log_matches: "{n} совпадений",
    data_from: "Данные от {time}",
    fg_title: "Справочник полей",
    fg_expand: "Развернуть",
    fg_collapse: "Свернуть",
    fleet_health: "Здоровье флота",
    chip_all: "Все",
    chip_active: "Активные",
    chip_inactive: "Неактивные",
    chip_issues: "С проблемами",
    chip_clawdbot: "Clawdbot",
    chip_droid: "Droid",
    status_went_down: "{name} остановлен",
    status_came_up: "{name} снова работает",
    status_restarting: "{name} перезапускается",
    trend_up: "+{pct}%",
    trend_down: "{pct}%",
    insights_title: "Обзор флота",
    insights_top_spender: "Макс. расходы (24ч)",
    insights_daily_avg: "Средние расходы/день",
    insights_monthly_proj: "Прогноз на месяц",
    insights_error_rate: "Ошибки (24ч)",
    insights_most_active: "Самый активный (24ч)",
    insights_longest_uptime: "Макс. аптайм",
    insights_of_requests: "из {total} запросов",
    notif_enable: "Уведомления",
    notif_enabled: "Уведомления включены",
    notif_denied: "Уведомления заблокированы браузером",
    sc_cmd_palette: "Палитра команд",
    cmd_search_placeholder: "Поиск ботов, действий\u2026",
    cmd_no_results: "Ничего не найдено",
    cmd_group_bots: "Боты",
    cmd_group_actions: "Действия",
    cmd_group_quick: "Быстрые действия",
    cmd_refresh: "Обновить данные",
    cmd_export: "Экспорт CSV",
    cmd_notif: "Уведомления",
    cmd_filter: "Фокус на фильтр",
    cmd_shortcuts: "Горячие клавиши",
    cmd_compact: "Компактный вид",
    cmd_stop: "Остановить {name}",
    cmd_restart: "Перезапустить {name}",
    cmd_start: "Запустить {name}",
    cmd_logs: "Логи {name}",
    cmd_navigate: "навигация",
    cmd_select: "выбрать",
    cmd_close: "закрыть",
    strip_online: "{n}/{total} онлайн",
    strip_spent: "потрачено сегодня",
    strip_issues: "{n} проблем",
    strip_no_issues: "Без проблем",
    strip_uptime: "аптайм флота",
    activity_heatmap: "Активность 24ч",
    activity_tokens: "{n} токенов",
    activity_requests: "{n} запросов",
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
    renderFleetBar(state.data);
    renderInsights(state.data);
    renderFilterChips(state.data);
    renderBotsTable(state.data);
    renderIssuesBadge(state.data);
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
  if (modal) {
    modal.classList.add("modalClosing");
    const onEnd = () => {
      modal.removeEventListener("animationend", onEnd);
      modal.classList.remove("modalClosing");
      modal.hidden = true;
    };
    modal.addEventListener("animationend", onEnd);
    setTimeout(onEnd, 250);
  }

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

/* ── Animated number counter ── */
function animateNumber(el, from, to, duration, formatFn) {
  if (!el || !Number.isFinite(from) || !Number.isFinite(to) || from === to) {
    if (el) el.textContent = formatFn(to);
    return;
  }
  const start = performance.now();
  const diff = to - from;
  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(1, elapsed / duration);
    // Ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = from + diff * eased;
    el.textContent = formatFn(current);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function monthlyProjectionSub(dailyAll) {
  if (!dailyAll || dailyAll.length < 2) return t("summary_cost_sub");
  const recent = dailyAll.slice(-7);
  const totalCost = recent.reduce((s, d) => s + (d.costUSD || 0), 0);
  const avgDaily = totalCost / recent.length;
  const monthly = avgDaily * 30;
  return t("summary_cost_monthly", { monthly: fmtMoneyUsd(monthly) });
}

function renderInsights(data) {
  const el = $("insightsSection");
  if (!el) return;
  const bots = Array.isArray(data.bots) ? data.bots : [];
  if (!bots.length) { el.hidden = true; return; }
  el.hidden = false;

  const insights = [];

  // Top spender (24h)
  let topSpender = null;
  let topCost = 0;
  for (const bot of bots) {
    const u24 = (bot.usage && bot.usage.windows && bot.usage.windows["24h"]) || {};
    const cost = Number(u24.costUSD) || 0;
    if (cost > topCost) { topCost = cost; topSpender = bot; }
  }
  if (topSpender && topCost > 0) {
    insights.push({
      icon: "\uD83D\uDCB0",
      label: t("insights_top_spender"),
      value: `${topSpender.displayName || topSpender.unit}`,
      sub: fmtMoneyUsd(topCost),
      klass: "insightCost",
    });
  }

  // Daily average cost (from aggregate data)
  const dailyAgg = {};
  for (const bot of bots) {
    const daily = bot.usage && bot.usage.daily30d ? bot.usage.daily30d : [];
    for (const d of daily) {
      if (!d.date) continue;
      if (!dailyAgg[d.date]) dailyAgg[d.date] = { costUSD: 0, tokens: 0 };
      dailyAgg[d.date].costUSD += (d.costUSD || 0);
      dailyAgg[d.date].tokens += (d.tokens || 0);
    }
  }
  const dailyAll = Object.entries(dailyAgg).sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
  if (dailyAll.length >= 3) {
    const recent7 = dailyAll.slice(-7);
    const avgCost = recent7.reduce((s, d) => s + d.costUSD, 0) / recent7.length;
    const monthly = avgCost * 30;
    insights.push({
      icon: "\uD83D\uDCC8",
      label: t("insights_monthly_proj"),
      value: fmtMoneyUsd(monthly),
      sub: `${fmtMoneyUsd(avgCost)}/day avg`,
      klass: "insightProj",
    });
  }

  // Error rate
  const totals = data.totals || {};
  const totalReq = Number(totals.requests24h) || 0;
  const totalErr = Number(totals.errors24h) || 0;
  if (totalReq > 0) {
    const errPct = ((totalErr / totalReq) * 100).toFixed(1);
    insights.push({
      icon: totalErr > 0 ? "\u26A0\uFE0F" : "\u2705",
      label: t("insights_error_rate"),
      value: `${errPct}%`,
      sub: t("insights_of_requests", { total: fmtInt(totalReq) }),
      klass: totalErr > 0 ? "insightWarn" : "insightGood",
    });
  }

  // Most active bot (24h tokens)
  let mostActive = null;
  let maxTokens = 0;
  for (const bot of bots) {
    const u24 = (bot.usage && bot.usage.windows && bot.usage.windows["24h"]) || {};
    const tok = Number(u24.tokens) || 0;
    if (tok > maxTokens) { maxTokens = tok; mostActive = bot; }
  }
  if (mostActive && maxTokens > 0) {
    insights.push({
      icon: "\u26A1",
      label: t("insights_most_active"),
      value: mostActive.displayName || mostActive.unit,
      sub: `${fmtInt(maxTokens)} tokens`,
      klass: "insightActive",
    });
  }

  // Longest uptime
  let longestBot = null;
  let longestUp = 0;
  for (const bot of bots) {
    const up = Number(bot.systemd && bot.systemd.uptimeSeconds) || 0;
    if (up > longestUp) { longestUp = up; longestBot = bot; }
  }
  if (longestBot && longestUp > 3600) {
    insights.push({
      icon: "\u23F1\uFE0F",
      label: t("insights_longest_uptime"),
      value: longestBot.displayName || longestBot.unit,
      sub: fmtSeconds(longestUp),
      klass: "insightUptime",
    });
  }

  el.innerHTML = `
    <div class="insightsHeader">
      <span class="insightsTitle">${escapeHtml(t("insights_title"))}</span>
    </div>
    <div class="insightsGrid">
      ${insights.map(i => `
        <div class="insightCard ${i.klass || ""}">
          <span class="insightIcon">${i.icon}</span>
          <div class="insightBody">
            <div class="insightLabel">${escapeHtml(i.label)}</div>
            <div class="insightValue">${escapeHtml(i.value)}</div>
            <div class="insightSub">${escapeHtml(i.sub || "")}</div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

/* ── System Status Strip ── */
function renderStatusStrip(data) {
  const el = $("statusStrip");
  if (!el) return;
  const bots = Array.isArray(data.bots) ? data.bots : [];
  if (!bots.length) { el.hidden = true; return; }
  el.hidden = false;

  const totals = data.totals || {};
  const online = Number(totals.botsActive) || 0;
  const total = Number(totals.botsTotal) || 0;
  const cost = Number(totals.cost24h) || 0;

  // Count issues
  let issueCount = 0;
  for (const bot of bots) {
    if (botHasIssues(bot)) issueCount++;
  }

  // Fleet average uptime
  let totalUp = 0;
  let activeCount = 0;
  for (const bot of bots) {
    const up = Number(bot.systemd && bot.systemd.uptimeSeconds) || 0;
    if ((bot.systemd && bot.systemd.activeState) === "active" && up > 0) {
      totalUp += up;
      activeCount++;
    }
  }
  const avgUptime = activeCount > 0 ? fmtSeconds(totalUp / activeCount) : "-";

  const onlineDotCls = online === total ? "good" : online > 0 ? "warn" : "bad";
  const issueDotCls = issueCount === 0 ? "good" : "warn";

  // Build mini 24h sparkline from aggregate hourly data
  const hourlyAgg = {};
  for (const bot of bots) {
    const hourly = (bot.usage && bot.usage.hourly24h) ? bot.usage.hourly24h : [];
    for (const h of hourly) {
      if (!h.hour) continue;
      if (!hourlyAgg[h.hour]) hourlyAgg[h.hour] = 0;
      hourlyAgg[h.hour] += (h.requests || 0);
    }
  }
  const hourlyVals = Object.entries(hourlyAgg).sort((a, b) => a[0].localeCompare(b[0])).slice(-24).map(([, v]) => v);
  let miniSparkHtml = "";
  if (hourlyVals.length > 2) {
    const maxH = Math.max(1, ...hourlyVals);
    const bars = hourlyVals.map(v => {
      const h = Math.max(1, Math.round((v / maxH) * 14));
      return `<span style="display:inline-block;width:2px;height:${h}px;background:rgba(94,234,212,.5);border-radius:1px;vertical-align:bottom"></span>`;
    }).join("");
    miniSparkHtml = `<span style="display:inline-flex;align-items:flex-end;gap:1px;height:14px;margin-left:2px;vertical-align:middle">${bars}</span>`;
  }

  el.innerHTML = `
    <div class="stripItem"><span class="stripDot ${onlineDotCls}"></span><span class="stripValue">${online}/${total}</span> online</div>
    <div class="stripSep"></div>
    <div class="stripItem"><span class="stripValue">${fmtMoneyUsd(cost)}</span> ${t("strip_spent")}</div>
    <div class="stripSep"></div>
    <div class="stripItem"><span class="stripDot ${issueDotCls}"></span>${issueCount > 0 ? `<span class="stripValue">${issueCount}</span> issues` : t("strip_no_issues")}</div>
    <div class="stripSep"></div>
    <div class="stripItem">${t("strip_uptime")}: <span class="stripValue">${avgUptime}</span></div>
    ${miniSparkHtml ? `<div class="stripSep"></div><div class="stripItem">24h${miniSparkHtml}</div>` : ""}
  `;
}

/* ── 24h Activity Heatmap ── */
function renderActivityHeatmap(bot) {
  const section = $("activityHeatmapSection");
  const wrap = $("activityHeatmap");
  if (!section || !wrap) return;

  const hourly = (bot.usage && bot.usage.hourly24h) ? bot.usage.hourly24h : [];
  if (!hourly.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;

  // Build 24 hourly buckets
  const buckets = new Array(24).fill(0);
  const reqBuckets = new Array(24).fill(0);
  for (const h of hourly) {
    if (!h.hour) continue;
    try {
      const d = new Date(h.hour);
      const hr = d.getHours();
      if (hr >= 0 && hr < 24) {
        buckets[hr] += (h.tokens || 0);
        reqBuckets[hr] += (h.requests || 0);
      }
    } catch { /* ignore */ }
  }

  const max = Math.max(1, ...buckets);

  // Quantize to levels 0-4
  const levels = buckets.map(v => {
    if (v === 0) return 0;
    const ratio = v / max;
    if (ratio < 0.15) return 1;
    if (ratio < 0.4) return 2;
    if (ratio < 0.7) return 3;
    return 4;
  });

  const cells = levels.map((lvl, i) => {
    const tokStr = fmtInt(buckets[i]);
    const reqStr = fmtInt(reqBuckets[i]);
    return `<div class="heatmapCell h${lvl}" title="${String(i).padStart(2, '0')}:00 — ${tokStr} tok, ${reqStr} req"></div>`;
  }).join("");

  const hours = Array.from({ length: 24 }, (_, i) =>
    `<div class="heatmapHour">${i}</div>`
  ).join("");

  wrap.innerHTML = `
    <div class="heatmapGrid">${cells}</div>
    <div class="heatmapHours">${hours}</div>
  `;
}

function renderSummary(data) {
  const s = data.totals || {};
  const div = $("summary");
  div.innerHTML = "";

  // Aggregate daily data across all bots for sparklines
  const dailyAgg = {};
  for (const bot of (data.bots || [])) {
    const daily = bot.usage && bot.usage.daily30d ? bot.usage.daily30d : [];
    for (const d of daily) {
      if (!d.date) continue;
      if (!dailyAgg[d.date]) dailyAgg[d.date] = { tokens: 0, costUSD: 0, errors: 0 };
      dailyAgg[d.date].tokens += (d.tokens || 0);
      dailyAgg[d.date].costUSD += (d.costUSD || 0);
      dailyAgg[d.date].errors += (d.errors || 0);
    }
  }
  const dailyAll = Object.entries(dailyAgg).sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);

  const hasErrors = (Number(s.errors24h) || 0) > 0;

  const tokenTrend = calcTrend(dailyAll, "tokens");
  const costTrend = calcTrend(dailyAll, "costUSD");
  const errorTrend = calcTrend(dailyAll, "errors");

  const rawValues = [
    { raw: s.botsTotal || 0, fmt: fmtInt },
    { raw: s.tokens24h || 0, fmt: fmtInt },
    { raw: s.cost24h || 0, fmt: fmtMoneyUsd },
    { raw: s.errors24h || 0, fmt: fmtInt },
  ];

  const cards = [
    { label: t("summary_bots"), value: fmtInt(s.botsTotal), sub: t("summary_bots_sub", { active: fmtInt(s.botsActive) }), spark: "", trend: "", klass: "", key: "bots" },
    { label: t("summary_tokens24h"), value: fmtInt(s.tokens24h), sub: t("summary_tokens_sub", { requests: fmtInt(s.requests24h) }), spark: renderPillSparkline(dailyAll, "tokens", "rgba(94,234,212,.5)"), trend: trendHtml(tokenTrend), klass: "", key: "tokens" },
    { label: t("summary_cost24h"), value: fmtMoneyUsd(s.cost24h), sub: monthlyProjectionSub(dailyAll), spark: renderPillSparkline(dailyAll, "costUSD", "rgba(96,165,250,.5)"), trend: trendHtml(costTrend), klass: "", key: "cost" },
    { label: t("summary_errors24h"), value: fmtInt(s.errors24h), sub: t("summary_errors_sub"), spark: renderPillSparkline(dailyAll, "errors", "rgba(251,113,133,.5)"), trend: trendHtml(errorTrend), klass: hasErrors ? "pillError" : "", key: "errors" },
  ];

  // Read previous raw values for animation
  const prevRaw = state._summaryRaw || {};

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const rv = rawValues[i];
    const el = document.createElement("div");
    el.className = `pill pill--${c.key} ${c.klass || ""}`.trim();
    if (!state._summaryRendered) el.classList.add("pillAnimIn");
    el.innerHTML = `
      <div class="pillLabel">${c.label}</div>
      <div class="pillValue"><span class="pillNum">${c.value}</span>${c.trend || ""}</div>
      <div class="pillSub">${c.sub || ""}</div>
      ${c.spark || '<div class="pillSparkline"></div>'}
    `;
    div.appendChild(el);

    // Animate the number if it changed
    const oldVal = prevRaw[c.key];
    if (oldVal != null && oldVal !== rv.raw && Number.isFinite(oldVal)) {
      const numEl = el.querySelector(".pillNum");
      if (numEl) animateNumber(numEl, oldVal, rv.raw, 600, rv.fmt);
    }
  }

  // Store raw values for next render
  state._summaryRaw = {};
  for (let i = 0; i < cards.length; i++) {
    state._summaryRaw[cards[i].key] = rawValues[i].raw;
  }
  state._summaryRendered = true;
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

const BOT_NAME_SORT_COLLATOR = new Intl.Collator(["ru", "en"], {
  sensitivity: "base",
  numeric: true,
});

function botNameSortBucket(bot) {
  const name = String(bot.displayName || bot.unit || "").toLowerCase();
  if (name.includes("alena")) return 0;
  if (name.includes("mikhail")) return 1;
  return 2;
}

function compareBotsByNamePriority(a, b) {
  const bucketDiff = botNameSortBucket(a) - botNameSortBucket(b);
  if (bucketDiff !== 0) return bucketDiff;

  const nameDiff = BOT_NAME_SORT_COLLATOR.compare(
    String(a.displayName || a.unit || ""),
    String(b.displayName || b.unit || ""),
  );
  if (nameDiff !== 0) return nameDiff;

  return BOT_NAME_SORT_COLLATOR.compare(String(a.unit || ""), String(b.unit || ""));
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
    showToast(t("toast_action_ok", { action: actionLabel(action), unit }), "", { type: "good", duration: 3000 });
    await refresh();
    if (state.selectedUnit === unit) {
      openDetails(unit);
    }
  } catch (e) {
    const errMsg = String(e && (e.message || e) || "");
    showToast(t("toast_action_fail", { action: actionLabel(action), unit }), errMsg, { type: "bad", duration: 6000 });
    setError(t("action_failed", { pretty, error: errMsg }));
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
    showToast(t("sync_claude_auth"), t("toast_action_ok", { action: t("action_restart"), unit }), { type: "good" });
    await refresh();
    if (state.selectedUnit === unit) {
      openDetails(unit);
    }
  } catch (e) {
    const errMsg = String(e && (e.message || e) || "");
    showToast(t("sync_claude_auth"), errMsg, { type: "bad", duration: 6000 });
    setError(t("sync_claude_auth_failed", { error: errMsg }));
  }
}

/* ── Hover Preview Card ── */
let _hoverTimer = null;
let _hoverUnit = null;

function showHoverPreview(bot, x, y) {
  const el = $("hoverPreview");
  if (!el) return;
  _hoverUnit = bot.unit;

  const sd = bot.systemd || {};
  const usage24 = getUsageWindow(bot, "24h") || {};
  const activeState = String(sd.activeState || "");
  const subState = String(sd.subState || "");
  const dotCls = statusDotClass(bot);
  const statusText = `${systemdActiveLabel(activeState)}${subState ? " (" + systemdSubLabel(subState) + ")" : ""}`;
  const issues = getHealthIssues(bot);
  const errors24 = Number(usage24.errors) || 0;

  let issuesHtml = "";
  if (issues.length > 0) {
    const items = issues.slice(0, 3).map(iss => {
      const sev = String(iss.severity || "").toLowerCase();
      const msg = escapeHtml(String(iss.message || iss.key || ""));
      return `<div class="hpIssue ${sev}"><span class="hpIssueDot ${sev}"></span>${msg}</div>`;
    }).join("");
    issuesHtml = `<div class="hpIssues">${items}</div>`;
  }

  const memStr = Number.isFinite(sd.memoryBytes) ? fmtBytes(sd.memoryBytes) : "-";
  const cpuStr = Number.isFinite(sd.cpuSeconds) ? fmtSeconds(sd.cpuSeconds) : "-";

  el.innerHTML = `
    <div class="hpHeader">
      <span class="statusDot ${dotCls}"></span>
      <strong>${escapeHtml(bot.displayName || bot.unit)}</strong>
      ${typeBadgeHtml(bot.type)}
    </div>
    <div class="hpStatus">${escapeHtml(statusText)}</div>
    ${issuesHtml}
    <div class="hpGrid">
      <div class="hpStat"><span class="hpLabel">${t("sd_memory")}</span><span class="hpVal">${memStr}</span></div>
      <div class="hpStat"><span class="hpLabel">${t("sd_cpu")}</span><span class="hpVal">${cpuStr}</span></div>
      <div class="hpStat"><span class="hpLabel">${t("sd_restarts")}</span><span class="hpVal${(Number(sd.nRestarts) || 0) > 0 ? " warn" : ""}">${fmtInt(sd.nRestarts || 0)}</span></div>
      <div class="hpStat"><span class="hpLabel">${t("summary_errors24h")}</span><span class="hpVal${errors24 > 0 ? " bad" : ""}">${fmtInt(errors24)}</span></div>
    </div>
    <div class="hpHint">${t("action_details")} \u2192</div>
  `;

  el.hidden = false;

  // Position near cursor
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = x + 16;
  let top = y - 20;
  const rect = el.getBoundingClientRect();
  if (left + rect.width > vw - 16) left = x - rect.width - 16;
  if (top + rect.height > vh - 16) top = vh - rect.height - 16;
  if (top < 16) top = 16;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

function hideHoverPreview() {
  clearTimeout(_hoverTimer);
  _hoverUnit = null;
  const el = $("hoverPreview");
  if (el) el.hidden = true;
}

function renderBotsGrid(filtered, bots) {
  const grid = $("botsGrid");
  if (!grid) return;

  if (!filtered.length && bots.length > 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px 12px;color:var(--muted);font-size:14px">${escapeHtml(t("no_bots_match"))}</div>`;
    return;
  }

  // Surgical update if same bots (to prevent jitter/reloading)
  const currentUnits = Array.from(grid.querySelectorAll(".botCard")).map(c => c.dataset.unit);
  const nextUnits = filtered.map(f => f.bot.unit);
  const isSameOrder = JSON.stringify(currentUnits) === JSON.stringify(nextUnits);

  if (isSameOrder && currentUnits.length > 0) {
    for (const { bot } of filtered) {
      const card = grid.querySelector(`.botCard[data-unit="${bot.unit}"]`);
      if (card) {
        card.innerHTML = botCardInnerHtml(bot);
        card.className = `botCard${state.selectedUnit === bot.unit ? " selected" : ""}${isPinned(bot.unit) ? " pinned" : ""}`;
      }
    }
    return;
  }

  let html = "";
  for (const { bot } of filtered) {
    const isSelected = state.selectedUnit === bot.unit;
    const pinned = isPinned(bot.unit);
    html += `
      <div class="botCard${isSelected ? " selected" : ""}${pinned ? " pinned" : ""}" data-unit="${escapeHtml(bot.unit)}">
        ${botCardInnerHtml(bot)}
      </div>
    `;
  }
  grid.innerHTML = html;
}

function renderBotsTable(data) {
  const tbody = $("botsTbody");
  const grid = $("botsGrid");
  if (!tbody || !grid) return;

  const bots = Array.isArray(data.bots) ? data.bots : [];
  const items = bots.map((bot, idx) => ({ bot, idx }));

  const filtered = items.filter(({ bot }) => {
    if (!botMatchesFilter(bot, state.ui.filter)) return false;
    const show = state.ui.show;
    if (show === "active") return (bot.systemd && bot.systemd.activeState) === "active";
    if (show === "issues") return botHasIssues(bot);

    const chip = state.chipFilter || "all";
    if (chip === "active") return (bot.systemd && bot.systemd.activeState) === "active";
    if (chip === "inactive") return (bot.systemd && bot.systemd.activeState) !== "active";
    if (chip === "issues") return botHasIssues(bot);
    if (chip === "clawdbot") return String(bot.type || "").toLowerCase().includes("clawdbot");
    if (chip === "droid") return String(bot.type || "").toLowerCase().includes("droid");
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
    return compareBotsByNamePriority(A, B);
  };

  filtered.sort((a, b) => {
    const pa = isPinned(a.bot.unit) ? 0 : 1;
    const pb = isPinned(b.bot.unit) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const d = cmp(a, b);
    return d !== 0 ? d : a.idx - b.idx;
  });

  state.visibleUnits = filtered.map(({ bot }) => bot.unit);
  updateDetailsNavButtons();

  const countEl = $("visibleCount");
  if (countEl) countEl.textContent = `${filtered.length}/${bots.length}`;

  if (state.viewGrid) {
    tbody.innerHTML = "";
    renderBotsGrid(filtered, bots);
    return;
  }

  grid.innerHTML = "";
  if (!filtered.length && bots.length > 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px 12px;color:var(--muted);font-size:13px">${escapeHtml(t("no_bots_match"))}</td></tr>`;
    return;
  }

  // Surgical update for table
  const currentUnits = Array.from(tbody.querySelectorAll("tr:not(.sparkRow)")).map(r => r.dataset.unit);
  const nextUnits = filtered.map(f => f.bot.unit);
  const isSameOrder = JSON.stringify(currentUnits) === JSON.stringify(nextUnits);

  if (isSameOrder && currentUnits.length > 0) {
    for (const { bot } of filtered) {
      const row = tbody.querySelector(`tr:not(.sparkRow)[data-unit="${bot.unit}"]`);
      const sparkRow = tbody.querySelector(`tr.sparkRow[data-unit="${bot.unit}"]`);
      if (row && sparkRow) {
        // We need to parse the two-row HTML structure. To keep it simple but surgical,
        // we'll update the whole 2-row block by using a temporary container.
        const temp = document.createElement("tbody");
        temp.innerHTML = botRowHtml(bot, {
          isChecked: state.batch.has(bot.unit),
          isSelected: state.selectedUnit === bot.unit
        });
        row.innerHTML = temp.firstElementChild.innerHTML;
        row.className = temp.firstElementChild.className;
        sparkRow.innerHTML = temp.lastElementChild.innerHTML;
        sparkRow.className = temp.lastElementChild.className;
      }
    }
    updateBatchBar();
    updateSelectAllCheckbox();
    return;
  }

  const shouldAnimate = !state._skipRowAnim;
  let animIdx = 0;
  let html = "";

  for (const { bot } of filtered) {
    html += botRowHtml(bot, {
      animIdx: shouldAnimate ? animIdx : -1,
      isChecked: state.batch.has(bot.unit),
      isSelected: state.selectedUnit === bot.unit
    });
    animIdx++;
  }
  tbody.innerHTML = html;
  updateBatchBar();
  updateSelectAllCheckbox();
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

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
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
  const allZero = vals.every(v => !v);

  // Subtle chart background
  ctx.fillStyle = "rgba(159,176,195,0.08)";
  ctx.fillRect(pad, pad, innerW, innerH);

  // Horizontal gridlines
  const gridCount = 4;
  ctx.strokeStyle = "rgba(159,176,195,0.08)";
  ctx.lineWidth = 1;
  for (let g = 1; g < gridCount; g++) {
    const gy = pad + (innerH / gridCount) * g;
    ctx.beginPath();
    ctx.moveTo(pad, Math.round(gy) + 0.5);
    ctx.lineTo(pad + innerW, Math.round(gy) + 0.5);
    ctx.stroke();
  }

  if (allZero) {
    ctx.fillStyle = "rgba(159,176,195,0.3)";
    const dpr = window.devicePixelRatio || 1;
    ctx.font = `${Math.round(13 * dpr)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("\u2014", w / 2, h / 2);
    canvas._barChart = null;
    return;
  }

  const max = Math.max(1, ...vals);
  const barW = innerW / n;

  // Draw gradient-filled bars with rounded tops
  const barGrad = ctx.createLinearGradient(0, pad, 0, pad + innerH);
  barGrad.addColorStop(0, color);
  barGrad.addColorStop(1, hexToRgba(color, 0.25));

  for (let i = 0; i < n; i++) {
    const v = vals[i] || 0;
    const bh = (v / max) * innerH;
    if (bh < 1) continue;
    const x = pad + i * barW + 1;
    const y = pad + (innerH - bh);
    const bw = Math.max(1, barW - 2);
    const radius = Math.min(3, bw / 3, bh / 2);

    ctx.fillStyle = barGrad;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + bw - radius, y);
    ctx.quadraticCurveTo(x + bw, y, x + bw, y + radius);
    ctx.lineTo(x + bw, y + bh);
    ctx.lineTo(x, y + bh);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
  }

  // Glow line at the chart area top edge
  const glowGrad = ctx.createLinearGradient(pad, pad, pad + innerW, pad);
  glowGrad.addColorStop(0, "transparent");
  glowGrad.addColorStop(0.3, hexToRgba(color, 0.12));
  glowGrad.addColorStop(0.7, hexToRgba(color, 0.12));
  glowGrad.addColorStop(1, "transparent");
  ctx.fillStyle = glowGrad;
  ctx.fillRect(pad, pad, innerW, 1);

  // Draw max value label
  const dpr = window.devicePixelRatio || 1;
  const fmtFn = typeof format === "function" ? format : (v) => String(v);
  const maxLabel = fmtFn(max);
  ctx.fillStyle = "rgba(159,176,195,0.45)";
  ctx.font = `${Math.round(10 * dpr)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText(maxLabel, w - pad, pad + 2);

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
  let errors = [0];
  if (daily.length) {
    labels = daily.map(d => d.date || "");
    tokens = daily.map(d => d.tokens || 0);
    cost = daily.map(d => d.costUSD || 0);
    errors = daily.map(d => d.errors || 0);
  }

  drawBars($("tokensChart"), tokens, "#5eead4", { labels, title: t("legend_tokens_day"), format: (v) => fmtInt(v) });
  drawBars($("costChart"), cost, "#60a5fa", { labels, title: t("legend_cost_day"), format: (v) => fmtMoneyUsd(v) });
  drawBars($("errorsChart"), errors, "#fb7185", { labels, title: t("legend_errors_day"), format: (v) => fmtInt(v) });
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

  const errors24 = Number(win24.errors) || 0;
  const errorsAll = Number(all.errors) || 0;
  const pills = [
    {
      label: t("us_tokens24h"),
      value: fmtInt(win24.tokens),
      sub: `${fmtInt(win24.requests)} ${t("req_short")} • ${fmtInt(errors24)} ${t("err_short")}`,
      klass: errors24 > 0 ? "miniWarn" : "",
    },
    {
      label: t("us_cost24h"),
      value: fmtMoneyUsd(win24.costUSD),
      sub: "USD",
    },
    {
      label: t("us_tokens_all"),
      value: fmtInt(all.tokens),
      sub: `${fmtInt(all.requests)} ${t("req_short")} • ${fmtInt(errorsAll)} ${t("err_short")}`,
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
    <div class="miniPill ${p.klass || ""}">
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
  el.classList.remove("muted");
  const ts = last.timestamp || "";
  const msg = last.message || "error";
  const rel = relativeTime(ts);
  const timeText = rel ? `${fmtIso(ts)} (${rel})` : fmtIso(ts);
  el.innerHTML = `<div class="lastErrorTime">${escapeHtml(timeText)}</div><div class="lastErrorMsg">${escapeHtml(msg)}</div>`;
}

function renderHealth(bot) {
  const el = $("healthBox");
  const actionsEl = $("healthActions");
  if (!el) return;

  if (actionsEl) actionsEl.innerHTML = "";

  const issuesRaw = getHealthIssues(bot);
  if (!issuesRaw.length) {
    el.textContent = t("health_ok");
    el.classList.add("muted");
    return;
  }
  el.classList.remove("muted");

  // Sort: errors first, then warnings, then by timestamp descending
  const sevRank = (s) => { const v = String(s || "").toLowerCase(); return v === "error" ? 0 : v === "warn" ? 1 : 2; };
  const issues = [...issuesRaw].sort((a, b) => {
    const d = sevRank(a.severity) - sevRank(b.severity);
    if (d !== 0) return d;
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });

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

/* ── Toast notification system ── */
function showToast(title, msg, { type = "info", duration = 4000 } = {}) {
  const container = $("toastContainer");
  if (!container) return;

  const icons = { good: "\u2705", bad: "\u274C", warn: "\u26A0\uFE0F", info: "\u2139\uFE0F" };
  const el = document.createElement("div");
  el.className = `toast toast${type.charAt(0).toUpperCase() + type.slice(1)}`;
  const progressHtml = duration > 0 ? `<div class="toastProgress"><div class="toastProgressBar" style="--toast-duration:${duration}ms"></div></div>` : "";
  el.innerHTML = `
    <span class="toastIcon">${icons[type] || icons.info}</span>
    <div class="toastBody">
      <div class="toastTitle">${escapeHtml(title)}</div>
      ${msg ? `<div class="toastMsg">${escapeHtml(msg)}</div>` : ""}
    </div>
    <button class="toastClose">&times;</button>
    ${progressHtml}
  `;
  container.appendChild(el);

  const remove = () => {
    if (el._removed) return;
    el._removed = true;
    el.classList.add("toastLeaving");
    el.addEventListener("animationend", () => el.remove());
  };
  el.querySelector(".toastClose").addEventListener("click", remove);
  if (duration > 0) setTimeout(remove, duration);
}

/* ── Sparkline renderer ── */
function renderSparkline(daily7, { key = "tokens", color = null, fmtFn = null } = {}) {
  if (!daily7 || !daily7.length) return "";
  const vals = daily7.map(d => d[key] || 0);
  const max = Math.max(1, ...vals);
  const fmt = fmtFn || fmtInt;
  const style = color ? `background:${color}` : "";
  const bars = vals.map(v => {
    const h = Math.max(1, Math.round((v / max) * 18));
    return `<span class="sparklineBar" style="height:${h}px${style ? ";" + style : ""}" title="${fmt(v)}"></span>`;
  });
  return `<span class="sparklineWrap">${bars.join("")}</span>`;
}

/* ── Full-width sparklines (24h hourly + 30d daily, spans entire row) ── */
function renderFullWidthSparklines(hourly24h, daily30d) {
  function makeBars(data, color) {
    if (!data || !data.length) return "";
    const vals = data.map(d => d.tokens || 0);
    const mx = Math.max(1, ...vals);
    return vals.map(v => {
      const pct = mx > 0 ? Math.max(2, Math.round((v / mx) * 100)) : 2;
      return `<span class="fwSparkBar" style="height:${pct}%;background:${color}" title="${fmtInt(v)}"></span>`;
    }).join("");
  }

  const has24 = hourly24h && hourly24h.length;
  const has30 = daily30d && daily30d.length;
  if (!has24 && !has30) return "";

  const h24bars = has24 ? makeBars(hourly24h, "var(--teal)") : "";
  const d30bars = has30 ? makeBars(daily30d, "rgba(96,165,250,.6)") : "";

  let html = `<div class="fwSparkRow">`;
  html += `<span class="fwSparkLabel">24h</span><span class="fwSparkChart">${h24bars}</span>`;
  html += `<span class="fwSparkGap"></span>`;
  html += `<span class="fwSparkLabel">30d</span><span class="fwSparkChart">${d30bars}</span>`;
  html += `</div>`;
  return html;
}

/* ── Pin/favorite bots ── */
function savePinned() {
  lsSet("pinned", JSON.stringify(Array.from(state.pinned)));
}

function togglePin(unit) {
  if (state.pinned.has(unit)) state.pinned.delete(unit);
  else state.pinned.add(unit);
  savePinned();
  if (state.data) renderBotsTable(state.data);
}

function isPinned(unit) {
  return state.pinned.has(unit);
}

/* ── View toggle (compact/comfortable) ── */
function setViewCompact(compact) {
  state.viewCompact = compact;
  lsSet("viewCompact", compact ? "1" : "0");
  document.body.classList.toggle("viewCompact", compact);
  const btn = $("viewToggleBtn");
  if (btn) {
    btn.textContent = compact ? t("view_comfortable") : t("view_compact");
    btn.classList.toggle("active", compact);
  }
  if (state.data) renderBotsTable(state.data);
}

function setLayoutGrid(grid) {
  state.viewGrid = grid;
  lsSet("viewGrid", grid ? "1" : "0");
  document.body.classList.toggle("botsViewGrid", grid);
  const btn = $("layoutToggleBtn");
  if (btn) {
    btn.textContent = grid ? t("layout_grid") : t("layout_table");
    btn.classList.toggle("active", grid);
  }
  const tableWrap = document.querySelector(".tableWrap");
  const gridContainer = $("botsGrid");
  if (tableWrap) tableWrap.hidden = grid;
  if (gridContainer) gridContainer.hidden = !grid;
  if (state.data) renderBotsTable(state.data);
}

/* ── Connection status ── */
function setConnStatus(online) {
  state.connOnline = online;
  const dot = $("connDot");
  if (dot) {
    dot.className = `connDot ${online ? "online" : "offline"}`;
    dot.title = online ? t("conn_online") : t("conn_offline");
  }
}

/* ── Auto-refresh countdown ── */
const REFRESH_INTERVAL = 30000;
const COUNTDOWN_CIRCUMFERENCE = 56.55; // 2 * PI * 9

function startCountdown() {
  stopCountdown();
  state.countdownStart = Date.now();
  const circle = $("countdownCircle");
  const ring = $("countdownRing");
  if (ring) ring.style.display = state.auto ? "" : "none";
  if (!circle) return;

  state.countdownTimer = setInterval(() => {
    const elapsed = Date.now() - state.countdownStart;
    const progress = Math.min(1, elapsed / REFRESH_INTERVAL);
    const offset = COUNTDOWN_CIRCUMFERENCE * (1 - progress);
    circle.style.strokeDashoffset = String(offset);
  }, 200);
}

function stopCountdown() {
  if (state.countdownTimer) {
    clearInterval(state.countdownTimer);
    state.countdownTimer = null;
  }
  const circle = $("countdownCircle");
  if (circle) circle.style.strokeDashoffset = "0";
}

/* ── Log follow mode ── */
function setFollowLogs(active) {
  state.details.followLogs = active;
  const btn = $("followLogsBtn");
  if (btn) btn.classList.toggle("active", active);

  if (state.details.followTimer) {
    clearInterval(state.details.followTimer);
    state.details.followTimer = null;
  }

  if (active && state.details.logsUnit) {
    // Load immediately, then every 5s
    loadLogs(state.details.logsUnit);
    state.details.followTimer = setInterval(() => {
      if (state.details.logsUnit) loadLogs(state.details.logsUnit);
    }, 5000);
  }
}

/* ── Uptime bar renderer ── */
function renderUptimeBar(uptimeSeconds) {
  if (!Number.isFinite(uptimeSeconds) || uptimeSeconds <= 0) return fmtSeconds(uptimeSeconds);
  // Map uptime to a percentage (7 days = 100%)
  const maxSeconds = 7 * 86400;
  const pct = Math.min(100, (uptimeSeconds / maxSeconds) * 100);
  // Color: green for long, yellow for mid, red for short
  let color = "var(--good)";
  if (uptimeSeconds < 3600) color = "var(--bad)";
  else if (uptimeSeconds < 86400) color = "var(--warn)";
  return `<div class="uptimeBar"><span>${fmtSeconds(uptimeSeconds)}</span><span class="uptimeBarTrack"><span class="uptimeBarFill" style="width:${pct.toFixed(1)}%;background:${color}"></span></span></div>`;
}

/* ── Provider donut chart ── */
const DONUT_COLORS = ["#5eead4", "#60a5fa", "#fb7185", "#c084fc", "#fbbf24", "#34d399", "#f472b6", "#a78bfa"];

function drawDonut(canvas, slices) {
  if (!canvas) return;
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (!slices || !slices.length) return;

  const total = slices.reduce((s, v) => s + v.value, 0);
  if (total <= 0) return;

  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(cx, cy) - 4;
  const innerR = r * 0.55;
  let angle = -Math.PI / 2;

  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];
    const sliceAngle = (slice.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, angle, angle + sliceAngle);
    ctx.arc(cx, cy, innerR, angle + sliceAngle, angle, true);
    ctx.closePath();
    ctx.fillStyle = DONUT_COLORS[i % DONUT_COLORS.length];
    ctx.fill();
    angle += sliceAngle;
  }

  // Center text
  ctx.fillStyle = "#f0f4f9";
  ctx.font = `bold ${Math.round(r * 0.22)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(fmtInt(total), cx, cy - r * 0.08);
  ctx.fillStyle = "#93b4d4";
  ctx.font = `${Math.round(r * 0.14)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(t("tokens_word"), cx, cy + r * 0.15);
}

function renderProviderDonut(bot) {
  const canvas = $("providerDonut");
  if (!canvas) return;
  const providers = bot.usage && bot.usage.byProvider ? bot.usage.byProvider : {};
  const entries = Object.entries(providers).sort((a, b) => (b[1].tokens || 0) - (a[1].tokens || 0));
  const slices = entries.map(([name, st]) => ({ label: name, value: st.tokens || 0 }));
  drawDonut(canvas, slices);
}

/* ── Page title badge ── */
function updatePageTitleBadge(data) {
  if (!data || !data.bots) return;
  const issueCount = data.bots.reduce((n, bot) => {
    const issues = getHealthIssues(bot);
    return n + issues.filter(i => String(i.severity || "").toLowerCase() === "error").length;
  }, 0);
  const baseTitle = t("app_title");
  document.title = issueCount > 0 ? `[${issueCount}] ${baseTitle}` : baseTitle;
}

/* ── Issues notification badge ── */
function renderIssuesBadge(data) {
  const el = $("issuesBadge");
  if (!el || !data || !data.bots) return;

  const bots = data.bots || [];
  let errorCount = 0;
  let warnCount = 0;
  let downCount = 0;

  for (const bot of bots) {
    const issues = getHealthIssues(bot);
    for (const issue of issues) {
      const sev = String(issue.severity || "").toLowerCase();
      if (sev === "error") errorCount++;
      else if (sev === "warn") warnCount++;
    }
    const activeState = String(bot.systemd && bot.systemd.activeState || "");
    if (activeState !== "active") downCount++;
  }

  const totalIssues = errorCount + warnCount + downCount;

  if (totalIssues === 0) {
    el.hidden = false;
    el.className = "issuesBadge badgeOk";
    const lang = normalizeLang(state.ui.lang);
    el.innerHTML = `<span class="issuesBadgeIcon">\u2714</span>${lang === "ru" ? "Все ОК" : "All OK"}`;
    el.onclick = null;
    return;
  }

  el.hidden = false;
  el.className = `issuesBadge ${errorCount > 0 || downCount > 0 ? "badgeBad" : "badgeWarn"}`;

  const parts = [];
  if (downCount > 0) parts.push(`${downCount} down`);
  if (errorCount > 0) parts.push(`${errorCount} err`);
  if (warnCount > 0) parts.push(`${warnCount} warn`);

  el.innerHTML = `<span class="issuesBadgeIcon">${errorCount > 0 || downCount > 0 ? "\u26A0" : "\u26A0"}</span>${parts.join(" \u2022 ")}`;
  el.onclick = () => {
    state.chipFilter = "issues";
    state.ui.show = "all";
    const showSelect = $("showSelect");
    if (showSelect) showSelect.value = "all";
    lsSet("show", "all");
    if (state.data) {
      renderFilterChips(state.data);
      renderBotsTable(state.data);
    }
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
}

/* ── Telegram link helper ── */
function telegramLinkHtml(handle) {
  if (!handle) return "";
  const clean = String(handle).replace(/^@/, "");
  return `<a href="https://t.me/${escapeHtml(clean)}" target="_blank" rel="noopener" style="color:var(--teal);text-decoration:none" title="Open in Telegram">@${escapeHtml(clean)}</a>`;
}

/* ── Filter highlight ── */
function highlightFilterMatch(text, query) {
  if (!query) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const qEscaped = escapeHtml(query);
  const re = new RegExp(escapeRegExp(qEscaped), "gi");
  return escaped.replace(re, m => `<span class="filterHighlight">${m}</span>`);
}

/* ── Batch selection ── */
function updateBatchBar() {
  const bar = $("batchBar");
  const countEl = $("batchCount");
  const actionsEl = $("batchActions");
  if (!bar || !countEl || !actionsEl) return;

  const n = state.batch.size;
  if (n === 0) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  countEl.textContent = t("batch_selected", { n });

  actionsEl.innerHTML = "";
  const addBtn = (label, cls, action) => {
    const b = document.createElement("button");
    b.className = `btn ${cls}`;
    b.textContent = label;
    b.addEventListener("click", () => doBatchAction(action));
    actionsEl.appendChild(b);
  };
  addBtn(t("batch_start_all"), "btnGood", "start");
  addBtn(t("batch_stop_all"), "btnDanger", "stop");
  addBtn(t("batch_restart_all"), "", "restart");
}

function toggleBatchUnit(unit) {
  const isChecked = !state.batch.has(unit);
  if (state.batch.has(unit)) state.batch.delete(unit);
  else state.batch.add(unit);
  
  // Visually update checkboxes for this unit
  for (const cb of document.querySelectorAll(`.rowCheckbox[data-unit="${unit}"]`)) {
    cb.checked = isChecked;
  }
  
  updateBatchBar();
  updateSelectAllCheckbox();
}

function clearBatch() {
  state.batch.clear();
  updateBatchBar();
  // Uncheck all checkboxes
  for (const cb of document.querySelectorAll(".rowCheckbox[data-unit]")) {
    cb.checked = false;
  }
  updateSelectAllCheckbox();
}

function updateSelectAllCheckbox() {
  const selectAll = $("selectAllCheckbox");
  if (!selectAll) return;
  const visible = state.visibleUnits || [];
  if (!visible.length) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
    return;
  }
  const selected = visible.filter(u => state.batch.has(u));
  selectAll.checked = selected.length === visible.length;
  selectAll.indeterminate = selected.length > 0 && selected.length < visible.length;
}

async function doBatchAction(action) {
  const units = Array.from(state.batch);
  if (!units.length) return;
  const label = action === "start" ? t("batch_start_all") : action === "stop" ? t("batch_stop_all") : t("batch_restart_all");
  const confirmed = await showConfirm(t("batch_confirm", { action: label, n: units.length }), {
    confirmLabel: t("do_it"),
    confirmClass: action === "stop" ? "btnDanger" : action === "start" ? "btnGood" : "btnDanger",
  });
  if (!confirmed) return;

  let ok = 0;
  let fail = 0;
  for (const unit of units) {
    try {
      await apiPost(`/api/units/${encodeURIComponent(unit)}/${encodeURIComponent(action)}`);
      ok++;
    } catch {
      fail++;
    }
  }
  const msg = fail > 0 ? `${ok} ok, ${fail} failed` : `${ok} ok`;
  showToast(label, msg, { type: fail > 0 ? "warn" : "good" });
  clearBatch();
  await refresh();
}

/* ── CSV Export ── */
function exportCsv() {
  if (!state.data || !state.data.bots) return;
  const bots = state.data.bots;
  const header = ["Name","Unit","Type","Status","Enabled","Uptime (s)","Tokens (24h)","Cost (24h)","Errors (24h)","Tokens (all)","Cost (all)","Last Activity"];
  const rows = bots.map(bot => {
    const sd = bot.systemd || {};
    const u24 = getUsageWindow(bot, "24h") || {};
    const all = (bot.usage && bot.usage.allTime) || {};
    const lastAct = bot.usage ? (bot.usage.lastActivityAt || "") : "";
    return [
      bot.displayName || bot.unit,
      bot.unit,
      bot.type || "",
      `${sd.activeState || ""}/${sd.subState || ""}`,
      sd.unitFileState || "",
      sd.uptimeSeconds || 0,
      u24.tokens || 0,
      u24.costUSD || 0,
      u24.errors || 0,
      all.tokens || 0,
      all.costUSD || 0,
      lastAct,
    ];
  });

  const escape = (v) => {
    const s = String(v == null ? "" : v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csv = [header.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bots-export-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(t("export_csv"), `${bots.length} bots`, { type: "good", duration: 2000 });
}

/* ── Enabled state badge ── */
function enabledBadgeHtml(unitFileState) {
  const label = unitFileStateLabel(unitFileState) || "-";
  const cls = enabledChipClass(unitFileState);
  if (!cls) return escapeHtml(label);
  return `<span class="enabledBadge ${cls}">${escapeHtml(label)}</span>`;
}

/* ── Bot type badge ── */
function typeBadgeHtml(botType) {
  if (!botType) return "";
  const lower = String(botType).toLowerCase();
  let cls = "typeGeneric";
  if (lower.includes("clawdbot")) cls = "typeClawdbot";
  else if (lower.includes("droid")) cls = "typeDroid";
  return `<span class="typeBadge ${cls}">${escapeHtml(botType)}</span>`;
}

function botCardInnerHtml(bot) {
  const isSelected = state.selectedUnit === bot.unit;
  const pinned = isPinned(bot.unit);
  const sd = bot.systemd || {};
  const dotCls = statusDotClass(bot);
  const usage24 = getUsageWindow(bot, "24h") || {};
  const hourly24h = (bot.usage && bot.usage.hourly24h) ? bot.usage.hourly24h : [];

  let sparkBars = "";
  if (hourly24h.length > 0) {
    const vals = hourly24h.map(h => (Number(h.tokens) || 0));
    const max = Math.max(1, ...vals);
    sparkBars = vals.map(v => {
      const h = Math.max(1, Math.round((v / max) * 24));
      return `<span class="botCardSparkBar" style="height:${h}px"></span>`;
    }).join("");
  }

  return `
    <div class="botCardPinned">\u{1F4CC}</div>
    <div class="botCardHeader">
      <div class="botCardTitleWrap">
        <h3 class="botCardTitle">${escapeHtml(bot.displayName || bot.unit)}</h3>
        <div class="botCardSub">${typeBadgeHtml(bot.type)}</div>
      </div>
      <div class="botCardStatus">
        <span class="statusDot ${dotCls}"></span>
        <span class="${dotCls}">${escapeHtml(systemdActiveLabel(sd.activeState))}</span>
      </div>
    </div>
    <div class="botCardStats">
      <div class="botCardStat">
        <span class="botCardStatLabel">${t("th_uptime")}</span>
        <span class="botCardStatVal">${fmtSeconds(sd.uptimeSeconds)}</span>
      </div>
      <div class="botCardStat">
        <span class="botCardStatLabel">${t("th_tokens24h")}</span>
        <span class="botCardStatVal">${fmtInt(usage24.tokens)}</span>
      </div>
      <div class="botCardStat">
        <span class="botCardStatLabel">${t("th_cost24h")}</span>
        <span class="botCardStatVal">${fmtMoneyUsd(usage24.costUSD)}</span>
      </div>
      <div class="botCardStat">
        <span class="botCardStatLabel">${t("th_errors24h")}</span>
        <span class="botCardStatVal${usage24.errors > 0 ? " bad" : ""}">${fmtInt(usage24.errors)}</span>
      </div>
    </div>
    <div class="botCardSparkline">
      ${sparkBars}
    </div>
    <div class="botCardActions">
      <button class="btn btnSmall btnDetails" data-action="details">${t("action_details")}</button>
      <button class="btn btnSmall btnSecondary" data-action="pin">${pinned ? t("unpin") : t("pin")}</button>
    </div>
  `;
}

function botRowHtml(bot, { animIdx = -1, isChecked = false, isSelected = false } = {}) {
  const activeState = String(bot.systemd && bot.systemd.activeState || "");
  const usage24 = getUsageWindow(bot, "24h") || {};
  const lastAct = bot.usage ? bot.usage.lastActivityAt : null;
  const hourly24h = (bot.usage && bot.usage.hourly24h) ? bot.usage.hourly24h : [];
  const daily30d = (bot.usage && bot.usage.daily30d) ? bot.usage.daily30d : [];

  const issues = getHealthIssues(bot);
  const primaryIssue = pickPrimaryIssue(issues);
  const primaryMsg = primaryIssue ? String(primaryIssue.message || primaryIssue.key || "") : "";
  const primarySev = primaryIssue ? String(primaryIssue.severity || "").toLowerCase() : "";

  const dotClass = statusDotClass(bot);
  const issueHtml = primaryMsg
    ? `<div class="issueLine ${primarySev === "error" ? "bad" : "warn"}">${escapeHtml(primaryMsg)}</div>`
    : `<div class="issueLine">&nbsp;</div>`;

  const pinStar = isPinned(bot.unit) ? "\u2605" : "\u2606";
  const pinCls = isPinned(bot.unit) ? "pinBtn pinned" : "pinBtn";
  const filterQ = String(state.ui.filter || "").trim();
  const displayName = highlightFilterMatch(bot.displayName || bot.unit, filterQ);
  
  let nameHtml = `<div class="providerName"><button class="${pinCls}" data-unit="${escapeHtml(bot.unit)}" data-action="pin" title="${isPinned(bot.unit) ? t("unpin") : t("pin")}">${pinStar}</button>${displayName}${typeBadgeHtml(bot.type)}</div>`;
  const metaParts = [];
  if (bot.telegramHandle) metaParts.push(telegramLinkHtml(bot.telegramHandle));
  
  const metaText = [];
  if (bot.type) metaText.push(bot.type);
  if (bot.profile) metaText.push(`${t("meta_profile")}:${bot.profile}`);
  if (bot.scope === "user") metaText.push(bot.user ? `${t("meta_user")}:${bot.user}` : t("scope_user"));
  if (bot.gatewayPort) metaText.push(`${t("meta_port")}:${bot.gatewayPort}`);
  metaText.push(`${t("meta_unit")}:${bot.unit}`);
  if (metaText.length) metaParts.push(escapeHtml(metaText.join(" \u2022 ")));
  if (metaParts.length) nameHtml += `<div class="providerMeta">${metaParts.join(" \u2022 ")}</div>`;

  const canStop = activeState === "active" || activeState === "activating" || activeState === "deactivating";
  const ufs = String(bot.systemd.unitFileState || "").toLowerCase();
  const canDisable = ufs.startsWith("enabled");
  const canEnable = ufs === "disabled" || ufs === "indirect";

  const errors24 = Number(usage24.errors) || 0;
  const restarts = Number(bot.systemd.nRestarts) || 0;
  
  let rowClasses = ["rowClickable"];
  if (isSelected) rowClasses.push("rowSelected");
  if (activeState === "active") rowClasses.push("rowStateActive");
  else if (["activating", "deactivating", "reloading"].includes(activeState)) rowClasses.push("rowStateTransition");
  else rowClasses.push("rowStateInactive");

  if (activeState !== "active" || worstHealthSeverity(issues) >= 2) rowClasses.push("rowBad");
  else if (errors24 > 0 || restarts > 0 || bot.systemd.subState !== "running" || worstHealthSeverity(issues) >= 1) rowClasses.push("rowWarn");

  const lastActMs = getBotLastActivityMs(bot);
  if (lastActMs > 0 && (Date.now() - lastActMs) < 5 * 60 * 1000) rowClasses.push("rowRecentActivity");
  if (isPinned(bot.unit)) rowClasses.push("rowPinned");

  const uptimeHtml = `${renderUptimeBar(bot.systemd.uptimeSeconds)}${restarts > 0 ? `<div class="restartsBadge" title="${t("sd_restarts")}">\u21bb ${restarts}</div>` : `<div class="restartsBadge">&nbsp;</div>`}`;
  const activityHtml = lastAct ? `<div class="activityLine" title="${escapeHtml(lastAct)}">${escapeHtml(relativeTime(lastAct))}</div>` : `<div class="activityLine">&nbsp;</div>`;

  const usageHtml = `<span class="usageToken">${fmtInt(usage24.tokens)} tok</span> <span class="usageCost">${fmtMoneyUsd(usage24.costUSD)}</span> ${errors24 > 0 ? `<span class="usageErr">${fmtInt(errors24)} err</span>` : `<span class="usageErr">&nbsp;</span>`}`;
  const sparkHtml = renderFullWidthSparklines(hourly24h, daily30d);

  const animStyle = (animIdx >= 0 && animIdx < 12) ? `style="animation-delay:${animIdx * 30}ms"` : "";
  const rowClsStr = rowClasses.join(" ") + (animIdx >= 0 && animIdx < 12 ? " rowAnimIn" : "");

  return `
      <tr class="${rowClsStr}" ${animStyle} data-unit="${escapeHtml(bot.unit)}">
        <td style="width:32px;padding-right:0;vertical-align:middle" rowspan="2"><input type="checkbox" class="rowCheckbox" data-unit="${escapeHtml(bot.unit)}" ${isChecked ? "checked" : ""} /></td>
        <td><div class="cellClip">${nameHtml}</div></td>
        <td><div class="cellClip"><span class="statusDot ${dotClass}"></span>${enabledBadgeHtml(bot.systemd.unitFileState)}${issueHtml}</div></td>
        <td><div class="cellClip">${uptimeHtml}${activityHtml}</div></td>
        <td class="num usageCell"><div class="cellClip">${usageHtml}</div></td>
        <td class="actionsTd" rowspan="2">
          <div class="actionsWrap">
            <div class="actions">
              ${canStop ? `<button class="btn btnSmall btnDanger" data-action="stop">${t("action_stop")}</button><button class="btn btnSmall" data-action="restart">${t("action_restart")}</button>` : `<button class="btn btnSmall btnGood" data-action="start">${t("action_start")}</button>`}
              ${canDisable ? `<button class="btn btnSmall btnDanger" data-action="disable">${t("action_disable")}</button>` : ""}
              ${canEnable ? `<button class="btn btnSmall btnGood" data-action="enable">${t("action_enable")}</button>` : ""}
              <button class="btn btnSmall btnDetails" data-action="details">${t("action_details")}</button>
            </div>
          </div>
        </td>
      </tr>
      <tr class="sparkRow ${rowClsStr}" ${animStyle} data-unit="${escapeHtml(bot.unit)}">
        <td colspan="4" class="sparkTd">${sparkHtml}</td>
      </tr>
  `;
}

/* ── Summary pill sparklines ── */
function renderPillSparkline(dailyAll, key, color) {
  if (!dailyAll || !dailyAll.length) return "";
  const vals = dailyAll.slice(-7).map(d => d[key] || 0);
  const max = Math.max(1, ...vals);
  const bars = vals.map(v => {
    const h = Math.max(1, Math.round((v / max) * 22));
    return `<span class="pillSparkBar" style="height:${h}px;background:${color}"></span>`;
  });
  return `<div class="pillSparkline">${bars.join("")}</div>`;
}

/* ── Fleet Health Bar ── */
function getFleetTooltipEl() {
  let el = $("fleetTooltip");
  if (el) return el;
  el = document.createElement("div");
  el.id = "fleetTooltip";
  el.className = "fleetTooltip";
  el.hidden = true;
  document.body.appendChild(el);
  return el;
}

function renderFleetBar(data) {
  const bar = $("fleetBar");
  const countsEl = $("fleetCounts");
  if (!bar) return;
  const bots = Array.isArray(data.bots) ? data.bots : [];
  bar.innerHTML = "";

  let goodCount = 0, warnCount = 0, badCount = 0;

  for (const bot of bots) {
    const seg = document.createElement("div");
    seg.className = "fleetSeg";
    seg.dataset.name = bot.displayName || bot.unit;
    const cls = statusDotClass(bot);
    seg.classList.add(cls);
    if (cls === "good") goodCount++;
    else if (cls === "warn") warnCount++;
    else badCount++;

    if (state.selectedUnit === bot.unit) seg.classList.add("selected");

    seg.addEventListener("click", () => toggleDetails(bot.unit));
    seg.addEventListener("mouseenter", (e) => {
      const tip = getFleetTooltipEl();
      const sd = bot.systemd || {};
      const statusLabel = `${systemdActiveLabel(sd.activeState)}${sd.subState ? " (" + systemdSubLabel(sd.subState) + ")" : ""}`;
      const usage24 = getUsageWindow(bot, "24h") || {};
      tip.textContent = `${bot.displayName || bot.unit}\n${statusLabel} • ${fmtInt(usage24.tokens)} tok • ${fmtMoneyUsd(usage24.costUSD)}`;
      tip.style.whiteSpace = "pre";
      tip.hidden = false;
      const pad = 10;
      let left = e.clientX + pad;
      let top = e.clientY - 40;
      const r = tip.getBoundingClientRect();
      if (left + r.width + 8 > window.innerWidth) left = e.clientX - r.width - pad;
      if (top < 8) top = 8;
      tip.style.left = `${Math.max(8, left)}px`;
      tip.style.top = `${Math.max(8, top)}px`;
    });
    seg.addEventListener("mousemove", (e) => {
      const tip = getFleetTooltipEl();
      if (tip.hidden) return;
      const pad = 10;
      let left = e.clientX + pad;
      let top = e.clientY - 40;
      const r = tip.getBoundingClientRect();
      if (left + r.width + 8 > window.innerWidth) left = e.clientX - r.width - pad;
      if (top < 8) top = 8;
      tip.style.left = `${Math.max(8, left)}px`;
      tip.style.top = `${Math.max(8, top)}px`;
    });
    seg.addEventListener("mouseleave", () => {
      const tip = getFleetTooltipEl();
      tip.hidden = true;
    });

    bar.appendChild(seg);
  }

  if (countsEl) {
    countsEl.innerHTML = `
      <span class="fleetCount"><span class="fleetCountDot" style="background:var(--good)"></span>${goodCount}</span>
      <span class="fleetCount"><span class="fleetCountDot" style="background:var(--warn)"></span>${warnCount}</span>
      <span class="fleetCount"><span class="fleetCountDot" style="background:var(--bad)"></span>${badCount}</span>
    `;
  }
}

/* ── Quick Filter Chips ── */
function renderFilterChips(data) {
  const el = $("filterChipsSection");
  if (!el) return;
  const bots = Array.isArray(data.bots) ? data.bots : [];

  const counts = { all: bots.length, active: 0, inactive: 0, issues: 0, clawdbot: 0, droid: 0 };
  for (const bot of bots) {
    const active = (bot.systemd && bot.systemd.activeState) === "active";
    if (active) counts.active++;
    else counts.inactive++;
    if (botHasIssues(bot)) counts.issues++;
    const type = String(bot.type || "").toLowerCase();
    if (type.includes("clawdbot")) counts.clawdbot++;
    else if (type.includes("droid")) counts.droid++;
  }

  const chips = [
    { key: "all", label: t("chip_all"), count: counts.all },
    { key: "active", label: t("chip_active"), count: counts.active },
    { key: "inactive", label: t("chip_inactive"), count: counts.inactive },
    { key: "issues", label: t("chip_issues"), count: counts.issues },
  ];
  if (counts.clawdbot > 0) chips.push({ key: "clawdbot", label: t("chip_clawdbot"), count: counts.clawdbot });
  if (counts.droid > 0) chips.push({ key: "droid", label: t("chip_droid"), count: counts.droid });

  el.innerHTML = chips.map(c => {
    const active = state.chipFilter === c.key ? "active" : "";
    return `<button class="filterChip ${active}" data-chip="${c.key}">${escapeHtml(c.label)}<span class="filterChipCount">${c.count}</span></button>`;
  }).join("");

  for (const btn of el.querySelectorAll("[data-chip]")) {
    btn.addEventListener("click", () => {
      state.chipFilter = btn.dataset.chip || "all";
      // Reset the show dropdown to "all" so they don't conflict
      state.ui.show = "all";
      const showSelect = $("showSelect");
      if (showSelect) showSelect.value = "all";
      lsSet("show", "all");
      if (state.data) {
        renderFilterChips(state.data);
        renderBotsTable(state.data);
      }
    });
  }
}

/* ── Browser Notifications ── */
function canNotify() {
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

async function requestNotifications() {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") {
    showToast(t("notif_denied"), "", { type: "warn", duration: 3000 });
    return false;
  }
  const result = await Notification.requestPermission();
  if (result === "granted") {
    showToast(t("notif_enabled"), "", { type: "good", duration: 2000 });
    return true;
  }
  return false;
}

function sendBrowserNotification(title, body, { tag = "bots-dashboard" } = {}) {
  if (!canNotify()) return;
  try {
    const n = new Notification(title, {
      body,
      tag,
      icon: "/favicon-192x192.png",
      silent: false,
    });
    n.onclick = () => { window.focus(); n.close(); };
    setTimeout(() => n.close(), 10000);
  } catch { /* ignore */ }
}

/* ── Status Change Detection ── */
function detectStatusChanges(oldData, newData) {
  if (!oldData || !oldData.bots || !newData || !newData.bots) return;
  const oldMap = {};
  for (const b of oldData.bots) oldMap[b.unit] = b;

  for (const bot of newData.bots) {
    const old = oldMap[bot.unit];
    if (!old) continue;
    const oldActive = String(old.systemd && old.systemd.activeState || "");
    const newActive = String(bot.systemd && bot.systemd.activeState || "");
    const name = bot.displayName || bot.unit;

    if (oldActive === newActive) continue;

    if (oldActive === "active" && newActive !== "active") {
      if (newActive === "activating") {
        showToast(t("status_restarting", { name }), "", { type: "warn", duration: 5000 });
      } else {
        showToast(t("status_went_down", { name }), `${systemdActiveLabel(newActive)}`, { type: "bad", duration: 6000 });
        sendBrowserNotification(t("status_went_down", { name }), systemdActiveLabel(newActive), { tag: `down-${bot.unit}` });
      }
    } else if (oldActive !== "active" && newActive === "active") {
      showToast(t("status_came_up", { name }), "", { type: "good", duration: 4000 });
      sendBrowserNotification(t("status_came_up", { name }), "", { tag: `up-${bot.unit}` });
    }
  }
}

/* ── Summary Trend Indicators ── */
function calcTrend(daily, key) {
  if (!daily || daily.length < 2) return null;
  const recent = daily.slice(-1)[0];
  const prev = daily.slice(-2, -1)[0];
  const cur = (recent && recent[key]) || 0;
  const old = (prev && prev[key]) || 0;
  if (old === 0 && cur === 0) return { dir: "flat", pct: 0 };
  if (old === 0) return { dir: "up", pct: 100 };
  const pct = Math.round(((cur - old) / old) * 100);
  if (pct > 0) return { dir: "up", pct };
  if (pct < 0) return { dir: "down", pct };
  return { dir: "flat", pct: 0 };
}

function trendHtml(trend) {
  if (!trend || trend.dir === "flat") return "";
  const arrow = trend.dir === "up" ? "\u2191" : "\u2193";
  const cls = trend.dir === "up" ? "up" : "down";
  const pct = Math.abs(trend.pct);
  return `<span class="pillTrend ${cls}">${arrow}${pct}%</span>`;
}

/* ── Keyboard shortcuts help ── */
function showShortcuts() {
  const overlay = $("shortcutsOverlay");
  if (!overlay) return;
  const grid = $("shortcutsGrid");
  if (grid) {
    const shortcuts = [
      { keys: ["\u2318K / Ctrl+K"], desc: t("sc_cmd_palette") },
      { keys: ["Enter", "Click"], desc: t("sc_open_details") },
      { keys: ["Esc"], desc: t("sc_close") },
      { keys: ["\u2190 / K", "\u2192 / J"], desc: t("sc_prev_next") },
      { keys: ["R"], desc: t("sc_refresh") },
      { keys: ["/"], desc: t("sc_filter") },
      { keys: ["A"], desc: t("sc_select_all") },
      { keys: ["L"], desc: "Load logs (in details)" },
      { keys: ["N"], desc: t("notif_enable") },
      { keys: ["?"], desc: t("sc_shortcuts") },
    ];
    grid.innerHTML = shortcuts.map(s => `
      <div class="shortcutRow">
        <span class="shortcutKeys">${s.keys.map(k => `<span class="kbd">${escapeHtml(k)}</span>`).join("")}</span>
        <span class="shortcutDesc">${escapeHtml(s.desc)}</span>
      </div>
    `).join("");
  }
  overlay.hidden = false;
}

function hideShortcuts() {
  const overlay = $("shortcutsOverlay");
  if (overlay) overlay.hidden = true;
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
  const push = (text, { klass = "", mono = false, link = false } = {}) => {
    const s = String(text || "").trim();
    if (!s) return;
    chips.push({ text: s, klass: String(klass || "").trim(), mono: Boolean(mono), link: Boolean(link) });
  };

  if (bot.telegramHandle) push(bot.telegramHandle, { link: true });
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

  // Data freshness
  if (state.data && state.data.generatedAt) {
    push(t("data_from", { time: relativeTime(state.data.generatedAt) || fmtIso(state.data.generatedAt) }));
  }

  metaEl.innerHTML = chips.map((c) => {
    const cls = ["metaChip", c.klass].filter(Boolean).join(" ");
    let inner;
    if (c.link && c.text.startsWith("@")) {
      const clean = c.text.replace(/^@/, "");
      inner = `<a href="https://t.me/${escapeHtml(clean)}" target="_blank" rel="noopener">@${escapeHtml(clean)}</a>`;
    } else if (c.mono) {
      inner = `<code>${escapeHtml(c.text)}</code>`;
    } else {
      inner = escapeHtml(c.text);
    }
    return `<span class="${cls}" title="${escapeHtml(c.text)}">${inner}</span>`;
  }).join("");
}

function inferBotDocsKind(bot) {
  const unit = String(bot && bot.unit || "");
  if (!unit) return "chat";
  if (unit.startsWith("cli-bridge-gateway-") || unit === "kimi-cli-gateway.service") return "cli";
  if (unit.startsWith("clawdbot-") && unit.endsWith("-telegram.service")) return "chat";
  if (unit.includes("droid") || unit.includes("claudeminimax2bot")) return "local_cli";
  return "chat";
}

function inferBotDocsBackend(bot, doc, lang) {
  const isRu = lang === "ru";
  const combined = [
    bot && bot.displayName,
    bot && bot.telegramHandle,
    doc && doc.how,
  ].map(v => String(v || "")).join(" ");

  if (/Claude/i.test(combined) && /MiniMax/i.test(combined)) {
    return isRu ? "Claude Code CLI через MiniMax" : "Claude Code CLI via MiniMax";
  }
  if (/Claude/i.test(combined)) {
    return isRu ? "Claude" : "Claude";
  }
  if (/Antigravity/i.test(combined)) {
    return isRu ? "Antigravity CLI" : "Antigravity CLI";
  }
  if (/Kimi/i.test(combined)) {
    return isRu ? "Kimi CLI" : "Kimi CLI";
  }
  if (/MiniMax/i.test(combined)) {
    return isRu ? "MiniMax" : "MiniMax";
  }
  if (/Droid/i.test(combined)) {
    return isRu ? "Droid CLI" : "Droid CLI";
  }
  if (/Codex|GPT/i.test(combined)) {
    return isRu ? "Codex CLI" : "Codex CLI";
  }
  return isRu ? "AI-бэкенд этого бота" : "this bot's AI backend";
}

function inferBotRuntimeName(bot) {
  const explicit = String(bot && bot.runtimeName || "").trim().toLowerCase();
  if (explicit) return explicit;
  const execStart = String(bot && bot.execStart || "").trim().toLowerCase();
  if (execStart.includes("openclaw")) return "openclaw";
  if (execStart.includes("clawdbot")) return "clawdbot";
  if (execStart.includes("python")) return "python";
  return "";
}

function buildBotDocsFallback(bot, doc, lang) {
  const isRu = lang === "ru";
  const kind = inferBotDocsKind(bot);
  const backend = inferBotDocsBackend(bot, doc, lang);
  const hasBrowser = /browser/i.test(String(doc && doc.how || "")) || /browser/i.test(JSON.stringify(doc && doc.can || []));
  const profile = String(bot && bot.profile || "").trim();
  const gatewayPort = String(bot && bot.gatewayPort || "").trim();
  const scope = String(bot && bot.scope || "").trim();
  const stateDir = String(bot && bot.stateDir || "").trim();
  const shortState = stateDir ? stateDir.split("/").filter(Boolean).slice(-1)[0] : "";
  const execStart = String(bot && bot.execStart || "").trim();
  const runtimeName = inferBotRuntimeName(bot);
  const gatewayFamilyLabel = runtimeName === "openclaw" ? "OpenClaw" : "Clawdbot";
  const runtimeCommandText = execStart || (runtimeName === "openclaw"
    ? "/usr/bin/openclaw gateway"
    : runtimeName === "clawdbot"
      ? "/usr/bin/clawdbot gateway"
      : "");
  const sourceLabel = profile
    ? (isRu ? `профиль ${profile}` : `the ${profile} profile`)
    : (isRu ? "конфиг этого сервиса" : "this service's config");
  const sourceFrom = profile
    ? (isRu ? `профиля ${profile}` : `the ${profile} profile`)
    : (isRu ? "конфига этого сервиса" : "this service's config");
  const legacyCompatLine = isRu
    ? "OpenClaw умеет читать и legacy CLAWDBOT_* переменные/пути, поэтому миграция может пройти мягко, но это всё равно именно миграция runtime-слоя."
    : "OpenClaw can read legacy CLAWDBOT_* env vars and paths, so migration can be gentle, but it is still a runtime migration rather than a no-op rename.";

  if (kind === "cli") {
    return {
      how: isRu
        ? "Этот бот принимает задачи из Telegram и запускает локальные CLI-джобы в разрешённых workspace через gateway + cli-bridge."
        : "This bot accepts tasks from Telegram and runs local CLI jobs inside allowed workspaces through the gateway + cli-bridge stack.",
      can: isRu
        ? [
            "Запускать кодовые задачи и возвращать прогресс по ходу выполнения.",
            "Использовать настроенный CLI-бэкенд и ограничения этого бота.",
          ]
        : [
            "Run coding tasks and stream progress while they execute.",
            "Use this bot's configured CLI backend and safety limits.",
          ],
      cannot: isRu
        ? [
            "Не работает как обычный чат-бот: основной режим здесь именно выполнение задач.",
            "Не выходит за пределы разрешённых workspace и правил запуска этого бота.",
          ]
        : [
            "It is not a plain chat bot: its main mode is executing tasks.",
            "It does not go outside the allowed workspaces and runtime rules configured for this bot.",
          ],
      steps: isRu
        ? [
            "Вы отправляете задачу в Telegram.",
            `Gateway принимает запрос и передаёт его в cli-bridge, который готовит запуск через ${backend}.`,
            "Бот определяет подходящий workspace и проверяет свои лимиты, правила безопасности и таймауты.",
            "Если раннер занят, задача встаёт в очередь; если свободен, CLI стартует сразу.",
            "CLI выполняет шаги внутри разрешённого workspace и пишет прогресс по мере работы.",
            "Бот отправляет в Telegram промежуточные статусы, а затем итоговый результат или ошибку.",
          ]
        : [
            "You send a task in Telegram.",
            `The gateway receives the request and hands it to cli-bridge, which prepares a ${backend} run.`,
            "The bot chooses the right workspace and applies its time limits, safety rules, and runtime configuration.",
            "If the runner is busy, the request waits in queue; otherwise the CLI starts immediately.",
            "The CLI works inside an allowed workspace and emits progress while the task is running.",
            "The bot sends Telegram status updates and then posts the final result or failure.",
          ],
      behind: isRu
        ? [
            `Основа этого бота: Clawdbot gateway${gatewayPort ? ` на localhost:${gatewayPort}` : ""} + cli-bridge.`,
            `${backend} запускается как локальный CLI-процесс, а не как обычный чат-ответ модели.`,
            "Запросы не теряются, если бот занят: они могут ждать своей очереди по правилам конкретного сервиса.",
            "CLI работает только в разрешённых workspace и не должен выходить за пределы настроенной среды.",
            scope === "user"
              ? "Это пользовательский systemd-сервис, поэтому он работает в user-scope, а не как root/system unit."
              : "Это systemd-сервис системного уровня, поэтому управление и рестарты идут через systemd.",
          ]
        : [
            `This bot is powered by Clawdbot gateway${gatewayPort ? ` on localhost:${gatewayPort}` : ""} plus cli-bridge.`,
            `${backend} runs as a local CLI process, not as a normal one-shot chat completion.`,
            "Requests are not dropped just because the bot is busy: they can wait in queue according to this service's rules.",
            "The CLI only works inside allowed workspaces and is expected to stay within that configured environment.",
            scope === "user"
              ? "This is a user-scoped systemd service, so it runs in user scope rather than as a root/system unit."
              : "This is a system-level service, so lifecycle control and restarts are handled by systemd.",
          ],
      telegram: isRu
        ? [
            "Обычно сначала вы увидите короткое подтверждение или сообщение о постановке в очередь.",
            "Во время длинных задач бот может присылать апдейты прогресса вместо одного мгновенного ответа.",
            "Финал чаще выглядит как summary выполненной работы, а не как обычный разговорный абзац.",
            "Если задача упала, бот обычно возвращает сообщение об ошибке или короткое описание места сбоя.",
          ]
        : [
            "You usually see a short acknowledgement or queued status first.",
            "During longer tasks, the bot may send progress updates instead of a single instant reply.",
            "The ending is usually a work summary or result, not just a conversational paragraph.",
            "If the task fails, the bot typically returns an error message or short failure summary.",
          ],
      bestFor: isRu
        ? [
            "Исправления в репозитории, реализация фич и технические задачи, где нужен реальный CLI-раннер.",
            "Отладка, когда важно видеть прогресс или дождаться финального результата после нескольких шагов.",
            "Задачи, которые могут занять время и не обязаны отвечать мгновенно как обычный чат.",
          ]
        : [
            "Repo fixes, feature implementation, and technical tasks that need a real CLI runner.",
            "Debugging flows where progress visibility matters and the bot may need several execution steps.",
            "Longer tasks that do not need an instant conversational answer.",
          ],
      gatewayRole: isRu
        ? [
            `Clawdbot gateway — это локальный рантайм бота${gatewayPort ? `, который слушает порт ${gatewayPort}` : ""} и принимает запросы для этого сервиса.`,
            "Он не просто вызывает модель: он связывает Telegram/коннектор, конфиг, auth/state и запуск нужного backend или plugin.",
            "В CLI-ботах через него работает ещё и cli-bridge: gateway принимает задачу, а plugin превращает её в локальный CLI-run.",
          ]
        : [
            `Clawdbot gateway is the local bot runtime${gatewayPort ? ` listening on port ${gatewayPort}` : ""} that receives requests for this service.`,
            "It does more than call a model once: it ties together Telegram/connector input, config, auth/state, and the chosen backend or plugin.",
            "For CLI bots, cli-bridge hangs off that gateway: the gateway accepts the task, and the plugin turns it into a local CLI run.",
          ],
      runtimeActive: isRu
        ? [
            runtimeCommandText
              ? `Сейчас systemd запускает команду: ${runtimeCommandText}.`
              : "Сейчас этот бот работает как gateway-runtime поверх cli-bridge.",
            runtimeName === "clawdbot"
              ? "То есть даже если пакет выше по течению уже называется OpenClaw, конкретно этот сервис всё ещё сидит на бинарнике clawdbot."
              : runtimeName === "openclaw"
                ? "Этот сервис уже стартует через OpenClaw, а не через старый бинарник clawdbot."
                : "Ключевой факт: здесь есть отдельный runtime между Telegram и CLI, а не прямой запуск модели.",
            shortState
              ? `Его состояние и auth привязаны к runtime-папке ${shortState}, поэтому это не одноразовый скрипт без памяти.`
              : "У него есть собственный lifecycle, состояние и auth-слой, поэтому это не одноразовый скрипт без памяти.",
          ]
        : [
            runtimeCommandText
              ? `Systemd currently starts this service with: ${runtimeCommandText}.`
              : "This bot is currently running as a gateway runtime in front of cli-bridge.",
            runtimeName === "clawdbot"
              ? "So even if the upstream package is now called OpenClaw, this specific service is still on the clawdbot binary today."
              : runtimeName === "openclaw"
                ? "This service already starts through OpenClaw rather than the older clawdbot binary."
                : "The important part is that a real runtime sits between Telegram and the CLI, not just a direct model call.",
            shortState
              ? `Its state and auth are tied to the ${shortState} runtime directory, so this is not a stateless one-shot wrapper.`
              : "It has its own lifecycle, state, and auth layer, so this is not a stateless one-shot wrapper.",
          ],
      runtimeUpdate: isRu
        ? [
            runtimeName === "clawdbot"
              ? "Если вы обновите только пакет openclaw, а unit по-прежнему вызывает clawdbot, для этого бота прямо сейчас не изменится ничего."
              : "Если вы обновляете тот же самый runtime, бот может продолжить жить на том же Telegram-аккаунте и с тем же профилем.",
            runtimeName === "clawdbot"
              ? `Если обновится сам clawdbot по этому же пути, бот обычно сохранит тот же Telegram handle, тот же ${sourceLabel} и тот же backend (${backend}), но могут поменяться transport, очередь, plugin-поведение или auth-детали.`
              : `Если этот unit уже переведён на OpenClaw, то дальнейшие обновления обычно меняют transport/plugin/runtime-поведение, но не сам Telegram-бот и не выбранный backend (${backend}).`,
            runtimeName === "clawdbot"
              ? "Если unit вручную переключить на openclaw и сохранить совместимость профиля/state, бот может продолжить работать как раньше, просто уже на новом runtime-слое."
              : "Если же совместимость профиля, state или plugin-схемы нарушится, сервис может не стартовать или потерять кусок поведения, хотя сам Telegram handle останется тем же.",
            legacyCompatLine,
          ]
        : [
            runtimeName === "clawdbot"
              ? "If you update only the openclaw package while this unit still calls clawdbot, nothing changes for this bot right away."
              : "When you update the same runtime in place, the bot can usually keep the same Telegram identity and profile.",
            runtimeName === "clawdbot"
              ? `If the clawdbot binary itself gets updated at this same path, the bot usually keeps the same Telegram handle, ${sourceLabel}, and backend (${backend}), but transport, queueing, plugin behavior, or auth details can change.`
              : `If this unit is already on OpenClaw, later updates usually change transport/plugin/runtime behavior, not the Telegram bot identity or chosen backend (${backend}).`,
            runtimeName === "clawdbot"
              ? "If you manually switch the unit to openclaw and preserve profile/state compatibility, the bot can keep working much the same way, just on the renamed runtime layer."
              : "If profile, state, or plugin compatibility breaks, the service may fail to start or lose part of its behavior even though the Telegram handle stays the same.",
            legacyCompatLine,
          ],
      runtimeModel: isRu
        ? [
            `${gatewayFamilyLabel}/OpenClaw — это не модель, а runtime-обвязка вокруг Telegram, состояния и запуска backend.`,
            `Сама модель или backend берётся из ${sourceFrom}${backend ? ` и сейчас это ${backend}` : ""}.`,
            "Поэтому обновление runtime не превращает бота в custom model само по себе: оно меняет оболочку, transport и интеграции, а не веса модели.",
          ]
        : [
            `${gatewayFamilyLabel}/OpenClaw is not the model; it is the runtime shell around Telegram transport, state, and backend launch.`,
            `The actual model or backend is chosen by ${sourceLabel}${backend ? ` and is currently ${backend}` : ""}.`,
            "So updating the runtime does not turn the bot into a custom model by itself; it changes the shell, transport, and integrations, not the model weights.",
          ],
      gatewaySize: isRu
        ? [
            "Это не маленький prompt-хак и не просто skill: это отдельный сервисный слой со своим lifecycle.",
            `На практике размер здесь такой: один systemd-сервис${gatewayPort ? `, один gateway-порт (${gatewayPort})` : ""}${shortState ? ` и одна state-папка (${shortState})` : ""}.`,
            "Он держит маршрутизацию, очереди/состояние, auth-профили и интеграцию с локальными инструментами.",
          ]
        : [
            "This is not a tiny prompt trick and not just a skill: it is a separate service layer with its own lifecycle.",
            `In practice, the footprint looks like: one systemd service${gatewayPort ? `, one gateway port (${gatewayPort})` : ""}${shortState ? `, and one state directory (${shortState})` : ""}.`,
            "It owns routing, queue/state handling, auth profiles, and integration with local tools.",
          ],
      gatewayReplace: isRu
        ? [
            "Да, заменить можно, но только другим бот-рантаймом, который сам умеет принимать Telegram-сообщения, держать состояние и запускать backend/CLI.",
            "Skill не заменяет gateway: skill лишь меняет инструкции или поведение внутри уже существующего рантайма.",
            "MCP тоже не является полной заменой: MCP даёт инструменты/интеграции, но не берёт на себя Telegram transport, session state и очередь выполнения.",
            "Примеры реальной замены в этом workspace уже есть: droidminimaxbot и claudeminimax2bot обходятся без Clawdbot gateway и используют свои Python-runner'ы.",
          ]
        : [
            "Yes, but only with another bot runtime that can receive Telegram messages, keep state, and launch the backend/CLI itself.",
            "A skill does not replace the gateway: it only changes instructions or behavior inside an existing runtime.",
            "MCP is not a full replacement either: MCP provides tools/integrations, but it does not take over Telegram transport, session state, or execution queueing by itself.",
            "There are real replacement examples in this workspace already: droidminimaxbot and claudeminimax2bot bypass Clawdbot gateway and use their own Python runners.",
          ],
      gatewayMissing: isRu
        ? [
            `Если убрать сам gateway у этого бота, Telegram-запросам больше некуда будет приходить локально${gatewayPort ? ` на порт ${gatewayPort}` : ""}.`,
            "Профиль, state, auth и маршрутизация backend исчезнут вместе с этим runtime-слоем.",
            "Для CLI-бота дополнительно пропадёт путь gateway -> cli-bridge -> локальный CLI, то есть задачи просто перестанут запускаться.",
            "Итог: бот станет либо полностью offline, либо его придётся заменить другим полноценным рантаймом.",
          ]
        : [
            `If you remove the gateway from this bot, Telegram requests no longer have a local runtime to land on${gatewayPort ? ` at port ${gatewayPort}` : ""}.`,
            "The profile, state, auth handling, and backend routing disappear with that runtime layer.",
            "For a CLI bot, the gateway -> cli-bridge -> local CLI path also disappears, so jobs simply stop launching.",
            "End result: the bot becomes effectively offline unless another full runtime replaces it.",
          ],
      skillMissing: isRu
        ? [
            "Если убрать только skill, бот обычно не умирает и не исчезает из Telegram.",
            "Он продолжит принимать сообщения через тот же gateway/runtime, но станет менее специализированным.",
            "Пример: coding-бот может отвечать более общо, забыть внутренние правила команды или перестать следовать желаемому workflow.",
          ]
        : [
            "If you remove only a skill, the bot usually does not die and does not disappear from Telegram.",
            "It still receives messages through the same gateway/runtime, but becomes less specialized.",
            "Example: a coding bot may answer more generically, forget team-specific rules, or stop following the preferred workflow.",
          ],
      mcpMissing: isRu
        ? [
            "Если убрать MCP или другой tool bridge, transport/runtime всё ещё остаётся живым, поэтому бот обычно продолжает отвечать.",
            "Но пропадают именно tool-capabilities: открыть страницу, сходить в интеграцию, прочитать внешний источник, дернуть локальный сервис.",
            "Пример: бот сможет сказать «я не могу открыть страницу сейчас» или ответит только из памяти вместо реального tool-run.",
          ]
        : [
            "If you remove MCP or another tool bridge, the transport/runtime still exists, so the bot usually keeps replying.",
            "What disappears is the tool capability itself: opening a page, calling an integration, reading an external source, or hitting a local service.",
            "Example: the bot may say it cannot inspect a page right now, or answer only from memory instead of performing a real tool run.",
          ],
      bypass: isRu
        ? [
            "Обход gateway означает не «выключить один флаг», а написать или запустить другой runtime вместо него.",
            "Новый runtime должен сам делать Telegram polling/webhook, хранить историю, держать auth, запускать backend и возвращать ответ.",
            "Прямой пример из этого workspace: droidminimaxbot и claudeminimax2bot принимают сообщения своим Python-кодом без Clawdbot gateway.",
          ]
        : [
            "Bypassing the gateway does not mean flipping one flag off; it means running a different runtime in its place.",
            "That new runtime must do its own Telegram polling/webhook handling, history/state, auth, backend launch, and response delivery.",
            "Direct examples from this workspace: droidminimaxbot and claudeminimax2bot receive messages through their own Python code without Clawdbot gateway.",
          ],
      examples: isRu
        ? [
            {
              title: "Исправить баг в репозитории",
              steps: [
                "Вы пишете, что сломалось, и указываете нужный проект.",
                "Бот решает, в каком workspace можно выполнять эту задачу, и готовит запуск CLI.",
                "Если сейчас уже идёт другая работа, ваш запрос ждёт в очереди; иначе стартует сразу.",
                "Во время выполнения в чат приходят промежуточные апдейты или статусы.",
                "Когда задача заканчивается, бот присылает summary результата, ошибок или списка изменённых файлов.",
              ],
            },
            {
              title: "Длинная задача, когда бот уже занят",
              steps: [
                "Вы отправляете новую задачу, пока другая ещё выполняется.",
                "Запрос ставится в очередь по правилам этого бота.",
                "Когда слот освобождается, cli-bridge автоматически запускает CLI-процесс для вашей задачи.",
                "Во время выполнения вы начинаете получать уже ваши апдейты прогресса.",
                "Вы получаете итог без ручного перезапуска процесса или повторной отправки запроса.",
              ],
            },
          ]
        : [
            {
              title: "Fix a bug in a repo",
              steps: [
                "You describe the issue and point to the right project.",
                "The bot resolves which workspace it is allowed to use and prepares the CLI run.",
                "If another job is already running, your request waits in queue; otherwise it starts immediately.",
                "Progress updates arrive in the chat while the task runs.",
                "The bot finishes with the result, errors, or changed files summary.",
              ],
            },
            {
              title: "Send a long task while the bot is busy",
              steps: [
                "You send a new task while another one is still running.",
                "The request is queued according to this bot's concurrency rules.",
                "When a slot opens, cli-bridge starts the CLI run automatically.",
                "You begin receiving your own progress updates as soon as the run starts.",
                "You receive the final result without manually restarting anything or re-sending the task.",
              ],
            },
          ],
    };
  }

  if (kind === "local_cli") {
    const isClaudeMiniMax = String(bot && bot.unit || "").includes("claudeminimax2bot");
    return {
      how: isRu
        ? "Это кастомный телеграм-бот, который хранит локальную историю чата и запускает CLI для каждого запроса."
        : "This is a custom Telegram bot that keeps local chat history and launches a CLI process for each request.",
      can: isRu
        ? [
            "Продолжать диалог с сохранённым контекстом и текущими настройками workspace.",
            isClaudeMiniMax ? "Останавливать зависший запуск командой /cancel." : "Менять рабочий репозиторий командами бота, если это включено.",
          ]
        : [
            "Continue a conversation with saved context and current workspace settings.",
            isClaudeMiniMax ? "Stop a stuck run with /cancel." : "Change the working repo with bot commands when enabled.",
          ],
      cannot: isRu
        ? [
            "Это не Clawdbot gateway: здесь нет общей очереди задач между ботами.",
            "Каждый запрос ограничен таймаутами и guardrail-настройками конкретного бота.",
          ]
        : [
            "This is not a Clawdbot gateway bot: there is no shared job queue across bots.",
            "Each request is limited by this bot's timeout and guardrail settings.",
          ],
      steps: isRu
        ? [
            "Вы отправляете сообщение или команду в Telegram.",
            "Python-бот поднимает историю этого чата и текущие настройки workspace.",
            `Для запроса запускается ${backend}, который работает не «в пустоте», а с учётом локально сохранённого контекста.`,
            "Если для этого бота есть guardrail-ограничения, watchdog или команды управления, они применяются к запуску.",
            "Ответ возвращается в Telegram, а история диалога и состояние этого чата обновляются локально.",
          ]
        : [
            "You send a Telegram message or command.",
            "The Python bot restores this chat's history and current workspace settings.",
            `${backend} is launched for the request and works with the locally saved chat context rather than starting from scratch.`,
            "Any guardrails, watchdogs, or control commands configured for this bot apply to the run.",
            "The reply is returned to Telegram and the local chat history/state is updated afterward.",
          ],
      behind: isRu
        ? [
            "Это не универсальный gateway-сервис: здесь работает кастомный Python-бот со своей логикой обработки чатов.",
            "У каждого чата есть локальная история, поэтому follow-up запросы могут продолжать прошлый контекст точнее, чем одноразовый запуск.",
            `${backend} стартует как локальный процесс на каждый запрос или активный run этого чата.`,
            String(bot && bot.unit || "").includes("claudeminimax2bot")
              ? "Для Claude MiniMax есть защита от зависаний: один активный запуск на чат, watchdog и команда /cancel."
              : "Для этих ботов поведение сильнее зависит от локального конфига, history и команд типа /repo или /setrepo.",
          ]
        : [
            "This is not a generic gateway service: it is a custom Python bot with its own chat-handling logic.",
            "Each chat has local history, so follow-up requests can continue prior context more precisely than a one-off run.",
            `${backend} starts as a local process for each request or active run in that chat.`,
            String(bot && bot.unit || "").includes("claudeminimax2bot")
              ? "Claude MiniMax includes anti-stuck guardrails: one active run per chat, a watchdog, and /cancel."
              : "These bots depend more on local config, stored history, and commands such as /repo or /setrepo.",
          ],
      telegram: isRu
        ? [
            "Снаружи это похоже на чат-бота, но почти каждый запрос реально запускает CLI под капотом.",
            "Follow-up сообщения обычно чувствуют прошлый контекст, потому что история этого чата сохраняется локально.",
            String(bot && bot.unit || "").includes("claudeminimax2bot")
              ? "Если запуск завис, вы можете прервать его через /cancel и сразу отправить новую задачу."
              : "Если у бота включены команды управления workspace, вы можете переключать проект прямо из Telegram.",
          ]
        : [
            "From the outside it feels like a chat bot, but most requests really launch a CLI process underneath.",
            "Follow-up messages usually preserve earlier context because this chat's history is stored locally.",
            String(bot && bot.unit || "").includes("claudeminimax2bot")
              ? "If a run gets stuck, you can stop it with /cancel and immediately send a new request."
              : "When workspace-management commands are enabled, you can switch projects directly from Telegram.",
          ],
      bestFor: isRu
        ? [
            "Повторяющиеся диалоги по одному и тому же проекту, где важна локальная память чата.",
            "Работа, где нужно управлять контекстом чата вручную, а не через общую очередь gateway.",
            "Сценарии, где полезны команды управления вроде /repo, /setrepo или /cancel.",
          ]
        : [
            "Repeated conversations about the same project where per-chat local memory is valuable.",
            "Workflows where you want manual chat-level context control instead of a shared gateway queue.",
            "Scenarios where commands such as /repo, /setrepo, or /cancel are useful.",
          ],
      gatewayRole: isRu
        ? [
            "Этот бот уже не сидит на Clawdbot gateway: Telegram-сообщения идут прямо в его кастомный Python-runner.",
            `Именно этот runner сам решает, как поднимать ${backend}, хранить историю и обрабатывать команды для чата.`,
            "То есть здесь gateway уже фактически заменён отдельной реализацией бота.",
          ]
        : [
            "This bot already sits outside Clawdbot gateway: Telegram messages go straight into its custom Python runner.",
            `That runner itself decides how to launch ${backend}, keep history, and handle chat-level commands.`,
            "So in this case the gateway has already been replaced by a dedicated bot implementation.",
          ],
      runtimeActive: isRu
        ? [
            runtimeCommandText
              ? `Сейчас systemd запускает не clawdbot/openclaw, а команду: ${runtimeCommandText}.`
              : "Этот бот уже работает на своём отдельном runtime, а не на Clawdbot/OpenClaw gateway.",
            "То есть обновление пакета clawdbot/openclaw само по себе не пересадит этот бот на другой runtime.",
            isClaudeMiniMax
              ? "У Claude MiniMax runner может читать auth из clawdbot-папок, но это shared credentials, а не доказательство того, что сам runtime всё ещё clawdbot."
              : "Даже если где-то используются старые clawdbot/openclaw state или auth-файлы, это ещё не означает, что сам transport-слой бота работает на gateway.",
          ]
        : [
            runtimeCommandText
              ? `Systemd currently starts this service with ${runtimeCommandText}, not with clawdbot/openclaw.`
              : "This bot already runs on its own dedicated runtime rather than on Clawdbot/OpenClaw gateway.",
            "So updating the clawdbot/openclaw package alone does not move this bot onto a different runtime.",
            isClaudeMiniMax
              ? "Claude MiniMax may read auth from clawdbot directories, but that is shared credential storage, not proof that the runtime is still clawdbot."
              : "Even if old clawdbot/openclaw state or auth files are reused somewhere, that still does not mean the bot transport layer itself is running on the gateway.",
          ],
      runtimeUpdate: isRu
        ? [
            "Если обновить openclaw или clawdbot, а этот unit по-прежнему запускает Python-runner, Telegram-поведение этого бота обычно не изменится напрямую.",
            "Изменения будут только если этот кастомный runner сам зависит от формата auth/state, который раньше генерировал clawdbot/openclaw, и новая совместимость сломается.",
            "То есть для такого бота реальное изменение происходит не от rename пакета, а от правок в коде runner'а или в его конфиге/провайдере.",
          ]
        : [
            "If you update openclaw or clawdbot while this unit still launches its Python runner, this bot's Telegram behavior usually does not change directly.",
            "The main exception is when that custom runner depends on auth/state formats previously produced by clawdbot/openclaw and compatibility there breaks.",
            "So for a bot like this, the real behavior change comes from runner code or config changes, not from the package rename by itself.",
          ],
      runtimeModel: isRu
        ? [
            "Здесь кастомный именно runtime, а не обязательно кастомная модель.",
            `Сам backend/model по-прежнему берётся из конфига этого runner'а${backend ? ` и сейчас это ${backend}` : ""}.`,
            "То есть custom bot в этом случае означает «своя транспортная и orchestration-логика», а не «свои веса модели».",
          ]
        : [
            "What is custom here is the runtime, not necessarily the model.",
            `The actual backend/model is still chosen by this runner's config${backend ? ` and is currently ${backend}` : ""}.`,
            "So 'custom bot' here means custom transport and orchestration logic, not custom model weights.",
          ],
      gatewaySize: isRu
        ? [
            "Это полезное сравнение: чтобы «заменить gateway», пришлось написать свой Telegram-runner, историю чатов и управление процессами.",
            "То есть замена всё равно остаётся полноценным runtime-слоем, а не просто новым prompt или tool.",
            "Даже у такой замены остаются свои watchdog, state и команды управления.",
          ]
        : [
            "This is the useful comparison point: replacing the gateway still required writing a custom Telegram runner, chat history handling, and process control.",
            "So the replacement is still a real runtime layer, not just a new prompt or tool.",
            "Even this kind of replacement keeps its own watchdogs, state, and control commands.",
          ],
      gatewayReplace: isRu
        ? [
            "Skill может помочь такому боту вести себя иначе, но не заменяет transport/runtime слой.",
            "MCP может дать новому рантайму дополнительные инструменты, но сам по себе не становится Telegram-ботом.",
            "Если хочется отказаться от Clawdbot gateway, реальный путь — это свой бот-раннер вроде этого, а не просто добавить skill или MCP.",
          ]
        : [
            "A skill can make a bot like this behave differently, but it does not replace the transport/runtime layer.",
            "MCP can give a new runtime extra tools, but MCP by itself does not become a Telegram bot.",
            "If you want to move away from Clawdbot gateway, the real path is a custom runner like this one, not just adding a skill or MCP.",
          ],
      gatewayMissing: isRu
        ? [
            "Для этого бота вопрос теоретический: gateway здесь уже убран и заменён кастомным runner'ом.",
            "Если убрать и этот runner, Telegram-сообщения больше не будут обрабатываться вообще.",
            "То есть кто-то всё равно должен стоять между Telegram и backend: либо gateway, либо ваш собственный рантайм.",
          ]
        : [
            "For this bot the question is mostly theoretical: the gateway is already gone and replaced by a custom runner.",
            "If you remove that runner too, Telegram messages stop being processed entirely.",
            "So something still has to sit between Telegram and the backend: either the gateway or your own runtime.",
          ],
      skillMissing: isRu
        ? [
            "Если убрать skill, сам Python-runner и CLI-запуск продолжат жить.",
            "Потеряется не transport, а дополнительное поведение: инструкции, стиль, узкие правила, workflow-подсказки.",
            "Пример: бот всё ещё ответит, но будет менее точным в project-specific задачах.",
          ]
        : [
            "If you remove a skill, the Python runner and CLI execution still keep working.",
            "What you lose is not transport, but higher-level behavior: instructions, style, narrow rules, workflow hints.",
            "Example: the bot still answers, but becomes less precise for project-specific work.",
          ],
      mcpMissing: isRu
        ? [
            "Если убрать MCP/tooling, этот бот всё ещё может принимать Telegram-сообщения и запускать свой основной CLI/backend.",
            "Но всё, что зависит от внешних tools, исчезнет или начнёт деградировать в «не могу это сделать».",
            "Это влияет на возможности, но не заменяет сам runtime-слой бота.",
          ]
        : [
            "If you remove MCP/tooling, this bot can still accept Telegram messages and run its main CLI/backend path.",
            "But everything that depends on external tools disappears or degrades into 'I can't do that here'.",
            "That changes capability, but it does not replace the bot's runtime layer.",
          ],
      bypass: isRu
        ? [
            "Здесь bypass уже произошёл: вместо Clawdbot gateway работает отдельный Python Telegram runner.",
            "Именно поэтому этот бот сам управляет локальной историей, cancel/watchdog и запуском CLI.",
            "Это хороший пример того, что реальная замена gateway заметно больше, чем просто добавить skill или MCP.",
          ]
        : [
            "This bot is already the bypass example: a dedicated Python Telegram runner is used instead of Clawdbot gateway.",
            "That is why this bot manages local history, cancel/watchdog behavior, and CLI launch itself.",
            "It is a good example of why replacing the gateway is much bigger than just adding a skill or MCP.",
          ],
      examples: isRu
        ? [
            {
              title: "Продолжить прошлый разговор",
              steps: [
                "Вы задаёте follow-up без повторения всей предыстории.",
                "Бот подмешивает локально сохранённый контекст чата.",
                "CLI видит предыдущие сообщения и отвечает с учётом истории.",
                "Новая реплика тоже записывается в локальную историю, чтобы следующий follow-up продолжил ту же линию.",
              ],
            },
            {
              title: isClaudeMiniMax ? "Остановить зависший запуск" : "Сменить проект перед следующим запросом",
              steps: isClaudeMiniMax
                ? [
                    "Вы замечаете, что текущий запуск завис или больше не нужен.",
                    "Отправляете /cancel в тот же чат.",
                    "Бот останавливает текущий процесс и освобождает чат для нового запроса.",
                    "После этого вы можете сразу отправить новую задачу без рестарта самого сервиса.",
                  ]
                : [
                    "Вы отправляете команду вроде /setrepo или /repo.",
                    "Бот обновляет текущую рабочую папку для этого чата.",
                    "Следующий запрос уходит в CLI уже с новым проектным контекстом.",
                    "Это позволяет держать разные чаты привязанными к разным проектам.",
                  ],
            },
          ]
        : [
            {
              title: "Continue an earlier conversation",
              steps: [
                "You ask a follow-up without restating all prior context.",
                "The bot injects the locally saved chat history.",
                "The CLI sees the earlier messages and answers in context.",
                "That new reply is then stored again so the next follow-up continues the same thread.",
              ],
            },
            {
              title: isClaudeMiniMax ? "Stop a stuck run" : "Switch repos before the next request",
              steps: isClaudeMiniMax
                ? [
                    "You notice the current run is stuck or no longer needed.",
                    "You send /cancel in the same chat.",
                    "The bot stops the active process and frees the chat for the next request.",
                    "You can immediately submit a new task without restarting the service itself.",
                  ]
                : [
                    "You send a command such as /setrepo or /repo.",
                    "The bot updates the working directory for this chat.",
                    "The next request is sent to the CLI with the new project context.",
                    "That lets different chats stay attached to different projects.",
                  ],
            },
          ],
    };
  }

  return {
    how: isRu
      ? "Это разговорный Telegram-бот: он принимает сообщения, подготавливает контекст и отвечает в том же чате."
      : "This is a conversational Telegram bot: it receives messages, prepares context, and replies in the same chat.",
    can: isRu
      ? [
          "Вести обычный диалог и помогать с вопросами по тексту или коду.",
          hasBrowser ? "При необходимости открывать веб-страницы через доступный браузерный инструмент." : "Поддерживать продолжительные диалоги внутри одного чата.",
        ]
      : [
          "Hold a normal conversation and help with text or coding questions.",
          hasBrowser ? "Open web pages when this bot has a browser tool available." : "Carry longer conversations inside the same chat.",
        ],
    cannot: isRu
      ? [
          "Это не CLI-раннер: он не ставит задачи в очередь как cli-bridge боты.",
          "Отвечает только в разрешённых пользователях/чатах, если такой фильтр настроен.",
        ]
      : [
          "It is not a queued CLI runner: it does not execute repo jobs like the cli-bridge bots.",
          "It only responds in allowed users/chats when that filter is configured.",
        ],
    steps: isRu
      ? [
          "Вы пишете боту сообщение в Telegram.",
          `Clawdbot gateway поднимает профиль бота${profile ? ` (${profile})` : ""}, свежий контекст и выбранный бэкенд (${backend}).`,
          hasBrowser
            ? "Модель отвечает сразу или при необходимости использует доступный браузерный инструмент."
            : "Модель формирует ответ в обычном разговорном режиме.",
          "Недавний контекст диалога сохраняется, чтобы follow-up сообщения продолжали ту же тему.",
          "Готовый ответ отправляется обратно в тот же чат.",
        ]
      : [
          "You send the bot a message in Telegram.",
          `The Clawdbot gateway loads the bot profile${profile ? ` (${profile})` : ""}, recent context, and selected backend (${backend}).`,
          hasBrowser
            ? "The model answers directly or uses the available browser tool when needed."
            : "The model produces a reply in normal conversational mode.",
          "Recent conversation context is preserved so follow-up messages can continue the same thread.",
          "The finished reply is sent back into the same chat.",
        ],
    behind: isRu
      ? [
          `Бот работает через Clawdbot gateway${gatewayPort ? ` на localhost:${gatewayPort}` : ""}, а не как отдельный кастомный Python-раннер.`,
          profile
            ? `Профиль ${profile} определяет поведение бота: какой backend использовать, какие инструменты доступны и какие ограничения действуют.`
            : "Поведение бота задаётся конфигурацией gateway и выбранным backend.",
          "Это не job-очередь для репозиториев: каждый запрос обрабатывается как ход диалога, а не как отдельная CLI-задача.",
          hasBrowser
            ? "Если профиль разрешает браузерный инструмент, бот может открывать страницы перед тем, как ответить."
            : "Если дополнительных инструментов нет, ответ строится только на разговорном контексте и модели.",
        ]
      : [
          `This bot runs through Clawdbot gateway${gatewayPort ? ` on localhost:${gatewayPort}` : ""}, not as a separate custom Python runner.`,
          profile
            ? `The ${profile} profile defines how the bot behaves: which backend it uses, which tools are available, and which limits apply.`
            : "The bot's behavior is defined by gateway configuration and the selected backend.",
          "This is not a repo job queue: each request is handled as a conversation turn, not as a separate CLI task.",
          hasBrowser
            ? "When the profile allows a browser tool, the bot can open pages before replying."
            : "When extra tools are not enabled, the reply is produced from chat context plus the model only.",
        ],
    telegram: isRu
      ? [
          "Обычно вы видите один прямой ответ, а не серию технических апдейтов о прогрессе.",
          "Follow-up вопросы чаще ощущаются естественно, потому что недавний контекст чата сохраняется.",
          hasBrowser
            ? "Если бот открывает страницы, ответ может прийти немного позже, потому что сначала он собирает информацию."
            : "Если вопрос короткий, бот обычно отвечает как обычный разговорный ассистент без стадии очереди или запуска job.",
        ]
      : [
          "You usually see one direct answer rather than a stream of technical progress updates.",
          "Follow-up questions tend to feel natural because recent chat context is preserved.",
          hasBrowser
            ? "If the bot opens webpages, the response may take longer because it gathers information first."
            : "For short questions, the bot usually behaves like a normal conversational assistant with no queue or job stage.",
        ],
    bestFor: isRu
      ? [
          "Быстрые вопросы, обсуждения идей, объяснения и обычный интерактивный диалог.",
          "Короткие циклы вопрос-ответ, когда не нужен полноценный CLI-раннер в репозитории.",
          hasBrowser
            ? "Проверка страниц, ссылок и свежего контента, если этому профилю разрешён браузерный инструмент."
            : "Разговорные задачи, где важнее скорость и контекст, чем выполнение длинной технической job.",
        ]
      : [
          "Quick questions, brainstorming, explanations, and normal interactive conversation.",
          "Short back-and-forth loops where you do not need a full repo CLI runner.",
          hasBrowser
            ? "Checking pages, links, or fresh web content when this profile has the browser tool enabled."
            : "Conversational tasks where speed and context matter more than a long technical job run.",
        ],
    gatewayRole: isRu
      ? [
          `Clawdbot gateway — это локальный бот-рантайм${gatewayPort ? ` на порту ${gatewayPort}` : ""}, который держит профиль, сессию и подключение к backend.`,
          profile
            ? `Для этого бота профиль ${profile} задаёт, какой backend и какие инструменты использовать на каждом сообщении.`
            : "Для такого бота gateway решает, как собрать контекст и какой backend вызвать на каждом сообщении.",
          "Он получает Telegram-вход, добавляет недавний контекст и уже потом зовёт модель или доступный tool.",
        ]
      : [
          `Clawdbot gateway is the local bot runtime${gatewayPort ? ` on port ${gatewayPort}` : ""} that keeps the profile, session state, and backend connection together.`,
          profile
            ? `For this bot, the ${profile} profile decides which backend and tools are used on each message.`
            : "For a bot like this, the gateway decides how to assemble context and which backend to call on each message.",
          "It receives the Telegram input, adds recent context, and only then calls the model or available tool.",
        ],
    runtimeActive: isRu
      ? [
          runtimeCommandText
            ? `Сейчас systemd запускает команду: ${runtimeCommandText}.`
            : "Сейчас этот бот работает через отдельный gateway-runtime.",
          runtimeName === "clawdbot"
            ? "Это значит, что rename проекта в OpenClaw сам по себе пока ничего не переключил: этот сервис до сих пор стартует через clawdbot."
            : runtimeName === "openclaw"
              ? "Это значит, что сервис уже переведён на OpenClaw и не зависит от старого имени бинарника."
              : "Ключевая мысль: между Telegram и моделью уже есть отдельный runtime-слой, а не прямой вызов модели.",
          shortState
            ? `Сессии и auth этого бота живут в runtime-состоянии ${shortState}, поэтому transport и модель здесь не одно и то же.`
            : "Сессии и auth живут в отдельном runtime-слое, поэтому transport и модель здесь не одно и то же.",
        ]
      : [
          runtimeCommandText
            ? `Systemd currently starts this service with: ${runtimeCommandText}.`
            : "This bot is currently running through a dedicated gateway runtime.",
          runtimeName === "clawdbot"
            ? "That means the project rename to OpenClaw has not switched this service by itself yet: it still starts through clawdbot."
            : runtimeName === "openclaw"
              ? "That means the service has already been moved onto OpenClaw and no longer depends on the old binary name."
              : "The key point is that there is already a distinct runtime layer between Telegram and the model, not a direct model call.",
          shortState
            ? `Its sessions and auth live in the ${shortState} runtime state, so transport and model are not the same thing here.`
            : "Its sessions and auth live in a separate runtime layer, so transport and model are not the same thing here.",
        ],
    runtimeUpdate: isRu
      ? [
          runtimeName === "clawdbot"
            ? "Если обновить только пакет openclaw, а unit всё ещё вызывает clawdbot, этот бот прямо сейчас не изменится."
            : "Если вы обновляете тот же активный runtime, бот обычно продолжит жить на том же Telegram handle и с тем же профилем.",
          runtimeName === "clawdbot"
            ? `Если обновится сам clawdbot по тому же пути, профиль${profile ? ` ${profile}` : ""} и backend (${backend}) обычно останутся теми же, но ответы могут меняться из-за обновлённого runtime, tool wiring или auth-логики.`
            : `Если сервис уже переведён на OpenClaw, то обновления обычно меняют runtime/tool-поведение, но не сам профиль${profile ? ` ${profile}` : ""} и не backend (${backend}).`,
          runtimeName === "clawdbot"
            ? "Если unit вручную перевести на openclaw и сохранить совместимость state/config, бот может выглядеть для пользователя почти так же, но уже работать на новом runtime."
            : "Если же совместимость state, tools или профиля сломается, сервис может не стартовать или потерять часть поведения, даже при том же Telegram handle.",
          legacyCompatLine,
        ]
      : [
          runtimeName === "clawdbot"
            ? "If you update only the openclaw package while this unit still calls clawdbot, this bot does not change right away."
            : "When you update the same active runtime in place, the bot usually keeps the same Telegram handle and profile.",
          runtimeName === "clawdbot"
            ? `If the clawdbot binary at the same path gets updated, the ${profile ? `${profile} profile` : "profile"} and backend (${backend}) usually stay the same, but replies can still change because runtime logic, tool wiring, or auth behavior changed.`
            : `If this service is already on OpenClaw, updates usually change runtime/tool behavior, not the ${profile ? `${profile} profile` : "profile"} or backend (${backend}).`,
          runtimeName === "clawdbot"
            ? "If you manually switch the unit to openclaw and preserve state/config compatibility, the bot can look almost the same to users while running on the new runtime underneath."
            : "If state, tools, or profile compatibility breaks, the service may fail to start or lose part of its behavior even with the same Telegram handle.",
          legacyCompatLine,
        ],
    runtimeModel: isRu
      ? [
          `${gatewayFamilyLabel}/OpenClaw — это runtime-обвязка, а не сама модель.`,
          `Модель и инструменты берутся из ${sourceFrom}${backend ? `; сейчас это ${backend}` : ""}.`,
          "Поэтому бот не становится custom model только из-за того, что вы обновили или переименовали runtime: меняется orchestration-слой, а не сами веса модели.",
        ]
      : [
          `${gatewayFamilyLabel}/OpenClaw is the runtime shell, not the model itself.`,
          `The model and tools are selected by ${sourceLabel}${backend ? `; right now that points to ${backend}` : ""}.`,
          "So the bot does not become a custom model just because you updated or renamed the runtime: the orchestration layer changes, not the model weights.",
        ],
    gatewaySize: isRu
      ? [
          "Это больше, чем skill или prompt: gateway — отдельный сервис с профилем, state, auth и портом.",
          `На практике это выглядит как один сервис${gatewayPort ? ` + порт ${gatewayPort}` : ""}${shortState ? ` + state-папка ${shortState}` : ""}.`,
          "То есть это средний системный слой между Telegram и самой моделью, а не просто тонкая надстройка.",
        ]
      : [
          "This is bigger than a skill or prompt: the gateway is a separate service with profile, state, auth, and a port.",
          `In practice it looks like one service${gatewayPort ? ` + port ${gatewayPort}` : ""}${shortState ? ` + state directory ${shortState}` : ""}.`,
          "So it is a medium runtime layer between Telegram and the model, not just a thin wrapper.",
        ],
    gatewayReplace: isRu
      ? [
          "Да, но замена должна взять на себя transport, контекст, состояние, auth и lifecycle процесса.",
          "Skill не заменяет gateway: skill лишь учит уже существующий runtime вести себя по-другому.",
          "MCP не заменяет gateway тоже: MCP — это способ дать runtime инструменты, а не готовый Telegram shell.",
          "В этом workspace уже есть примеры замены: droidminimaxbot и claudeminimax2bot работают без gateway и сами делают runtime-работу.",
        ]
      : [
          "Yes, but the replacement must take over transport, context, state, auth, and process lifecycle itself.",
          "A skill does not replace the gateway: it only teaches an existing runtime to behave differently.",
          "MCP does not replace the gateway either: MCP is a way to give a runtime tools, not a ready-made Telegram shell.",
          "This workspace already has replacement examples: droidminimaxbot and claudeminimax2bot run without the gateway and perform that runtime work themselves.",
        ],
    gatewayMissing: isRu
      ? [
          `Если убрать gateway у такого чат-бота, сообщениям некуда будет приходить локально${gatewayPort ? ` на порт ${gatewayPort}` : ""}.`,
          "Профиль, сохранение недавнего контекста и вызов backend/tooling тоже исчезнут вместе с ним.",
          "Итог на практике: бот перестанет отвечать, пока вы не дадите ему другой runtime вместо gateway.",
        ]
      : [
          `If you remove the gateway from a chat bot like this, messages no longer have a local runtime to land on${gatewayPort ? ` at port ${gatewayPort}` : ""}.`,
          "The profile, recent-context handling, and backend/tool calls disappear with it too.",
          "In practice, the bot stops replying until you replace the gateway with another runtime.",
        ],
    skillMissing: isRu
      ? [
          "Если убрать skill, бот останется живым и сможет отвечать через тот же gateway.",
          "Что исчезнет: специализация, стиль, project-specific правила, дополнительные инструкции по workflow.",
          "Пример: бот всё ещё поговорит с вами, но станет больше похож на generic assistant.",
        ]
      : [
          "If you remove a skill, the bot still stays alive and can reply through the same gateway.",
          "What disappears is specialization: style, project-specific rules, and extra workflow instructions.",
          "Example: the bot still talks to you, but feels much more like a generic assistant.",
        ],
    mcpMissing: isRu
      ? [
          "Если убрать MCP или tool bridge, обычный разговорный ответ всё ещё возможен.",
          "Но tool-driven вещи ломаются: страница не откроется, интеграция не вызовется, внешний источник не прочитается.",
          "Пример: вместо реального чтения страницы бот сможет только ответить из памяти или признать, что инструмента нет.",
        ]
      : [
          "If you remove MCP or a tool bridge, a normal conversational answer is still possible.",
          "But tool-driven actions break: pages do not open, integrations do not run, external sources do not get fetched.",
          "Example: instead of actually reading a page, the bot can only answer from memory or admit the tool is unavailable.",
        ],
    bypass: isRu
      ? [
          "Чтобы обойти gateway, нужно не просто убрать его, а заменить на свой runtime, который сам примет Telegram-сообщение и сам вызовет backend.",
          "Такой runtime должен заново реализовать историю, auth, tool wiring и lifecycle сервиса.",
          "Поэтому bypass — это уже другая архитектура, а не маленькая настройка.",
        ]
      : [
          "To bypass the gateway, you do not just remove it; you replace it with your own runtime that receives Telegram messages and calls the backend itself.",
          "That runtime has to re-implement history, auth, tool wiring, and service lifecycle.",
          "So bypassing is a real architecture change, not a small configuration tweak.",
        ],
    examples: isRu
      ? [
          {
            title: "Быстрый вопрос по коду",
            steps: [
              "Вы задаёте короткий вопрос или просите объяснить ошибку.",
              "Gateway поднимает недавний контекст этого чата и отправляет запрос в выбранный backend.",
              "Бот отвечает без запуска отдельной CLI-job или очереди задач.",
              "Вы сразу можете продолжить уточняющими вопросами в том же чате.",
            ],
          },
          {
            title: hasBrowser ? "Проверить веб-страницу" : "Продолжить разговор по теме",
            steps: hasBrowser
              ? [
                  "Вы отправляете URL или просите посмотреть страницу.",
                  "Бот открывает её через браузерный инструмент, если это разрешено у данного профиля.",
                  "После этого возвращает summary или ответ по содержимому страницы.",
                  "Дальше вы можете задавать follow-up вопросы по найденной информации в том же чате.",
                ]
              : [
                  "Вы задаёте follow-up по уже начатой теме.",
                  "Бот использует недавнюю историю диалога.",
                  "Ответ приходит как продолжение обычного разговора, без переключения в режим job-раннера.",
                  "Контекст темы сохраняется и для следующего сообщения тоже.",
                ],
          },
        ]
      : [
          {
            title: "Quick coding question",
            steps: [
              "You ask a short question or paste an error to explain.",
              "The gateway loads the recent context from this chat and sends the request to the selected backend.",
              "The bot answers without launching a separate CLI job or queueing workflow.",
              "You can immediately continue with follow-up questions in the same chat.",
            ],
          },
          {
            title: hasBrowser ? "Check a webpage" : "Continue the same topic",
            steps: hasBrowser
              ? [
                  "You send a URL or ask the bot to inspect a page.",
                  "The bot opens it with the browser tool when that profile allows it.",
                  "It returns a summary or answer based on what it found on the page.",
                  "You can then keep asking follow-ups about that page in the same chat thread.",
                ]
              : [
                  "You send a follow-up about the same topic.",
                  "The bot uses the recent chat history.",
                  "The answer comes back as a normal conversation, not a queued job run.",
                  "The topic stays warm for the next message too.",
                ],
          },
        ],
  };
}

function renderBotDocs(bot) {
  const box = $("botDocsBox");
  if (!box) return;

  const docsAll = bot && bot.docs;
  const lang = normalizeLang(state.ui.lang) || "en";
  const doc = (docsAll && (docsAll[lang] || docsAll.en)) ? (docsAll[lang] || docsAll.en) : null;
  const fallback = buildBotDocsFallback(bot, doc, lang);

  const sections = [];
  const toList = (items) => Array.isArray(items)
    ? items.map(s => String(s || "").trim()).filter(Boolean)
    : [];
  const pickRicherList = (primary, fallbackItems) => {
    const a = toList(primary);
    const b = toList(fallbackItems);
    return a.length >= b.length ? a : b;
  };
  const normalizeExamples = (items) => Array.isArray(items)
    ? items.map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const title = String(entry.title || "").trim();
        const steps = toList(entry.steps);
        return title && steps.length ? { title, steps } : null;
      }).filter(Boolean)
    : [];
  const pickRicherExamples = (primary, fallbackItems) => {
    const a = normalizeExamples(primary);
    const b = normalizeExamples(fallbackItems);
    const score = (items) => items.reduce((sum, entry) => sum + entry.steps.length, 0);
    return score(a) >= score(b) ? a : b;
  };
  const renderStepList = (items, klass = "botDocList") =>
    `<ol class="${klass}">${items.map(s => `<li>${escapeHtml(s)}</li>`).join("")}</ol>`;
  const renderBulletList = (items, klass = "botDocList") =>
    `<ul class="${klass}">${items.map(s => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`;

  const how = String((doc && doc.how) || fallback.how || "").trim();
  if (how) {
    const html = escapeHtml(how).replaceAll("\n", "<br>");
    sections.push(
      `<div class="botDocSection"><div class="botDocTitle">${escapeHtml(t("bot_docs_how"))}</div><div class="botDocText">${html}</div></div>`
    );
  }

  const can = toList(doc && doc.can).length ? toList(doc && doc.can) : toList(fallback.can);
  if (can.length) {
    sections.push(
      `<div class="botDocSection"><div class="botDocTitle good">${escapeHtml(t("bot_docs_can"))}</div><ul class="botDocList">${can.map(s => `<li>${escapeHtml(s)}</li>`).join("")}</ul></div>`
    );
  }

  const cannot = toList(doc && doc.cannot).length ? toList(doc && doc.cannot) : toList(fallback.cannot);
  if (cannot.length) {
    sections.push(
      `<div class="botDocSection"><div class="botDocTitle bad">${escapeHtml(t("bot_docs_cannot"))}</div><ul class="botDocList">${cannot.map(s => `<li>${escapeHtml(s)}</li>`).join("")}</ul></div>`
    );
  }

  const steps = pickRicherList(doc && doc.steps, fallback.steps);
  if (steps.length) {
    sections.push(
      `<div class="botDocSection"><div class="botDocTitle">${escapeHtml(t("bot_docs_steps"))}</div>${renderStepList(steps, "botDocSteps")}</div>`
    );
  }

  const detailCards = [];
  const behind = toList(doc && doc.behind).length ? toList(doc && doc.behind) : toList(fallback.behind);
  if (behind.length) {
    detailCards.push(
      `<div class="botDocFact"><div class="botDocTitle">${escapeHtml(t("bot_docs_behind"))}</div>${renderBulletList(behind, "botDocList botDocListCompact")}</div>`
    );
  }

  const telegram = toList(doc && doc.telegram).length ? toList(doc && doc.telegram) : toList(fallback.telegram);
  if (telegram.length) {
    detailCards.push(
      `<div class="botDocFact"><div class="botDocTitle">${escapeHtml(t("bot_docs_telegram"))}</div>${renderBulletList(telegram, "botDocList botDocListCompact")}</div>`
    );
  }

  const bestFor = toList(doc && doc.bestFor).length ? toList(doc && doc.bestFor) : toList(fallback.bestFor);
  if (bestFor.length) {
    detailCards.push(
      `<div class="botDocFact"><div class="botDocTitle">${escapeHtml(t("bot_docs_best_for"))}</div>${renderBulletList(bestFor, "botDocList botDocListCompact")}</div>`
    );
  }

  const gatewayRole = toList(doc && doc.gatewayRole).length ? toList(doc && doc.gatewayRole) : toList(fallback.gatewayRole);
  if (gatewayRole.length) {
    detailCards.push(
      `<div class="botDocFact"><div class="botDocTitle">${escapeHtml(t("bot_docs_gateway_role"))}</div>${renderBulletList(gatewayRole, "botDocList botDocListCompact")}</div>`
    );
  }

  const runtimeActive = toList(doc && doc.runtimeActive).length ? toList(doc && doc.runtimeActive) : toList(fallback.runtimeActive);
  if (runtimeActive.length) {
    detailCards.push(
      `<div class="botDocFact"><div class="botDocTitle">${escapeHtml(t("bot_docs_runtime_active"))}</div>${renderBulletList(runtimeActive, "botDocList botDocListCompact")}</div>`
    );
  }

  const runtimeUpdate = toList(doc && doc.runtimeUpdate).length ? toList(doc && doc.runtimeUpdate) : toList(fallback.runtimeUpdate);
  if (runtimeUpdate.length) {
    detailCards.push(
      `<div class="botDocFact"><div class="botDocTitle">${escapeHtml(t("bot_docs_runtime_update"))}</div>${renderBulletList(runtimeUpdate, "botDocList botDocListCompact")}</div>`
    );
  }

  const runtimeModel = toList(doc && doc.runtimeModel).length ? toList(doc && doc.runtimeModel) : toList(fallback.runtimeModel);
  if (runtimeModel.length) {
    detailCards.push(
      `<div class="botDocFact"><div class="botDocTitle">${escapeHtml(t("bot_docs_runtime_model"))}</div>${renderBulletList(runtimeModel, "botDocList botDocListCompact")}</div>`
    );
  }

  const gatewaySize = toList(doc && doc.gatewaySize).length ? toList(doc && doc.gatewaySize) : toList(fallback.gatewaySize);
  if (gatewaySize.length) {
    detailCards.push(
      `<div class="botDocFact"><div class="botDocTitle">${escapeHtml(t("bot_docs_gateway_size"))}</div>${renderBulletList(gatewaySize, "botDocList botDocListCompact")}</div>`
    );
  }

  const gatewayReplace = toList(doc && doc.gatewayReplace).length ? toList(doc && doc.gatewayReplace) : toList(fallback.gatewayReplace);
  if (gatewayReplace.length) {
    detailCards.push(
      `<div class="botDocFact"><div class="botDocTitle">${escapeHtml(t("bot_docs_gateway_replace"))}</div>${renderBulletList(gatewayReplace, "botDocList botDocListCompact")}</div>`
    );
  }

  const gatewayMissing = toList(doc && doc.gatewayMissing).length ? toList(doc && doc.gatewayMissing) : toList(fallback.gatewayMissing);
  if (gatewayMissing.length) {
    detailCards.push(
      `<div class="botDocFact"><div class="botDocTitle">${escapeHtml(t("bot_docs_gateway_missing"))}</div>${renderBulletList(gatewayMissing, "botDocList botDocListCompact")}</div>`
    );
  }

  const skillMissing = toList(doc && doc.skillMissing).length ? toList(doc && doc.skillMissing) : toList(fallback.skillMissing);
  if (skillMissing.length) {
    detailCards.push(
      `<div class="botDocFact"><div class="botDocTitle">${escapeHtml(t("bot_docs_skill_missing"))}</div>${renderBulletList(skillMissing, "botDocList botDocListCompact")}</div>`
    );
  }

  const mcpMissing = toList(doc && doc.mcpMissing).length ? toList(doc && doc.mcpMissing) : toList(fallback.mcpMissing);
  if (mcpMissing.length) {
    detailCards.push(
      `<div class="botDocFact"><div class="botDocTitle">${escapeHtml(t("bot_docs_mcp_missing"))}</div>${renderBulletList(mcpMissing, "botDocList botDocListCompact")}</div>`
    );
  }

  const bypass = toList(doc && doc.bypass).length ? toList(doc && doc.bypass) : toList(fallback.bypass);
  if (bypass.length) {
    detailCards.push(
      `<div class="botDocFact"><div class="botDocTitle">${escapeHtml(t("bot_docs_bypass"))}</div>${renderBulletList(bypass, "botDocList botDocListCompact")}</div>`
    );
  }

  if (detailCards.length) {
    sections.push(`<div class="botDocFacts">${detailCards.join("")}</div>`);
  }

  const examples = pickRicherExamples(doc && doc.examples, fallback.examples);
  if (examples.length) {
    sections.push(
      `<div class="botDocSection"><div class="botDocTitle">${escapeHtml(t("bot_docs_examples"))}</div><div class="botDocExamples">${examples.map((entry) => `<div class="botDocExample"><div class="botDocExampleTitle">${escapeHtml(entry.title)}</div>${renderStepList(entry.steps, "botDocSteps")}</div>`).join("")}</div></div>`
    );
  }

  if (!sections.length) {
    box.innerHTML = `<div class="muted">${escapeHtml(t("bot_docs_missing"))}</div>`;
    return;
  }

  box.innerHTML = `<div class="botDocs">${sections.join("")}</div>`;
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
  renderBotDocs(bot);
  renderFieldGuide(bot);
  renderSystemdBox(bot);
  ensureUnitDetails(bot.unit);
  renderUsageSummary(bot);
  renderLastError(bot);
  renderActivityHeatmap(bot);

  renderUsageCharts(bot);

  // Start live uptime ticker
  startUptimeTicker(bot);

  const providers = bot.usage && bot.usage.byProvider ? bot.usage.byProvider : {};
  const list = $("providersList");
  list.innerHTML = "";

  const entries = Object.entries(providers).sort((a, b) => (b[1].tokens || 0) - (a[1].tokens || 0));
  const totalProviderTokens = entries.reduce((sum, [, st]) => sum + (st.tokens || 0), 0);
  const totalProviderCost = entries.reduce((sum, [, st]) => sum + (st.costUSD || 0), 0);
  const costLabel = $("providersTotalCost");
  if (costLabel) costLabel.textContent = entries.length ? `${fmtInt(totalProviderTokens)} ${t("tokens_word")} • ${fmtMoneyUsd(totalProviderCost)}` : "";
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
      const pct = totalProviderTokens > 0 ? ((st.tokens || 0) / totalProviderTokens * 100) : 0;
      const pctStr = pct >= 1 ? `${pct.toFixed(0)}%` : pct > 0 ? "<1%" : "0%";
      row.innerHTML = `
        <div>
          <div class="providerName">${escapeHtml(provider)} <span class="providerPct">${pctStr}</span></div>
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

  // Render provider donut chart (hide if no data)
  const donutWrap = $("providerDonut") && $("providerDonut").closest(".providerChartWrap");
  if (donutWrap) donutWrap.style.display = entries.length ? "" : "none";
  renderProviderDonut(bot);

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
    searchInput.onkeydown = (e) => {
      if (e.key === "Escape" && searchInput.value) {
        e.preventDefault();
        e.stopPropagation();
        searchInput.value = "";
        state.details.logQuery = "";
        if (logsPre.dataset.logsLoaded === "1") renderLogsView();
      }
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

  // Download logs button
  const dlBtn = $("downloadLogsBtn");
  if (dlBtn) dlBtn.onclick = () => downloadLogs();

  // Follow logs button
  setFollowLogs(false); // reset on new detail open
  const followBtn = $("followLogsBtn");
  if (followBtn) {
    followBtn.onclick = () => {
      setFollowLogs(!state.details.followLogs);
    };
  }

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

  // Show match count badge
  const searchInput = $("logSearchInput");
  const badge = $("logMatchBadge");
  if (badge) {
    if (q && shown.length > 0) {
      badge.textContent = t("log_matches", { n: shown.length });
      badge.hidden = false;
    } else if (q && !shown.length) {
      badge.textContent = t("logs_no_matches");
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  if (q && !shown.length) {
    logsPre.textContent = t("logs_no_matches");
    return;
  }

  const qRe = q ? new RegExp(escapeRegExp(q), "gi") : null;
  const badRe = /\b(error|fatal|exception|traceback|panic|critical)\b/ig;
  const warnRe = /\b(warn|warning|deprecated)\b/ig;
  const jsonRe = /(\{[^{}]{10,}\})/g;
  const timestampRe = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\s*/;

  const out = shown.map((ln, i) => {
    let s = escapeHtml(ln);
    if (qRe) s = s.replace(qRe, m => `<mark class="logMatch">${m}</mark>`);
    s = s.replace(badRe, m => `<span class="logSevBad">${m}</span>`);
    s = s.replace(warnRe, m => `<span class="logSevWarn">${m}</span>`);

    // Highlight JSON objects inline
    s = s.replace(jsonRe, m => `<span class="logJson">${m}</span>`);

    // Detect severity for line indicator
    const lnLower = ln.toLowerCase();
    let sevCls = "";
    if (/\b(error|fatal|exception|traceback|panic|critical)\b/.test(lnLower)) sevCls = "logLineBad";
    else if (/\b(warn|warning|deprecated)\b/.test(lnLower)) sevCls = "logLineWarn";

    // Highlight timestamps
    s = s.replace(/^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/, m => `<span class="logTs">${m}</span>`);

    const lineNum = q ? "" : `<span class="logLineNum">${i + 1}</span>`;
    return `<span class="logLine ${sevCls}">${lineNum}<span class="logLineText">${s}</span></span>`;
  }).join("\n");

  if (!out) {
    logsPre.textContent = t("no_logs");
    return;
  }
  logsPre.innerHTML = out;
  // Auto-scroll to bottom
  logsPre.scrollTop = logsPre.scrollHeight;
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

// ============================================
// Field Guide (contextual term explainer)
// ============================================
function initFieldGuide() {
  const toggle = $("fieldGuideToggle");
  const box = $("fieldGuideBox");
  if (!toggle || !box) return;
  toggle.addEventListener("click", () => {
    const show = box.hidden;
    box.hidden = !show;
    toggle.textContent = show ? t("fg_collapse") : t("fg_expand");
  });
}

function renderFieldGuide(bot) {
  const box = $("fieldGuideBox");
  const titleEl = $("fieldGuideTitle");
  if (!box) return;
  if (titleEl) titleEl.textContent = t("fg_title");

  const lang = normalizeLang(state.ui.lang) || "en";
  const isRu = lang === "ru";
  const sd = bot.systemd || {};
  const usage = bot.usage || {};
  const allTime = usage.allTime || {};
  const w24 = (usage.windows && usage.windows["24h"]) || {};
  const providers = usage.byProvider || {};
  const providerNames = Object.keys(providers);

  const bots = state.data && Array.isArray(state.data.bots) ? state.data.bots : [];
  const clawdbots = bots.filter(b => b.type === "clawdbot");
  const droids = bots.filter(b => b.type === "droid");
  const totalBots = bots.length;
  const totalCost = bots.reduce((s, b) => s + ((b.usage && b.usage.allTime && b.usage.allTime.costUSD) || 0), 0);
  const thisCostPct = totalCost > 0 ? ((allTime.costUSD || 0) / totalCost * 100).toFixed(1) : "0";
  const costRank = bots
    .map(b => ({ unit: b.unit, cost: (b.usage && b.usage.allTime && b.usage.allTime.costUSD) || 0 }))
    .sort((a, b) => b.cost - a.cost)
    .findIndex(b => b.unit === bot.unit) + 1;

  const groups = [];

  // ── Identity ──
  const identityEntries = [];

  identityEntries.push({
    term: bot.displayName || bot.unit,
    def: isRu
      ? `<strong>Отображаемое имя</strong> этого бота в дашборде. Задаётся в <code>config.json</code> → <code>botMappings</code>. Реальный идентификатор — systemd unit name.`
      : `<strong>Display name</strong> for this bot in the dashboard. Set in <code>config.json</code> → <code>botMappings</code>. The real identifier is the systemd unit name.`,
  });

  if (bot.telegramHandle) {
    identityEntries.push({
      term: bot.telegramHandle,
      def: isRu
        ? `<strong>Telegram-хэндл</strong> — имя бота в Telegram. Пользователи пишут этому боту, и он обрабатывает их запросы. Каждый бот имеет уникальный хэндл, зарегистрированный через <code>@BotFather</code>.`
        : `<strong>Telegram handle</strong> — the bot's username in Telegram. Users message this bot and it processes their requests. Registered via <code>@BotFather</code>.`,
    });
  }

  if (bot.type) {
    const typeExplain = bot.type === "clawdbot"
      ? (isRu
        ? `<strong>Тип: clawdbot</strong> — работает на движке <strong>Clawdbot Gateway</strong>. Clawdbot — универсальная платформа: принимает сообщения из Telegram, направляет в AI-бэкенд (Claude, Codex, Antigravity, Kimi, MiniMax), управляет очередью задач, хранит историю сессий. ${clawdbots.length} из ${totalBots} ботов используют этот движок.`
        : `<strong>Type: clawdbot</strong> — runs on the <strong>Clawdbot Gateway</strong> engine. Clawdbot is a universal platform: receives Telegram messages, routes to an AI backend (Claude, Codex, Antigravity, Kimi, MiniMax), manages job queue, stores session history. ${clawdbots.length} of ${totalBots} bots use this engine.`)
      : bot.type === "droid"
        ? (isRu
          ? `<strong>Тип: droid</strong> — работает через <strong>Droid CLI</strong> (<code>droid exec</code>). Более простой Python-бот — вызывает Droid CLI для каждого сообщения. Нет очереди задач clawdbot, но есть свои команды (/repo, /newchat). ${droids.length} из ${totalBots} ботов используют Droid.`
          : `<strong>Type: droid</strong> — runs via <strong>Droid CLI</strong> (<code>droid exec</code>). Simpler Python bot — calls Droid CLI per message. No clawdbot job queue, but has own commands (/repo, /newchat). ${droids.length} of ${totalBots} bots use Droid.`)
        : (isRu
          ? `<strong>Тип: ${escapeHtml(bot.type)}</strong> — тип движка этого бота.`
          : `<strong>Type: ${escapeHtml(bot.type)}</strong> — the engine type for this bot.`);
    identityEntries.push({ term: bot.type, def: typeExplain });
  }

  if (bot.gatewayPort) {
    const otherPorts = clawdbots.filter(b => b.unit !== bot.unit && b.gatewayPort).map(b => b.gatewayPort).join(", ");
    identityEntries.push({
      term: `port:${bot.gatewayPort}`,
      def: isRu
        ? `<strong>Gateway-порт</strong> — HTTP-порт на localhost, где Clawdbot Gateway слушает запросы. Telegram-коннектор подключается к этому порту. Каждый clawdbot-бот имеет уникальный порт, чтобы избежать конфликтов.`
        : `<strong>Gateway port</strong> — the localhost HTTP port where Clawdbot Gateway listens. The Telegram connector sends messages here. Each clawdbot bot needs a unique port to avoid conflicts.`,
      compare: isRu
        ? `Другие порты: ${otherPorts || "нет"}`
        : `Other ports in fleet: ${otherPorts || "none"}`,
    });
  }

  identityEntries.push({
    term: `unit:${bot.unit}`,
    def: isRu
      ? `<strong>Systemd unit</strong> — имя сервиса в systemd (уникальный идентификатор в ОС). Шаблон имён: <code>cli-bridge-gateway-*</code> = CLI-Bridge бот (запускает CLI-задачи в репозиториях), <code>clawdbot-*-telegram</code> = чат-бот через Clawdbot, <code>droid*</code> = Droid-бот. Управление: <code>systemctl start/stop/restart ${escapeHtml(bot.unit)}</code>.`
      : `<strong>Systemd unit</strong> — the service name in systemd (unique OS identifier). Naming pattern: <code>cli-bridge-gateway-*</code> = CLI-Bridge bot (runs CLI jobs in repos), <code>clawdbot-*-telegram</code> = chat bot via Clawdbot, <code>droid*</code> = Droid bot. Control: <code>systemctl start/stop/restart ${escapeHtml(bot.unit)}</code>.`,
  });

  if (bot.scope) {
    identityEntries.push({
      term: `scope:${bot.scope}`,
      def: bot.scope === "system"
        ? (isRu
          ? `<strong>Scope: system</strong> — системный сервис (от root). Управление: <code>sudo systemctl ...</code>. ${bots.filter(b=>b.scope==="system").length}/${totalBots} ботов работают так.`
          : `<strong>Scope: system</strong> — system-level service (as root). Managed via <code>sudo systemctl ...</code>. ${bots.filter(b=>b.scope==="system").length}/${totalBots} bots run this way.`)
        : (isRu
          ? `<strong>Scope: user</strong> — пользовательский сервис (от ${escapeHtml(bot.user || "user")}). Управление: <code>systemctl --user ...</code>. Работает без root, изолирован от системных процессов.`
          : `<strong>Scope: user</strong> — user-level service (as ${escapeHtml(bot.user || "user")}). Via <code>systemctl --user ...</code>. Runs without root, isolated from system processes.`),
    });
  }

  groups.push({ title: isRu ? "Идентификация" : "Identity", entries: identityEntries });

  // ── System Status ──
  const systemEntries = [];
  systemEntries.push({
    term: `Status: ${sd.activeState || "-"} (${sd.subState || "-"})`,
    def: isRu
      ? `<strong>activeState</strong>: <code>active</code> = работает, <code>inactive</code> = остановлен, <code>failed</code> = упал с ошибкой, <code>activating</code> = запускается (может быть зациклен в auto-restart). <strong>subState</strong>: <code>running</code> = процесс жив, <code>dead</code> = процесс завершён.`
      : `<strong>activeState</strong>: <code>active</code> = running, <code>inactive</code> = stopped, <code>failed</code> = crashed, <code>activating</code> = starting (may loop). <strong>subState</strong>: <code>running</code> = alive, <code>dead</code> = exited.`,
  });
  if (sd.uptimeSeconds != null) {
    const uptimeH = Math.floor(sd.uptimeSeconds / 3600);
    systemEntries.push({
      term: `Uptime: ${fmtSeconds(sd.uptimeSeconds)}`,
      def: isRu
        ? `Время с последнего запуска. ${uptimeH > 24 ? "Стабильно работает >24ч." : uptimeH > 1 ? "Работает несколько часов." : "Запущен недавно — возможен перезапуск."}`
        : `Time since last start. ${uptimeH > 24 ? "Stable >24h." : uptimeH > 1 ? "Running several hours." : "Started recently — possibly restarted."}`,
    });
  }
  systemEntries.push({
    term: `Restarts: ${fmtInt(sd.nRestarts)}`,
    def: isRu
      ? `Автоперезапуски systemd после сбоя. Высокое число = нестабильность. 0 = стабильно с последнего ручного запуска.`
      : `Auto-restarts by systemd after crashes. High count = instability. 0 = stable since last manual start.`,
  });
  systemEntries.push({
    term: `Memory: ${fmtBytes(sd.memoryCurrentBytes)}`,
    def: isRu
      ? `RAM процесса. Clawdbot: 200–500 МБ (Node.js + CLI). Droid: ~100–200 МБ (Python). >1 ГБ = возможна утечка.`
      : `Process RAM. Clawdbot: 200–500 MB (Node.js + CLI). Droid: ~100–200 MB (Python). >1 GB = possible leak.`,
  });
  systemEntries.push({
    term: `PID: ${sd.mainPid || "-"}`,
    def: isRu
      ? `Process ID — уникальный номер процесса. Меняется при перезапуске. Для отладки: <code>strace -p ${sd.mainPid}</code>.`
      : `Process ID — unique process number. Changes on restart. Debug: <code>strace -p ${sd.mainPid}</code>.`,
  });
  groups.push({ title: isRu ? "Состояние системы" : "System Status", entries: systemEntries });

  // ── Unit Details / Environment ──
  const unitPayload = state.details.unitDetails;
  if (unitPayload) {
    const envEntries = [];
    const uf = unitPayload.unitFile || {};

    if (unitPayload.fragmentPath) {
      envEntries.push({
        term: unitPayload.fragmentPath,
        def: isRu
          ? `<strong>Fragment path</strong> — файл юнита systemd. Описывает команду запуска, переменные окружения, рабочую директорию, политику перезапуска. Редактировать: <code>sudo nano ${escapeHtml(unitPayload.fragmentPath)}</code>, затем <code>sudo systemctl daemon-reload</code>.`
          : `<strong>Fragment path</strong> — the systemd unit file. Defines start command, env vars, working dir, restart policy. Edit: <code>sudo nano ${escapeHtml(unitPayload.fragmentPath)}</code>, then <code>sudo systemctl daemon-reload</code>.`,
      });
    }
    if (uf.workingDirectory) {
      envEntries.push({
        term: `WorkingDirectory: ${uf.workingDirectory}`,
        def: isRu ? `Рабочая директория процесса — корень проекта.` : `Process working directory — the project root.`,
      });
    }
    if (uf.execStart) {
      envEntries.push({
        term: `ExecStart: ${uf.execStart}`,
        def: isRu
          ? `<strong>Команда запуска</strong>. <code>/usr/bin/clawdbot gateway</code> = Clawdbot в режиме gateway (HTTP + Telegram). Для Droid: обычно <code>python3 bot.py</code>.`
          : `<strong>Start command</strong>. <code>/usr/bin/clawdbot gateway</code> = Clawdbot gateway mode (HTTP + Telegram). For Droid: typically <code>python3 bot.py</code>.`,
      });
    }

    const shownEnv = uf.env && uf.env.shown ? uf.env.shown : {};
    for (const [key, val] of Object.entries(shownEnv)) {
      let explanation;
      if (key === "CLAWDBOT_CONFIG_PATH") {
        explanation = isRu
          ? `<strong>Путь к конфигу Clawdbot</strong> — JSON-файл, определяющий поведение бота: AI-бэкенд (Claude/Codex/Antigravity/Kimi/MiniMax), список workspace, токены Telegram, таймауты, параллельность, режимы (bypass-sandbox, bypass-permissions). Каждый бот имеет свой конфиг.`
          : `<strong>Clawdbot config path</strong> — JSON file defining bot behavior: AI backend (Claude/Codex/Antigravity/Kimi/MiniMax), workspace list, Telegram tokens, timeouts, concurrency, modes (bypass-sandbox, bypass-permissions). Each bot has its own config.`;
      } else if (key === "CLAWDBOT_GATEWAY_PORT") {
        explanation = isRu
          ? `<strong>Порт gateway</strong> — HTTP-порт, где Clawdbot слушает. Telegram-коннектор и cli-bridge подключаются сюда. Совпадает с <code>port</code> в карточке.`
          : `<strong>Gateway port</strong> — HTTP port where Clawdbot listens. Telegram connector and cli-bridge connect here. Matches <code>port</code> in the card.`;
      } else if (key === "CLAWDBOT_STATE_DIR") {
        explanation = isRu
          ? `<strong>Директория состояния</strong> — папка, где Clawdbot хранит данные: историю сессий (SQLite), логи токенов, очередь задач. Именно отсюда дашборд берёт статистику (токены, стоимость, ошибки). Путь уникален для каждого бота.`
          : `<strong>State directory</strong> — folder where Clawdbot stores data: session history (SQLite), token logs, job queue. The dashboard reads stats from here (tokens, cost, errors). Path is unique per bot.`;
      } else {
        explanation = isRu
          ? `Переменная окружения: <code>${escapeHtml(key)}=${escapeHtml(val)}</code>`
          : `Environment variable: <code>${escapeHtml(key)}=${escapeHtml(val)}</code>`;
      }
      envEntries.push({ term: `${key}=${val}`, def: explanation });
    }

    const hiddenKeys = uf.env && uf.env.hiddenKeys ? uf.env.hiddenKeys : [];
    if (hiddenKeys.length) {
      envEntries.push({
        term: isRu ? `Скрытые: ${hiddenKeys.join(", ")}` : `Hidden: ${hiddenKeys.join(", ")}`,
        def: isRu
          ? `Скрыты из безопасности. Обычно <code>PATH</code>, <code>TERM</code>, <code>FORCE_COLOR</code> — не несут конфигурационной ценности.`
          : `Hidden for security. Typically <code>PATH</code>, <code>TERM</code>, <code>FORCE_COLOR</code> — no config value.`,
      });
    }
    if (envEntries.length) groups.push({ title: isRu ? "Юнит и окружение" : "Unit & Environment", entries: envEntries });
  }

  // ── Usage & Cost ──
  const usageEntries = [];
  usageEntries.push({
    term: isRu ? `Токены (24ч): ${fmtInt(w24.tokens)}` : `Tokens (24h): ${fmtInt(w24.tokens)}`,
    def: isRu
      ? `<strong>Токены</strong> за 24ч. Токен ≈ 4 англ. символа / 1-2 рус. символа. AI тарифицируются за input + output токены.`
      : `<strong>Tokens</strong> in 24h. A token ≈ 4 English chars / 1-2 Russian chars. AI models charge per input + output tokens.`,
  });
  usageEntries.push({
    term: isRu ? `Стоимость (24ч): ${fmtMoneyUsd(w24.costUSD)}` : `Cost (24h): ${fmtMoneyUsd(w24.costUSD)}`,
    def: isRu
      ? `Стоимость API-вызовов за 24ч в USD. Claude Opus — дороже, Codex/MiniMax — дешевле.`
      : `API call cost in 24h (USD). Claude Opus is most expensive, Codex/MiniMax are cheaper.`,
    compare: isRu
      ? `Этот бот #${costRank} из ${totalBots} по общей стоимости. Доля: ${thisCostPct}% ($${totalCost.toFixed(2)} всего).`
      : `This bot is #${costRank} of ${totalBots} by total cost. Share: ${thisCostPct}% ($${totalCost.toFixed(2)} total).`,
  });
  if (allTime.tokens) {
    usageEntries.push({
      term: isRu ? `Всего: ${fmtInt(allTime.tokens)} ток., ${fmtMoneyUsd(allTime.costUSD)}` : `All-time: ${fmtInt(allTime.tokens)} tok, ${fmtMoneyUsd(allTime.costUSD)}`,
      def: isRu
        ? `${fmtInt(allTime.requests)} запросов, ${fmtInt(allTime.errors)} ошибок за всё время.`
        : `${fmtInt(allTime.requests)} requests, ${fmtInt(allTime.errors)} errors lifetime.`,
    });
  }
  if (usage.sessionsFiles != null) {
    usageEntries.push({
      term: isRu ? `Сессии: ${fmtInt(usage.sessionsFiles)} (${fmtBytes(usage.sessionsBytes)})` : `Sessions: ${fmtInt(usage.sessionsFiles)} (${fmtBytes(usage.sessionsBytes)})`,
      def: isRu
        ? `Файлы сессий в state-директории. Каждая сессия = отдельный диалог или CLI-задача.`
        : `Session files in state dir. Each session = separate conversation or CLI job.`,
    });
  }
  groups.push({ title: isRu ? "Использование и стоимость" : "Usage & Cost", entries: usageEntries });

  // ── Providers ──
  if (providerNames.length) {
    const providerEntries = [];
    for (const name of providerNames) {
      const prov = providers[name];
      const models = prov.models ? Object.keys(prov.models) : [];
      let provExplain;
      if (name === "anthropic") {
        provExplain = isRu
          ? `<strong>Anthropic</strong> — провайдер Claude. Модели: ${models.join(", ")}. Самый дорогой (~$15/$75 за 1M input/output), но самый мощный.`
          : `<strong>Anthropic</strong> — Claude provider. Models: ${models.join(", ")}. Most expensive (~$15/$75 per 1M in/out), but most capable.`;
      } else if (name.includes("codex") || name.includes("openai")) {
        provExplain = isRu
          ? `<strong>${escapeHtml(name)}</strong> — Codex/GPT (OpenAI). Модели: ${models.join(", ")}. Быстрый для кода, дешевле Claude.`
          : `<strong>${escapeHtml(name)}</strong> — Codex/GPT (OpenAI). Models: ${models.join(", ")}. Fast for code, cheaper than Claude.`;
      } else if (name.includes("minimax")) {
        provExplain = isRu
          ? `<strong>${escapeHtml(name)}</strong> — MiniMax. Модели: ${models.join(", ")}. Альтернативный провайдер, обычно самый дешёвый.`
          : `<strong>${escapeHtml(name)}</strong> — MiniMax. Models: ${models.join(", ")}. Alternative provider, typically cheapest.`;
      } else if (name.includes("kimi")) {
        provExplain = isRu
          ? `<strong>${escapeHtml(name)}</strong> — Kimi (Moonshot AI). Модели: ${models.join(", ")}. Специализация на коде.`
          : `<strong>${escapeHtml(name)}</strong> — Kimi (Moonshot AI). Models: ${models.join(", ")}. Code specialist.`;
      } else if (name.includes("antigravity")) {
        provExplain = isRu
          ? `<strong>${escapeHtml(name)}</strong> — Antigravity. Модели: ${models.join(", ")}.`
          : `<strong>${escapeHtml(name)}</strong> — Antigravity. Models: ${models.join(", ")}.`;
      } else {
        provExplain = isRu
          ? `<strong>${escapeHtml(name)}</strong> — AI-провайдер. Модели: ${models.join(", ") || "-"}.`
          : `<strong>${escapeHtml(name)}</strong> — AI provider. Models: ${models.join(", ") || "-"}.`;
      }
      providerEntries.push({
        term: `${name}: ${fmtInt(prov.tokens)} tok, ${fmtMoneyUsd(prov.costUSD)}`,
        def: provExplain,
      });
    }
    groups.push({ title: isRu ? "Провайдеры AI" : "AI Providers", entries: providerEntries });
  }

  // ── Health ──
  const healthEntries = [];
  const issues = (bot.health && Array.isArray(bot.health.issues)) ? bot.health.issues : [];
  if (issues.length) {
    for (const issue of issues) {
      healthEntries.push({
        term: issue.message || issue.key || "Issue",
        def: isRu
          ? `<strong>Severity: ${escapeHtml(issue.severity || "?")}</strong>. ${issue.hint ? escapeHtml(issue.hint) : "Обнаружено в логах."} ${issue.key && issue.key.includes("oauth") ? "Решается кнопкой «Sync Claude auth» + Restart." : ""}`
          : `<strong>Severity: ${escapeHtml(issue.severity || "?")}</strong>. ${issue.hint ? escapeHtml(issue.hint) : "Detected in logs."} ${issue.key && issue.key.includes("oauth") ? "Fix: \"Sync Claude auth\" + Restart." : ""}`,
      });
    }
  } else {
    healthEntries.push({
      term: isRu ? "Все системы работают" : "All systems operational",
      def: isRu
        ? "Нет проблем. Дашборд проверяет: OAuth-ошибки, конфликты портов, отсутствие бинарников, ошибки Telegram."
        : "No issues. Dashboard checks: OAuth errors, port conflicts, missing binaries, Telegram connection errors.",
    });
  }
  groups.push({ title: isRu ? "Здоровье" : "Health", entries: healthEntries });

  // Render
  box.innerHTML = groups.map(g => `
    <div class="fieldGuideGroup">
      <div class="fieldGuideGroupTitle">${escapeHtml(g.title)}</div>
      ${g.entries.map(e => `
        <div class="fieldGuideEntry">
          <div class="fieldGuideTerm">${escapeHtml(e.term)}</div>
          <div class="fieldGuideDef">${e.def}</div>
          ${e.compare ? `<div class="fieldGuideCompare">${e.compare}</div>` : ""}
        </div>
      `).join("")}
    </div>
  `).join("");
}

// ============================================
// Log Download
// ============================================
function downloadLogs() {
  const raw = state.details.logsRaw;
  const unit = state.details.logsUnit || "logs";
  if (!raw) { showToast("No logs to download", "error"); return; }
  const blob = new Blob([raw], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${unit.replace(/[^a-zA-Z0-9@._-]/g, "_")}_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.log`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

function updateSelectionClasses() {
  const sel = state.selectedUnit;
  // Grid
  for (const card of document.querySelectorAll(".botCard")) {
    card.classList.toggle("selected", card.dataset.unit === sel);
  }
  // Table
  for (const row of document.querySelectorAll("#botsTbody tr")) {
    row.classList.toggle("rowSelected", row.dataset.unit === sel);
  }
}

function openDetails(unit, { updateUrl = true } = {}) {
  hideHoverPreview();
  if (!state.details.inited) initDetailsUi();
  if (!state.data) return null;
  const bot = (state.data && state.data.bots || []).find(b => b.unit === unit);
  if (!bot) return false;

  const modal = $("detailModal");
  const wasOpen = Boolean(modal && !modal.hidden);
  if (modal && modal.hidden) state.details.lastFocus = document.activeElement;

  state.selectedUnit = unit;
  renderDetails(bot);
  
  updateSelectionClasses();

  if (updateUrl) setUrlUnit(unit, { replace: wasOpen });
  const closeBtn = $("closeDetailBtn");
  if (closeBtn) closeBtn.focus();
  return true;
}

/* ── Live Uptime Ticker ── */
let _uptimeTickerTimer = null;
let _uptimeTickerStartMs = 0;
let _uptimeTickerBaseSeconds = 0;

function startUptimeTicker(bot) {
  stopUptimeTicker();
  const sd = bot.systemd || {};
  if (sd.activeState !== "active" || !Number.isFinite(sd.uptimeSeconds) || sd.uptimeSeconds <= 0) return;

  _uptimeTickerBaseSeconds = sd.uptimeSeconds;
  _uptimeTickerStartMs = Date.now();

  // Find or create the uptime chip in detail meta
  updateUptimeChip();
  _uptimeTickerTimer = setInterval(updateUptimeChip, 1000);
}

function stopUptimeTicker() {
  if (_uptimeTickerTimer) {
    clearInterval(_uptimeTickerTimer);
    _uptimeTickerTimer = null;
  }
}

function updateUptimeChip() {
  const metaEl = $("detailMetaLine");
  if (!metaEl) return;

  const elapsed = (Date.now() - _uptimeTickerStartMs) / 1000;
  const totalSec = Math.floor(_uptimeTickerBaseSeconds + elapsed);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const u = normalizeLang(state.ui.lang) === "ru" ? { d: "д", h: "ч", m: "м", s: "с" } : { d: "d", h: "h", m: "m", s: "s" };

  let text;
  if (d > 0) text = `${d}${u.d} ${h}${u.h} ${m}${u.m}`;
  else if (h > 0) text = `${h}${u.h} ${m}${u.m}`;
  else text = `${m}${u.m}`;
  const secStr = `${String(s).padStart(2, "0")}${u.s}`;

  // Update existing uptimeLive chip or find uptime chip
  let liveChip = metaEl.querySelector(".uptimeLive");
  if (!liveChip) {
    // Find a chip that looks like uptime (contains "d " or "h " or "m ")
    const chips = metaEl.querySelectorAll(".metaChip");
    for (const chip of chips) {
      const txt = chip.textContent || "";
      if (/\d+[dhдч]\s/.test(txt) && !chip.querySelector("a") && !chip.querySelector("code")) {
        chip.classList.add("uptimeLive");
        liveChip = chip;
        break;
      }
    }
  }
  if (liveChip) {
    liveChip.innerHTML = `${text} <span class="uptimeLiveSec">${secStr}</span>`;
  }
}

function closeDetails({ updateUrl = true } = {}) {
  if (updateUrl && getUrlUnit()) {
    // Prefer "real" back navigation, so Back/Forward works naturally and we don't
    // create duplicate history entries. Deep-links are handled by seeding a base
    // entry via ensureDetailsHistorySeeded().
    try { history.back(); } catch { /* ignore */ }
    return;
  }

  // Stop log follow mode and uptime ticker
  setFollowLogs(false);
  stopUptimeTicker();

  const modal = $("detailModal");
  if (modal) {
    modal.classList.add("modalClosing");
    const onEnd = () => {
      modal.removeEventListener("animationend", onEnd);
      modal.classList.remove("modalClosing");
      modal.hidden = true;
      document.body.classList.remove("modalOpen");
    };
    modal.addEventListener("animationend", onEnd);
    // Safety fallback in case animationend doesn't fire
    setTimeout(onEnd, 250);
  }

  state.selectedUnit = null;
  updateSelectionClasses();

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

  // Preserve the connection dot when updating
  const connDot = $("connDot");
  const connHtml = connDot ? connDot.outerHTML : "";
  $("updatedAt").innerHTML = `${connHtml}${t("updated_prefix")}${escapeHtml(fmtIso(data.generatedAt))}`;
  $("relativeTime").textContent = relativeTime(data.generatedAt);
  $("tzLabel").textContent = `${t("timezone_prefix")}${data.timezone || "-"}`;
  updatePageTitleBadge(data);
}

async function refresh() {
  setError("");
  try {
    const r = await fetch("/api/bots", { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();

    // Detect status changes before updating state
    detectStatusChanges(state.data, data);

    state.prevData = state.data;
    const isFirstLoad = !state.data;
    state.data = data;
    setConnStatus(true);

    // Skip row animation on auto-refresh (only animate on first load/filter changes)
    if (!isFirstLoad) state._skipRowAnim = true;

    renderHeader(data);

    renderStatusStrip(data);
    renderSummary(data);
    renderFleetBar(data);
    renderInsights(data);
    renderFilterChips(data);
    renderBotsTable(data);
    renderIssuesBadge(data);
    state._skipRowAnim = false;

    if (state.selectedUnit) {
      const still = (data.bots || []).find(b => b.unit === state.selectedUnit);
      if (still) renderDetails(still);
      else closeDetails({ updateUrl: true });
    }
    syncDetailsFromUrl();
  } catch (e) {
    setConnStatus(false);
    setError(t("load_api_failed", { error: String(e && (e.message || e) || "") }));
  }
}

function setAuto(on) {
  state.auto = on;
  const autoBtn = $("autoBtn");
  // Preserve countdown ring when updating button content
  const ring = $("countdownRing");
  const ringHtml = ring ? ring.outerHTML : "";
  if (autoBtn) {
    autoBtn.innerHTML = `${on ? t("auto_on") : t("auto_off")} ${ringHtml}`;
    autoBtn.className = `btn ${on ? "btnSecondary" : ""}`.trim();
  }
  lsSet("auto", on ? "1" : "0");
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  stopCountdown();
  if (on) {
    state.timer = setInterval(() => {
      refresh();
      startCountdown();
    }, REFRESH_INTERVAL);
    startCountdown();
  }
  const ringEl = $("countdownRing");
  if (ringEl) ringEl.style.display = on ? "" : "none";
}

/* ── Sort header indicators ── */
function updateSortHeaders() {
  const current = state.ui.sort || "name";
  for (const th of document.querySelectorAll("th[data-sort]")) {
    const key = th.dataset.sort;
    const base = key.replace(/_(asc|desc)$/, "");
    const currentBase = current.replace(/_(asc|desc)$/, "");
    const isActive = base === currentBase;
    th.classList.toggle("sortActive", isActive);
    th.classList.toggle("sortDesc", isActive && current.endsWith("_desc"));
    th.classList.toggle("sortAsc", isActive && !current.endsWith("_desc"));
  }
}

/* ── Loading Skeleton ── */
function showLoadingSkeleton() {
  const summary = $("summary");
  if (summary && !summary.children.length) {
    summary.innerHTML = Array.from({ length: 4 }, () =>
      `<div class="pill skeleton skeletonPill"></div>`
    ).join("");
  }
  const fleet = $("fleetBar");
  if (fleet && !fleet.children.length) {
    fleet.innerHTML = `<div class="skeleton skeletonBar" style="flex:1"></div>`;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  showLoadingSkeleton();
  initConfirmUi();
  initFieldGuide();
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
      // Reset chip filter when using dropdown
      state.chipFilter = "all";
      if (state.data) {
        renderFilterChips(state.data);
        renderBotsTable(state.data);
      }
    });
  }
  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      state.ui.sort = sortSelect.value || "name";
      lsSet("sort", state.ui.sort);
      if (state.data) renderBotsTable(state.data);
    });
  }

  /* ── Sortable column headers ── */
  for (const th of document.querySelectorAll("th[data-sort]")) {
    th.addEventListener("click", () => {
      const sortKey = th.dataset.sort;
      if (!sortKey) return;
      // Toggle direction if clicking the same column
      if (state.ui.sort === sortKey) {
        // Already sorting by this — toggle between asc/desc variant
        if (sortKey.endsWith("_desc")) {
          state.ui.sort = sortKey.replace(/_desc$/, "_asc");
        } else if (sortKey.endsWith("_asc")) {
          state.ui.sort = sortKey.replace(/_asc$/, "_desc");
        } else {
          // "name" sort — just keep it
          state.ui.sort = sortKey;
        }
      } else {
        state.ui.sort = sortKey;
      }
      lsSet("sort", state.ui.sort);
      if (sortSelect) sortSelect.value = state.ui.sort;
      updateSortHeaders();
      if (state.data) renderBotsTable(state.data);
    });
  }

  /* ── View toggle ── */
  setViewCompact(state.viewCompact);
  const viewToggleBtn = $("viewToggleBtn");
  if (viewToggleBtn) {
    viewToggleBtn.addEventListener("click", () => setViewCompact(!state.viewCompact));
  }

  const layoutToggleBtn = $("layoutToggleBtn");
  if (layoutToggleBtn) {
    layoutToggleBtn.addEventListener("click", () => setLayoutGrid(!state.viewGrid));
  }
  setLayoutGrid(state.viewGrid);

  /* ── Select-all checkbox ── */
  const selectAllCb = $("selectAllCheckbox");
  if (selectAllCb) {
    selectAllCb.addEventListener("change", () => {
      const visible = state.visibleUnits || [];
      if (selectAllCb.checked) {
        for (const u of visible) state.batch.add(u);
      } else {
        for (const u of visible) state.batch.delete(u);
      }
      if (state.data) renderBotsTable(state.data);
    });
  }

  /* ── Batch clear ── */
  const batchClearBtn = $("batchClearBtn");
  if (batchClearBtn) batchClearBtn.addEventListener("click", () => {
    clearBatch();
    if (state.data) renderBotsTable(state.data);
  });

  /* ── Grid/Table delegation ── */
  const botsGrid = $("botsGrid");
  if (botsGrid) {
    botsGrid.addEventListener("click", (e) => {
      const card = e.target.closest(".botCard");
      if (!card) return;
      const unit = card.dataset.unit;
      if (!unit) return;
      const btn = e.target.closest("button");
      if (btn) {
        const action = btn.dataset.action;
        if (action === "pin") { e.stopPropagation(); togglePin(unit); return; }
        if (action === "details") { e.stopPropagation(); toggleDetails(unit); return; }
      }
      toggleDetails(unit);
    });
  }
  const botsTbody = $("botsTbody");
  if (botsTbody) {
    botsTbody.addEventListener("click", (e) => {
      const target = e.target;
      const row = target.closest("tr");
      if (!row) return;
      const unit = row.dataset.unit;
      if (!unit) return;
      const btn = target.closest("button");
      if (btn) {
        const action = btn.dataset.action;
        if (action) {
          e.stopPropagation();
          if (action === "pin") togglePin(unit);
          else if (action === "details") toggleDetails(unit);
          else if (["stop", "restart", "start", "enable", "disable"].includes(action)) doAction(unit, action);
          return;
        }
      }
      if (target.closest(".rowCheckbox")) { e.stopPropagation(); toggleBatchUnit(unit); return; }
      toggleDetails(unit);
    });
    // Hover preview (desktop only)
    botsTbody.addEventListener("mouseenter", (e) => {
      const row = e.target.closest("tr");
      if (!row || row.classList.contains("sparkRow") || window.innerWidth < 680) return;
      const unit = row.dataset.unit;
      if (!unit || !state.data) return;
      const bot = state.data.bots.find(b => b.unit === unit);
      if (!bot) return;
      clearTimeout(_hoverTimer);
      _hoverTimer = setTimeout(() => showHoverPreview(bot, e.clientX, e.clientY), 500);
    }, true);
    botsTbody.addEventListener("mousemove", (e) => {
      const row = e.target.closest("tr");
      if (!row || row.classList.contains("sparkRow") || _hoverUnit !== row.dataset.unit) return;
      const el = $("hoverPreview");
      if (!el || el.hidden) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = e.clientX + 16;
      let top = e.clientY - 20;
      const rect = el.getBoundingClientRect();
      if (left + rect.width > vw - 16) left = e.clientX - rect.width - 16;
      if (top + rect.height > vh - 16) top = vh - rect.height - 16;
      if (top < 16) top = 16;
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    }, true);
    botsTbody.addEventListener("mouseleave", hideHoverPreview, true);
  }

  /* ── CSV export ── */
  const exportBtn = $("exportCsvBtn");
  if (exportBtn) exportBtn.addEventListener("click", exportCsv);

  /* ── Notifications ── */
  const notifBtn = $("notifBtn");
  if (notifBtn) {
    // Update visual state
    const updateNotifBtn = () => {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        notifBtn.classList.add("active");
        notifBtn.title = t("notif_enabled");
      }
    };
    updateNotifBtn();
    notifBtn.addEventListener("click", async () => {
      await requestNotifications();
      updateNotifBtn();
    });
  }

  /* ── Command Palette ── */
  const cmdPalette = $("cmdPalette");
  const cmdPaletteBg = $("cmdPaletteBg");
  const cmdPaletteInput = $("cmdPaletteInput");
  const cmdPaletteResults = $("cmdPaletteResults");

  let cmdActiveIdx = 0;
  let cmdItems = [];

  function openCmdPalette() {
    if (!cmdPalette) return;
    cmdPalette.hidden = false;
    document.body.classList.add("modalOpen");
    cmdPaletteInput.value = "";
    cmdActiveIdx = 0;
    renderCmdResults("");
    setTimeout(() => cmdPaletteInput.focus(), 50);
  }

  function closeCmdPalette() {
    if (!cmdPalette) return;
    cmdPalette.hidden = true;
    document.body.classList.remove("modalOpen");
  }

  function fuzzyMatch(query, text) {
    if (!query) return { match: true, score: 0, indices: [] };
    const q = query.toLowerCase();
    const t = text.toLowerCase();
    // Simple substring match with position tracking
    const idx = t.indexOf(q);
    if (idx >= 0) {
      const indices = [];
      for (let i = idx; i < idx + q.length; i++) indices.push(i);
      return { match: true, score: idx === 0 ? 100 : 80, indices };
    }
    // Character-by-character fuzzy
    let qi = 0;
    const indices = [];
    let score = 0;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
      if (t[ti] === q[qi]) {
        indices.push(ti);
        score += (ti === 0 || t[ti - 1] === " " || t[ti - 1] === "-" || t[ti - 1] === "_") ? 10 : 5;
        qi++;
      }
    }
    if (qi === q.length) return { match: true, score, indices };
    return { match: false, score: 0, indices: [] };
  }

  function highlightFuzzy(text, indices) {
    if (!indices.length) return escapeHtml(text);
    const chars = [...text];
    const set = new Set(indices);
    let out = "";
    let inMark = false;
    for (let i = 0; i < chars.length; i++) {
      if (set.has(i) && !inMark) { out += "<mark>"; inMark = true; }
      else if (!set.has(i) && inMark) { out += "</mark>"; inMark = false; }
      out += escapeHtml(chars[i]);
    }
    if (inMark) out += "</mark>";
    return out;
  }

  function renderCmdResults(query) {
    if (!cmdPaletteResults) return;
    const qRaw = String(query || "").trim();
    const qLower = qRaw.toLowerCase();
    const bots = state.data ? (state.data.bots || []) : [];
    cmdItems = [];

    // Check for special filters
    const isFilter = qLower.startsWith("is:");
    const filterType = isFilter ? qLower.slice(3) : null;

    // Bot results
    const botResults = [];
    for (const bot of bots) {
      if (isFilter) {
        if (filterType === "active" && (bot.systemd && bot.systemd.activeState) !== "active") continue;
        if (filterType === "inactive" && (bot.systemd && bot.systemd.activeState) === "active") continue;
        if (filterType === "issue" && !botHasIssues(bot)) continue;
      }

      const name = bot.displayName || bot.unit;
      const searchText = [name, bot.telegramHandle, bot.unit, bot.type, bot.profile].filter(Boolean).join(" ");
      const m = fuzzyMatch(qRaw, searchText);
      if (!m.match && !isFilter) continue;
      const nameMatch = fuzzyMatch(qRaw, name);
      botResults.push({ bot, score: isFilter ? 100 : m.score, nameMatch });
    }
    botResults.sort((a, b) => b.score - a.score);

    // Quick actions
    const actions = [
      { icon: "\u{1F504}", name: t("cmd_refresh"), meta: "R", action: () => { closeCmdPalette(); refresh(); } },
      { icon: "\u{1F4E6}", name: t("cmd_export"), meta: "CSV", action: () => { closeCmdPalette(); exportCsv(); } },
      { icon: "\u{1F514}", name: t("cmd_notif"), meta: "N", action: () => { closeCmdPalette(); requestNotifications(); } },
      { icon: "\u{1F50D}", name: t("cmd_filter"), meta: "/", action: () => { closeCmdPalette(); const fi = $("filterInput"); if (fi) fi.focus(); } },
      { icon: "\u{2328}", name: t("cmd_shortcuts"), meta: "?", action: () => { closeCmdPalette(); showShortcuts(); } },
      { icon: "\u{1F4CB}", name: t("cmd_compact"), meta: "", action: () => { closeCmdPalette(); setViewCompact(!state.viewCompact); } },
      { icon: "\u{1F532}", name: state.viewGrid ? t("layout_table") : t("layout_grid"), meta: "", action: () => { closeCmdPalette(); setLayoutGrid(!state.viewGrid); } },
    ];

    const filteredActions = qRaw
      ? actions.filter(a => fuzzyMatch(qRaw, a.name + " " + a.meta).match)
      : actions;

    let html = "";

    // Bots section
    if (botResults.length) {
      html += `<div class="cmdPaletteGroup"><div class="cmdPaletteGroupLabel">${escapeHtml(t("cmd_group_bots"))}</div>`;
      const shown = botResults.slice(0, 8);
      for (const { bot, nameMatch } of shown) {
        const name = bot.displayName || bot.unit;
        const dotCls = statusDotClass(bot);
        const nameHtml = nameMatch.match && nameMatch.indices.length ? highlightFuzzy(name, nameMatch.indices) : escapeHtml(name);
        const meta = [bot.telegramHandle, bot.type].filter(Boolean).join(" \u2022 ");
        const idx = cmdItems.length;
        cmdItems.push({
          type: "bot",
          bot,
          action: () => { closeCmdPalette(); openDetails(bot.unit); },
        });
        html += `
          <div class="cmdPaletteItem${idx === cmdActiveIdx ? " cmdActive" : ""}" data-cmd-idx="${idx}">
            <span class="cmdPaletteItemIcon"><span class="cmdPaletteItemDot ${dotCls}"></span></span>
            <div class="cmdPaletteItemBody">
              <div class="cmdPaletteItemName">${nameHtml}</div>
              <div class="cmdPaletteItemMeta">${escapeHtml(meta)}</div>
            </div>
            <span class="cmdPaletteItemRight">${escapeHtml(fmtMoneyUsd(((bot.usage && bot.usage.windows && bot.usage.windows["24h"]) || {}).costUSD || 0))} 24h</span>
          </div>`;
      }
      html += `</div>`;
    }

    // Actions section
    if (filteredActions.length) {
      html += `<div class="cmdPaletteGroup"><div class="cmdPaletteGroupLabel">${escapeHtml(t("cmd_group_actions"))}</div>`;
      for (const a of filteredActions) {
        const idx = cmdItems.length;
        cmdItems.push({ type: "action", action: a.action });
        const nameHtml = q ? highlightFuzzy(a.name, fuzzyMatch(q, a.name).indices) : escapeHtml(a.name);
        html += `
          <div class="cmdPaletteItem${idx === cmdActiveIdx ? " cmdActive" : ""}" data-cmd-idx="${idx}">
            <span class="cmdPaletteItemIcon">${a.icon}</span>
            <div class="cmdPaletteItemBody">
              <div class="cmdPaletteItemName">${nameHtml}</div>
              <div class="cmdPaletteItemMeta">${escapeHtml(a.meta)}</div>
            </div>
          </div>`;
      }
      html += `</div>`;
    }

    // Per-bot quick actions (when query matches a bot clearly)
    if (botResults.length === 1 || (botResults.length > 0 && botResults[0].score >= 80)) {
      const topBot = botResults[0].bot;
      const activeState = String(topBot.systemd && topBot.systemd.activeState || "");
      const botActions = [];
      const bName = topBot.displayName || topBot.unit;
      if (activeState === "active") {
        botActions.push({ icon: "\u{1F6D1}", name: t("cmd_stop", { name: bName }), action: () => { closeCmdPalette(); doAction(topBot.unit, "stop"); } });
        botActions.push({ icon: "\u{1F504}", name: t("cmd_restart", { name: bName }), action: () => { closeCmdPalette(); doAction(topBot.unit, "restart"); } });
      } else {
        botActions.push({ icon: "\u{25B6}\u{FE0F}", name: t("cmd_start", { name: bName }), action: () => { closeCmdPalette(); doAction(topBot.unit, "start"); } });
      }
      botActions.push({ icon: "\u{1F4C4}", name: t("cmd_logs", { name: bName }), action: () => { closeCmdPalette(); openDetails(topBot.unit); setTimeout(() => { const btn = $("loadLogsBtn"); if (btn) btn.click(); }, 300); } });

      html += `<div class="cmdPaletteGroup"><div class="cmdPaletteGroupLabel">${escapeHtml(t("cmd_group_quick"))}</div>`;
      for (const a of botActions) {
        const idx = cmdItems.length;
        cmdItems.push({ type: "action", action: a.action });
        html += `
          <div class="cmdPaletteItem${idx === cmdActiveIdx ? " cmdActive" : ""}" data-cmd-idx="${idx}">
            <span class="cmdPaletteItemIcon">${a.icon}</span>
            <div class="cmdPaletteItemBody">
              <div class="cmdPaletteItemName">${escapeHtml(a.name)}</div>
            </div>
          </div>`;
      }
      html += `</div>`;
    }

    if (!html) {
      html = `<div class="cmdPaletteEmpty">${escapeHtml(t("cmd_no_results"))}</div>`;
    }

    cmdPaletteResults.innerHTML = html;

    // Click handlers for items
    for (const el of cmdPaletteResults.querySelectorAll("[data-cmd-idx]")) {
      el.addEventListener("click", () => {
        const idx = parseInt(el.dataset.cmdIdx, 10);
        if (cmdItems[idx] && cmdItems[idx].action) cmdItems[idx].action();
      });
      el.addEventListener("mouseenter", () => {
        cmdActiveIdx = parseInt(el.dataset.cmdIdx, 10);
        updateCmdActive();
      });
    }
  }

  function updateCmdActive() {
    if (!cmdPaletteResults) return;
    for (const el of cmdPaletteResults.querySelectorAll(".cmdPaletteItem")) {
      const idx = parseInt(el.dataset.cmdIdx, 10);
      el.classList.toggle("cmdActive", idx === cmdActiveIdx);
    }
    // Scroll active into view
    const active = cmdPaletteResults.querySelector(".cmdActive");
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  if (cmdPaletteInput) {
    cmdPaletteInput.addEventListener("input", () => {
      cmdActiveIdx = 0;
      renderCmdResults(cmdPaletteInput.value);
    });
    cmdPaletteInput.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        cmdActiveIdx = Math.min(cmdActiveIdx + 1, cmdItems.length - 1);
        updateCmdActive();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        cmdActiveIdx = Math.max(cmdActiveIdx - 1, 0);
        updateCmdActive();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (cmdItems[cmdActiveIdx] && cmdItems[cmdActiveIdx].action) {
          cmdItems[cmdActiveIdx].action();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeCmdPalette();
      }
    });
  }

  if (cmdPaletteBg) cmdPaletteBg.addEventListener("click", closeCmdPalette);
  const cmdKBtn = $("cmdKBtn");
  if (cmdKBtn) cmdKBtn.addEventListener("click", openCmdPalette);

  /* ── Global keyboard shortcuts ── */
  document.addEventListener("keydown", (e) => {
    // Cmd/Ctrl+K opens command palette from anywhere
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      const palette = $("cmdPalette");
      if (palette && !palette.hidden) closeCmdPalette();
      else openCmdPalette();
      return;
    }

    // Skip if command palette is open
    if (cmdPalette && !cmdPalette.hidden) return;

    // Skip if inside input/select/textarea
    const tag = String(e.target && e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || (e.target && e.target.isContentEditable)) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;

    const shortcutsOverlay = $("shortcutsOverlay");
    if (shortcutsOverlay && !shortcutsOverlay.hidden) {
      if (e.key === "Escape" || e.key === "?") {
        e.preventDefault();
        hideShortcuts();
      }
      return;
    }

    const detailModal = $("detailModal");
    const confirmModal = $("confirmModal");
    const isDetailOpen = detailModal && !detailModal.hidden;
    const isConfirmOpen = confirmModal && !confirmModal.hidden;

    if (isConfirmOpen) return;

    if (e.key === "?") {
      e.preventDefault();
      showShortcuts();
      return;
    }

    if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      refresh();
      return;
    }

    if (e.key === "/") {
      if (!isDetailOpen) {
        e.preventDefault();
        const fi = $("filterInput");
        if (fi) fi.focus();
        return;
      }
    }

    if (e.key === "a" || e.key === "A") {
      if (!isDetailOpen) {
        e.preventDefault();
        const selectAllCb = $("selectAllCheckbox");
        if (selectAllCb) {
          selectAllCb.checked = !selectAllCb.checked;
          selectAllCb.dispatchEvent(new Event("change"));
        }
        return;
      }
    }

    if ((e.key === "l" || e.key === "L") && isDetailOpen) {
      e.preventDefault();
      if (state.details.logsUnit) loadLogs(state.details.logsUnit);
      return;
    }

    if (e.key === "n" || e.key === "N") {
      e.preventDefault();
      requestNotifications();
      return;
    }
  });

  /* Shortcuts overlay close handlers */
  const shortcutsOverlay = $("shortcutsOverlay");
  const shortcutsBg = $("shortcutsBg");
  const shortcutsCloseBtn = $("shortcutsCloseBtn");
  if (shortcutsBg) shortcutsBg.addEventListener("click", hideShortcuts);
  if (shortcutsCloseBtn) shortcutsCloseBtn.addEventListener("click", hideShortcuts);
  if (shortcutsOverlay) {
    shortcutsOverlay.addEventListener("click", (e) => {
      if (e.target === shortcutsOverlay) hideShortcuts();
    });
  }

  /* ── Page visibility: pause auto-refresh when hidden ── */
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (state.timer) clearInterval(state.timer);
      state.timer = null;
      stopCountdown();
    } else if (state.auto) {
      refresh();
      state.timer = setInterval(() => {
        refresh();
        startCountdown();
      }, REFRESH_INTERVAL);
      startCountdown();
    }
  });

  updateSortHeaders();
  const autoStored = lsGet("auto", "1");
  setAuto(autoStored !== "0");
  refresh();
});
