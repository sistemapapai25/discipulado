"use strict";

const API_ENDPOINT = "/api/salvar";
const ACCESS_ENDPOINT = "/api/acesso";
const SUBJECTS_ENDPOINT = "/api/assuntos";
const PASTOR_WHATSAPP_NUMBER = "55COLE_AQUI_NUMERO_DO_PASTOR";
const YOUTUBE_VIDEO_ID = "COLE_AQUI_YOUTUBE_VIDEO_ID";
const DRAFT_KEY = "discipulado-lideres-draft-v1";

const CHURCH_CONFIG = {
  name: "Nome da Igreja",
  logoUrl: "",
};

const state = {
  leaders: [],
  trainings: [],
  leaderStatus: "idle",
  trainingStatus: "idle",
  leader: null,
  email: "",
  selectedLeaderId: "",
  selectedLeaderName: "",
  ministry: "",
  selectedTrainingId: "",
  creatorMode: false,
  editingTrainingId: "",
  trainingDraft: createEmptyTrainingDraft(),
  currentModuleIndex: -1,
  answers: {},
  isSubmitting: false,
  isSavingTraining: false,
  submitted: false,
};

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
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
  }
}

function getPageTitle() {
  if (!state.leader) {
    return "Acesso do líder";
  }

  if (state.creatorMode) {
    return state.editingTrainingId ? "Editar assunto" : "Criar assunto";
  }

  if (state.currentModuleIndex < 0) {
    return "Menu principal";
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

async function requestAccess() {
  const email = state.email.trim().toLowerCase();

  if (!isValidEmail(email)) {
    showToast("Informe um e-mail válido.", "error");
    document.querySelector("#emailInput")?.focus();
    return;
  }

  state.leaderStatus = "loading";
  render();

  try {
    const response = await fetch(ACCESS_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || "Não foi possível validar seu acesso.");
    }

    state.email = email;
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
    state.ministry = getSelectedLeader()?.ministry || "";
    state.leaderStatus = "loaded";

    saveDraft();
  } catch (error) {
    state.leader = null;
    state.leaders = [];
    state.selectedLeaderId = "";
    state.selectedLeaderName = "";
    state.ministry = "";
    state.leaderStatus = "error";
    saveDraft();
    showToast(error.message, "error");
  }

  render();
}

async function loadTrainings() {
  state.trainingStatus = "loading";

  try {
    const response = await fetch(SUBJECTS_ENDPOINT, {
      headers: { Accept: "application/json" },
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || "Não foi possível carregar os assuntos.");
    }

    state.trainings = (result.trainings || [])
      .filter(isValidTraining)
      .sort(sortTrainings);
    state.trainingStatus = result.warning ? "warning" : "loaded";

    if (!getAllTrainings().some((training) => training.id === state.selectedTrainingId)) {
      state.selectedTrainingId = state.trainings[0]?.id || "";
    }
  } catch (error) {
    state.trainings = [];
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
  updateProgress();
  studyTitle.textContent = getPageTitle();

  if (state.submitted) {
    renderSuccess();
    return;
  }

  if (!state.leader) {
    state.creatorMode = false;
    state.editingTrainingId = "";
    renderLogin();
    return;
  }

  if (state.creatorMode) {
    renderTrainingBuilder();
    return;
  }

  if (state.currentModuleIndex < 0) {
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
  app.innerHTML = `
    <section class="panel">
      <div class="hero-strip">
        <h2>Acesso ao discipulado de liderança</h2>
        <p>Entre com o e-mail cadastrado no church360 para acessar seus departamentos e os assuntos disponíveis.</p>
      </div>
      <div class="panel-body">
        <div class="form-grid">
          <div class="field">
            <label for="emailInput">E-mail cadastrado no church360</label>
            <input class="input" id="emailInput" type="email" value="${escapeHtml(state.email)}" placeholder="seuemail@exemplo.com" autocomplete="email" ${state.leaderStatus === "loading" ? "disabled" : ""} />
            <p class="hint">${getAccessStatusText()}</p>
          </div>
        </div>

        <div class="actions">
          <button class="btn" type="button" data-action="access" ${state.leaderStatus === "loading" ? "disabled" : ""}>
            ${state.leaderStatus === "loading" ? "Verificando..." : "Entrar"}
          </button>
        </div>
      </div>
    </section>
  `;

  bindLoginEvents();
}

function renderMainMenu() {
  const selectedLeader = getSelectedLeader();
  const selectedTraining = getSelectedTraining();
  const canStart = Boolean(state.selectedLeaderId && selectedTraining);
  const ministryOptions = state.leaders
    .map((leader) => {
      const selected = leader.id === state.selectedLeaderId ? "selected" : "";
      return `<option value="${escapeHtml(leader.id)}" ${selected}>${escapeHtml(leader.label || leader.ministry)}</option>`;
    })
    .join("");
  const allTrainings = getAllTrainings();
  const trainingOptions = allTrainings.map((training) => {
    const selected = training.id === state.selectedTrainingId ? "selected" : "";
    return `<option value="${escapeHtml(training.id)}" ${selected}>${escapeHtml(training.title)}</option>`;
  }).join("");
  const departmentList = state.leaders
    .map((leader) => `<span class="pill">${escapeHtml(leader.ministry)}</span>`)
    .join("");

  app.innerHTML = `
    <section class="panel">
      <div class="hero-strip">
        <h2>Menu principal</h2>
        <p>Escolha o assunto do discipulado, revise seus departamentos e inicie o treinamento.</p>
      </div>
      <div class="panel-body">
        <div class="form-grid">
          <div class="summary">
            <article class="summary-item">
              <h3>${escapeHtml(state.leader.name)}</h3>
              <p>${escapeHtml(state.leader.email || state.email)}</p>
              <div class="module-meta">${departmentList}</div>
            </article>
          </div>

          <div class="field">
            <label for="leaderSelect">Departamento para este discipulado</label>
            <select class="select" id="leaderSelect">
              ${ministryOptions}
            </select>
          </div>

          <div class="field">
            <div class="mini-row">
              <label for="trainingSelect">Assunto do discipulado</label>
              <button class="link-button" type="button" data-action="reload-trainings">Atualizar assuntos</button>
            </div>
            <select class="select" id="trainingSelect" ${allTrainings.length ? "" : "disabled"}>
              <option value="">${allTrainings.length ? "Selecione um assunto" : "Nenhum assunto cadastrado"}</option>
              ${trainingOptions}
            </select>
            <p class="hint">${getTrainingStatusText()}</p>
          </div>

          <div class="study-confirm">
            <span>Assunto selecionado</span>
            <strong>${escapeHtml(selectedTraining?.title || "Nenhum assunto selecionado")}</strong>
            <span class="hint">${selectedTraining ? `${selectedTraining.modules.length} módulos com vídeo e questionário integrado.` : "Cadastre ou selecione um assunto para iniciar."}</span>
          </div>
        </div>

        <div class="actions">
          <button class="btn secondary" type="button" data-action="create-training">Criar assunto</button>
          <button class="btn secondary" type="button" data-action="edit-training" ${selectedTraining ? "" : "disabled"}>Editar assunto</button>
          <button class="btn secondary" type="button" data-action="change-email">Sair</button>
          <button class="btn" type="button" data-action="start" ${canStart ? "" : "disabled"}>Iniciar treinamento</button>
        </div>
      </div>
    </section>
  `;

  bindMainMenuEvents();
}

function bindLoginEvents() {
  document
    .querySelector("#emailInput")
    ?.addEventListener("input", (event) => {
      state.email = event.target.value;
      saveDraft();
    });

  document
    .querySelector("#emailInput")
    ?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        requestAccess();
      }
    });

  document
    .querySelector("[data-action='access']")
    ?.addEventListener("click", requestAccess);
}

