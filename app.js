"use strict";

const API_ENDPOINT = "/api/salvar";
const ACCESS_ENDPOINT = "/api/acesso";
const ADMIN_ENDPOINT = "/api/admin";
const SUBJECTS_ENDPOINT = "/api/assuntos";
const LEADERS_ENDPOINT = "/api/lideres";
const SERIES_ENDPOINT = "/api/series";
const YOUTUBE_VIDEO_ID = "COLE_AQUI_YOUTUBE_VIDEO_ID";
const DRAFT_KEY = "discipulado-lideres-draft-v1";
const ADMIN_ALLOWED_EMAILS = ["apbergpapai@gmail.com"];

const CHURCH_CONFIG = {
  name: "Igreja Apostólica e Profética Águas Purificadoras",
  logoUrl: "assets/logo-igreja.png",
};

const state = {
  leaders: [],
  series: [],
  trainings: [],
  savedModules: [],
  leaderStatus: "idle",
  trainingStatus: "idle",
  leader: null,
  leaderToken: "",
  email: "",
  loginStep: "email",
  loginName: "",
  loginPurpose: "criar",
  codeDestination: "",
  // Senha e código nunca vão para o localStorage: só vivem em memória.
  password: "",
  passwordConfirm: "",
  temporaryPassword: "",
  code: "",
  isSendingCode: false,
  // Tela de senhas dos lideres (so administrador).
  leaderAccessMode: false,
  leaderAccessList: [],
  leaderAccessSearch: "",
  leaderAccessStatus: "idle",
  leaderAccessResult: null,
  resettingEmail: "",
  selectedLeaderId: "",
  selectedLeaderName: "",
  ministry: "",
  selectedSeriesId: "",
  selectedTrainingId: "",
  creatorMode: false,
  configMode: false,
  configDraft: [],
  seriesMode: false,
  seriesDraft: createEmptySeriesDraft(),
  editingSeriesId: "",
  editingTrainingId: "",
  trainingDraft: createEmptyTrainingDraft(),
  progressByTraining: {},
  currentModuleIndex: -1,
  answers: {},
  isSubmitting: false,
  isSavingModule: false,
  isSavingTraining: false,
  isSavingSeries: false,
  isSavingConfig: false,
  isLoadingSavedAnswers: false,
  isCheckingAdmin: false,
  adminUnlocked: false,
  adminToken: "",
  submissionId: "",
  submitted: false,
};

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
const topbar = document.querySelector(".topbar");
const progressFill = document.querySelector("#progressFill");
const progressLabel = document.querySelector("#progressLabel");
const studyTitle = document.querySelector("#studyTitle");
const churchName = document.querySelector("#churchName");
const churchLogoMark = document.querySelector("#churchLogoMark");
const churchLogoImage = document.querySelector("#churchLogoImage");

let toastTimeout;

document.addEventListener("DOMContentLoaded", init);

function init() {
  setupChurchHeader();
  restoreDraft();
  render();
  loadTrainings();
}

function setupChurchHeader() {
  churchName.textContent = CHURCH_CONFIG.name;
  churchLogoMark.textContent = getChurchInitials(CHURCH_CONFIG.name);

  if (CHURCH_CONFIG.logoUrl) {
    churchLogoImage.src = CHURCH_CONFIG.logoUrl;
    churchLogoImage.alt = `Logo ${CHURCH_CONFIG.name}`;
    churchLogoImage.hidden = false;
    churchLogoMark.hidden = true;
  } else {
    churchLogoImage.hidden = true;
    churchLogoMark.hidden = false;
  }
}

function getPageTitle() {
  if (!state.leader) {
    return "Acesso do Líder e Voluntário";
  }

  if (state.configMode) {
    return "Liberação das séries";
  }

  if (state.seriesMode) {
    return state.editingSeriesId ? "Editar série" : "Criar série";
  }

  if (state.creatorMode) {
    return state.editingTrainingId ? "Editar assunto" : "Criar assunto";
  }

  if (state.currentModuleIndex < 0) {
    return "Menu Principal";
  }

  return getSelectedTraining()?.title || "Discipulado";
}

function getChurchInitials(name) {
  const words = String(name || "Igreja")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function getChurchLogoMarkup(className = "") {
  const classAttribute = ["church-logo", className].filter(Boolean).join(" ");

  if (CHURCH_CONFIG.logoUrl) {
    return `<img class="${classAttribute} church-logo-image" src="${escapeHtml(CHURCH_CONFIG.logoUrl)}" alt="Logo ${escapeHtml(CHURCH_CONFIG.name)}" />`;
  }

  return `<span class="${classAttribute}" aria-label="Logo ${escapeHtml(CHURCH_CONFIG.name)}">${escapeHtml(getChurchInitials(CHURCH_CONFIG.name))}</span>`;
}

async function postAccess(body) {
  const response = await fetch(ACCESS_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error || "Não foi possível validar seu acesso.");
  }

  return result;
}

/**
 * Primeira etapa: descobre se o e-mail é de um membro ativo e se ele já tem
 * senha, para mandar a pessoa para a tela certa.
 */
async function checkEmailStep() {
  const email = state.email.trim().toLowerCase();

  if (!isValidEmail(email)) {
    showToast("Informe um e-mail válido.", "error");
    document.querySelector("#emailInput")?.focus();
    return;
  }

  state.email = email;
  state.leaderStatus = "loading";
  render();

  try {
    const result = await postAccess({ acao: "status", email });

    state.loginName = result.nome || "";
    state.leaderStatus = "idle";

    if (result.estado === "com-senha") {
      state.loginStep = "senha";
      state.password = "";
      render();
      setTimeout(() => document.querySelector("#passwordInput")?.focus(), 50);
      saveDraft();
      return;
    }

    // Primeiro acesso: o código por e-mail é o que garante que quem cria a
    // senha é o dono do e-mail, e não quem chegou primeiro.
    await sendCode("criar");
  } catch (error) {
    state.leaderStatus = "error";
    showToast(error.message, "error");
    render();
  }
}

async function sendCode(purpose) {
  state.isSendingCode = true;
  render();

  try {
    const result = await postAccess({
      acao: "enviar-codigo",
      email: state.email,
    });

    state.loginPurpose = purpose;
    state.codeDestination = result.destino || "";
    state.loginStep = "codigo";
    state.code = "";
    state.password = "";
    state.passwordConfirm = "";
    state.leaderStatus = "idle";
    state.isSendingCode = false;
    saveDraft();
    render();
    showToast("Código enviado. Confira sua caixa de entrada.", "success");
    setTimeout(() => document.querySelector("#codeInput")?.focus(), 50);
  } catch (error) {
    state.isSendingCode = false;
    state.leaderStatus = "idle";
    render();
    showToast(error.message, "error");
  }
}

async function savePasswordAndSignIn() {
  syncLoginFieldsFromDom();

  const code = state.code.replace(/\D/g, "");

  if (code.length !== 6) {
    showToast("Digite o código de 6 dígitos que chegou no seu e-mail.", "error");
    document.querySelector("#codeInput")?.focus();
    return;
  }

  if (state.password.length < 8) {
    showToast("A senha precisa ter pelo menos 8 caracteres.", "error");
    document.querySelector("#newPasswordInput")?.focus();
    return;
  }

  if (state.password !== state.passwordConfirm) {
    showToast("As duas senhas não são iguais.", "error");
    document.querySelector("#confirmPasswordInput")?.focus();
    return;
  }

  await completeSignIn({
    acao: "definir-senha",
    email: state.email,
    codigo: code,
    senha: state.password,
  });
}

async function signInWithPassword() {
  syncLoginFieldsFromDom();

  if (!state.password) {
    showToast("Digite sua senha.", "error");
    document.querySelector("#passwordInput")?.focus();
    return;
  }

  await completeSignIn({
    acao: "entrar",
    email: state.email,
    senha: state.password,
  });
}

async function changeTemporaryPassword() {
  syncLoginFieldsFromDom();

  if (state.password.length < 8) {
    showToast("A senha precisa ter pelo menos 8 caracteres.", "error");
    document.querySelector("#newPasswordInput")?.focus();
    return;
  }

  if (state.password !== state.passwordConfirm) {
    showToast("As duas senhas não são iguais.", "error");
    document.querySelector("#confirmPasswordInput")?.focus();
    return;
  }

  await completeSignIn({
    acao: "trocar-senha",
    email: state.email,
    senhaAtual: state.temporaryPassword,
    senha: state.password,
  });
}

async function completeSignIn(body) {
  state.leaderStatus = "loading";
  render();

  try {
    const result = await postAccess(body);

    // Senha temporária aceita: ela não abre o app, só leva para a troca.
    if (result.precisaTrocarSenha) {
      state.temporaryPassword = body.senha || "";
      state.password = "";
      state.passwordConfirm = "";
      state.loginStep = "trocar";
      state.leaderStatus = "idle";
      render();
      showToast("Senha temporária aceita. Agora escolha a sua senha.", "success");
      setTimeout(() => document.querySelector("#newPasswordInput")?.focus(), 50);
      return;
    }

    state.leaderToken = result.token || "";
    state.leader = result.leader || null;
    state.leaders = (result.ministries || [])
      .filter(Boolean)
      .sort(sortLeaders);
    state.selectedLeaderName = state.leader?.name || "";
    state.selectedLeaderId = state.leaders.some(
      (leader) => leader.id === state.selectedLeaderId,
    )
      ? state.selectedLeaderId
      : state.leaders[0]?.id || "";
    state.ministry = getDepartmentNames();
    state.leaderStatus = "loaded";
    clearLoginSecrets();
    state.loginStep = "email";

    if (!canManageSubjects()) {
      resetAdminAccess();
    }

    await loadLeaderProgress();
    ensureSelectableSeries();
    ensureSelectableTraining();
    await loadSavedAnswersForSelectedTraining();

    saveDraft();
  } catch (error) {
    state.leader = null;
    state.leaderToken = "";
    state.leaders = [];
    state.savedModules = [];
    state.progressByTraining = {};
    state.selectedLeaderId = "";
    state.selectedLeaderName = "";
    state.ministry = "";
    state.leaderStatus = "idle";
    saveDraft();
    showToast(error.message, "error");
  }

  render();
}

function backToEmailStep() {
  state.loginStep = "email";
  state.leaderStatus = "idle";
  clearLoginSecrets();
  render();
  setTimeout(() => document.querySelector("#emailInput")?.focus(), 50);
}

/**
 * Lê os campos direto do DOM antes de enviar. O evento "input" não é confiável
 * quando quem preenche não é o dedo do usuário: o preenchimento automático do
 * código (autocomplete="one-time-code"), o gerenciador de senhas e alguns
 * teclados de celular escrevem no campo sem disparar o evento. Sem isto, a tela
 * mostra o código e o aplicativo envia vazio.
 */
function syncLoginFieldsFromDom() {
  const code = document.querySelector("#codeInput");
  const newPassword = document.querySelector("#newPasswordInput");
  const confirmPassword = document.querySelector("#confirmPasswordInput");
  const password = document.querySelector("#passwordInput");

  if (code && typeof code.value === "string") {
    state.code = code.value.replace(/\D/g, "").slice(0, 6);
  }

  if (newPassword && typeof newPassword.value === "string") {
    state.password = newPassword.value;
  }

  if (confirmPassword && typeof confirmPassword.value === "string") {
    state.passwordConfirm = confirmPassword.value;
  }

  if (password && typeof password.value === "string") {
    state.password = password.value;
  }
}

function clearLoginSecrets() {
  state.password = "";
  state.passwordConfirm = "";
  state.temporaryPassword = "";
  state.code = "";
  state.isSendingCode = false;
}

async function loadSavedAnswersForSelectedTraining() {
  if (!state.leader || !state.selectedTrainingId) {
    state.savedModules = [];
    state.submissionId = "";
    state.isLoadingSavedAnswers = false;
    return;
  }

  if (!state.leaderToken) {
    state.savedModules = [];
    state.submissionId = "";
    state.isLoadingSavedAnswers = false;
    return;
  }

  state.isLoadingSavedAnswers = true;

  try {
    const params = new URLSearchParams({
      estudo_id: state.selectedTrainingId,
    });
    const response = await fetch(`${API_ENDPOINT}?${params.toString()}`, {
      headers: withLeaderToken({ Accept: "application/json" }),
    });
    const result = await response.json().catch(() => ({}));

    if (response.status === 401) {
      state.isLoadingSavedAnswers = false;
      handleExpiredSession();
      return;
    }

    if (!response.ok) {
      throw new Error(result.error || "Não foi possível carregar respostas salvas.");
    }

    const savedAnswers = isPlainObject(result.answers) ? result.answers : {};
    state.answers = {
      ...state.answers,
      ...savedAnswers,
    };
    state.savedModules = Array.isArray(result.modules) && result.modules.length
      ? result.modules
      : getAnsweredModulesForSelectedTraining();
    state.submissionId = result.submissionId || "";
  } catch (error) {
    state.savedModules = [];
    showToast(error.message, "error");
  }

  state.isLoadingSavedAnswers = false;
  saveDraft();
}

