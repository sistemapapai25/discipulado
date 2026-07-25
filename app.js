"use strict";

const API_ENDPOINT = "/api/salvar";
const ACCESS_ENDPOINT = "/api/acesso";
const PASTOR_WHATSAPP_NUMBER = "55COLE_AQUI_NUMERO_DO_PASTOR";
const YOUTUBE_VIDEO_ID = "COLE_AQUI_YOUTUBE_VIDEO_ID";
const DRAFT_KEY = "discipulado-lideres-draft-v1";

const TRAININGS = [
  {
    id: "aumentando-niveis-de-gloria-apostolo-jean",
    title: "Aumentando os Níveis de Glória - Apóstolo Jean",
    speaker: "Apóstolo Jean",
    modules: [
      {
      id: "modulo-1",
      number: 1,
      title: "Resgatados de uma Maneira Vã de Viver",
      timeLabel: "24:58 a 33:23",
      start: 1498,
      end: 2003,
      questions: [
        {
          id: "1.1",
          title: "Pergunta 1.1",
          text: 'O Apóstolo ensina que fomos resgatados de uma "vã maneira de viver" herdada por tradição. Identifique: que hábitos, mentalidades ou tradições da sua família/passado você sente que ainda tenta arrastar para a sua vida cristã?',
        },
        {
          id: "1.2",
          title: "Pergunta 1.2",
          text: "Com suas palavras, o que muda na sua rotina quando você entende que foi comprado por um preço precioso e não pertence mais a si mesmo?",
        },
      ],
    },
    {
      id: "modulo-2",
      number: 2,
      title: "O que é a Glória de Deus?",
      timeLabel: "38:51 a 44:28",
      start: 2331,
      end: 2668,
      questions: [
        {
          id: "2.1",
          title: "Pergunta 2.1",
          text: 'De acordo com o texto de Êxodo 33 citado na pregação, o que é biblicamente a "Glória de Deus"?',
        },
        {
          id: "2.2",
          title: "Pergunta 2.2",
          text: 'Olhando para o seu dia a dia (na sua casa, no seu trabalho e com seus amigos), as pessoas têm conseguido enxergar a "face de Deus" nas suas atitudes?',
        },
      ],
    },
    {
      id: "modulo-3",
      number: 3,
      title: "A Transferência da Glória",
      timeLabel: "44:28 a 55:27",
      start: 2668,
      end: 3327,
      questions: [
        {
          id: "3.1",
          title: "Pergunta 3.1",
          text: "No vídeo, o Apóstolo faz uma dinâmica com a igreja. Como a glória do Pai chega até nós hoje?",
        },
        {
          id: "3.2",
          title: "Pergunta 3.2",
          text: "Jesus orou para que fôssemos UM para manifestar essa glória. Você tem trabalhado em unidade com a liderança e equipe, ou tem tido a tendência de agir de forma isolada?",
        },
      ],
    },
    {
      id: "modulo-4",
      number: 4,
      title: "Como Aumentar os Níveis de Glória",
      timeLabel: "56:43 a 1:13:40",
      start: 3403,
      end: 4420,
      questions: [
        {
          id: "4.1",
          title: "Pergunta 4.1",
          text: "Segundo João 15:8, de que maneira prática a Igreja devolve a glória para o Pai?",
        },
        {
          id: "4.2",
          title: "Pergunta 4.2 (Diagnóstico)",
          text: 'O que significa "dar frutos" na sua vida hoje? Onde você sente que tem dado frutos e em qual área sente que precisa frutificar mais?',
        },
        {
          id: "4.3",
          title: "Pergunta 4.3 (Bloqueios)",
          text: 'O que tem sido o principal "bloqueio" ou desculpa que tem impedido você de dar frutos em um novo nível hoje? (Ex: cansaço, tempo, medo, falta de foco, etc.)',
        },
      ],
    },
    {
      id: "modulo-5",
      number: 5,
      title: "Arrependimento e Desentupindo o Canal",
      timeLabel: "1:14:02 a 1:38:05",
      start: 4442,
      end: 5885,
      questions: [
        {
          id: "5.1",
          title: "Pergunta 5.1",
          text: "O Apóstolo ministrou sobre desentupir o canal para ser um rio de águas purificadoras. Que atitude, mudança de caráter ou confissão você precisa fazer hoje para alinhar sua rota com Deus?",
        },
        {
          id: "5.2",
          title: "Pergunta 5.2",
          text: "Qual compromisso prático você assume com o Senhor e com a nossa igreja a partir desta semana para exercer sua liderança com excelência?",
        },
        {
          id: "5.3",
          title: "Pergunta 5.3 (Suporte Pastoral)",
          text: "Como eu, como seu pastor, posso orar por você ou te apoiar de forma prática nesta nova fase?",
        },
      ],
    },
    ],
  },
];

