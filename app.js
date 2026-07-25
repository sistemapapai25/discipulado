"use strict";

const SUPABASE_CONFIG = {
  url: "COLE_AQUI_SUPABASE_URL_DO_CHURCH360",
  anonKey: "COLE_AQUI_SUPABASE_ANON_KEY_DO_CHURCH360",
  membershipTable: "ministry_member",
  leaderRoles: ["leader", "coordinator"],
  leadersSelect: `
    id,
    role,
    user_account!inner (
      id,
      full_name,
      first_name,
      last_name,
      nickname,
      is_active
    ),
    ministry!inner (
      id,
      name,
      is_active
    )
  `,
};

const API_ENDPOINT = "/api/salvar";
const PASTOR_WHATSAPP_NUMBER = "55COLE_AQUI_NUMERO_DO_PASTOR";
const YOUTUBE_VIDEO_ID = "COLE_AQUI_YOUTUBE_VIDEO_ID";
const DRAFT_KEY = "discipulado-lideres-draft-v1";

const ACTIVE_STUDY = {
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
};

const state = {
  leaders: [],
  leaderStatus: "idle",
  selectedLeaderId: "",
  selectedLeaderName: "",
  ministry: "",
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

let supabaseClient = null;
let toastTimeout;

document.addEventListener("DOMContentLoaded", init);

function init() {
  studyTitle.textContent = ACTIVE_STUDY.title;
  restoreDraft();
  render();
  loadLeaders();
}

async function loadLeaders() {
  state.leaderStatus = "loading";
  render();

  try {
    supabaseClient = createSupabaseClient();
    if (!supabaseClient) {
      throw new Error("Configure SUPABASE_URL e SUPABASE_ANON_KEY no app.js.");
    }

    const { data, error } = await supabaseClient
      .from(SUPABASE_CONFIG.membershipTable)
      .select(SUPABASE_CONFIG.leadersSelect)
      .in("role", SUPABASE_CONFIG.leaderRoles)
      .eq("user_account.is_active", true)
      .eq("ministry.is_active", true);

    if (error) {
      throw error;
    }

    state.leaders = (data || [])
      .map(normalizeLeader)
      .filter(Boolean)
      .sort(sortLeaders);
    state.leaderStatus = "loaded";

    if (state.selectedLeaderId) {
      const selectedLeader = state.leaders.find(
        (leader) => leader.id === state.selectedLeaderId,
      );
      if (selectedLeader) {
        state.selectedLeaderName = selectedLeader.name;
      }
    }
  } catch (error) {
    state.leaders = [];
    state.leaderStatus = "error";
    showToast(error.message, "error");
  }

  render();
}

function createSupabaseClient() {
  const hasConfig =
    SUPABASE_CONFIG.url.startsWith("https://") &&
    !SUPABASE_CONFIG.url.includes("COLE_AQUI") &&
    SUPABASE_CONFIG.anonKey &&
    !SUPABASE_CONFIG.anonKey.includes("COLE_AQUI");

  if (!hasConfig || !window.supabase?.createClient) {
    return null;
  }

  return window.supabase.createClient(
    SUPABASE_CONFIG.url,
    SUPABASE_CONFIG.anonKey,
  );
}

function normalizeLeader(leader) {
  const person = leader.user_account;
  const ministry = leader.ministry;

  if (!person?.id || !ministry?.id) {
    return null;
  }

  const name =
    person.full_name ||
    [person.first_name, person.last_name].filter(Boolean).join(" ") ||
    person.nickname ||
    "Líder sem nome";
  const ministryName = ministry.name || "Ministério não informado";

  return {
    id: String(leader.id),
    userId: String(person.id),
    ministryId: String(ministry.id),
    name,
    ministry: ministryName,
    role: leader.role || "",
    label: `${name} - ${ministryName}`,
  };
}

function sortLeaders(firstLeader, secondLeader) {
  return firstLeader.label.localeCompare(secondLeader.label, "pt-BR", {
    sensitivity: "base",
  });
}

function render() {
  updateProgress();

  if (state.submitted) {
    renderSuccess();
    return;
  }

  if (state.currentModuleIndex < 0) {
    renderIntro();
    return;
  }

  renderModule(ACTIVE_STUDY.modules[state.currentModuleIndex]);
}

function updateProgress() {
  const total = ACTIVE_STUDY.modules.length;
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
  const leaderOptions = state.leaders
    .map((leader) => {
      const selected = leader.id === state.selectedLeaderId ? "selected" : "";
      return `<option value="${escapeHtml(leader.id)}" ${selected}>${escapeHtml(leader.label || leader.name)}</option>`;
    })
    .join("");

  const selectedLeader = getSelectedLeader();
  const canStart = Boolean(state.selectedLeaderId && state.ministry.trim());

  app.innerHTML = `
    <section class="panel">
      <div class="hero-strip">
        <h2>Formação prática para líderes que desejam frutificar com maturidade.</h2>
        <p>Uma jornada de escuta, unidade e crescimento no exercício da liderança.</p>
      </div>
      <div class="panel-body">
        <div class="form-grid">
          <div class="field">
            <div class="mini-row">
              <label for="leaderSelect">Selecione o líder ativo</label>
              <button class="link-button" type="button" data-action="reload-leaders">Atualizar lista</button>
            </div>
            <select class="select" id="leaderSelect" ${state.leaderStatus === "loading" ? "disabled" : ""}>
              <option value="">${getLeaderSelectLabel()}</option>
              ${leaderOptions}
            </select>
            <p class="hint">${getLeaderStatusText()}</p>
          </div>

          <div class="field">
            <label for="ministryInput">Ministério que lidera</label>
            <input class="input" id="ministryInput" type="text" value="${escapeHtml(state.ministry)}" placeholder="Ex: Células, Louvor, Kids, Intercessão" />
          </div>

          <div class="study-confirm">
            <span>Estudo ativo atual</span>
            <strong>${escapeHtml(ACTIVE_STUDY.title)}</strong>
            <span class="hint">${ACTIVE_STUDY.modules.length} módulos com vídeo e questionário integrado.</span>
          </div>

          ${
            selectedLeader
              ? `<p class="status-line">Líder selecionado: <strong>${escapeHtml(selectedLeader.name)}</strong>${selectedLeader.ministry ? ` | Ministério cadastrado: ${escapeHtml(selectedLeader.ministry)}` : ""}</p>`
              : ""
          }
        </div>

        <div class="actions">
          <button class="btn" type="button" data-action="start" ${canStart ? "" : "disabled"}>Iniciar treinamento</button>
        </div>
      </div>
    </section>
  `;

  bindIntroEvents();
}

function bindIntroEvents() {
  document
    .querySelector("#leaderSelect")
    ?.addEventListener("change", (event) => {
      state.selectedLeaderId = event.target.value;
      const selectedLeader = getSelectedLeader();
      state.selectedLeaderName = selectedLeader?.name || "";
      if (!state.ministry && selectedLeader?.ministry) {
        state.ministry = selectedLeader.ministry;
      }
      saveDraft();
      render();
    });

  document
    .querySelector("#ministryInput")
    ?.addEventListener("input", (event) => {
      state.ministry = event.target.value;
      saveDraft();
      updateStartButtonState();
    });

  document
    .querySelector("[data-action='reload-leaders']")
    ?.addEventListener("click", loadLeaders);

  document
    .querySelector("[data-action='start']")
    ?.addEventListener("click", () => {
      const selectedLeader = getSelectedLeader();
      if (!selectedLeader || !state.ministry.trim()) {
        showToast("Selecione o líder e informe o ministério.", "error");
        return;
      }

      state.selectedLeaderName = selectedLeader.name;
      state.currentModuleIndex = 0;
      saveDraft();
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
}

function updateStartButtonState() {
  const startButton = document.querySelector("[data-action='start']");
  if (startButton) {
    startButton.disabled = !(state.selectedLeaderId && state.ministry.trim());
  }
}

function getLeaderSelectLabel() {
  if (state.leaderStatus === "loading") {
    return "Carregando líderes...";
  }

  if (state.leaderStatus === "error") {
    return "Configure o Supabase para carregar líderes";
  }

  return "Escolha um líder";
}

function getLeaderStatusText() {
  if (state.leaderStatus === "loading") {
    return "Buscando líderes e coordenadores ativos no Supabase church360.";
  }

  if (state.leaderStatus === "loaded") {
    return state.leaders.length
      ? `${state.leaders.length} líder(es) ativo(s) carregado(s).`
      : "Nenhum líder ativo foi encontrado na tabela configurada.";
  }

  if (state.leaderStatus === "error") {
    return "Preencha as credenciais do Supabase em app.js e confira as permissões de leitura das tabelas ministry_member, user_account e ministry.";
  }

  return "A lista será carregada automaticamente.";
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
  const isLast = state.currentModuleIndex === ACTIVE_STUDY.modules.length - 1;
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
  const module = ACTIVE_STUDY.modules[state.currentModuleIndex];
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
  const allQuestions = ACTIVE_STUDY.modules.flatMap((module) => module.questions);
  const missing = allQuestions.find(
    (question) => !(state.answers[question.id] || "").trim(),
  );

  if (missing) {
    const targetModuleIndex = ACTIVE_STUDY.modules.findIndex((module) =>
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

  return {
    estudo: {
      id: ACTIVE_STUDY.id,
      titulo: ACTIVE_STUDY.title,
      pregador: ACTIVE_STUDY.speaker,
    },
    lider: {
      id: selectedLeader?.userId || state.selectedLeaderId,
      nome: selectedLeader?.name || state.selectedLeaderName,
      vinculo_ministerio_id: selectedLeader?.id || state.selectedLeaderId,
      ministerio_id: selectedLeader?.ministryId || null,
      papel: selectedLeader?.role || null,
    },
    ministerio: state.ministry.trim(),
    respostas: ACTIVE_STUDY.modules.map((module) => ({
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
  const leaderName = selectedLeader?.name || state.selectedLeaderName || "Não informado";
  const lines = [
    `Resumo do Treinamento de Liderança`,
    ``,
    `Estudo: ${ACTIVE_STUDY.title}`,
    `Líder: ${leaderName}`,
    `Ministério: ${state.ministry.trim() || "Não informado"}`,
    ``,
  ];

  ACTIVE_STUDY.modules.forEach((module) => {
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
            <p>${escapeHtml(state.selectedLeaderName || getSelectedLeader()?.name || "Não informado")}</p>
          </article>
          <article class="summary-item">
            <h3>Ministério</h3>
            <p>${escapeHtml(state.ministry || "Não informado")}</p>
          </article>
          <article class="summary-item">
            <h3>Estudo</h3>
            <p>${escapeHtml(ACTIVE_STUDY.title)}</p>
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
    state.ministry = "";
    state.currentModuleIndex = -1;
    state.answers = {};
    state.submitted = false;
    saveDraft();
    render();
  });
}

function getSelectedLeader() {
  return state.leaders.find((leader) => leader.id === state.selectedLeaderId);
}

function restoreDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
    state.selectedLeaderId = draft.selectedLeaderId || "";
    state.selectedLeaderName = draft.selectedLeaderName || "";
    state.ministry = draft.ministry || "";
    const draftModuleIndex = Number.isInteger(draft.currentModuleIndex)
      ? draft.currentModuleIndex
      : -1;
    state.currentModuleIndex =
      draftModuleIndex >= -1 && draftModuleIndex < ACTIVE_STUDY.modules.length
        ? draftModuleIndex
        : -1;
    state.answers = draft.answers || {};
  } catch {
    clearDraft();
  }
}

function saveDraft() {
  const draft = {
    selectedLeaderId: state.selectedLeaderId,
    selectedLeaderName: state.selectedLeaderName,
    ministry: state.ministry,
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