async function loadLeaderProgress() {
  if (!state.leaderToken) {
    state.progressByTraining = {};
    return;
  }

  try {
    const response = await fetch(API_ENDPOINT, {
      cache: "no-store",
      headers: withLeaderToken({ Accept: "application/json" }),
    });
    const result = await response.json().catch(() => ({}));

    if (response.status === 401) {
      handleExpiredSession();
      return;
    }

    if (!response.ok) {
      throw new Error(result.error || "Não foi possível carregar seu progresso.");
    }

    state.progressByTraining = isPlainObject(result.progress) ? result.progress : {};
  } catch (error) {
    showToast(error.message, "error");
  }

  saveDraft();
}

function getSavedModuleIds(trainingId) {
  const savedModuleIds = state.progressByTraining[trainingId];
  return Array.isArray(savedModuleIds) ? savedModuleIds : [];
}

function markModuleProgress(trainingId, moduleId) {
  if (!trainingId || !moduleId) {
    return;
  }

  const savedModuleIds = new Set(getSavedModuleIds(trainingId));
  savedModuleIds.add(moduleId);

  state.progressByTraining = {
    ...state.progressByTraining,
    [trainingId]: Array.from(savedModuleIds),
  };
}

function getTrainingProgress(training) {
  const savedModuleIds = new Set(getSavedModuleIds(training.id));
  const total = training.modules.length;
  const answered = training.modules.filter((module) =>
    savedModuleIds.has(module.id),
  ).length;

  return {
    total,
    answered,
    isComplete: total > 0 && answered >= total,
  };
}

function getSeriesWithAccess() {
  const adminBypass = Boolean(state.adminUnlocked && canManageSubjects());

  return getAllSeries().map((serie, index) => {
    const trainings = getTrainingsForSeries(serie.id);
    const completed = trainings.filter(
      (training) => getTrainingProgress(training).isComplete,
    ).length;
    const started = trainings.some(
      (training) => getTrainingProgress(training).answered > 0,
    );
    const released = serie.released !== false;
    const restrictionReason = released ? "" : "Ainda não liberada pela liderança.";

    return {
      serie,
      position: index + 1,
      released,
      total: trainings.length,
      completed,
      started,
      isComplete: trainings.length > 0 && completed >= trainings.length,
      restricted: Boolean(restrictionReason),
      restrictionReason,
      locked: Boolean(restrictionReason) && !adminBypass,
      adminBypass: Boolean(restrictionReason) && adminBypass,
    };
  });
}

function getSeriesAccess(seriesId) {
  return getSeriesWithAccess().find((entry) => entry.serie.id === seriesId) || null;
}

function ensureSelectableSeries() {
  const entries = getSeriesWithAccess();

  // Com uma série só, o app entra direto e nem mostra a tela de séries.
  if (entries.length <= 1) {
    state.selectedSeriesId = entries[0]?.serie.id || "";
    return;
  }

  const current = entries.find((entry) => entry.serie.id === state.selectedSeriesId);

  if (!current || current.locked) {
    state.selectedSeriesId = "";
  }
}

function getTrainingsWithAccess(seriesId = state.selectedSeriesId) {
  const adminBypass = Boolean(state.adminUnlocked && canManageSubjects());
  const entries = [];
  let previousReleased = null;

  getTrainingsForSeries(seriesId).forEach((training, index) => {
    const progress = getTrainingProgress(training);
    const released = training.released !== false;
    const requiresPrevious = training.requiresPrevious === true;
    let restrictionReason = "";

    if (!released) {
      restrictionReason = "Ainda não liberado pela liderança.";
    } else if (requiresPrevious && previousReleased && !previousReleased.isComplete) {
      restrictionReason = `Conclua antes: ${previousReleased.title}.`;
    }

    const entry = {
      training,
      position: index + 1,
      released,
      requiresPrevious,
      previousTitle: previousReleased?.title || "",
      restricted: Boolean(restrictionReason),
      restrictionReason,
      locked: Boolean(restrictionReason) && !adminBypass,
      adminBypass: Boolean(restrictionReason) && adminBypass,
      ...progress,
    };

    entries.push(entry);

    if (released) {
      previousReleased = { title: training.title, isComplete: progress.isComplete };
    }
  });

  return entries;
}

function getTrainingAccess(trainingId) {
  return (
    getTrainingsWithAccess().find((entry) => entry.training.id === trainingId) || null
  );
}

function ensureSelectableTraining() {
  if (!state.selectedSeriesId) {
    state.selectedTrainingId = "";
    return;
  }

  const entries = getTrainingsWithAccess();
  const current = entries.find(
    (entry) => entry.training.id === state.selectedTrainingId,
  );

  if (current && !current.locked) {
    return;
  }

  const nextTraining =
    entries.find((entry) => !entry.locked && !entry.isComplete) ||
    entries.find((entry) => !entry.locked);

  state.selectedTrainingId = nextTraining?.training.id || "";
}

async function loadTrainings() {
  state.trainingStatus = "loading";

  try {
    const subjectsUrl = `${SUBJECTS_ENDPOINT}?_=${Date.now()}`;
    const response = await fetch(subjectsUrl, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || "Não foi possível carregar os assuntos.");
    }

    state.series = (result.series || []).filter(isValidSeries).sort(sortByOrder);
    state.trainings = (result.trainings || [])
      .filter(isValidTraining)
      .sort(sortTrainings);
    state.trainingStatus = result.warning ? "warning" : "loaded";

    await loadLeaderProgress();
    ensureSelectableSeries();
    ensureSelectableTraining();
    await loadSavedAnswersForSelectedTraining();
  } catch (error) {
    state.series = [];
    state.trainings = [];
    state.selectedSeriesId = "";
    state.selectedTrainingId = "";
    state.trainingStatus = "error";
    showToast(error.message, "error");
  }

  saveDraft();
  render();
}

function sortLeaders(firstLeader, secondLeader) {
  const firstLabel = firstLeader.label || firstLeader.name || "";
  const secondLabel = secondLeader.label || secondLeader.name || "";

  return firstLabel.localeCompare(secondLabel, "pt-BR", {
    sensitivity: "base",
  });
}

function render() {
  if (
    !canManageSubjects() &&
    (state.adminUnlocked ||
      state.adminToken ||
      state.creatorMode ||
      state.configMode ||
      state.seriesMode ||
      state.editingTrainingId)
  ) {
    resetAdminAccess();
  }

  updateProgress();
  studyTitle.textContent = getPageTitle();
  updateTopbarVisibility();

  if (state.submitted) {
    renderSuccess();
    return;
  }

  if (!state.leader) {
    state.creatorMode = false;
    state.configMode = false;
    state.seriesMode = false;
    state.editingTrainingId = "";
    renderLogin();
    return;
  }

  if (
    !state.adminUnlocked &&
    (state.creatorMode ||
      state.configMode ||
      state.seriesMode ||
      state.leaderAccessMode)
  ) {
    state.creatorMode = false;
    state.configMode = false;
    state.seriesMode = false;
    state.leaderAccessMode = false;
    state.leaderAccessResult = null;
    state.editingTrainingId = "";
    state.editingSeriesId = "";
    state.isSavingTraining = false;
    state.isSavingSeries = false;
    state.isSavingConfig = false;
  }

  if (state.leaderAccessMode) {
    renderLeaderAccess();
    return;
  }

  if (state.configMode) {
    renderSubjectSettings();
    return;
  }

  if (state.seriesMode) {
    renderSeriesEditor();
    return;
  }

  if (state.creatorMode) {
    renderTrainingBuilder();
    return;
  }

  if (state.currentModuleIndex < 0) {
    if (!state.selectedSeriesId) {
      renderSeriesMenu();
      return;
    }

    renderMainMenu();
    return;
  }

  const selectedTraining = getSelectedTraining();
  if (!selectedTraining) {
    state.currentModuleIndex = -1;
    renderMainMenu();
    return;
  }

  renderModule(selectedTraining.modules[state.currentModuleIndex]);
}

function updateTopbarVisibility() {
  if (!topbar) {
    return;
  }

  topbar.hidden = shouldHideTopbar();
}

function shouldHideTopbar() {
  return Boolean(
    state.leader &&
    !state.creatorMode &&
    !state.configMode &&
    !state.seriesMode &&
    !state.submitted &&
    state.currentModuleIndex < 0,
  );
}

function updateProgress() {
  const selectedTraining = getSelectedTraining();
  const total = selectedTraining?.modules?.length || 1;
  const progress =
    state.currentModuleIndex < 0 || !selectedTraining
      ? 0
      : Math.round(((state.currentModuleIndex + 1) / total) * 100);

  progressFill.style.width = `${progress}%`;
  progressLabel.textContent =
    state.currentModuleIndex < 0
      ? state.leader ? "Menu" : "Acesso"
      : `Módulo ${state.currentModuleIndex + 1} de ${total}`;
}

function renderLogin() {
  if (state.loginStep === "senha") {
    renderPasswordStep();
    return;
  }

  if (state.loginStep === "codigo") {
    renderCodeStep();
    return;
  }

  if (state.loginStep === "trocar") {
    renderChangePasswordStep();
    return;
  }

  renderEmailStep();
}

function renderChangePasswordStep() {
  const busy = state.leaderStatus === "loading";

  app.innerHTML = `
    <section class="panel">
      <div class="hero-strip">
        <h2>Crie sua senha</h2>
        <p>
          Você entrou com uma senha temporária. Escolha agora uma senha só sua —
          a temporária deixa de valer.
        </p>
      </div>
      <div class="panel-body">
        <div class="form-grid">
          <div class="field">
            <label class="field-label">E-mail</label>
            <p class="status-line">${escapeHtml(state.email)}</p>
          </div>
          <div class="field">
            <label for="newPasswordInput">Sua nova senha</label>
            <input class="input" id="newPasswordInput" type="password" value="${escapeHtml(state.password)}" placeholder="Pelo menos 8 caracteres" autocomplete="new-password" ${busy ? "disabled" : ""} />
            <p class="hint">Use pelo menos 8 caracteres, com letras e números.</p>
          </div>
          <div class="field">
            <label for="confirmPasswordInput">Repita a senha</label>
            <input class="input" id="confirmPasswordInput" type="password" value="${escapeHtml(state.passwordConfirm)}" placeholder="Digite a senha de novo" autocomplete="new-password" ${busy ? "disabled" : ""} />
          </div>
        </div>

        <div class="actions">
          <button class="btn" type="button" data-action="change-password" ${busy ? "disabled" : ""}>
            ${busy ? "Salvando..." : "Salvar e entrar"}
          </button>
          <button class="btn secondary" type="button" data-action="back-to-email" ${busy ? "disabled" : ""}>
            Voltar
          </button>
        </div>
      </div>
    </section>
  `;

  bindChangePasswordStepEvents();
}

function renderEmailStep() {
  const busy = state.leaderStatus === "loading";

  app.innerHTML = `
    <section class="panel">
      <div class="hero-strip">
        <h2>Acesso do Líder e Voluntário</h2>
        <p>Entre com o e-mail cadastrado no church360 para acessar os assuntos disponíveis.</p>
      </div>
      <div class="panel-body">
        <div class="form-grid">
          <div class="field">
            <label for="emailInput">Digite seu E-mail</label>
            <input class="input" id="emailInput" type="email" value="${escapeHtml(state.email)}" placeholder="seuemail@exemplo.com" autocomplete="email" ${busy ? "disabled" : ""} />
          </div>
        </div>

        <div class="actions">
          <button class="btn" type="button" data-action="check-email" ${busy ? "disabled" : ""}>
            ${busy ? "Verificando..." : "Continuar"}
          </button>
        </div>
      </div>
    </section>
  `;

  bindEmailStepEvents();
}

function renderPasswordStep() {
  const busy = state.leaderStatus === "loading";
  const greeting = state.loginName
    ? `Olá, ${escapeHtml(state.loginName)}!`
    : "Bem-vindo de volta!";

  app.innerHTML = `
    <section class="panel">
      <div class="hero-strip">
        <h2>${greeting}</h2>
        <p>Digite sua senha para entrar no discipulado.</p>
      </div>
      <div class="panel-body">
        <div class="form-grid">
          <div class="field">
            <label class="field-label">E-mail</label>
            <p class="status-line">${escapeHtml(state.email)}</p>
          </div>
          <div class="field">
            <label for="passwordInput">Sua senha</label>
            <input class="input" id="passwordInput" type="password" value="${escapeHtml(state.password)}" placeholder="Digite sua senha" autocomplete="current-password" ${busy ? "disabled" : ""} />
          </div>
        </div>

        <div class="actions">
          <button class="btn" type="button" data-action="sign-in" ${busy ? "disabled" : ""}>
            ${busy ? "Entrando..." : "Entrar"}
          </button>
          <button class="btn secondary" type="button" data-action="back-to-email" ${busy ? "disabled" : ""}>
            Usar outro e-mail
          </button>
        </div>

        <div class="mini-row" style="margin-top:14px;justify-content:center;">
          <button class="btn link-button" type="button" data-action="forgot-password" ${state.isSendingCode ? "disabled" : ""}>
            ${state.isSendingCode ? "Enviando código..." : "Esqueci minha senha"}
          </button>
        </div>
      </div>
    </section>
  `;

  bindPasswordStepEvents();
}