const state = {
  leaders: [],
  leaderStatus: "idle",
  leader: null,
  email: "",
  selectedLeaderId: "",
  selectedLeaderName: "",
  ministry: "",
  selectedTrainingId: TRAININGS[0].id,
  currentModuleIndex: -1,
  answers: {},
  isSubmitting: false,
  submitted: false,
};

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
const progressFill = document.querySelector("#progressFill");
const progressLabel = document.querySelector("#progressLabel");
const studyTitle = document.querySelector("#studyTitle");

let toastTimeout;

document.addEventListener("DOMContentLoaded", init);

function init() {
  studyTitle.textContent = getSelectedTraining().title;
  restoreDraft();
  render();
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

function sortLeaders(firstLeader, secondLeader) {
  const firstLabel = firstLeader.label || firstLeader.name || "";
  const secondLabel = secondLeader.label || secondLeader.name || "";

  return firstLabel.localeCompare(secondLabel, "pt-BR", {
    sensitivity: "base",
  });
}

function render() {
  updateProgress();
  studyTitle.textContent = getSelectedTraining().title;

  if (state.submitted) {
    renderSuccess();
    return;
  }

  if (state.currentModuleIndex < 0) {
    renderIntro();
    return;
  }

  renderModule(getSelectedTraining().modules[state.currentModuleIndex]);
}

function updateProgress() {
  const total = getSelectedTraining().modules.length;
  const progress =
    state.currentModuleIndex < 0
      ? 0
      : Math.round(((state.currentModuleIndex + 1) / total) * 100);

  progressFill.style.width = `${progress}%`;
  progressLabel.textContent =
    state.currentModuleIndex < 0
      ? "Início"
      : `Módulo ${state.currentModuleIndex + 1} de ${total}`;
}

function renderIntro() {
  const selectedLeader = getSelectedLeader();
  const selectedTraining = getSelectedTraining();
  const hasAccess = Boolean(state.leader);
  const canStart = Boolean(
    hasAccess && state.selectedLeaderId && state.selectedTrainingId,
  );
  const ministryOptions = state.leaders
    .map((leader) => {
      const selected = leader.id === state.selectedLeaderId ? "selected" : "";
      return `<option value="${escapeHtml(leader.id)}" ${selected}>${escapeHtml(leader.label || leader.ministry)}</option>`;
    })
    .join("");
  const trainingOptions = TRAININGS.map((training) => {
    const selected = training.id === state.selectedTrainingId ? "selected" : "";
    return `<option value="${escapeHtml(training.id)}" ${selected}>${escapeHtml(training.title)}</option>`;
  }).join("");

  app.innerHTML = `
    <section class="panel">
      <div class="hero-strip">
        <h2>Formação prática para líderes que desejam frutificar com maturidade.</h2>
        <p>Uma jornada de escuta, unidade e crescimento no exercício da liderança.</p>
      </div>
      <div class="panel-body">
        <div class="form-grid">
          <div class="field">
            <label for="emailInput">E-mail cadastrado no church360</label>
            <input class="input" id="emailInput" type="email" value="${escapeHtml(state.email)}" placeholder="seuemail@exemplo.com" autocomplete="email" ${state.leaderStatus === "loading" || hasAccess ? "disabled" : ""} />
            <p class="hint">${getAccessStatusText()}</p>
          </div>

          ${
            hasAccess
              ? `
                <div class="summary">
                  <article class="summary-item">
                    <h3>Líder identificado</h3>
                    <p>${escapeHtml(state.leader.name)}${state.leader.email ? ` | ${escapeHtml(state.leader.email)}` : ""}</p>
                  </article>
                </div>

                <div class="field">
                  <label for="leaderSelect">Ministério vinculado</label>
                  <select class="select" id="leaderSelect">
                    ${ministryOptions}
                  </select>
                </div>

                <div class="field">
                  <label for="trainingSelect">Assunto do discipulado</label>
                  <select class="select" id="trainingSelect">
                    ${trainingOptions}
                  </select>
                </div>
              `
              : ""
          }

          <div class="study-confirm">
            <span>Assunto selecionado</span>
            <strong>${escapeHtml(selectedTraining.title)}</strong>
            <span class="hint">${selectedTraining.modules.length} módulos com vídeo e questionário integrado.</span>
          </div>

          ${
            selectedLeader
              ? `<p class="status-line">Ministério: <strong>${escapeHtml(selectedLeader.ministry)}</strong></p>`
              : ""
          }
        </div>

        <div class="actions">
          ${
            hasAccess
              ? `<button class="btn secondary" type="button" data-action="change-email">Trocar e-mail</button>
                 <button class="btn" type="button" data-action="start" ${canStart ? "" : "disabled"}>Iniciar treinamento</button>`
              : `<button class="btn" type="button" data-action="access" ${state.leaderStatus === "loading" ? "disabled" : ""}>${state.leaderStatus === "loading" ? "Verificando..." : "Acessar treinamento"}</button>`
          }
        </div>
      </div>
    </section>
  `;

  bindIntroEvents();
}

function bindIntroEvents() {
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
      if (!state.leader || !selectedLeader || !state.selectedTrainingId) {
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

  const isFirst = state.currentModuleIndex === 0;
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
          <button class="btn secondary" type="button" data-action="previous" ${isFirst ? "disabled" : ""}>Voltar</button>
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
  const hasVideoId =
    YOUTUBE_VIDEO_ID &&
    !YOUTUBE_VIDEO_ID.includes("COLE_AQUI") &&
    YOUTUBE_VIDEO_ID.length >= 8;

  if (!hasVideoId) {
    return `
      <div class="video-frame" role="img" aria-label="Player de vídeo pendente de configuração">
        <div class="video-placeholder">
          <div>
            <strong>Player do YouTube preparado</strong>
            <span>Preencha YOUTUBE_VIDEO_ID em app.js para abrir este corte automaticamente: ${escapeHtml(module.timeLabel)}.</span>
          </div>
        </div>
      </div>
    `;
  }

  const params = new URLSearchParams({
    start: String(module.start),
    end: String(module.end),
    rel: "0",
    modestbranding: "1",
  });

  return `
    <div class="video-frame">
      <iframe
        title="${escapeHtml(module.title)}"
        src="https://www.youtube.com/embed/${encodeURIComponent(YOUTUBE_VIDEO_ID)}?${params.toString()}"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
      ></iframe>
    </div>
  `;
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
        saveDraft();
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
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
  const module = getSelectedTraining().modules[state.currentModuleIndex];
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
            <p>${escapeHtml(selectedTraining.title)}</p>
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
    state.selectedTrainingId = TRAININGS[0].id;
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
    TRAININGS.find((training) => training.id === state.selectedTrainingId) ||
    TRAININGS[0]
  );
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
    state.selectedLeaderId = draft.selectedLeaderId || "";
    state.selectedLeaderName = draft.selectedLeaderName || "";
    state.ministry = draft.ministry || "";
    state.selectedTrainingId = TRAININGS.some(
      (training) => training.id === draft.selectedTrainingId,
    )
      ? draft.selectedTrainingId
      : TRAININGS[0].id;
    const draftModuleIndex = Number.isInteger(draft.currentModuleIndex)
      ? draft.currentModuleIndex
      : -1;
    state.currentModuleIndex =
      draftModuleIndex >= -1 &&
      draftModuleIndex < getSelectedTraining().modules.length
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
    selectedLeaderId: state.selectedLeaderId,
    selectedLeaderName: state.selectedLeaderName,
    ministry: state.ministry,
    selectedTrainingId: state.selectedTrainingId,
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