function bindMainMenuEvents() {
  document
    .querySelector("#leaderSelect")
    ?.addEventListener("change", (event) => {
      state.selectedLeaderId = event.target.value;
      state.ministry = getSelectedLeader()?.ministry || "";
      saveDraft();
      render();
    });

  document
    .querySelector("#trainingSelect")
    ?.addEventListener("change", (event) => {
      state.selectedTrainingId = event.target.value;
      state.currentModuleIndex = -1;
      state.answers = {};
      saveDraft();
      render();
    });

  document
    .querySelector("[data-action='reload-trainings']")
    ?.addEventListener("click", loadTrainings);

  document
    .querySelector("[data-action='create-training']")
    ?.addEventListener("click", () => {
      state.creatorMode = true;
      state.editingTrainingId = "";
      state.currentModuleIndex = -1;
      state.trainingDraft = createEmptyTrainingDraft();
      saveDraft();
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

  document
    .querySelector("[data-action='edit-training']")
    ?.addEventListener("click", () => {
      const selectedTraining = getSelectedTraining();

      if (!selectedTraining) {
        showToast("Selecione um assunto para editar.", "error");
        return;
      }

      state.creatorMode = true;
      state.editingTrainingId = selectedTraining.id;
      state.currentModuleIndex = -1;
      state.trainingDraft = createTrainingDraftFromTraining(selectedTraining);
      saveDraft();
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

  document
    .querySelector("[data-action='change-email']")
    ?.addEventListener("click", () => {
      state.leader = null;
      state.leaders = [];
      state.email = "";
      state.selectedLeaderId = "";
      state.selectedLeaderName = "";
      state.ministry = "";
      state.currentModuleIndex = -1;
      state.answers = {};
      state.submitted = false;
      state.leaderStatus = "idle";
      saveDraft();
      render();
    });

  document
    .querySelector("[data-action='start']")
    ?.addEventListener("click", () => {
      const selectedLeader = getSelectedLeader();
      const selectedTraining = getSelectedTraining();
      if (!state.leader || !selectedLeader || !selectedTraining) {
        showToast("Confirme o e-mail, o ministério e o assunto.", "error");
        return;
      }

      state.selectedLeaderName = state.leader.name;
      state.ministry = selectedLeader.ministry;
      state.currentModuleIndex = 0;
      saveDraft();
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
}

function getAccessStatusText() {
  if (state.leaderStatus === "loading") {
    return "Validando seu e-mail no church360.";
  }

  if (state.leaderStatus === "error") {
    return "Não foi possível validar este e-mail como líder ativo.";
  }

  if (state.leaderStatus === "loaded") {
    return `${state.leaders.length} ministério(s) de liderança encontrado(s).`;
  }

  return "Digite o e-mail usado no cadastro do church360.";
}

function getTrainingStatusText() {
  if (state.trainingStatus === "loading") {
    return "Carregando assuntos cadastrados.";
  }

  if (state.trainingStatus === "error") {
    return "Não foi possível carregar assuntos do Neon.";
  }

  if (state.trainingStatus === "warning") {
    return "Crie a tabela no Neon para cadastrar e exibir assuntos.";
  }

  const count = state.trainings.length;
  return count
    ? `${count} assunto(s) cadastrado(s) no Neon.`
    : "Nenhum assunto cadastrado no Neon.";
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

  app.innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <p class="eyebrow">Módulo ${module.number}</p>
        <h2>${escapeHtml(module.title)}</h2>
        <div class="module-meta">
          <span class="pill">Corte ${escapeHtml(module.timeLabel)}</span>
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
          <button class="btn secondary" type="button" data-action="menu">Menu principal</button>
          ${
            isLast
              ? `<button class="btn" type="button" data-action="submit" ${state.isSubmitting ? "disabled" : ""}>${state.isSubmitting ? "Enviando..." : "Concluir e Enviar Respostas"}</button>
                 <button class="btn whatsapp" type="button" data-action="whatsapp">Enviar Copia para o Pastor via WhatsApp</button>`
              : `<button class="btn" type="button" data-action="next">Próximo módulo</button>`
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
            <span>Cadastre o link do YouTube para abrir este corte automaticamente: ${escapeHtml(module.timeLabel)}.</span>
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

  document.querySelector("[data-action='next']")?.addEventListener("click", () => {
    if (!validateCurrentModule()) {
      return;
    }

    state.currentModuleIndex += 1;
    saveDraft();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  document
    .querySelector("[data-action='submit']")
    ?.addEventListener("click", submitAnswers);

  document
    .querySelector("[data-action='whatsapp']")
    ?.addEventListener("click", sendWhatsappSummary);
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
    state.trainings = [
      training,
      ...state.trainings.filter((item) => item.id !== training.id),
    ].filter(isValidTraining);
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
    state.isSavingTraining = false;
    showToast(error.message, "error");
    render();
  }
}

async function submitAnswers() {
  if (!validateAllAnswers()) {
    return;
  }

  state.isSubmitting = true;
  render();

  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildPayload()),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || "Não foi possível salvar as respostas.");
    }

    state.submitted = true;
    state.isSubmitting = false;
    clearDraft();
    showToast("Respostas salvas com sucesso.", "success");
    render();
  } catch (error) {
    state.isSubmitting = false;
    showToast(`${error.message} Use o envio por WhatsApp como contingência.`, "error");
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

  if (!selectedTraining) {
    throw new Error("Nenhum assunto selecionado.");
  }

  return {
    estudo: {
      id: selectedTraining.id,
      titulo: selectedTraining.title,
      pregador: selectedTraining.speaker,
    },
    lider: {
      id: selectedLeader?.userId || state.leader?.id || state.selectedLeaderId,
      nome: state.leader?.name || selectedLeader?.name || state.selectedLeaderName,
      email: state.leader?.email || state.email,
      vinculo_ministerio_id: selectedLeader?.id || state.selectedLeaderId,
      ministerio_id: selectedLeader?.ministryId || null,
      papel: selectedLeader?.role || null,
    },
    ministerio: state.ministry.trim(),
    respostas: selectedTraining.modules.map((module) => ({
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
    })),
    resumo_whatsapp: buildWhatsappSummary(),
    metadados: {
      origem: "webapp-discipulado-lideres",
      versao: "1.0.0",
      concluido_em: new Date().toISOString(),
      user_agent: navigator.userAgent,
    },
  };
}

function buildWhatsappSummary() {
  const selectedLeader = getSelectedLeader();
  const selectedTraining = getSelectedTraining();
  if (!selectedTraining) {
    return "";
  }

  const leaderName =
    state.leader?.name || selectedLeader?.name || state.selectedLeaderName || "Não informado";
  const lines = [
    `Resumo do Treinamento de Liderança`,
    ``,
    `Estudo: ${selectedTraining.title}`,
    `Líder: ${leaderName}`,
    `E-mail: ${state.leader?.email || state.email || "Não informado"}`,
    `Ministério: ${state.ministry.trim() || "Não informado"}`,
    ``,
  ];

  selectedTraining.modules.forEach((module) => {
    lines.push(`Módulo ${module.number}: ${module.title}`);
    lines.push(`Corte: ${module.timeLabel}`);
    module.questions.forEach((question) => {
      lines.push(`${question.title}: ${(state.answers[question.id] || "").trim() || "Sem resposta"}`);
    });
    lines.push("");
  });

  return lines.join("\n");
}

function sendWhatsappSummary() {
  if (!validateAllAnswers()) {
    return;
  }

  const number = PASTOR_WHATSAPP_NUMBER.includes("COLE_AQUI")
    ? ""
    : PASTOR_WHATSAPP_NUMBER.replace(/\D/g, "");
  const baseUrl = number ? `https://wa.me/${number}` : "https://wa.me/";
  const url = `${baseUrl}?text=${encodeURIComponent(buildWhatsappSummary())}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function renderSuccess() {
  const selectedTraining = getSelectedTraining();

  app.innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <p class="eyebrow">Registro concluído</p>
        <h2>Respostas enviadas para acompanhamento pastoral.</h2>
        <p>Você ainda pode enviar uma cópia por WhatsApp caso queira reforçar o recebimento.</p>
      </div>
      <div class="panel-body">
        <div class="summary">
          <article class="summary-item">
            <h3>Líder</h3>
            <p>${escapeHtml(state.leader?.name || state.selectedLeaderName || getSelectedLeader()?.name || "Não informado")}</p>
          </article>
          <article class="summary-item">
            <h3>Ministério</h3>
            <p>${escapeHtml(state.ministry || "Não informado")}</p>
          </article>
          <article class="summary-item">
            <h3>Estudo</h3>
            <p>${escapeHtml(selectedTraining?.title || "Não informado")}</p>
          </article>
        </div>
        <div class="actions">
          <button class="btn whatsapp" type="button" data-action="whatsapp">Enviar Copia para o Pastor via WhatsApp</button>
          <button class="btn secondary" type="button" data-action="restart">Novo envio</button>
        </div>
      </div>
    </section>
  `;

  document
    .querySelector("[data-action='whatsapp']")
    ?.addEventListener("click", sendWhatsappSummary);

  document.querySelector("[data-action='restart']")?.addEventListener("click", () => {
    state.selectedLeaderId = "";
    state.selectedLeaderName = "";
    state.email = "";
    state.leader = null;
    state.leaders = [];
    state.ministry = "";
    state.selectedTrainingId = "";
    state.creatorMode = false;
    state.editingTrainingId = "";
    state.trainingDraft = createEmptyTrainingDraft();
    state.currentModuleIndex = -1;
    state.answers = {};
    state.submitted = false;
    state.leaderStatus = "idle";
    saveDraft();
    render();
  });
}

function getSelectedLeader() {
  return state.leaders.find((leader) => leader.id === state.selectedLeaderId);
}

function getSelectedTraining() {
  return (
    getAllTrainings().find((training) => training.id === state.selectedTrainingId) ||
    null
  );
}

function getAllTrainings() {
  return state.trainings.filter(isValidTraining);
}

function isValidTraining(training) {
  return Boolean(
    training?.id &&
      training?.title &&
      Array.isArray(training.modules) &&
      training.modules.length,
  );
}

function sortTrainings(firstTraining, secondTraining) {
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
    youtubeVideoUrl: "",
    modules: [createEmptyModuleDraft()],
  };
}

function createTrainingDraftFromTraining(training) {
  const modules = Array.isArray(training?.modules) && training.modules.length
    ? training.modules
    : [createEmptyModuleDraft()];

  return {
    title: String(training?.title || ""),
    speaker: String(training?.speaker || ""),
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
    state.leader = draft.leader || null;
    state.leaders = Array.isArray(draft.leaders) ? draft.leaders : [];
    state.trainings = Array.isArray(draft.trainings)
      ? draft.trainings.filter(isValidTraining)
      : [];
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
  } catch {
    clearDraft();
  }
}

function saveDraft() {
  const draft = {
    email: state.email,
    leader: state.leader,
    leaders: state.leaders,
    trainings: state.trainings,
    selectedLeaderId: state.selectedLeaderId,
    selectedLeaderName: state.selectedLeaderName,
    ministry: state.ministry,
    selectedTrainingId: state.selectedTrainingId,
    creatorMode: state.creatorMode,
    editingTrainingId: state.editingTrainingId,
    trainingDraft: state.trainingDraft,
    currentModuleIndex: state.currentModuleIndex,
    answers: state.answers,
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