function renderCodeStep() {
  const busy = state.leaderStatus === "loading";
  const isReset = state.loginPurpose === "redefinir";
  const destination = state.codeDestination || state.email;

  app.innerHTML = `
    <section class="panel">
      <div class="hero-strip">
        <h2>${isReset ? "Redefinir sua senha" : "Criar sua senha"}</h2>
        <p>
          Enviamos um código de 6 dígitos para <strong>${escapeHtml(destination)}</strong>.
          O código vale por 15 minutos.
        </p>
      </div>
      <div class="panel-body">
        <div class="form-grid">
          <div class="field">
            <label for="codeInput">Código recebido por e-mail</label>
            <input class="input code-input" id="codeInput" type="text" value="${escapeHtml(state.code)}" placeholder="000000" inputmode="numeric" autocomplete="one-time-code" maxlength="6" ${busy ? "disabled" : ""} />
          </div>
          <div class="field">
            <label for="newPasswordInput">${isReset ? "Nova senha" : "Crie sua senha"}</label>
            <input class="input" id="newPasswordInput" type="password" value="${escapeHtml(state.password)}" placeholder="Pelo menos 8 caracteres" autocomplete="new-password" ${busy ? "disabled" : ""} />
            <p class="hint">Use pelo menos 8 caracteres, com letras e números.</p>
          </div>
          <div class="field">
            <label for="confirmPasswordInput">Repita a senha</label>
            <input class="input" id="confirmPasswordInput" type="password" value="${escapeHtml(state.passwordConfirm)}" placeholder="Digite a senha de novo" autocomplete="new-password" ${busy ? "disabled" : ""} />
          </div>
        </div>

        <div class="actions">
          <button class="btn" type="button" data-action="save-password" ${busy ? "disabled" : ""}>
            ${busy ? "Salvando..." : isReset ? "Salvar e entrar" : "Criar senha e entrar"}
          </button>
          <button class="btn secondary" type="button" data-action="back-to-email" ${busy ? "disabled" : ""}>
            Voltar
          </button>
        </div>

        <div class="mini-row" style="margin-top:14px;justify-content:center;">
          <button class="btn link-button" type="button" data-action="resend-code" ${state.isSendingCode ? "disabled" : ""}>
            ${state.isSendingCode ? "Enviando..." : "Não recebi o código, enviar de novo"}
          </button>
        </div>
      </div>
    </section>
  `;

  bindCodeStepEvents();
}

function renderSeriesMenu() {
  const entries = getSeriesWithAccess();
  const departmentList = state.leaders
    .map((leader) => `<span class="pill">${escapeHtml(leader.ministry)}</span>`)
    .join("");
  const listMarkup = entries.length
    ? entries.map(getSeriesOptionMarkup).join("")
    : `<p class="hint">Nenhuma série cadastrada até agora.</p>`;
  const adminActionsMarkup = canManageSubjects()
    ? state.adminUnlocked
      ? `
            <button class="btn secondary" type="button" data-action="open-config">Configurar liberação</button>
            <button class="btn secondary" type="button" data-action="create-series">Criar série</button>
            <button class="btn secondary" type="button" data-action="open-leader-access">Senhas dos líderes</button>
          `
      : `
            <button class="btn secondary" type="button" data-action="unlock-admin" ${state.isCheckingAdmin ? "disabled" : ""}>
              ${state.isCheckingAdmin ? "Validando..." : "Liberar edição"}
            </button>
          `
    : "";

  app.innerHTML = `
    <section class="panel">
      <div class="hero-strip">
        <div class="main-menu-brand">
          ${getChurchLogoMarkup("main-menu-logo")}
          <span>${escapeHtml(CHURCH_CONFIG.name)}</span>
        </div>
        <h2>Menu Principal</h2>
        <p>Escolha a série que você vai estudar.</p>
      </div>
      <div class="panel-body">
        <div class="form-grid">
          <div class="summary">
            <article class="summary-item">
              ${getMemberIdentityMarkup({ showEmail: Boolean(state.leaders.length) })}
              ${departmentList ? `<div class="module-meta">${departmentList}</div>` : ""}
            </article>
          </div>

          <div class="field">
            <div class="mini-row">
              <span class="field-label">Séries de Discipulado</span>
              <button class="link-button" type="button" data-action="reload-trainings">Atualizar</button>
            </div>
            <div class="training-list" role="list">
              ${listMarkup}
            </div>
          </div>
        </div>

        <div class="actions">
          ${adminActionsMarkup}
          <button class="btn secondary" type="button" data-action="change-email">Sair</button>
        </div>
      </div>
    </section>
  `;

  bindSeriesMenuEvents();
}

function getSeriesOptionMarkup(entry) {
  const classNames = ["training-option"];

  if (entry.locked) {
    classNames.push("is-locked");
  }

  if (entry.isComplete) {
    classNames.push("is-complete");
  }

  const tags = [];

  if (entry.restricted) {
    tags.push(`<span class="tag tag-lock">🔒 ${escapeHtml(entry.restrictionReason)}</span>`);
  }

  if (entry.adminBypass) {
    tags.push(`<span class="tag tag-admin">Aberta para você (administrador)</span>`);
  }

  if (!entry.total) {
    tags.push(`<span class="tag">Nenhum assunto ainda</span>`);
  } else if (entry.isComplete) {
    tags.push(`<span class="tag tag-done">Concluída · ${entry.total} assunto(s)</span>`);
  } else if (entry.started) {
    tags.push(
      `<span class="tag tag-progress">Em andamento · ${entry.completed} de ${entry.total} assunto(s)</span>`,
    );
  } else if (!entry.locked) {
    tags.push(`<span class="tag">${entry.total} assunto(s)</span>`);
  }

  return `
    <button
      class="${classNames.join(" ")}"
      type="button"
      role="listitem"
      data-action="select-series"
      data-series-id="${escapeHtml(entry.serie.id)}"
      ${entry.locked ? "disabled" : ""}
    >
      <span class="training-option-order">${entry.locked ? "🔒" : entry.position}</span>
      <span class="training-option-body">
        <strong>${escapeHtml(entry.serie.title)}</strong>
        ${entry.serie.description ? `<span class="hint">${escapeHtml(entry.serie.description)}</span>` : ""}
        <span class="training-option-tags">${tags.join("")}</span>
      </span>
      <span class="training-option-check ${entry.isComplete ? "" : "chevron"}" aria-hidden="true">${entry.isComplete ? "✓" : "›"}</span>
    </button>
  `;
}

function bindSeriesMenuEvents() {
  document.querySelectorAll("[data-action='select-series']").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const seriesId = event.currentTarget.dataset.seriesId || "";
      const entry = getSeriesAccess(seriesId);

      if (entry?.locked) {
        showToast(entry.restrictionReason, "error");
        return;
      }

      state.selectedSeriesId = seriesId;
      state.selectedTrainingId = "";
      state.answers = {};
      state.savedModules = [];
      state.submissionId = "";
      ensureSelectableTraining();
      state.isLoadingSavedAnswers = true;
      saveDraft();
      render();
      await loadSavedAnswersForSelectedTraining();
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  document
    .querySelector("[data-action='reload-trainings']")
    ?.addEventListener("click", loadTrainings);

  document
    .querySelector("[data-action='unlock-admin']")
    ?.addEventListener("click", requestAdminAccess);

  document
    .querySelector("[data-action='open-config']")
    ?.addEventListener("click", openSubjectSettings);

  document
    .querySelector("[data-action='open-leader-access']")
    ?.addEventListener("click", openLeaderAccess);

  document
    .querySelector("[data-action='create-series']")
    ?.addEventListener("click", () => openSeriesEditor(""));

  document
    .querySelector("[data-action='change-email']")
    ?.addEventListener("click", signOut);
}

function renderMainMenu() {
  const selectedTraining = getSelectedTraining();
  const trainingEntries = getTrainingsWithAccess();
  const selectedEntry = trainingEntries.find(
    (entry) => entry.training.id === state.selectedTrainingId,
  );
  const canStart = Boolean(state.leader && selectedTraining && !selectedEntry?.locked);
  const trainingListMarkup = trainingEntries.length
    ? trainingEntries.map(getTrainingOptionMarkup).join("")
    : `<p class="hint">Nenhum assunto cadastrado até agora.</p>`;
  const departmentList = state.leaders
    .map((leader) => `<span class="pill">${escapeHtml(leader.ministry)}</span>`)
    .join("");
  const departmentMarkup = departmentList
    ? `<div class="module-meta">${departmentList}</div>`
    : "";
  const memberIdentityMarkup = getMemberIdentityMarkup({
    showEmail: Boolean(state.leaders.length),
  });
  const savedAnswersMarkup = state.savedModules.length
    ? `<span class="hint">${state.savedModules.length} módulo(s) já respondido(s) neste assunto.</span>`
    : state.isLoadingSavedAnswers
      ? `<span class="hint">Carregando respostas salvas.</span>`
      : "";
  const selectedSeries = getSelectedSeries();
  const hasManySeries = getAllSeries().length > 1;
  const adminActionsMarkup = canManageSubjects()
    ? state.adminUnlocked
      ? `
            <button class="btn secondary" type="button" data-action="open-config">Configurar liberação</button>
            <button class="btn secondary" type="button" data-action="edit-series">Editar série</button>
            <button class="btn secondary" type="button" data-action="create-training">Criar assunto</button>
            <button class="btn secondary" type="button" data-action="edit-training" ${selectedTraining ? "" : "disabled"}>Editar assunto</button>
            <button class="btn secondary" type="button" data-action="open-leader-access">Senhas dos líderes</button>
          `
      : `
            <button class="btn secondary" type="button" data-action="unlock-admin" ${state.isCheckingAdmin ? "disabled" : ""}>
              ${state.isCheckingAdmin ? "Validando..." : "Liberar edição"}
            </button>
          `
    : "";

  app.innerHTML = `
    <section class="panel">
      <div class="hero-strip">
        <div class="main-menu-brand">
          ${getChurchLogoMarkup("main-menu-logo")}
          <span>${escapeHtml(CHURCH_CONFIG.name)}</span>
        </div>
        <p class="eyebrow on-hero">Série</p>
        <h2>${escapeHtml(selectedSeries?.title || "Menu Principal")}</h2>
        <p>${escapeHtml(selectedSeries?.description || "Escolha o assunto e inicie o Discipulado.")}</p>
      </div>
      <div class="panel-body">
        <div class="form-grid">
          <div class="summary">
            <article class="summary-item">
              ${memberIdentityMarkup}
              ${departmentMarkup}
            </article>
          </div>

          <div class="field">
            <div class="mini-row">
              <span class="field-label">Assunto do Discipulado</span>
              ${
                hasManySeries
                  ? `<button class="link-button" type="button" data-action="back-to-series">Trocar de série</button>`
                  : `<button class="link-button" type="button" data-action="reload-trainings">Atualizar assuntos</button>`
              }
            </div>
            <div class="training-list" role="list">
              ${trainingListMarkup}
            </div>
          </div>

          <div class="study-confirm">
            <span>Assunto selecionado</span>
            <strong>${escapeHtml(selectedTraining?.title || "Nenhum assunto selecionado")}</strong>
            <span class="hint">${selectedTraining ? `${selectedTraining.modules.length} módulos com vídeo e questionário integrado.` : "Escolha um assunto liberado para iniciar."}</span>
            ${savedAnswersMarkup}
          </div>
        </div>

        <div class="actions">
          ${adminActionsMarkup}
          <button class="btn secondary" type="button" data-action="change-email">Sair</button>
          <button class="btn" type="button" data-action="start" ${canStart ? "" : "disabled"}>Inicia Discipulado</button>
        </div>
      </div>
    </section>
  `;

  bindMainMenuEvents();
}

function getTrainingOptionMarkup(entry) {
  const isSelected = entry.training.id === state.selectedTrainingId;
  const classNames = ["training-option"];

  if (isSelected && !entry.locked) {
    classNames.push("is-selected");
  }

  if (entry.locked) {
    classNames.push("is-locked");
  }

  if (entry.isComplete) {
    classNames.push("is-complete");
  }

  const tags = [];

  if (entry.restricted) {
    tags.push(
      `<span class="tag tag-lock">🔒 ${escapeHtml(entry.restrictionReason)}</span>`,
    );
  }

  if (entry.adminBypass) {
    tags.push(`<span class="tag tag-admin">Aberto para você (administrador)</span>`);
  }

  if (entry.isComplete) {
    tags.push(`<span class="tag tag-done">Concluído · ${entry.total} módulos</span>`);
  } else if (entry.answered > 0) {
    tags.push(
      `<span class="tag tag-progress">Em andamento · ${entry.answered} de ${entry.total} módulos</span>`,
    );
  } else if (!entry.locked) {
    tags.push(`<span class="tag">${entry.total} módulos</span>`);
  }

  return `
    <button
      class="${classNames.join(" ")}"
      type="button"
      role="listitem"
      data-action="select-training"
      data-training-id="${escapeHtml(entry.training.id)}"
      aria-pressed="${isSelected && !entry.locked ? "true" : "false"}"
      ${entry.locked ? "disabled" : ""}
    >
      <span class="training-option-order">${entry.locked ? "🔒" : entry.position}</span>
      <span class="training-option-body">
        <strong>${escapeHtml(entry.training.title)}</strong>
        <span class="training-option-tags">${tags.join("")}</span>
      </span>
      <span class="training-option-check" aria-hidden="true">${entry.isComplete ? "✓" : ""}</span>
    </button>
  `;
}

function bindEmailStepEvents() {
  const input = document.querySelector("#emailInput");

  input?.addEventListener("input", (event) => {
    state.email = event.target.value;
    saveDraft();
  });

  bindEnterKey(input, checkEmailStep);

  document
    .querySelector("[data-action='check-email']")
    ?.addEventListener("click", checkEmailStep);
}

function bindPasswordStepEvents() {
  const input = document.querySelector("#passwordInput");

  input?.addEventListener("input", (event) => {
    state.password = event.target.value;
  });

  bindEnterKey(input, signInWithPassword);

  document
    .querySelector("[data-action='sign-in']")
    ?.addEventListener("click", signInWithPassword);

  document
    .querySelector("[data-action='back-to-email']")
    ?.addEventListener("click", backToEmailStep);

  document
    .querySelector("[data-action='forgot-password']")
    ?.addEventListener("click", () => sendCode("redefinir"));
}

function bindCodeStepEvents() {
  const codeInput = document.querySelector("#codeInput");

  codeInput?.addEventListener("input", (event) => {
    // Só dígitos: colar o código do e-mail com espaço em volta continua valendo.
    const digits = event.target.value.replace(/\D/g, "").slice(0, 6);
    state.code = digits;
    event.target.value = digits;
  });

  document
    .querySelector("#newPasswordInput")
    ?.addEventListener("input", (event) => {
      state.password = event.target.value;
    });

  const confirmInput = document.querySelector("#confirmPasswordInput");

  confirmInput?.addEventListener("input", (event) => {
    state.passwordConfirm = event.target.value;
  });

  bindEnterKey(confirmInput, savePasswordAndSignIn);

  document
    .querySelector("[data-action='save-password']")
    ?.addEventListener("click", savePasswordAndSignIn);

  document
    .querySelector("[data-action='back-to-email']")
    ?.addEventListener("click", backToEmailStep);

  document
    .querySelector("[data-action='resend-code']")
    ?.addEventListener("click", () => sendCode(state.loginPurpose));
}

const LEADER_ACCESS_LABELS = {
  "sem-senha": { texto: "Ainda não criou senha", classe: "tag" },
  "com-senha": { texto: "Senha criada", classe: "tag tag-done" },
  temporaria: { texto: "Senha temporária ativa", classe: "tag tag-progress" },
  "temporaria-expirada": { texto: "Temporária vencida", classe: "tag tag-lock" },
};

function renderLeaderAccess() {
  const busy = state.leaderAccessStatus === "loading";
  const result = state.leaderAccessResult;

  const resultMarkup = result
    ? `
        <div class="config-item" style="border-color:var(--primary);">
          <p class="eyebrow">Senha temporária de ${escapeHtml(result.nome)}</p>
          <p class="temp-password">${escapeHtml(result.senhaTemporaria)}</p>
          <p class="hint">
            Entregue esta senha a ${escapeHtml(getFirstName(result.nome))} — em mãos, por telefone
            ou por mensagem. Ela vale por ${escapeHtml(result.validaAte)} e, ao entrar,
            o aplicativo pede que ele crie uma senha própria.
          </p>
          <p class="hint"><strong>Anote agora:</strong> esta senha não aparece de novo.</p>
          <div class="actions">
            <button class="btn secondary" type="button" data-action="dismiss-reset">Entendi, fechar</button>
          </div>
        </div>
      `
    : "";

  const listMarkup = state.leaderAccessList.length
    ? state.leaderAccessList.map(getLeaderAccessRowMarkup).join("")
    : `<p class="hint">${busy ? "Buscando..." : "Nenhum líder encontrado com esse nome ou e-mail."}</p>`;

  app.innerHTML = `
    <section class="panel">
      <div class="hero-strip">
        <h2>Senhas dos líderes</h2>
        <p>
          Use isto quando alguém perder o acesso ao próprio e-mail e não conseguir
          usar o "Esqueci minha senha".
        </p>
      </div>
      <div class="panel-body">
        ${resultMarkup}

        <div class="form-grid">
          <div class="field">
            <label for="leaderSearchInput">Buscar por nome ou e-mail</label>
            <input class="input" id="leaderSearchInput" type="search" value="${escapeHtml(state.leaderAccessSearch)}" placeholder="Digite parte do nome" ${busy ? "disabled" : ""} />
          </div>
        </div>

        <div class="actions">
          <button class="btn secondary" type="button" data-action="search-leaders" ${busy ? "disabled" : ""}>
            ${busy ? "Buscando..." : "Buscar"}
          </button>
        </div>

        <div class="config-list" style="margin-top:18px;">
          ${listMarkup}
        </div>

        <div class="actions">
          <button class="btn secondary" type="button" data-action="close-leader-access">Voltar ao menu</button>
        </div>
      </div>
    </section>
  `;

  bindLeaderAccessEvents();
}

function getLeaderAccessRowMarkup(leader) {
  const label = LEADER_ACCESS_LABELS[leader.estado] || LEADER_ACCESS_LABELS["sem-senha"];
  const isResetting = state.resettingEmail === leader.email;

  return `
    <article class="config-item">
      <div class="config-item-head">
        <div>
          <p class="config-item-title">${escapeHtml(leader.name)}</p>
          <p class="hint">${escapeHtml(leader.email)}</p>
        </div>
        <span class="${label.classe}">${escapeHtml(label.texto)}</span>
      </div>
      <div class="actions">
        <button class="btn secondary" type="button" data-action="reset-leader" data-email="${escapeHtml(leader.email)}" ${isResetting ? "disabled" : ""}>
          ${isResetting ? "Gerando..." : "Gerar senha temporária"}
        </button>
      </div>
    </article>
  `;
}

function bindLeaderAccessEvents() {
  const input = document.querySelector("#leaderSearchInput");

  input?.addEventListener("input", (event) => {
    state.leaderAccessSearch = event.target.value;
  });

  bindEnterKey(input, loadLeaderAccessList);

  document
    .querySelector("[data-action='search-leaders']")
    ?.addEventListener("click", loadLeaderAccessList);

  document
    .querySelector("[data-action='close-leader-access']")
    ?.addEventListener("click", closeLeaderAccess);

  document
    .querySelector("[data-action='dismiss-reset']")
    ?.addEventListener("click", () => {
      state.leaderAccessResult = null;
      render();
    });

  document.querySelectorAll("[data-action='reset-leader']").forEach((button) => {
    button.addEventListener("click", (event) => {
      resetLeaderPassword(event.currentTarget.dataset.email || "");
    });
  });
}

function openLeaderAccess() {
  if (!state.adminUnlocked || !canManageSubjects()) {
    showToast("Informe a senha administrativa para gerenciar o acesso.", "error");
    return;
  }

  state.leaderAccessMode = true;
  state.leaderAccessResult = null;
  state.leaderAccessList = [];
  state.leaderAccessSearch = "";
  render();
  loadLeaderAccessList();
}

function closeLeaderAccess() {
  state.leaderAccessMode = false;
  state.leaderAccessResult = null;
  state.leaderAccessList = [];
  state.leaderAccessSearch = "";
  state.leaderAccessStatus = "idle";
  render();
}

async function loadLeaderAccessList() {
  // Lidos antes do render: se o acesso administrativo cair no meio, o
  // resetAdminAccess() limpa o termo e o token, e a busca sairia vazia.
  const term = state.leaderAccessSearch.trim();
  const adminToken = state.adminToken;

  state.leaderAccessStatus = "loading";
  render();

  try {
    const params = new URLSearchParams();

    if (term) {
      params.set("busca", term);
    }

    const suffix = params.toString() ? `?${params.toString()}` : "";
    const response = await fetch(`${LEADERS_ENDPOINT}${suffix}`, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "x-admin-token": adminToken,
      },
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || "Não foi possível carregar os líderes.");
    }

    state.leaderAccessList = Array.isArray(result.leaders) ? result.leaders : [];
    state.leaderAccessStatus = "idle";
  } catch (error) {
    state.leaderAccessList = [];
    state.leaderAccessStatus = "idle";
    showToast(error.message, "error");
  }

  render();
}

async function resetLeaderPassword(email) {
  if (!email) {
    return;
  }

  const adminToken = state.adminToken;

  state.resettingEmail = email;
  render();

  try {
    const response = await fetch(LEADERS_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-admin-token": adminToken,
      },
      body: JSON.stringify({ acao: "redefinir", email }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || "Não foi possível gerar a senha temporária.");
    }

    state.leaderAccessResult = result;
    state.resettingEmail = "";
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    await loadLeaderAccessList();
  } catch (error) {
    state.resettingEmail = "";
    showToast(error.message, "error");
    render();
  }
}

function getFirstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "ele";
}

function bindChangePasswordStepEvents() {
  document
    .querySelector("#newPasswordInput")
    ?.addEventListener("input", (event) => {
      state.password = event.target.value;
    });

  const confirmInput = document.querySelector("#confirmPasswordInput");

  confirmInput?.addEventListener("input", (event) => {
    state.passwordConfirm = event.target.value;
  });

  bindEnterKey(confirmInput, changeTemporaryPassword);

  document
    .querySelector("[data-action='change-password']")
    ?.addEventListener("click", changeTemporaryPassword);

  document
    .querySelector("[data-action='back-to-email']")
    ?.addEventListener("click", backToEmailStep);
}

function bindEnterKey(input, action) {
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      action();
    }
  });
}

function bindMainMenuEvents() {
  document.querySelectorAll("[data-action='select-training']").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const trainingId = event.currentTarget.dataset.trainingId || "";

      if (trainingId === state.selectedTrainingId) {
        return;
      }

      const entry = getTrainingAccess(trainingId);

      if (entry?.locked) {
        showToast(entry.restrictionReason, "error");
        return;
      }

      state.selectedTrainingId = trainingId;
      state.currentModuleIndex = -1;
      state.answers = {};
      state.savedModules = [];
      state.submissionId = "";
      state.isLoadingSavedAnswers = true;
      saveDraft();
      render();
      await loadSavedAnswersForSelectedTraining();
      render();
    });
  });

  document
    .querySelector("[data-action='reload-trainings']")
    ?.addEventListener("click", loadTrainings);

  document
    .querySelector("[data-action='back-to-series']")
    ?.addEventListener("click", () => {
      state.selectedSeriesId = "";
      state.selectedTrainingId = "";
      state.currentModuleIndex = -1;
      state.savedModules = [];
      saveDraft();
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

  document
    .querySelector("[data-action='open-config']")
    ?.addEventListener("click", openSubjectSettings);

  document
    .querySelector("[data-action='open-leader-access']")
    ?.addEventListener("click", openLeaderAccess);

  document
    .querySelector("[data-action='edit-series']")
    ?.addEventListener("click", () => openSeriesEditor(state.selectedSeriesId));

  document
    .querySelector("[data-action='unlock-admin']")
    ?.addEventListener("click", requestAdminAccess);

  document
    .querySelector("[data-action='create-training']")
    ?.addEventListener("click", () => {
      if (!state.adminUnlocked || !canManageSubjects()) {
        showToast("Informe a senha para criar assuntos.", "error");
        return;
      }

      if (!getAllSeries().length) {
        showToast("Crie uma série antes de cadastrar assuntos.", "error");
        return;
      }

      state.creatorMode = true;
      state.configMode = false;
      state.seriesMode = false;
      state.editingTrainingId = "";
      state.currentModuleIndex = -1;
      state.trainingDraft = createEmptyTrainingDraft();
      state.trainingDraft.seriesId = getDefaultSeriesIdForDraft();
      saveDraft();
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

  document
    .querySelector("[data-action='edit-training']")
    ?.addEventListener("click", () => {
      if (!state.adminUnlocked || !canManageSubjects()) {
        showToast("Informe a senha para editar assuntos.", "error");
        return;
      }

      const selectedTraining = getSelectedTraining();

      if (!selectedTraining) {
        showToast("Selecione um assunto para editar.", "error");
        return;
      }

      state.creatorMode = true;
      state.configMode = false;
      state.seriesMode = false;
      state.editingTrainingId = selectedTraining.id;
      state.currentModuleIndex = -1;
      state.trainingDraft = createTrainingDraftFromTraining(selectedTraining);
      saveDraft();
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

  document
    .querySelector("[data-action='change-email']")
    ?.addEventListener("click", signOut);

  document
    .querySelector("[data-action='start']")
    ?.addEventListener("click", async () => {
      const selectedTraining = getSelectedTraining();
      if (!state.leader || !selectedTraining) {
        showToast("Confirme o e-mail e o assunto.", "error");
        return;
      }

      const entry = getTrainingAccess(selectedTraining.id);

      if (entry?.locked) {
        showToast(entry.restrictionReason, "error");
        return;
      }

      state.selectedLeaderName = state.leader.name;
      state.ministry = getDepartmentNames();
      await loadSavedAnswersForSelectedTraining();
      state.submissionId = state.submissionId || createSubmissionId();
      state.currentModuleIndex = 0;
      saveDraft();
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
}

function signOut() {
  state.leader = null;
  state.leaderToken = "";
  state.leaders = [];
  state.savedModules = [];
  state.progressByTraining = {};
  state.email = "";
  state.selectedLeaderId = "";
  state.selectedLeaderName = "";
  state.ministry = "";
  state.currentModuleIndex = -1;
  state.answers = {};
  state.submitted = false;
  state.submissionId = "";
  state.leaderStatus = "idle";
  state.loginStep = "email";
  state.loginName = "";
  state.codeDestination = "";
  clearLoginSecrets();
  resetAdminAccess();
  saveDraft();
  render();
}

function openSubjectSettings() {
  if (!state.adminUnlocked || !canManageSubjects()) {
    showToast("Informe a senha para configurar a liberação.", "error");
    return;
  }

  state.configMode = true;
  state.creatorMode = false;
  state.seriesMode = false;
  state.editingTrainingId = "";
  state.currentModuleIndex = -1;
  state.configDraft = createConfigDraft();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openSeriesEditor(seriesId) {
  if (!state.adminUnlocked || !canManageSubjects()) {
    showToast("Informe a senha para criar ou editar séries.", "error");
    return;
  }

  const serie = getAllSeries().find((item) => item.id === seriesId) || null;

  if (seriesId && !serie) {
    showToast("Selecione uma série para editar.", "error");
    return;
  }

  state.seriesMode = true;
  state.configMode = false;
  state.creatorMode = false;
  state.editingSeriesId = serie?.id || "";
  state.currentModuleIndex = -1;
  state.seriesDraft = serie
    ? { title: serie.title, description: serie.description || "" }
    : createEmptySeriesDraft();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function createEmptySeriesDraft() {
  return { title: "", description: "" };
}

function renderSeriesEditor() {
  const isEditing = Boolean(state.editingSeriesId);
  const draft = state.seriesDraft;
  const subjectCount = isEditing
    ? getTrainingsForSeries(state.editingSeriesId).length
    : 0;

  app.innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <p class="eyebrow">${isEditing ? "Editar série" : "Nova série"}</p>
        <h2>${isEditing ? "Editar série" : "Criar série"}</h2>
        <p>${
          isEditing
            ? `Esta série tem ${subjectCount} assunto(s). A ordem e a liberação ficam em "Configurar liberação".`
            : "A série agrupa os assuntos de um mesmo ensino. Depois de criar, cadastre os assuntos dentro dela."
        }</p>
      </div>
      <div class="panel-body">
        <div class="form-grid">
          <div class="field">
            <label for="seriesTitle">Título da série</label>
            <input class="input" id="seriesTitle" type="text" value="${escapeHtml(draft.title || "")}" data-series-field="title" placeholder="Ex: Conferência com o Apóstolo Jean" />
          </div>

          <div class="field">
            <label for="seriesDescription">Descrição</label>
            <input class="input" id="seriesDescription" type="text" value="${escapeHtml(draft.description || "")}" data-series-field="description" placeholder="Opcional. Aparece embaixo do título no menu." />
          </div>
        </div>

        <div class="actions split">
          <button class="btn secondary" type="button" data-action="cancel-series">Voltar</button>
          <button class="btn" type="button" data-action="save-series" ${state.isSavingSeries ? "disabled" : ""}>
            ${state.isSavingSeries ? "Salvando..." : isEditing ? "Salvar alterações" : "Criar série"}
          </button>
        </div>
      </div>
    </section>
  `;

  document.querySelectorAll("[data-series-field]").forEach((input) => {
    input.addEventListener("input", (event) => {
      state.seriesDraft[event.target.dataset.seriesField] = event.target.value;
    });
  });

  document
    .querySelector("[data-action='cancel-series']")
    ?.addEventListener("click", () => {
      state.seriesMode = false;
      state.editingSeriesId = "";
      state.isSavingSeries = false;
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

  document
    .querySelector("[data-action='save-series']")
    ?.addEventListener("click", saveSeries);
}

async function saveSeries() {
  if (!canManageSubjects() || !state.adminToken) {
    resetAdminAccess();
    showToast("Informe a senha para salvar séries.", "error");
    render();
    return;
  }

  const title = String(state.seriesDraft.title || "").trim();

  if (!title) {
    showToast("Informe o título da série.", "error");
    document.querySelector("#seriesTitle")?.focus();
    return;
  }

  const isEditing = Boolean(state.editingSeriesId);
  state.isSavingSeries = true;
  render();

  try {
    const response = await fetch(SERIES_ENDPOINT, {
      method: isEditing ? "PUT" : "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Admin-Token": state.adminToken,
      },
      body: JSON.stringify({
        id: state.editingSeriesId || undefined,
        title,
        description: String(state.seriesDraft.description || "").trim(),
        creator: state.leader,
      }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || "Não foi possível salvar a série.");
    }

    if (Array.isArray(result.series)) {
      state.series = result.series.filter(isValidSeries).sort(sortByOrder);
    }

    if (!isEditing && result.serie?.id) {
      state.selectedSeriesId = result.serie.id;
    }

    state.seriesMode = false;
    state.editingSeriesId = "";
    state.seriesDraft = createEmptySeriesDraft();
    state.isSavingSeries = false;
    ensureSelectableTraining();
    saveDraft();
    showToast(isEditing ? "Série atualizada." : "Série criada.", "success");
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    if (/senha|administrativa|token|401/i.test(error.message)) {
      state.adminToken = "";
      state.adminUnlocked = false;
    }

    state.isSavingSeries = false;
    showToast(error.message, "error");
    render();
  }
}

async function requestAdminAccess() {
  if (!canManageSubjects()) {
    resetAdminAccess();
    showToast("Edição de assuntos disponível apenas para o administrador.", "error");
    render();
    return;
  }

  const password = window.prompt("Digite a senha para liberar criação e edição de assuntos.");

  if (password === null) {
    return;
  }

  if (!password.trim()) {
    showToast("Informe a senha administrativa.", "error");
    return;
  }

  state.isCheckingAdmin = true;
  render();

  try {
    const response = await fetch(ADMIN_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: getLoggedUserEmail(),
        password,
      }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || "Não foi possível validar a senha.");
    }

    if (!result.token) {
      throw new Error("Token administrativo não retornado.");
    }

    state.adminToken = result.token;
    state.adminUnlocked = true;
    showToast("Edição de assuntos liberada.", "success");
  } catch (error) {
    state.adminToken = "";
    state.adminUnlocked = false;
    showToast(error.message, "error");
  }

  state.isCheckingAdmin = false;
  render();
}

function getAccessStatusText() {
  if (state.leaderStatus === "loading") {
    return "Validando seu e-mail no church360.";
  }

  if (state.leaderStatus === "error") {
    return "Não foi possível validar este e-mail como usuário ativo.";
  }

  if (state.leaderStatus === "loaded") {
    return "E-mail validado no church360.";
  }

  return "Digite o e-mail usado no cadastro do church360.";
}

function renderTrainingBuilder() {
  const draft = state.trainingDraft;
  const isEditing = Boolean(state.editingTrainingId);
  const modulesMarkup = draft.modules
    .map((module, moduleIndex) => {
      const questionsMarkup = module.questions
        .map(
          (question, questionIndex) => `
            <article class="question">
              <div class="mini-row">
                <label class="question-label" for="question-${moduleIndex}-${questionIndex}">
                  Pergunta ${moduleIndex + 1}.${questionIndex + 1}
                </label>
                <button class="link-button" type="button" data-action="remove-question" data-module-index="${moduleIndex}" data-question-index="${questionIndex}">
                  Remover
                </button>
              </div>
              <textarea
                class="textarea"
                id="question-${moduleIndex}-${questionIndex}"
                data-question-field
                data-module-index="${moduleIndex}"
                data-question-index="${questionIndex}"
                placeholder="Digite a pergunta que o líder deverá responder."
              >${escapeHtml(question.text)}</textarea>
            </article>
          `,
        )
        .join("");

      return `
        <article class="summary-item">
          <div class="mini-row">
            <h3>Módulo ${moduleIndex + 1}</h3>
            <button class="link-button" type="button" data-action="remove-module" data-module-index="${moduleIndex}">
              Remover módulo
            </button>
          </div>

          <div class="form-grid">
            <div class="field">
              <label for="module-title-${moduleIndex}">Título do módulo</label>
              <input class="input" id="module-title-${moduleIndex}" type="text" value="${escapeHtml(module.title || "")}" data-module-field="title" data-module-index="${moduleIndex}" placeholder="Ex: Identidade e Chamado" />
            </div>

            <div class="field">
              <label for="module-video-${moduleIndex}">Link do vídeo do módulo</label>
              <input class="input" id="module-video-${moduleIndex}" type="url" value="${escapeHtml(module.videoUrl || "")}" data-module-field="videoUrl" data-module-index="${moduleIndex}" placeholder="https://youtu.be/..." />
              <p class="hint">Opcional quando o link principal do assunto estiver preenchido.</p>
            </div>

            <div class="form-grid two">
              <div class="field">
                <label for="module-start-${moduleIndex}">Início do corte</label>
                <input class="input" id="module-start-${moduleIndex}" type="text" value="${escapeHtml(module.startTime || "")}" data-module-field="startTime" data-module-index="${moduleIndex}" placeholder="Ex: 24:58" />
              </div>
              <div class="field">
                <label for="module-end-${moduleIndex}">Fim do corte</label>
                <input class="input" id="module-end-${moduleIndex}" type="text" value="${escapeHtml(module.endTime || "")}" data-module-field="endTime" data-module-index="${moduleIndex}" placeholder="Ex: 33:23" />
              </div>
            </div>

            <div class="questions">
              ${questionsMarkup}
            </div>

            <button class="btn secondary" type="button" data-action="add-question" data-module-index="${moduleIndex}">
              Adicionar pergunta
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  app.innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <p class="eyebrow">${isEditing ? "Editar assunto" : "Novo assunto"}</p>
        <h2>${isEditing ? "Editar discipulado" : "Criar discipulado"}</h2>
        <p>${isEditing ? "Atualize os módulos, links de vídeo e perguntas. Depois de salvar, o assunto será atualizado para todos." : "Monte o assunto com módulos, vídeos e perguntas. Depois de salvar, ele aparecerá no menu de seleção."}</p>
      </div>
      <div class="panel-body">
        <div class="form-grid">
          <div class="field">
            <label for="trainingSeries">Série</label>
            <select class="select" id="trainingSeries" data-training-field="seriesId">
              ${getAllSeries()
                .map(
                  (serie) =>
                    `<option value="${escapeHtml(serie.id)}" ${serie.id === draft.seriesId ? "selected" : ""}>${escapeHtml(serie.title)}</option>`,
                )
                .join("")}
            </select>
            <p class="hint">O assunto entra no fim da fila desta série.</p>
          </div>

          <div class="field">
            <label for="trainingTitle">Título do assunto</label>
            <input class="input" id="trainingTitle" type="text" value="${escapeHtml(draft.title || "")}" data-training-field="title" placeholder="Ex: Fundamentos da Liderança Cristã" />
          </div>

          <div class="field">
            <label for="trainingSpeaker">Pregador ou facilitador</label>
            <input class="input" id="trainingSpeaker" type="text" value="${escapeHtml(draft.speaker || "")}" data-training-field="speaker" placeholder="Ex: Pastor, apóstolo ou líder responsável" />
          </div>

          <div class="field">
            <label for="trainingVideoUrl">Link principal do vídeo do assunto</label>
            <input class="input" id="trainingVideoUrl" type="url" value="${escapeHtml(draft.youtubeVideoUrl || "")}" data-training-field="youtubeVideoUrl" placeholder="https://youtu.be/..." />
            <p class="hint">Use este campo quando todos os módulos forem cortes do mesmo vídeo.</p>
          </div>

          <div class="summary">
            ${modulesMarkup}
          </div>

          <button class="btn secondary" type="button" data-action="add-module">
            Adicionar módulo
          </button>
        </div>

        <div class="actions split">
          <button class="btn secondary" type="button" data-action="cancel-training">Voltar ao menu</button>
          <button class="btn" type="button" data-action="save-training" ${state.isSavingTraining ? "disabled" : ""}>
            ${state.isSavingTraining ? "Salvando..." : isEditing ? "Salvar alterações" : "Salvar assunto"}
          </button>
        </div>
      </div>
    </section>
  `;

  bindTrainingBuilderEvents();
}

function createConfigDraft() {
  return getAllSeries().map((serie, seriesIndex) => ({
    id: serie.id,
    title: serie.title,
    released: serie.released !== false,
    order: seriesIndex + 1,
    subjects: getTrainingsForSeries(serie.id).map((training, subjectIndex) => ({
      id: training.id,
      title: training.title,
      modules: training.modules.length,
      released: training.released !== false,
      requiresPrevious: training.requiresPrevious === true,
      order: subjectIndex + 1,
    })),
  }));
}

function renderSubjectSettings() {
  const series = state.configDraft;

  const seriesMarkup = series
    .map((serie, seriesIndex) => {
      let previousReleasedTitle = "";

      const subjectsMarkup = serie.subjects
        .map((subject, subjectIndex) => {
          const prerequisiteHint = !subject.requiresPrevious
            ? "Fica disponível assim que estiver liberado."
            : previousReleasedTitle
              ? `Só abre depois que a pessoa concluir: ${previousReleasedTitle}.`
              : "É o primeiro da fila liberado, então abre direto.";

          if (subject.released) {
            previousReleasedTitle = subject.title;
          }

          return `
            <article class="config-subject ${subject.released ? "" : "is-blocked"}">
              <div class="config-item-head">
                <span class="config-order small">${subjectIndex + 1}</span>
                <div class="config-item-title">
                  <strong>${escapeHtml(subject.title)}</strong>
                  <span class="hint">${subject.modules} módulo(s)</span>
                </div>
                <div class="config-move">
                  <button class="icon-button" type="button" data-action="move-subject-up" data-series-index="${seriesIndex}" data-subject-index="${subjectIndex}" ${subjectIndex === 0 ? "disabled" : ""} aria-label="Subir ${escapeHtml(subject.title)}">↑</button>
                  <button class="icon-button" type="button" data-action="move-subject-down" data-series-index="${seriesIndex}" data-subject-index="${subjectIndex}" ${subjectIndex === serie.subjects.length - 1 ? "disabled" : ""} aria-label="Descer ${escapeHtml(subject.title)}">↓</button>
                </div>
              </div>

              <label class="switch-row">
                <input type="checkbox" data-config-scope="subject" data-config-field="released" data-series-index="${seriesIndex}" data-subject-index="${subjectIndex}" ${subject.released ? "checked" : ""} />
                <span>
                  <strong>Liberado para os líderes</strong>
                  <span class="hint">Desligue para segurar este assunto até a hora que você quiser.</span>
                </span>
              </label>

              <label class="switch-row">
                <input type="checkbox" data-config-scope="subject" data-config-field="requiresPrevious" data-series-index="${seriesIndex}" data-subject-index="${subjectIndex}" ${subject.requiresPrevious ? "checked" : ""} />
                <span>
                  <strong>Exige concluir o assunto anterior</strong>
                  <span class="hint">${escapeHtml(prerequisiteHint)}</span>
                </span>
              </label>
            </article>
          `;
        })
        .join("");

      return `
        <article class="config-item ${serie.released ? "" : "is-blocked"}">
          <div class="config-item-head">
            <span class="config-order">${seriesIndex + 1}</span>
            <div class="config-item-title">
              <p class="eyebrow">Série</p>
              <strong>${escapeHtml(serie.title)}</strong>
              <span class="hint">${serie.subjects.length} assunto(s)</span>
            </div>
            <div class="config-move">
              <button class="icon-button" type="button" data-action="move-series-up" data-series-index="${seriesIndex}" ${seriesIndex === 0 ? "disabled" : ""} aria-label="Subir ${escapeHtml(serie.title)}">↑</button>
              <button class="icon-button" type="button" data-action="move-series-down" data-series-index="${seriesIndex}" ${seriesIndex === series.length - 1 ? "disabled" : ""} aria-label="Descer ${escapeHtml(serie.title)}">↓</button>
            </div>
          </div>

          <label class="switch-row">
            <input type="checkbox" data-config-scope="series" data-config-field="released" data-series-index="${seriesIndex}" ${serie.released ? "checked" : ""} />
            <span>
              <strong>Série liberada</strong>
              <span class="hint">Desligada, ela aparece com cadeado e nenhum assunto dentro dela abre.</span>
            </span>
          </label>

          <div class="config-subjects">
            ${subjectsMarkup || `<p class="hint">Nenhum assunto nesta série ainda.</p>`}
          </div>
        </article>
      `;
    })
    .join("");

  app.innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <p class="eyebrow">Configuração</p>
        <h2>Liberação das séries</h2>
        <p>Cada série é uma fila independente. Ordene as séries, escolha quais estão liberadas e, dentro de cada uma, defina a ordem dos assuntos e quais só abrem depois de concluir o anterior.</p>
      </div>
      <div class="panel-body">
        <div class="config-list">
          ${seriesMarkup || `<p class="hint">Nenhuma série cadastrada até agora.</p>`}
        </div>

        <div class="actions split">
          <button class="btn secondary" type="button" data-action="cancel-config">Voltar ao menu</button>
          <button class="btn" type="button" data-action="save-config" ${state.isSavingConfig || !series.length ? "disabled" : ""}>
            ${state.isSavingConfig ? "Salvando..." : "Salvar configuração"}
          </button>
        </div>
      </div>
    </section>
  `;

  bindSubjectSettingsEvents();
}

function bindSubjectSettingsEvents() {
  document.querySelectorAll("[data-config-scope]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const { configScope, configField, seriesIndex, subjectIndex } =
        event.target.dataset;
      const serie = state.configDraft[Number(seriesIndex)];

      if (!serie) {
        return;
      }

      if (configScope === "series") {
        serie[configField] = event.target.checked;
      } else {
        const subject = serie.subjects[Number(subjectIndex)];
        if (subject) {
          subject[configField] = event.target.checked;
        }
      }

      render();
    });
  });

  document.querySelectorAll("[data-action='move-series-up']").forEach((button) => {
    button.addEventListener("click", (event) => {
      moveSeries(Number(event.currentTarget.dataset.seriesIndex), -1);
    });
  });

  document.querySelectorAll("[data-action='move-series-down']").forEach((button) => {
    button.addEventListener("click", (event) => {
      moveSeries(Number(event.currentTarget.dataset.seriesIndex), 1);
    });
  });

  document.querySelectorAll("[data-action='move-subject-up']").forEach((button) => {
    button.addEventListener("click", (event) => {
      const { seriesIndex, subjectIndex } = event.currentTarget.dataset;
      moveSubject(Number(seriesIndex), Number(subjectIndex), -1);
    });
  });

  document.querySelectorAll("[data-action='move-subject-down']").forEach((button) => {
    button.addEventListener("click", (event) => {
      const { seriesIndex, subjectIndex } = event.currentTarget.dataset;
      moveSubject(Number(seriesIndex), Number(subjectIndex), 1);
    });
  });

  document
    .querySelector("[data-action='cancel-config']")
    ?.addEventListener("click", () => {
      state.configMode = false;
      state.configDraft = [];
      state.isSavingConfig = false;
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

  document
    .querySelector("[data-action='save-config']")
    ?.addEventListener("click", saveSubjectSettings);
}

function moveSeries(index, offset) {
  const targetIndex = index + offset;

  if (
    !Number.isInteger(index) ||
    targetIndex < 0 ||
    targetIndex >= state.configDraft.length
  ) {
    return;
  }

  const series = [...state.configDraft];
  [series[index], series[targetIndex]] = [series[targetIndex], series[index]];
  state.configDraft = series.map((serie, position) => ({
    ...serie,
    order: position + 1,
  }));
  render();
}

function moveSubject(seriesIndex, subjectIndex, offset) {
  const serie = state.configDraft[seriesIndex];
  const targetIndex = subjectIndex + offset;

  if (!serie || targetIndex < 0 || targetIndex >= serie.subjects.length) {
    return;
  }

  const subjects = [...serie.subjects];
  [subjects[subjectIndex], subjects[targetIndex]] = [
    subjects[targetIndex],
    subjects[subjectIndex],
  ];

  state.configDraft = state.configDraft.map((item, position) =>
    position === seriesIndex
      ? {
          ...item,
          subjects: subjects.map((subject, order) => ({
            ...subject,
            order: order + 1,
          })),
        }
      : item,
  );
  render();
}

async function saveSubjectSettings() {
  if (!canManageSubjects() || !state.adminToken) {
    resetAdminAccess();
    showToast("Informe a senha para configurar a liberação.", "error");
    render();
    return;
  }

  state.isSavingConfig = true;
  render();

  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Admin-Token": state.adminToken,
  };

  try {
    const seriesResponse = await fetch(SERIES_ENDPOINT, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        settings: state.configDraft.map((serie, index) => ({
          id: serie.id,
          order: index + 1,
          released: serie.released,
        })),
      }),
    });
    const seriesResult = await seriesResponse.json().catch(() => ({}));

    if (!seriesResponse.ok) {
      throw new Error(seriesResult.error || "Não foi possível salvar as séries.");
    }

    const subjectSettings = state.configDraft.flatMap((serie) =>
      serie.subjects.map((subject, index) => ({
        id: subject.id,
        seriesId: serie.id,
        order: index + 1,
        released: subject.released,
        requiresPrevious: subject.requiresPrevious,
      })),
    );

    let subjectsResult = {};

    if (subjectSettings.length) {
      const subjectsResponse = await fetch(SUBJECTS_ENDPOINT, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ settings: subjectSettings }),
      });
      subjectsResult = await subjectsResponse.json().catch(() => ({}));

      if (!subjectsResponse.ok) {
        throw new Error(
          subjectsResult.error || "Não foi possível salvar os assuntos.",
        );
      }
    }

    applySeriesFromResponse(subjectsResult.series || seriesResult.series);
    applyTrainingsFromResponse(subjectsResult.trainings);
    state.configMode = false;
    state.configDraft = [];
    state.isSavingConfig = false;
    ensureSelectableSeries();
    ensureSelectableTraining();
    saveDraft();
    showToast("Liberação atualizada com sucesso.", "success");
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    if (/senha|administrativa|token|401/i.test(error.message)) {
      state.adminToken = "";
      state.adminUnlocked = false;
    }

    state.isSavingConfig = false;
    showToast(error.message, "error");
    render();
  }
}

function applySeriesFromResponse(series) {
  if (!Array.isArray(series)) {
    return false;
  }

  state.series = series.filter(isValidSeries).sort(sortByOrder);
  return true;
}

function applyTrainingsFromResponse(trainings) {
  if (!Array.isArray(trainings)) {
    return false;
  }

  state.trainings = trainings.filter(isValidTraining).sort(sortTrainings);
  state.trainingStatus = "loaded";
  return true;
}

function renderModule(module) {
  const questions = module.questions
    .map(
      (question) => `
        <article class="question">
          <label class="question-label" for="answer-${question.id}">
            ${escapeHtml(question.title)}
          </label>
          <p class="question-text">${escapeHtml(question.text)}</p>
          <textarea
            class="textarea"
            id="answer-${question.id}"
            data-question-id="${escapeHtml(question.id)}"
            placeholder="Escreva sua resposta com clareza e sinceridade."
          >${escapeHtml(state.answers[question.id] || "")}</textarea>
        </article>
      `,
    )
    .join("");

  const isLast =
    state.currentModuleIndex === getSelectedTraining().modules.length - 1;
  const videoMarkup = getVideoMarkup(module);
  const nextButtonLabel = state.isSavingModule ? "Salvando..." : "Próximo Módulo";

  app.innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <p class="eyebrow">Módulo ${module.number}</p>
        <h2>${escapeHtml(module.title)}</h2>
        <div class="module-meta">
          <span class="pill alt">${module.questions.length} pergunta(s)</span>
        </div>
      </div>
      <div class="panel-body">
        ${videoMarkup}
        <div class="questions">
          ${questions}
        </div>
        <div class="actions split">
          <button class="btn secondary" type="button" data-action="previous">Voltar</button>
          <button class="btn secondary" type="button" data-action="menu">Menu Principal</button>
          ${
            isLast
              ? `<button class="btn" type="button" data-action="submit" ${state.isSubmitting ? "disabled" : ""}>${state.isSubmitting ? "Salvando..." : "Concluir Discipulado"}</button>`
              : `<button class="btn" type="button" data-action="next" ${state.isSavingModule ? "disabled" : ""}>${nextButtonLabel}</button>`
          }
        </div>
      </div>
    </section>
  `;

  bindModuleEvents();
}

function getVideoMarkup(module) {
  const videoId = getModuleVideoId(module);
  const hasVideoId =
    videoId && !videoId.includes("COLE_AQUI") && videoId.length >= 8;

  if (!hasVideoId) {
    return `
      <div class="video-frame" role="img" aria-label="Player de vídeo pendente de configuração">
        <div class="video-placeholder">
          <div>
            <strong>Player do YouTube preparado</strong>
            <span>Cadastre o link do YouTube para abrir este módulo automaticamente.</span>
          </div>
        </div>
      </div>
    `;
  }

  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
  });

  if (module.start > 0) {
    params.set("start", String(module.start));
  }

  if (module.end > 0) {
    params.set("end", String(module.end));
  }

  return `
    <div class="video-frame">
      <iframe
        title="${escapeHtml(module.title)}"
        src="https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${params.toString()}"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
      ></iframe>
    </div>
  `;
}

function getModuleVideoId(module) {
  return (
    module.videoId ||
    getSelectedTraining()?.youtubeVideoId ||
    YOUTUBE_VIDEO_ID ||
    ""
  );
}

function bindModuleEvents() {
  document.querySelectorAll("[data-question-id]").forEach((textarea) => {
    textarea.addEventListener("input", (event) => {
      state.answers[event.target.dataset.questionId] = event.target.value;
      saveDraft();
    });
  });

  document
    .querySelector("[data-action='previous']")
    ?.addEventListener("click", () => {
      if (state.currentModuleIndex > 0) {
        state.currentModuleIndex -= 1;
      } else {
        state.currentModuleIndex = -1;
      }
      saveDraft();
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

  document
    .querySelector("[data-action='menu']")
    ?.addEventListener("click", () => {
      state.currentModuleIndex = -1;
      saveDraft();
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

  document
    .querySelector("[data-action='next']")
    ?.addEventListener("click", saveCurrentModuleAndGoNext);

  document
    .querySelector("[data-action='submit']")
    ?.addEventListener("click", submitAnswers);
}

function bindTrainingBuilderEvents() {
  document.querySelectorAll("[data-training-field]").forEach((input) => {
    input.addEventListener("input", (event) => {
      state.trainingDraft[event.target.dataset.trainingField] = event.target.value;
      saveDraft();
    });
  });

  document.querySelectorAll("[data-module-field]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const module = state.trainingDraft.modules[Number(event.target.dataset.moduleIndex)];
      if (module) {
        module[event.target.dataset.moduleField] = event.target.value;
        saveDraft();
      }
    });
  });

  document.querySelectorAll("[data-question-field]").forEach((textarea) => {
    textarea.addEventListener("input", (event) => {
      const module = state.trainingDraft.modules[Number(event.target.dataset.moduleIndex)];
      const question = module?.questions[Number(event.target.dataset.questionIndex)];
      if (question) {
        question.text = event.target.value;
        saveDraft();
      }
    });
  });

  document
    .querySelector("[data-action='add-module']")
    ?.addEventListener("click", () => {
      syncTrainingDraftFromForm();
      state.trainingDraft.modules.push(createEmptyModuleDraft());
      saveDraft();
      render();
    });

  document.querySelectorAll("[data-action='remove-module']").forEach((button) => {
    button.addEventListener("click", (event) => {
      syncTrainingDraftFromForm();
      const moduleIndex = Number(event.currentTarget.dataset.moduleIndex);
      if (state.trainingDraft.modules.length === 1) {
        showToast("Mantenha pelo menos um módulo.", "error");
        return;
      }
      state.trainingDraft.modules.splice(moduleIndex, 1);
      saveDraft();
      render();
    });
  });

  document.querySelectorAll("[data-action='add-question']").forEach((button) => {
    button.addEventListener("click", (event) => {
      syncTrainingDraftFromForm();
      const module = state.trainingDraft.modules[Number(event.currentTarget.dataset.moduleIndex)];
      if (module) {
        module.questions.push(createEmptyQuestionDraft());
        saveDraft();
        render();
      }
    });
  });

  document.querySelectorAll("[data-action='remove-question']").forEach((button) => {
    button.addEventListener("click", (event) => {
      syncTrainingDraftFromForm();
      const module = state.trainingDraft.modules[Number(event.currentTarget.dataset.moduleIndex)];
      const questionIndex = Number(event.currentTarget.dataset.questionIndex);
      if (!module) {
        return;
      }
      if (module.questions.length === 1) {
        showToast("Mantenha pelo menos uma pergunta no módulo.", "error");
        return;
      }
      module.questions.splice(questionIndex, 1);
      saveDraft();
      render();
    });
  });

  document
    .querySelector("[data-action='cancel-training']")
    ?.addEventListener("click", () => {
      state.creatorMode = false;
      state.editingTrainingId = "";
      state.isSavingTraining = false;
      saveDraft();
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

  document
    .querySelector("[data-action='save-training']")
    ?.addEventListener("click", saveTraining);
}

async function saveTraining() {
  if (!canManageSubjects()) {
    resetAdminAccess();
    showToast("Edição de assuntos disponível apenas para o administrador.", "error");
    state.creatorMode = false;
    render();
    return;
  }

  if (!state.adminToken) {
    state.adminUnlocked = false;
    showToast("Informe a senha para salvar assuntos.", "error");
    state.creatorMode = false;
    render();
    return;
  }

  syncTrainingDraftFromForm();

  if (!validateTrainingDraft()) {
    return;
  }

  state.isSavingTraining = true;
  render();

  const isEditing = Boolean(state.editingTrainingId);

  try {
    const response = await fetch(SUBJECTS_ENDPOINT, {
      method: isEditing ? "PUT" : "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Admin-Token": state.adminToken,
      },
      body: JSON.stringify({
        id: state.editingTrainingId || undefined,
        ...state.trainingDraft,
        creator: state.leader,
      }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || "Não foi possível salvar o assunto.");
    }

    const training = result.training;

    if (!applyTrainingsFromResponse(result.trainings)) {
      state.trainings = [
        training,
        ...state.trainings.filter((item) => item.id !== training.id),
      ]
        .filter(isValidTraining)
        .sort(sortTrainings);
    }

    // O assunto pode ter mudado de série na edição: segue ele.
    if (training.seriesId) {
      state.selectedSeriesId = training.seriesId;
    }

    state.selectedTrainingId = training.id;
    state.trainingDraft = createEmptyTrainingDraft();
    state.creatorMode = false;
    state.editingTrainingId = "";
    state.isSavingTraining = false;
    state.currentModuleIndex = -1;
    state.answers = {};
    state.trainingStatus = "loaded";
    saveDraft();
    showToast(
      isEditing ? "Assunto atualizado com sucesso." : "Assunto salvo com sucesso.",
      "success",
    );
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    if (/senha|administrativa|token|401/i.test(error.message)) {
      state.adminToken = "";
      state.adminUnlocked = false;
    }

    state.isSavingTraining = false;
    showToast(error.message, "error");
    render();
  }
}

async function saveCurrentModuleAndGoNext() {
  if (!validateCurrentModule()) {
    return;
  }

  state.isSavingModule = true;
  render();

  try {
    await saveModuleByIndex(state.currentModuleIndex);
    markCurrentModuleAsSaved();
    state.currentModuleIndex += 1;
    state.isSavingModule = false;
    saveDraft();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    state.isSavingModule = false;
    showToast(`${error.message} Tente novamente antes de avançar.`, "error");
    render();
  }
}

async function saveModuleByIndex(moduleIndex) {
  const response = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: withLeaderToken({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(buildModulePayload(moduleIndex)),
  });

  const result = await response.json().catch(() => ({}));

  if (response.status === 401) {
    handleExpiredSession();
    throw new Error("Sua sessão expirou.");
  }

  if (!response.ok) {
    throw new Error(result.error || "Não foi possível salvar este módulo.");
  }

  return result;
}

async function submitAnswers() {
  if (!validateAllAnswers()) {
    return;
  }

  state.isSubmitting = true;
  render();

  try {
    await saveModuleByIndex(state.currentModuleIndex);
    markCurrentModuleAsSaved();

    state.savedModules = getAnsweredModulesForSelectedTraining();
    await loadLeaderProgress();

    state.submitted = true;
    state.isSubmitting = false;
    clearDraft();
    showToast("Respostas salvas com sucesso.", "success");
    render();
  } catch (error) {
    state.isSubmitting = false;
    showToast(error.message, "error");
    render();
  }
}

function validateCurrentModule() {
  const selectedTraining = getSelectedTraining();
  const module = selectedTraining?.modules[state.currentModuleIndex];

  if (!module) {
    showToast("Selecione um assunto antes de continuar.", "error");
    state.currentModuleIndex = -1;
    render();
    return false;
  }

  const missing = module.questions.find(
    (question) => !(state.answers[question.id] || "").trim(),
  );

  if (missing) {
    showToast(`Responda a ${missing.title} antes de continuar.`, "error");
    document.querySelector(`#answer-${cssEscape(missing.id)}`)?.focus();
    return false;
  }

  return true;
}

function validateAllAnswers() {
  const study = getSelectedTraining();
  if (!study) {
    showToast("Selecione um assunto antes de enviar.", "error");
    state.currentModuleIndex = -1;
    render();
    return false;
  }

  const allQuestions = study.modules.flatMap((module) => module.questions);
  const missing = allQuestions.find(
    (question) => !(state.answers[question.id] || "").trim(),
  );

  if (missing) {
    const targetModuleIndex = study.modules.findIndex((module) =>
      module.questions.some((question) => question.id === missing.id),
    );
    state.currentModuleIndex = targetModuleIndex;
    saveDraft();
    render();
    showToast(`Responda a ${missing.title} antes de enviar.`, "error");
    setTimeout(() => document.querySelector(`#answer-${cssEscape(missing.id)}`)?.focus(), 50);
    return false;
  }

  return true;
}

function buildPayload() {
  const selectedLeader = getSelectedLeader();
  const selectedTraining = getSelectedTraining();
  const departmentNames = getDepartmentNames();

  if (!selectedTraining) {
    throw new Error("Nenhum assunto selecionado.");
  }

  return {
    serie: {
      id: selectedTraining.seriesId || state.selectedSeriesId || "",
      titulo: getSeriesTitle(selectedTraining.seriesId),
    },
    estudo: {
      id: selectedTraining.id,
      titulo: selectedTraining.title,
      pregador: selectedTraining.speaker,
    },
    lider: {
      id: selectedLeader?.userId || state.leader?.id || state.selectedLeaderId,
      nome: state.leader?.name || selectedLeader?.name || state.selectedLeaderName,
      email: state.leader?.email || state.email,
      foto_url: state.leader?.photoUrl || "",
      vinculo_ministerio_id: selectedLeader?.id || null,
      ministerio_id: selectedLeader?.ministryId || null,
      papel: selectedLeader?.role || null,
    },
    ministerio: departmentNames || "Não informado",
    departamentos: getDepartmentsForPayload(),
    respostas: selectedTraining.modules.map(buildModuleAnswer),
    metadados: {
      origem: "webapp-discipulado-lideres",
      versao: "1.0.0",
      tipo_registro: "treinamento",
      envio_id: getOrCreateSubmissionId(),
      concluido_em: new Date().toISOString(),
      user_agent: navigator.userAgent,
    },
  };
}

function buildModulePayload(moduleIndex) {
  const selectedLeader = getSelectedLeader();
  const selectedTraining = getSelectedTraining();
  const module = selectedTraining?.modules[moduleIndex];
  const departmentNames = getDepartmentNames();

  if (!selectedTraining || !module) {
    throw new Error("Nenhum módulo selecionado.");
  }

  return {
    serie: {
      id: selectedTraining.seriesId || state.selectedSeriesId || "",
      titulo: getSeriesTitle(selectedTraining.seriesId),
    },
    estudo: {
      id: selectedTraining.id,
      titulo: selectedTraining.title,
      pregador: selectedTraining.speaker,
    },
    modulo: {
      id: module.id,
      numero: module.number,
      titulo: module.title,
    },
    lider: {
      id: selectedLeader?.userId || state.leader?.id || state.selectedLeaderId,
      nome: state.leader?.name || selectedLeader?.name || state.selectedLeaderName,
      email: state.leader?.email || state.email,
      foto_url: state.leader?.photoUrl || "",
      vinculo_ministerio_id: selectedLeader?.id || null,
      ministerio_id: selectedLeader?.ministryId || null,
      papel: selectedLeader?.role || null,
    },
    ministerio: departmentNames || "Não informado",
    departamentos: getDepartmentsForPayload(),
    respostas: [buildModuleAnswer(module)],
    metadados: {
      origem: "webapp-discipulado-lideres",
      versao: "1.0.0",
      tipo_registro: "modulo",
      envio_id: getOrCreateSubmissionId(),
      modulo_indice: moduleIndex,
      salvo_em: new Date().toISOString(),
      user_agent: navigator.userAgent,
    },
  };
}

function buildModuleAnswer(module) {
  return {
    modulo_id: module.id,
    modulo_numero: module.number,
    modulo_titulo: module.title,
    corte: module.timeLabel,
    perguntas: module.questions.map((question) => ({
      pergunta_id: question.id,
      pergunta_titulo: question.title,
      pergunta_texto: question.text,
      resposta: (state.answers[question.id] || "").trim(),
    })),
  };
}

function markCurrentModuleAsSaved() {
  const module = getSelectedTraining()?.modules[state.currentModuleIndex];

  if (!module) {
    return;
  }

  markModuleProgress(state.selectedTrainingId, module.id);

  const savedModule = {
    id: module.id,
    number: module.number,
    title: module.title,
  };
  const existingModuleIndex = state.savedModules.findIndex(
    (item) => item.id === savedModule.id,
  );

  if (existingModuleIndex >= 0) {
    state.savedModules[existingModuleIndex] = savedModule;
    return;
  }

  state.savedModules = [...state.savedModules, savedModule];
}

function getAnsweredModulesForSelectedTraining() {
  const selectedTraining = getSelectedTraining();

  if (!selectedTraining) {
    return [];
  }

  return selectedTraining.modules
    .filter((module) =>
      module.questions.length &&
      module.questions.every((question) => (state.answers[question.id] || "").trim()),
    )
    .map((module) => ({
      id: module.id,
      number: module.number,
      title: module.title,
    }));
}

function renderSuccess() {
  const selectedTraining = getSelectedTraining();
  const departmentNames = getDepartmentNames();
  const departmentSummary = departmentNames
    ? `
          <article class="summary-item">
            <h3>Departamentos</h3>
            <p>${escapeHtml(departmentNames)}</p>
          </article>`
    : "";

  app.innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <p class="eyebrow">Registro concluído</p>
        <h2>Respostas enviadas para acompanhamento pastoral.</h2>
      </div>
      <div class="panel-body">
        <div class="summary">
          <article class="summary-item">
            ${getMemberIdentityMarkup({ showEmail: Boolean(state.leaders.length) })}
          </article>
          ${departmentSummary}
          <article class="summary-item">
            <h3>Estudo</h3>
            <p>${escapeHtml(selectedTraining?.title || "Não informado")}</p>
          </article>
        </div>
        <div class="actions">
          <button class="btn secondary" type="button" data-action="success-menu">Voltar ao menu principal</button>
        </div>
      </div>
    </section>
  `;

  document.querySelector("[data-action='success-menu']")?.addEventListener("click", () => {
    state.savedModules = state.savedModules.length
      ? state.savedModules
      : getAnsweredModulesForSelectedTraining();
    state.creatorMode = false;
    state.configMode = false;
    state.seriesMode = false;
    state.editingTrainingId = "";
    state.trainingDraft = createEmptyTrainingDraft();
    state.currentModuleIndex = -1;
    state.submitted = false;
    state.isSubmitting = false;
    state.isSavingModule = false;
    saveDraft();
    render();
  });
}

function getSelectedLeader() {
  return (
    state.leaders.find((leader) => leader.id === state.selectedLeaderId) ||
    state.leaders[0] ||
    null
  );
}

function getLeaderId() {
  return getSelectedLeader()?.userId || state.leader?.id || "";
}

function withLeaderToken(headers = {}) {
  return state.leaderToken
    ? { ...headers, "x-leader-token": state.leaderToken }
    : headers;
}

function handleExpiredSession() {
  // A sessão caiu, mas o que o líder digitou não deve cair com ela: guarda o
  // rascunho, derruba só a sessão e devolve as respostas ao voltar.
  const answers = state.answers;
  const currentModuleIndex = state.currentModuleIndex;
  const submissionId = state.submissionId;

  signOut();

  state.answers = answers;
  state.currentModuleIndex = currentModuleIndex;
  state.submissionId = submissionId;
  saveDraft();
  showToast(
    "Sua sessão expirou. Entre novamente — suas respostas foram guardadas.",
    "error",
  );
  render();
}

function getLoggedUserEmail() {
  return String(state.leader?.email || state.email || "").trim().toLowerCase();
}

function canManageSubjects() {
  const email = getLoggedUserEmail();
  return Boolean(state.leader && email && ADMIN_ALLOWED_EMAILS.includes(email));
}

function resetAdminAccess() {
  state.adminUnlocked = false;
  state.adminToken = "";
  state.isCheckingAdmin = false;
  state.creatorMode = false;
  state.configMode = false;
  state.configDraft = [];
  state.seriesMode = false;
  state.seriesDraft = createEmptySeriesDraft();
  state.editingSeriesId = "";
  state.editingTrainingId = "";
  state.isSavingTraining = false;
  state.isSavingSeries = false;
  state.isSavingConfig = false;
  state.leaderAccessMode = false;
  state.leaderAccessList = [];
  state.leaderAccessSearch = "";
  state.leaderAccessStatus = "idle";
  // A senha temporária gerada nunca sobrevive a uma saída de tela.
  state.leaderAccessResult = null;
  state.resettingEmail = "";
}

function getMemberIdentityMarkup({ showEmail = true } = {}) {
  const name =
    state.leader?.name || state.selectedLeaderName || getSelectedLeader()?.name || "Não informado";
  const photoUrl = state.leader?.photoUrl || "";
  const photoMarkup = photoUrl
    ? `<img class="member-photo" src="${escapeHtml(photoUrl)}" alt="Foto de ${escapeHtml(name)}" />`
    : `<span class="member-photo member-photo-fallback" aria-hidden="true">${escapeHtml(getPersonInitials(name))}</span>`;
  const emailMarkup = showEmail
    ? `<p>${escapeHtml(state.leader?.email || state.email || "")}</p>`
    : "";

  return `
    <div class="member-identity">
      ${photoMarkup}
      <div class="member-details">
        <h3>${escapeHtml(name)}</h3>
        ${emailMarkup}
      </div>
    </div>
  `;
}

function getPersonInitials(name) {
  const words = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return (words.length ? words : ["U"])
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function getOrCreateSubmissionId() {
  if (!state.submissionId) {
    state.submissionId = createSubmissionId();
  }

  return state.submissionId;
}

function createSubmissionId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getDepartmentNames() {
  return state.leaders
    .map((leader) => String(leader.ministry || "").trim())
    .filter(Boolean)
    .join(", ");
}

function getDepartmentsForPayload() {
  return state.leaders
    .map((leader) => ({
      vinculo_ministerio_id: leader.id || null,
      ministerio_id: leader.ministryId || null,
      nome: leader.ministry || "",
      papel: leader.role || null,
    }))
    .filter((department) => department.nome);
}

function getSelectedTraining() {
  return (
    getAllTrainings().find((training) => training.id === state.selectedTrainingId) ||
    null
  );
}

function getSeriesTitle(seriesId) {
  const serie = getAllSeries().find((item) => item.id === seriesId);
  return serie?.title || getSelectedSeries()?.title || "";
}

function getSelectedSeries() {
  return getAllSeries().find((serie) => serie.id === state.selectedSeriesId) || null;
}

function getAllSeries() {
  return state.series.filter(isValidSeries);
}

function getAllTrainings() {
  return state.trainings.filter(isValidTraining);
}

function getTrainingsForSeries(seriesId) {
  if (!seriesId) {
    return [];
  }

  return getAllTrainings()
    .filter((training) => training.seriesId === seriesId)
    .sort(sortTrainings);
}

function isValidSeries(serie) {
  return Boolean(serie?.id && serie?.title);
}

function sortByOrder(first, second) {
  const firstOrder = Number(first.order) || 0;
  const secondOrder = Number(second.order) || 0;

  if (firstOrder !== secondOrder) {
    return firstOrder - secondOrder;
  }

  return String(first.title || "").localeCompare(String(second.title || ""), "pt-BR", {
    sensitivity: "base",
  });
}

function isValidTraining(training) {
  return Boolean(
    training?.id &&
      training?.title &&
      Array.isArray(training.modules) &&
      training.modules.length,
  );
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sortTrainings(firstTraining, secondTraining) {
  const firstOrder = Number(firstTraining.order) || 0;
  const secondOrder = Number(secondTraining.order) || 0;

  if (firstOrder !== secondOrder) {
    return firstOrder - secondOrder;
  }

  return String(firstTraining.title || "").localeCompare(
    String(secondTraining.title || ""),
    "pt-BR",
    { sensitivity: "base" },
  );
}

function createEmptyTrainingDraft() {
  return {
    title: "",
    speaker: "",
    seriesId: "",
    youtubeVideoUrl: "",
    modules: [createEmptyModuleDraft()],
  };
}

function getDefaultSeriesIdForDraft() {
  return state.selectedSeriesId || getAllSeries()[0]?.id || "";
}

function createTrainingDraftFromTraining(training) {
  const modules = Array.isArray(training?.modules) && training.modules.length
    ? training.modules
    : [createEmptyModuleDraft()];

  return {
    title: String(training?.title || ""),
    speaker: String(training?.speaker || ""),
    seriesId: String(training?.seriesId || state.selectedSeriesId || ""),
    youtubeVideoUrl: buildYoutubeWatchUrl(training?.youtubeVideoId || ""),
    modules: modules.map((module) => ({
      title: String(module?.title || ""),
      videoUrl:
        String(module?.videoUrl || "") || buildYoutubeWatchUrl(module?.videoId || ""),
      startTime:
        formatSecondsToTimeInput(module?.start) ||
        getTimeLabelPart(module?.timeLabel, 0),
      endTime:
        formatSecondsToTimeInput(module?.end) ||
        getTimeLabelPart(module?.timeLabel, 1),
      questions:
        Array.isArray(module?.questions) && module.questions.length
          ? module.questions.map((question) => ({
              text: String(question?.text || ""),
            }))
          : [createEmptyQuestionDraft()],
    })),
  };
}

function createEmptyModuleDraft() {
  return {
    title: "",
    videoUrl: "",
    startTime: "",
    endTime: "",
    questions: [createEmptyQuestionDraft()],
  };
}

function createEmptyQuestionDraft() {
  return { text: "" };
}

function buildYoutubeWatchUrl(videoId) {
  const value = String(videoId || "").trim();
  return value ? `https://www.youtube.com/watch?v=${value}` : "";
}

function formatSecondsToTimeInput(seconds) {
  const totalSeconds = Number(seconds);

  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = Math.floor(totalSeconds % 60);
  const secondsLabel = String(remainingSeconds).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${secondsLabel}`;
  }

  return `${minutes}:${secondsLabel}`;
}

function getTimeLabelPart(timeLabel, index) {
  const parts = String(timeLabel || "").split(/\s+a\s+/i);
  const value = parts[index]?.trim() || "";
  return value === "Vídeo completo" ? "" : value;
}

function syncTrainingDraftFromForm() {
  document.querySelectorAll("[data-training-field]").forEach((input) => {
    state.trainingDraft[input.dataset.trainingField] = input.value;
  });

  document.querySelectorAll("[data-module-field]").forEach((input) => {
    const module = state.trainingDraft.modules[Number(input.dataset.moduleIndex)];
    if (module) {
      module[input.dataset.moduleField] = input.value;
    }
  });

  document.querySelectorAll("[data-question-field]").forEach((textarea) => {
    const module = state.trainingDraft.modules[Number(textarea.dataset.moduleIndex)];
    const question = module?.questions[Number(textarea.dataset.questionIndex)];
    if (question) {
      question.text = textarea.value;
    }
  });
}

function validateTrainingDraft() {
  const draft = state.trainingDraft;
  const hasTrainingVideo = String(draft.youtubeVideoUrl || "").trim();

  if (!String(draft.title || "").trim()) {
    showToast("Informe o título do assunto.", "error");
    document.querySelector("#trainingTitle")?.focus();
    return false;
  }

  const invalidModuleIndex = draft.modules.findIndex((module) => {
    const hasTitle = String(module.title || "").trim();
    const hasVideo = hasTrainingVideo || String(module.videoUrl || "").trim();
    const hasQuestion =
      Array.isArray(module.questions) &&
      module.questions.some((question) => String(question.text || "").trim());
    return !hasTitle || !hasVideo || !hasQuestion;
  });

  if (invalidModuleIndex >= 0) {
    showToast(
      `Complete o título, o link principal do vídeo ou o link do módulo, e pelo menos uma pergunta no módulo ${invalidModuleIndex + 1}.`,
      "error",
    );
    return false;
  }

  return true;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function restoreDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
    state.email = draft.email || "";
    state.leaderToken = draft.leaderToken || "";
    // Rascunho sem token (gravado antes desta versão, ou de uma saída) não vale
    // como sessão: o líder entra de novo e as respostas continuam guardadas.
    state.leader = state.leaderToken ? draft.leader || null : null;
    state.leaders =
      state.leaderToken && Array.isArray(draft.leaders) ? draft.leaders : [];
    state.series = Array.isArray(draft.series)
      ? draft.series.filter(isValidSeries).sort(sortByOrder)
      : [];
    state.trainings = Array.isArray(draft.trainings)
      ? draft.trainings.filter(isValidTraining)
      : [];
    state.selectedSeriesId = getAllSeries().some(
      (serie) => serie.id === draft.selectedSeriesId,
    )
      ? draft.selectedSeriesId
      : "";
    state.selectedLeaderId = draft.selectedLeaderId || "";
    state.selectedLeaderName = draft.selectedLeaderName || "";
    state.ministry = draft.ministry || "";
    state.selectedTrainingId = getAllTrainings().some(
      (training) => training.id === draft.selectedTrainingId,
    )
      ? draft.selectedTrainingId
      : state.trainings[0]?.id || "";
    state.creatorMode = Boolean(draft.creatorMode);
    state.editingTrainingId = getAllTrainings().some(
      (training) => training.id === draft.editingTrainingId,
    )
      ? draft.editingTrainingId
      : "";
    state.trainingDraft = draft.trainingDraft?.modules
      ? draft.trainingDraft
      : createEmptyTrainingDraft();
    const draftModuleIndex = Number.isInteger(draft.currentModuleIndex)
      ? draft.currentModuleIndex
      : -1;
    state.currentModuleIndex =
      draftModuleIndex >= -1 &&
      draftModuleIndex < (getSelectedTraining()?.modules.length || 0)
        ? draftModuleIndex
        : -1;
    state.answers = draft.answers || {};
    state.savedModules = Array.isArray(draft.savedModules) ? draft.savedModules : [];
    state.progressByTraining = isPlainObject(draft.progressByTraining)
      ? draft.progressByTraining
      : {};
    state.submissionId = draft.submissionId || "";
    state.isSavingModule = false;
    state.isSubmitting = false;
    state.isLoadingSavedAnswers = false;
    // Senha e código nunca são gravados; o fluxo de login sempre começa do zero.
    state.loginStep = "email";
    state.loginName = "";
    state.codeDestination = "";
    clearLoginSecrets();
  } catch {
    clearDraft();
  }
}

function saveDraft() {
  const draft = {
    email: state.email,
    leader: state.leader,
    leaderToken: state.leaderToken,
    leaders: state.leaders,
    savedModules: state.savedModules,
    series: state.series,
    trainings: state.trainings,
    selectedSeriesId: state.selectedSeriesId,
    selectedLeaderId: state.selectedLeaderId,
    selectedLeaderName: state.selectedLeaderName,
    ministry: state.ministry,
    selectedTrainingId: state.selectedTrainingId,
    creatorMode: state.creatorMode,
    editingTrainingId: state.editingTrainingId,
    trainingDraft: state.trainingDraft,
    currentModuleIndex: state.currentModuleIndex,
    answers: state.answers,
    progressByTraining: state.progressByTraining,
    submissionId: state.submissionId,
  };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

function showToast(message, type = "default") {
  clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  toastTimeout = setTimeout(() => {
    toast.className = "toast";
  }, 5200);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cssEscape(value) {
  if (window.CSS?.escape) {
    return window.CSS.escape(value);
  }

  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
