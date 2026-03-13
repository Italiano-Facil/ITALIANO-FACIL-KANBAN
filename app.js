
/*********************** GLOBAL ERROR CAPTURE **********************/
// Mantém o design e evita "tela vermelha total" sem contexto.
    window.onerror = function(msg, url, line, col, err) {
      console.error("JS Error:", { msg, url, line, col, err });
      try{
        showToast("Erro de Javascript", `${msg} (linha ${line})`, "error", 6000);
      }catch(_){}
      return false;
    };
 window.onerror = function(msg, url, line, col, err) {
  try {
    showToast("Erro de Javascript", `${msg} (linha ${line})`, "error", 6000);
  } catch(_) {}
  return false;
};

/*********************** TOAST *************************************/
function showToast(title, desc = "", type = "info", timeout = 3200){
@@ -115,6 +114,7 @@ let AUTH = {
};

document.addEventListener('DOMContentLoaded', async () => {
  renderOfertaOptions();
setupListeners();
await protectWithAuth();
applyRoleUI();
@@ -157,9 +157,7 @@ const { data: atendente, error: e2 } = await sb
AUTH.isAdmin = Boolean(atendente?.is_admin);
AUTH.isPreVendas = String(atendente?.perfil || "").toLowerCase() === "prevendas";

    if (!AUTH.isAdmin && session.user.email === "vinicius@italianofacil.com") {
      AUTH.isAdmin = true;
    }
  

const btnLogout = document.getElementById("btnLogout");
if (btnLogout) btnLogout.addEventListener("click", async () => {
@@ -176,7 +174,16 @@ const { data: atendente, error: e2 } = await sb
const navUn = document.getElementById("navUnassigned");
if (navUn) navUn.classList.toggle("hidden", !AUTH.isAdmin);
}
function toggleOfferSection(forceOpen = null) {
  const body = document.getElementById("offerSectionBody");
  const icon = document.getElementById("offerToggleIcon");
  if (!body || !icon) return;

  const willOpen = forceOpen !== null ? forceOpen : body.classList.contains("hidden");

  body.classList.toggle("hidden", !willOpen);
  icon.className = willOpen ? "ph ph-caret-up" : "ph ph-caret-down";
}
async function renderPreVendas(){
const wrap = document.getElementById("prevendasWrap");
const countEl = document.getElementById("pvCount");
@@ -360,11 +367,22 @@ async function pvCreateLead(){
}
}
function toggleView(){
  const order = ["kanban","pvcreate","pvleads","pvsend","dashboard","reports","settings"];
  const order = AUTH.isPreVendas
    ? ["pvcreate","pvleads","pvsend"]
    : AUTH.isAdmin
      ? ["kanban","performance","dashboard","reports","settings"]
      : ["kanban","performance","received","rejected"];

const idx = order.indexOf(VIEW);
const next = order[(idx + 1) % order.length];
setView(next);
}
/**METAS VENDEDORES**/
const SELLER_GOALS = {
  "Bruna": 30,
  "Victoria": 25,
  "Heloisa": 20
};


/*********************** VIEW **************************************/
@@ -400,12 +418,14 @@ async function setView(which) {

const abas = [
'board', 'pvcreate', 'pvleads', 'pvsend',
    'performance',
'dashboard', 'reports', 'settings',
'unassigned', 'rejected', 'received'
];

const botoes = [
'navKanban', 'navPvCreate', 'navPvLeads', 'navPvSend',
    'navPerformance',
'navDash', 'navReports', 'navSettings',
'navUnassigned', 'navRejected', 'navReceived'
];
@@ -433,12 +453,21 @@ async function setView(which) {
document.getElementById('navPvLeads')?.classList.add('active');
await renderPreVendas();
}
else if (which === 'pvsend') {
  document.getElementById('pvsend')?.classList.remove('hidden');
  document.getElementById('navPvSend')?.classList.add('active');
  await fillPvSendAtendentes();
}
  else if (which === 'pvsend') {
    document.getElementById('pvsend')?.classList.remove('hidden');
    document.getElementById('navPvSend')?.classList.add('active');
    await fillPvSendAtendentes();
  }
  else if (which === 'performance') {
    document.getElementById('performance')?.classList.remove('hidden');
    document.getElementById('navPerformance')?.classList.add('active');
    renderPerformance();
  }
else if (which === 'dashboard') {
    if (!AUTH.isAdmin) {
      showToast("Acesso negado", "Apenas admin pode ver métricas gerais", "error");
      return setView("performance");
    }
document.getElementById('dashboard')?.classList.remove('hidden');
document.getElementById('navDash')?.classList.add('active');
renderDashboard();
@@ -454,6 +483,10 @@ else if (which === 'pvsend') {
renderReceived();
}
else if (which === 'reports') {
    if (!AUTH.isAdmin) {
      showToast("Acesso negado", "Apenas admin pode ver relatórios gerais", "error");
      return setView("performance");
    }
document.getElementById('reports')?.classList.remove('hidden');
document.getElementById('navReports')?.classList.add('active');
renderReports();
@@ -464,7 +497,7 @@ else if (which === 'pvsend') {
syncSettingsUI();
}
else if (which === 'unassigned') {
    if(!AUTH.isAdmin){
    if (!AUTH.isAdmin) {
showToast("Acesso negado", "Apenas admin", "error");
return setView("kanban");
}
@@ -478,7 +511,6 @@ else if (which === 'pvsend') {
renderBoard();
}
}

let PV_SEND = { search: "", stage: "" };

function getPvSendCards() {
@@ -644,16 +676,17 @@ async function reload(){
updateMetrics();
populateFilters();

  if (VIEW === "dashboard") renderDashboard();
  else if (VIEW === "reports") renderReports();
  else if (VIEW === "settings") syncSettingsUI();
  else if (VIEW === "unassigned") renderUnassigned();
  else if (VIEW === "rejected") renderRejected();
  else if (VIEW === "received") renderReceived();
  else if (VIEW === "pvleads") renderPreVendas();
if (VIEW === "performance") renderPerformance();
else if (VIEW === "dashboard") renderDashboard();
else if (VIEW === "reports") renderReports();
else if (VIEW === "settings") syncSettingsUI();
else if (VIEW === "unassigned") renderUnassigned();
else if (VIEW === "rejected") renderRejected();
else if (VIEW === "received") renderReceived();
else if (VIEW === "pvleads") renderPreVendas();
else if (VIEW === "pvsend") await fillPvSendAtendentes();
  else if (VIEW === "pvcreate") setView("pvcreate");
  else renderBoard();
else if (VIEW === "pvcreate") setView("pvcreate");
else renderBoard();

startLiveTimers();
}
@@ -1213,7 +1246,19 @@ function buildStoppedReportRows({

/*********************** DATA LAYER ********************************/

async function createLead({ nome, telefone, fluxo, responsavel, origem, motivo, createdRole = null }){
async function createLead({
  nome,
  telefone,
  fluxo,
  responsavel,
  origem,
  motivo,
  createdRole = null,
  ofertaCursos = [],
  ofertaAcessos = [],
  ofertaValor = null,
  ofertaObs = ""
}) {
if(!KANBAN.STAGES.includes(fluxo)) fluxo = "Inicial";

const now = new Date();
@@ -1232,6 +1277,12 @@ async function createLead({ nome, telefone, fluxo, responsavel, origem, motivo,
created_by_auth: AUTH.session?.user?.id || null,
created_by_atendente_id: AUTH.atendenteId || null,
created_by_role: createdRole || null,

    oferta_cursos: ofertaCursos,
    oferta_acessos: ofertaAcessos,
    oferta_valor: ofertaValor,
    oferta_obs: ofertaObs || "",
    oferta_updated_at: new Date().toISOString()
};

const { data, error } = await sb
@@ -1332,23 +1383,35 @@ const { data, error } = await q.range(page * pageSize, (page + 1) * pageSize - 1
if(orig !== '—' && orig !== '') origensSet.add(orig);

cards.push({
  id: row['id'],
id: row['id'],
name: safe_(row.nome, '(Sem nome)'),
phone: safe_(row.telefone, ''),
origem: orig,
responsavel: resp,
manychat: safe_(row['Manychat_id'], ''),
motivo: safe_(row['Motivo'], ''),
fluxo: stage,
  dataLead: row["Data"] || null,
  horaLead: horaEntrada || null,

  dataLead: row["Data"] || "",
  horaLead: row["Hora-entrada"] || "",
  dataMudancaFluxo: row["Data da mudança do fluxo"] || "",
  horaMudancaFluxo: row["Hora da mudança do fluxo"] || "",
  numeroOrigem: row["numero-origem"] || "",
  

horaLabel: formatHora_(horaEntrada),
stageTs: stageTs || 0,
sortTs: sortTs || 0,
ageSec,
created_by_auth: row.created_by_auth,
created_by_atendente_id: row.created_by_atendente_id,
created_by_role: row.created_by_role,

  ofertaCursos: Array.isArray(row.oferta_cursos) ? row.oferta_cursos : [],
  ofertaAcessos: Array.isArray(row.oferta_acessos) ? row.oferta_acessos : [],
  ofertaValor: row.oferta_valor ?? null,
  ofertaObs: row.oferta_obs || "",
  ofertaUpdatedAt: row.oferta_updated_at || null
});
}

@@ -1428,50 +1491,57 @@ function getPreVendasCards() {



    async function updateCardStage(id, newStage){
      if(!KANBAN.STAGES.includes(newStage)) throw new Error('Stage inválido.');
async function updateCardStage(id, newStage){
  if(!KANBAN.STAGES.includes(newStage)) throw new Error('Stage inválido.');

      const now = new Date();
      const payload = {
        'fluxo-id': newStage,
        'Data da mudança do fluxo': now.toLocaleDateString('pt-BR'),
        'Hora da mudança do fluxo': now.toLocaleTimeString('pt-BR')
      };
  const now = new Date();
  const payload = {
    'fluxo-id': newStage,
    'Data da mudança do fluxo': now.toLocaleDateString('pt-BR'),
    'Hora da mudança do fluxo': now.toLocaleTimeString('pt-BR')
  };

      const { error } = await sb
        .from(KANBAN.TABLE)
        .update(payload)
        .eq('id', id);
  const { error } = await sb
    .from(KANBAN.TABLE)
    .update(payload)
    .eq('id', id);

      if(error) throw error;
      return { ok:true };
      await addAuditLog({
  actionType: "lead_stage_change",
  entityType: "lead",
  entityId: card.id,
  description: `Lead movido de ${oldStage} para ${newStage}`,
  oldData: { fluxo: oldStage },
  newData: { fluxo: newStage },
  metadata: { origem_tela: "kanban_drag_drop" }
});
    }
  if(error) throw error;

  return { ok:true };
}

function formatNumeroOrigem(origem) {
  if (!origem) return "";

    async function updateCardFields(id, fields){
      const payload = {};
      if(fields.responsavel !== undefined) payload['responsavel-id'] = fields.responsavel;
      if(fields.origem !== undefined) payload['origem-id'] = fields.origem;
      if(fields.motivo !== undefined) payload['Motivo'] = fields.motivo;
  origem = origem.toLowerCase();

      const { error } = await sb
        .from(KANBAN.TABLE)
        .update(payload)
        .eq('id', id);
  if (origem.includes("many")) return "Many";
  if (origem.includes("bot")) return "Bot";

      if(error) throw error;
      return { ok:true };
    }
  return "";
}
async function updateCardFields(id, fields){
  const payload = {};

  if(fields.responsavel !== undefined) payload['responsavel-id'] = fields.responsavel;
  if(fields.origem !== undefined) payload['origem-id'] = fields.origem;
  if(fields.motivo !== undefined) payload['Motivo'] = fields.motivo;

  if(fields.ofertaCursos !== undefined) payload['oferta_cursos'] = fields.ofertaCursos;
  if(fields.ofertaAcessos !== undefined) payload['oferta_acessos'] = fields.ofertaAcessos;
  if(fields.ofertaValor !== undefined) payload['oferta_valor'] = fields.ofertaValor;
  if(fields.ofertaObs !== undefined) payload['oferta_obs'] = fields.ofertaObs;
  if(fields.ofertaUpdatedAt !== undefined) payload['oferta_updated_at'] = fields.ofertaUpdatedAt;

  const { error } = await sb
    .from(KANBAN.TABLE)
    .update(payload)
    .eq('id', id);

  if(error) throw error;
  return { ok:true };
}
/*********************** UI RENDER: BOARD **************************/
function renderBoard(){
const board = document.getElementById('board');
@@ -1533,32 +1603,37 @@ function getPreVendasCards() {

const waLink = buildWaLink(c.phone);

          cardEl.innerHTML = `
            <div class="card-actions">
              <button class="act" title="Editar" type="button" onclick="event.stopPropagation(); openModal(${JSON.stringify(c.id)})">
                <i class="ph ph-pencil-simple"></i>
              </button>
              <button class="act whats" title="WhatsApp" type="button"
                ${waLink ? `onclick="event.stopPropagation(); window.open('${waLink}', '_blank')"` : `onclick="event.stopPropagation(); showToast('Sem WhatsApp', 'Telefone inválido/ausente', 'warn')"`}>
                <i class="ph ph-whatsapp-logo"></i>
              </button>
              <button class="act win" title="Marcar como Parabéns" type="button" onclick="event.stopPropagation(); quickWin(${JSON.stringify(c.id)})">
                <i class="ph ph-trophy"></i>
              </button>
            </div>

            <div class="c-top">
              <p class="c-title">${escapeHtml(c.name)}</p>
              <div class="c-right">
                <span class="pill-mini js-timer ${timerClass}" data-stagets="${c.stageTs}">--:--:--</span>
              </div>
            </div>
cardEl.innerHTML = `
  <div class="card-actions">
    <button class="act" title="Editar" type="button" onclick="event.stopPropagation(); openModal(${JSON.stringify(c.id)})">
      <i class="ph ph-pencil-simple"></i>
    </button>
    <button class="act whats" title="WhatsApp" type="button"
      ${waLink ? `onclick="event.stopPropagation(); window.open('${waLink}', '_blank')"` : `onclick="event.stopPropagation(); showToast('Sem WhatsApp', 'Telefone inválido/ausente', 'warn')"`}>
      <i class="ph ph-whatsapp-logo"></i>
    </button>
    <button class="act win" title="Marcar como Parabéns" type="button" onclick="event.stopPropagation(); quickWin(${JSON.stringify(c.id)})">
      <i class="ph ph-trophy"></i>
    </button>
  </div>

  <div class="c-top">
    <p class="c-title">${escapeHtml(c.name)}</p>
    <div class="c-right">
      ${c.numeroOrigem ? `
        <span class="pill-mini origem">
          ${escapeHtml(formatNumeroOrigem(c.numeroOrigem))}
        </span>
      ` : ""}
      <span class="pill-mini js-timer ${timerClass}" data-stagets="${c.stageTs}">--:--:--</span>
    </div>
  </div>

            <div class="c-meta">
              <span class="tag accent"><i class="ph ph-user"></i> ${escapeHtml(c.responsavel)}</span>
              <span class="tag"><i class="ph ph-map-pin"></i> ${escapeHtml(c.origem)}</span>
            </div>
          `;
  <div class="c-meta">
    <span class="tag accent"><i class="ph ph-user"></i> ${escapeHtml(c.responsavel)}</span>
    <span class="tag"><i class="ph ph-map-pin"></i> ${escapeHtml(c.origem)}</span>
  </div>
`;

// Click opens modal
cardEl.addEventListener('click', () => openModal(c.id));
@@ -1780,12 +1855,122 @@ function setupPreVendasListeners(){
const funilLabels = STATE.stages || [];
const funilData = funilLabels.map(s => (STATE.cards || []).filter(c => c.fluxo === s).length);

      if (charts.funil) charts.funil.destroy();
      charts.funil = new Chart(document.getElementById('funilChart'), {
        type: 'bar',
        data: { labels: funilLabels, datasets: [{ label: 'Qtd de Leads', data: funilData, backgroundColor: 'rgba(34,197,94,0.85)', borderRadius: 10 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
      });
const totalFunil = funilData.reduce((acc, v) => acc + v, 0);

if (charts.funil) charts.funil.destroy();

charts.funil = new Chart(document.getElementById('funilChart'), {
  type: 'bar',
  data: {
    labels: funilLabels,
    datasets: [{
      label: 'Leads por etapa',
      data: funilData,
      backgroundColor: [
        'rgba(59,130,246,0.88)',  // Inicial
        'rgba(245,158,11,0.88)',  // A02
        'rgba(245,158,11,0.78)',  // Recall A02
        'rgba(168,85,247,0.88)',  // A03
        'rgba(168,85,247,0.78)',  // Recall A03
        'rgba(239,68,68,0.88)',   // A04
        'rgba(239,68,68,0.78)',   // Recall A04
        'rgba(34,197,94,0.88)',   // Link-Enviado
        'rgba(16,185,129,0.92)'   // Parabéns
      ],
      borderRadius: 12,
      borderSkipped: false,
      barThickness: 18
    }]
  },
  options: {
    indexAxis: 'y', // ← deixa o gráfico horizontal
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 700
    },
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          label: function(ctx) {
            const value = Number(ctx.raw || 0);
            const pct = totalFunil ? ((value / totalFunil) * 100).toFixed(1) : "0.0";
            return `${value} leads • ${pct}%`;
          }
        }
      }
    },
    scales: {
      y: {
        ticks: {
          color: '#9aa7b4',
          font: {
            weight: '800'
          }
        },
        grid: {
          color: 'rgba(255,255,255,0.06)'
        }
      },
      x: {
        beginAtZero: true,
        ticks: {
          color: '#9aa7b4',
          font: {
            weight: '800'
          }
        },
        grid: {
          color: 'rgba(255,255,255,0.08)'
        }
      }
    }
  },

plugins: [{
  id: 'funilPercentLabels',
  afterDatasetsDraw(chart) {

    const { ctx, chartArea } = chart;
    const dataset = chart.data.datasets[0];
    const meta = chart.getDatasetMeta(0);

    ctx.save();
    ctx.textBaseline = 'middle';

    meta.data.forEach((bar, index) => {

      const value = Number(dataset.data[index] || 0);
      const pct = totalFunil ? ((value / totalFunil) * 100).toFixed(1) : "0.0";

      const text = `${value} (${pct}%)`;

      const rightEdge = chartArea.right;
      const textWidth = ctx.measureText(text).width;

      let x = bar.x + 8;
      let y = bar.y;

      ctx.font = '800 12px "Plus Jakarta Sans"';

      if (bar.x + textWidth + 20 > rightEdge) {
        x = bar.x - textWidth - 10;
        ctx.fillStyle = "#ffffff";
      } else {
        ctx.fillStyle = "#eaf0f7";
      }

      ctx.fillText(text, x, y);

    });

    ctx.restore();
  }
}]
});

// CONSULTORES
const respMap = {};
@@ -1959,6 +2144,7 @@ function renderReports(){
function openCreateLead(){
if (AUTH.isPreVendas && VIEW !== "pvcreate") {
showToast("Acesso limitado", "Pré-vendas só pode cadastrar leads na aba de cadastro", "warn");
    clearOfertaFields();
return;
}

@@ -1977,6 +2163,11 @@ function openCreateLead(){
const fResp = document.getElementById('fResponsavel');
const fOrig = document.getElementById('fOrigem');
const fMotivo = document.getElementById('fMotivo');
  const fDataLead = document.getElementById('fDataLead');
  const fHoraLead = document.getElementById('fHoraLead');
  const fDataMudancaFluxo = document.getElementById('fDataMudancaFluxo');
  const fHoraMudancaFluxo = document.getElementById('fHoraMudancaFluxo');


if(!overlay || !modalTitle || !modalSub || !fNome || !fTelefone || !fFluxo || !fResp || !fOrig || !fMotivo){
showToast("Modal incompleto", "Faltam IDs no HTML do modal", "error", 5200);
@@ -1986,17 +2177,25 @@ function openCreateLead(){
modalTitle.textContent = "Novo Lead";
modalSub.textContent = "Preencha os dados e clique em Salvar";

  fNome.value = "";
  fTelefone.value = "";
  fFluxo.value = "Inicial";
  fResp.value = "";
  fOrig.value = "";
  fMotivo.value = "";
fNome.value = "";
fTelefone.value = "";
fFluxo.value = "Inicial";
fResp.value = "";
fOrig.value = "";
fMotivo.value = "";

if (fDataLead) fDataLead.textContent = "—";
if (fHoraLead) fHoraLead.textContent = "—";
if (fDataMudancaFluxo) fDataMudancaFluxo.textContent = "—";
if (fHoraMudancaFluxo) fHoraMudancaFluxo.textContent = "—";

const waBtn = document.getElementById('waBtn');
if(waBtn) waBtn.classList.add('hidden');

overlay.classList.remove('hidden');
  clearOfertaFields();
toggleOfferSection(false);
overlay.classList.remove('hidden');
}

/*********************** DRAG & DROP *******************************/
@@ -2007,6 +2206,71 @@ function openCreateLead(){
stack.classList.add('drop-hover');
if(col) col.classList.add('drag-over');
}
const OFERTA_CURSOS = [
  "Completo",
  "Clube de Conversação",
  "Completo + Conversação",
  "Completo - Mensal",
  "Completo Master",
  "Italiano Prático",
  "Extra",
  "Renovação - Curso",
  "Renovação + Conversação",
  "Renovação - Master",
  "Renovação - Suporte",
  "Pacote",
  "Inglês",
  "Bônus",
  "Acomp. Individual",
  "VITALÍCIO",
  "Extra Master",
  "Eternum",
  "Upsell",
  "Piccolo Eternum",
  "TIPO",
  "Tira dúvidas",
  "Thiago Dalla + IF",
  "Pacote Esperienza",
  "CC - Conversação Dupla",
  "Intermediário",
  "Imersão Online",
  "Pacote Todos os Cursos"
];

const OFERTA_ACESSOS = [
  "1 Ano",
  "2 meses",
  "1 ano e 6 meses",
  "2 anos",
  "3 meses",
  "4 Meses",
  "6 meses",
  "Mensalidade",
  "Vitalício",
  "Iniciantes",
  "Viagens",
  "Avançado",
  "Música",
  "Gestos",
  "Explorando a Itália",
  "Chiacchierate con gli Italiani",
  "Grammatica In Tasca",
  "CPF",
  "TIPO",
  "Trabalho na Itália",
  "Baralho de viagens + Baralho físico",
  "Regiões da Itália",
  "Pacote",
  "Intensivo",
  "Preparatório B1",
  "Treinamento de leitura",
  "Italiano com Filmes e Séries",
  "Os segredos de Firenze",
  "Inglês",
  "Ticket(Ingresso)",
  "KIT do Aluno",
  "KIT três baralhos"
];

function onDragLeave(e){
const stack = e.currentTarget;
@@ -2082,6 +2346,11 @@ async function openModal(id) {
const overlay    = document.getElementById('modalOverlay');
const waBtn      = document.getElementById('waBtn');

  const fDataLead = document.getElementById('fDataLead');
  const fHoraLead = document.getElementById('fHoraLead');
  const fDataMudancaFluxo = document.getElementById('fDataMudancaFluxo');
  const fHoraMudancaFluxo = document.getElementById('fHoraMudancaFluxo');

if (!modalTitle || !modalSub || !fNome || !fTelefone || !fFluxo || !fResp || !fOrig || !fMotivo || !overlay) {
console.warn("Modal não encontrado. Verifique IDs do modal.");
showToast("Modal não encontrado", "IDs do modal não existem no HTML", "error", 5200);
@@ -2098,19 +2367,30 @@ async function openModal(id) {
fTelefone.value = card.phone || '';
fFluxo.value = card.fluxo || 'Inicial';

  // ✅ carrega lista e só depois seta o valor
await fillAtendentesSelect();
fResp.value = card.responsavel !== '—' ? (card.responsavel || '') : '';
  await fillAtendentesSelect();
  fResp.value = card.responsavel !== '—' ? (card.responsavel || '') : '';

fOrig.value = card.origem !== '—' ? (card.origem || '') : '';
fMotivo.value = card.motivo || '';

  if (fDataLead) fDataLead.textContent = card.dataLead || "—";
  if (fHoraLead) fHoraLead.textContent = card.horaLead || "—";
  if (fDataMudancaFluxo) fDataMudancaFluxo.textContent = card.dataMudancaFluxo || "—";
  if (fHoraMudancaFluxo) fHoraMudancaFluxo.textContent = card.horaMudancaFluxo || "—";

if (waBtn) {
const link = buildWaLink(card.phone);
    if (link) { waBtn.href = link; waBtn.classList.remove('hidden'); }
    else { waBtn.classList.add('hidden'); }
    if (link) {
      waBtn.href = link;
      waBtn.classList.remove('hidden');
    } else {
      waBtn.classList.add('hidden');
    }
}

  fillOfertaFields(card);
  toggleOfferSection(false);

overlay.classList.remove('hidden');
}

@@ -2749,10 +3029,18 @@ async function saveModal(){
const telefone = (fTelefone.value || "").trim();
const fluxo = (fFluxo.value || "Inicial").trim();

  const oferta = collectOfertaFields();

const newFields = {
responsavel: (fResp.value || '').trim() || '—',
origem: (fOrig.value || '').trim() || '—',
    motivo: (fMotivo.value || '').trim()
    motivo: (fMotivo.value || '').trim(),

    ofertaCursos: oferta.ofertaCursos,
    ofertaAcessos: oferta.ofertaAcessos,
    ofertaValor: oferta.ofertaValor,
    ofertaObs: oferta.ofertaObs,
    ofertaUpdatedAt: oferta.ofertaUpdatedAt
};

if(MODAL.mode === "create"){
@@ -2772,7 +3060,12 @@ async function saveModal(){
responsavel: newFields.responsavel,
origem: newFields.origem,
motivo: newFields.motivo,
        createdRole: "prevendas"
        createdRole: "prevendas",

        ofertaCursos: newFields.ofertaCursos,
        ofertaAcessos: newFields.ofertaAcessos,
        ofertaValor: newFields.ofertaValor,
        ofertaObs: newFields.ofertaObs
});

await addAuditLog({
@@ -2787,34 +3080,18 @@ async function saveModal(){
fluxo,
responsavel: newFields.responsavel,
origem: newFields.origem,
          motivo: newFields.motivo
          motivo: newFields.motivo,
          oferta_cursos: newFields.ofertaCursos,
          oferta_acessos: newFields.ofertaAcessos,
          oferta_valor: newFields.ofertaValor,
          oferta_obs: newFields.ofertaObs
},
metadata: {
origem_tela: "modal_create"
}
});

      STATE.cards.unshift({
        id: created.id,
        name: nome,
        phone: telefone,
        origem: newFields.origem,
        responsavel: newFields.responsavel,
        manychat: '',
        motivo: newFields.motivo,
        fluxo,
        horaLabel: '—',
        stageTs: Date.now(),
        sortTs: Date.now(),
        ageSec: 0
      });

      updateMetrics();
      populateFilters();
      if(VIEW === "kanban") renderBoard();
      if(VIEW === "dashboard") renderDashboard();
      if(VIEW === "reports") renderReports();

      await reload();
showToast("Lead criado", nome, "success", 2400);
}catch(err){
console.error("saveModal create falhou:", err);
@@ -2833,7 +3110,11 @@ async function saveModal(){
fluxo: card.fluxo,
responsavel: card.responsavel,
origem: card.origem,
    motivo: card.motivo
    motivo: card.motivo,
    ofertaCursos: card.ofertaCursos || [],
    ofertaAcessos: card.ofertaAcessos || [],
    ofertaValor: card.ofertaValor ?? null,
    ofertaObs: card.ofertaObs || ""
};

card.name = nome;
@@ -2842,8 +3123,14 @@ async function saveModal(){
card.responsavel = newFields.responsavel;
card.origem = newFields.origem;
card.motivo = newFields.motivo;
  card.ofertaCursos = newFields.ofertaCursos;
  card.ofertaAcessos = newFields.ofertaAcessos;
  card.ofertaValor = newFields.ofertaValor;
  card.ofertaObs = newFields.ofertaObs;
  card.ofertaUpdatedAt = newFields.ofertaUpdatedAt;

closeModal();

if(VIEW === "kanban") renderBoard();
if(VIEW === "dashboard") renderDashboard();
if(VIEW === "reports") renderReports();
@@ -2867,7 +3154,11 @@ async function saveModal(){
fluxo,
responsavel: newFields.responsavel,
origem: newFields.origem,
        motivo: newFields.motivo
        motivo: newFields.motivo,
        oferta_cursos: newFields.ofertaCursos,
        oferta_acessos: newFields.ofertaAcessos,
        oferta_valor: newFields.ofertaValor,
        oferta_obs: newFields.ofertaObs
},
metadata: {
origem_tela: "modal_edit"
@@ -2876,13 +3167,18 @@ async function saveModal(){

showToast("Atualizado", "Dados do lead salvos", "success", 2200);
populateFilters();
    await reload();
}catch(err){
card.name = old.nome;
card.phone = old.telefone;
card.fluxo = old.fluxo;
card.responsavel = old.responsavel;
card.origem = old.origem;
card.motivo = old.motivo;
    card.ofertaCursos = old.ofertaCursos;
    card.ofertaAcessos = old.ofertaAcessos;
    card.ofertaValor = old.ofertaValor;
    card.ofertaObs = old.ofertaObs;

console.error("saveModal edit falhou:", err);
showToast("Falha ao salvar", String(err.message || err), "error", 5200);
@@ -2930,31 +3226,32 @@ async function saveModal(){
showToast("Configurações aplicadas", `Auto-refresh: ${SETTINGS.refreshSec}s • SLA: ${SETTINGS.slaWarnMin}/${SETTINGS.slaDangerMin}m`, "success", 3200);
}

    function resetSettings(){
      SETTINGS.refreshSec = 30;
      SETTINGS.slaWarnMin = KANBAN.SLA.warnMin;
      SETTINGS.slaDangerMin = KANBAN.SLA.dangerMin;
function resetSettings(){
  SETTINGS.refreshSec = 30;
  SETTINGS.slaWarnMin = KANBAN.SLA.warnMin;
  SETTINGS.slaDangerMin = KANBAN.SLA.dangerMin;

      if(STATE.meta?.sla){
        STATE.meta.sla.warnMin = SETTINGS.slaWarnMin;
        STATE.meta.sla.dangerMin = SETTINGS.slaDangerMin;
      }
  if(STATE.meta?.sla){
    STATE.meta.sla.warnMin = SETTINGS.slaWarnMin;
    STATE.meta.sla.dangerMin = SETTINGS.slaDangerMin;
  }

      syncSettingsUI();
      const auto = document.getElementById("autoRefresh");
      setAutoRefresh(Boolean(auto?.checked));
      updateMetrics();
  syncSettingsUI();
  const auto = document.getElementById("autoRefresh");
  setAutoRefresh(Boolean(auto?.checked));
  updateMetrics();

if (VIEW === "dashboard") renderDashboard();
else if (VIEW === "reports") renderReports();
else if (VIEW === "settings") syncSettingsUI();
else if (VIEW === "unassigned") renderUnassigned();
else if (VIEW === "pvleads") renderPreVendas();
else if (VIEW === "pvcreate") setView("pvcreate");
else renderBoard();
  if (VIEW === "performance") renderPerformance();
  else if (VIEW === "dashboard") renderDashboard();
  else if (VIEW === "reports") renderReports();
  else if (VIEW === "settings") syncSettingsUI();
  else if (VIEW === "unassigned") renderUnassigned();
  else if (VIEW === "pvleads") renderPreVendas();
  else if (VIEW === "pvcreate") setView("pvcreate");
  else renderBoard();

      showToast("Resetado", "Voltou para o padrão", "info", 2600);
    }
  showToast("Resetado", "Voltou para o padrão", "info", 2600);
}

/*********************** COMPACT MODE (opção nova) ******************/
function toggleCompact(){
@@ -2964,6 +3261,69 @@ else renderBoard();
}

/*********************** HELPERS ***********************************/
function renderOfertaOptions() {
  const cursosWrap = document.getElementById("ofertaCursosWrap");
  const acessosWrap = document.getElementById("ofertaAcessosWrap");

  if (cursosWrap) {
    cursosWrap.innerHTML = OFERTA_CURSOS.map(item => `
      <label class="check-item">
        <input type="checkbox" value="${escapeHtml(item)}">
        <span>${escapeHtml(item)}</span>
      </label>
    `).join("");
  }

  if (acessosWrap) {
    acessosWrap.innerHTML = OFERTA_ACESSOS.map(item => `
      <label class="check-item">
        <input type="checkbox" value="${escapeHtml(item)}">
        <span>${escapeHtml(item)}</span>
      </label>
    `).join("");
  }
}

function getCheckedValues(containerId) {
  return [...document.querySelectorAll(`#${containerId} input[type="checkbox"]:checked`)]
    .map(el => el.value);
}

function setCheckedValues(containerId, values = []) {
  const selected = new Set(Array.isArray(values) ? values : []);
  document.querySelectorAll(`#${containerId} input[type="checkbox"]`).forEach(input => {
    input.checked = selected.has(input.value);
  });
}

function clearOfertaFields() {
  setCheckedValues("ofertaCursosWrap", []);
  setCheckedValues("ofertaAcessosWrap", []);
  const valor = document.getElementById("fOfertaValor");
  const obs = document.getElementById("fOfertaObs");
  if (valor) valor.value = "";
  if (obs) obs.value = "";
}

function fillOfertaFields(card) {
  setCheckedValues("ofertaCursosWrap", card?.ofertaCursos || []);
  setCheckedValues("ofertaAcessosWrap", card?.ofertaAcessos || []);
  const valor = document.getElementById("fOfertaValor");
  const obs = document.getElementById("fOfertaObs");
  if (valor) valor.value = card?.ofertaValor ?? "";
  if (obs) obs.value = card?.ofertaObs || "";
}

function collectOfertaFields() {
  const valorRaw = document.getElementById("fOfertaValor")?.value || "";
  return {
    ofertaCursos: getCheckedValues("ofertaCursosWrap"),
    ofertaAcessos: getCheckedValues("ofertaAcessosWrap"),
    ofertaValor: valorRaw === "" ? null : Number(valorRaw),
    ofertaObs: (document.getElementById("fOfertaObs")?.value || "").trim(),
    ofertaUpdatedAt: new Date().toISOString()
  };
}
function safe_(v, fallback){
const s = String(v ?? '').trim();
return s ? s : fallback;
@@ -3024,13 +3384,17 @@ else renderBoard();
}
function applyRoleUI() {
const isPv = AUTH.isPreVendas;
  const isAdmin = AUTH.isAdmin;

document.getElementById("navKanban")?.classList.toggle("hidden", isPv);
  document.getElementById("navDash")?.classList.toggle("hidden", isPv);
  document.getElementById("navUnassigned")?.classList.add("hidden");
  document.getElementById("navPerformance")?.classList.toggle("hidden", isPv);

  document.getElementById("navDash")?.classList.toggle("hidden", isPv || !isAdmin);
  document.getElementById("navReports")?.classList.toggle("hidden", isPv || !isAdmin);
  document.getElementById("navUnassigned")?.classList.toggle("hidden", !isAdmin);

document.getElementById("navRejected")?.classList.toggle("hidden", isPv);
document.getElementById("navReceived")?.classList.toggle("hidden", isPv);
  document.getElementById("navReports")?.classList.toggle("hidden", isPv);
document.getElementById("navSettings")?.classList.toggle("hidden", isPv);

document.getElementById("navPvCreate")?.classList.toggle("hidden", !isPv);
@@ -3041,12 +3405,367 @@ function applyRoleUI() {

if (isPv) {
VIEW = "pvcreate";
  } else if (!isAdmin && VIEW === "dashboard") {
    VIEW = "performance";
}
}
function getSellerGoal(repName) {
  return Number(SELLER_GOALS[repName] || 0);
}

function getAttentionStage(stageMap) {
  const activeStages = Object.entries(stageMap)
    .filter(([stage]) => String(stage).toLowerCase() !== "parabéns")
    .sort((a, b) => {
      if (b[1].count !== a[1].count) return b[1].count - a[1].count;
      return b[1].avgAgeSec - a[1].avgAgeSec;
    });

  if (!activeStages.length) return { stage: "—", count: 0, avgAgeSec: 0 };

  return {
    stage: activeStages[0][0],
    count: activeStages[0][1].count,
    avgAgeSec: activeStages[0][1].avgAgeSec
  };
}

function computeSellerPerformance() {
  const cards = STATE.cards || [];

  const sellersMap = {};

  cards.forEach(card => {
    const rep = (card.responsavel && card.responsavel !== "—") ? card.responsavel : "Sem dono";

    if (!sellersMap[rep]) {
      sellersMap[rep] = {
        rep,
        total: 0,
        won: 0,
        active: 0,
        stopped: 0,
        linkEnviado: 0,
        avgAgeSec: 0,
        cards: [],
        stages: {}
      };
    }

    sellersMap[rep].total++;
    sellersMap[rep].cards.push(card);

    const stage = card.fluxo || "Inicial";

    if (!sellersMap[rep].stages[stage]) {
      sellersMap[rep].stages[stage] = {
        count: 0,
        totalAgeSec: 0,
        avgAgeSec: 0
      };
    }

    sellersMap[rep].stages[stage].count++;
    sellersMap[rep].stages[stage].totalAgeSec += Number(card.ageSec || 0);

    if (String(stage).toLowerCase() === "parabéns") {
      sellersMap[rep].won++;
    } else {
      sellersMap[rep].active++;
    }

    if (String(stage).toLowerCase() === "link-enviado") {
      sellersMap[rep].linkEnviado++;
    }

    if (Number(card.ageSec || 0) >= THREE_DAYS_SEC && String(stage).toLowerCase() !== "parabéns") {
      sellersMap[rep].stopped++;
    }
  });

  const result = Object.values(sellersMap).map(item => {
    const totalActiveAge = item.cards
      .filter(c => String(c.fluxo || "").toLowerCase() !== "parabéns")
      .reduce((sum, c) => sum + Number(c.ageSec || 0), 0);

    item.avgAgeSec = item.active ? Math.round(totalActiveAge / item.active) : 0;

    Object.keys(item.stages).forEach(stage => {
      const st = item.stages[stage];
      st.avgAgeSec = st.count ? Math.round(st.totalAgeSec / st.count) : 0;
      st.percent = item.total ? Number(((st.count / item.total) * 100).toFixed(1)) : 0;
    });

    item.convRate = item.total ? Number(((item.won / item.total) * 100).toFixed(1)) : 0;

    const attention = getAttentionStage(item.stages);
    item.attentionStage = attention.stage;
    item.attentionStageCount = attention.count;
    item.attentionStageAvgAgeSec = attention.avgAgeSec;

    item.goal = getSellerGoal(item.rep);
    item.goalPct = item.goal > 0 ? Number(((item.won / item.goal) * 100).toFixed(1)) : 0;

    return item;
  });

  result.sort((a, b) => b.won - a.won || b.convRate - a.convRate);
  return result;
}
function escapeHtml(s){
return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
    function getTeamAverageConversion() {
  const perf = computeSellerPerformance().filter(s => s.rep !== "Sem dono");
  if (!perf.length) return 0;
  const sum = perf.reduce((acc, item) => acc + Number(item.convRate || 0), 0);
  return Number((sum / perf.length).toFixed(1));
}

function getPerformanceBadge(seller) {
  const conv = Number(seller.convRate || 0);
  const goalPct = Number(seller.goalPct || 0);
  const stopped = Number(seller.stopped || 0);

  if (goalPct >= 100 || conv >= 25) {
    return { label: "Excelente", color: "#22c55e", bg: "rgba(34,197,94,.16)" };
  }

  if (stopped >= 5 || conv < 10) {
    return { label: "Crítico", color: "#ef4444", bg: "rgba(239,68,68,.16)" };
  }

  return { label: "Atenção", color: "#f59e0b", bg: "rgba(245,158,11,.16)" };
}

function getGoalProgressWidth(goalPct) {
  return Math.max(0, Math.min(100, Number(goalPct || 0)));
}

function buildMiniStageBars(seller) {
  const orderedStages = Object.entries(seller.stages || {})
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);

  if (!orderedStages.length) {
    return `<div style="color:var(--muted); font-size:12px;">Sem dados de etapas</div>`;
  }

  return orderedStages.map(([stage, info]) => `
    <div style="margin-bottom:8px;">
      <div style="display:flex; justify-content:space-between; gap:8px; margin-bottom:4px; font-size:12px; font-weight:800;">
        <span>${escapeHtml(stage)}</span>
        <span>${info.percent}%</span>
      </div>
      <div style="height:8px; border-radius:999px; background:rgba(255,255,255,.08); overflow:hidden;">
        <div style="height:100%; width:${Math.max(0, Math.min(100, info.percent))}%; background:linear-gradient(90deg, rgba(59,130,246,.9), rgba(34,197,94,.9)); border-radius:999px;"></div>
      </div>
    </div>
  `).join("");
}
function renderPerformance() {
  const wrap = document.getElementById("performanceWrap");
  const filter = document.getElementById("performanceSellerFilter");
  if (!wrap) return;

  let sellers = computeSellerPerformance().filter(s => s.rep !== "Sem dono");

  if (!AUTH.isAdmin && AUTH.atendente) {
    const myName = AUTH.atendente.manychat_name || AUTH.atendente.nome || "";
    sellers = sellers.filter(s => s.rep === myName);
  }

  if (filter) {
    const current = filter.value || "";
    const options = computeSellerPerformance()
      .filter(s => s.rep !== "Sem dono")
      .map(s => s.rep)
      .filter(Boolean)
      .sort();

    filter.innerHTML = `
      <option value="">Todos os vendedores</option>
      ${options.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}
    `;

    filter.value = current;
    filter.disabled = !AUTH.isAdmin;

    if (!filter.dataset.bound) {
      filter.addEventListener("change", () => renderPerformance());
      filter.dataset.bound = "1";
    }

    if (AUTH.isAdmin && filter.value) {
      sellers = sellers.filter(s => s.rep === filter.value);
    }
  }

  if (!sellers.length) {
    wrap.innerHTML = `
      <div style="color:var(--muted); font-weight:900; padding:14px;">
        Nenhum dado de desempenho encontrado.
      </div>
    `;
    return;
  }

  const teamAvg = getTeamAverageConversion();

  wrap.innerHTML = sellers.map(seller => {
    const badge = getPerformanceBadge(seller);
    const progressWidth = getGoalProgressWidth(seller.goalPct);
    const isAboveTeam = Number(seller.convRate || 0) >= teamAvg;
    const diffTeam = Number((Number(seller.convRate || 0) - teamAvg).toFixed(1));

const stagesHtml = Object.entries(seller.stages)
  .sort((a, b) => b[1].count - a[1].count)
  .map(([stage, info]) => {
    const pct = Math.max(0, Math.min(100, Number(info.percent || 0)));

    let stageTone = "neutral";
    const stageLower = String(stage).toLowerCase();

    if (stageLower.includes("recall")) stageTone = "warn";
    else if (stageLower === "parabéns") stageTone = "success";
    else if (stageLower === "link-enviado") stageTone = "info";

    return `
      <div class="stage-row ${stageTone}">
        <div class="stage-row-top">
          <div class="stage-name-wrap">
            <span class="stage-dot"></span>
            <span class="stage-name">${escapeHtml(stage)}</span>
          </div>
          <div class="stage-percent">${pct}%</div>
        </div>

        <div class="stage-bar">
          <div class="stage-bar-fill" style="width:${pct}%"></div>
        </div>

        <div class="stage-meta-line">
          <span>${info.count} leads</span>
          <span>Média: ${formatHMS(info.avgAgeSec)}</span>
        </div>
      </div>
    `;
  }).join("");

    return `
      <div class="chart-card" style="margin-bottom:14px;">
        <div class="chart-title" style="align-items:flex-start; gap:12px; flex-wrap:wrap;">
          <div class="left">
            <i class="ph ph-user-circle"></i> ${escapeHtml(seller.rep)}
          </div>

          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <div class="pill">Conversão: ${seller.convRate}%</div>
            <div style="
              padding:8px 12px;
              border-radius:999px;
              font-size:12px;
              font-weight:900;
              color:${badge.color};
              background:${badge.bg};
              border:1px solid ${badge.color}33;
            ">
              ${badge.label}
            </div>
          </div>
        </div>

        <div style="margin:10px 0 16px 0;">
          <div style="display:flex; justify-content:space-between; gap:10px; margin-bottom:6px; font-size:12px; font-weight:900;">
            <span>Progresso da meta mensal</span>
            <span>${seller.goal > 0 ? `${seller.won}/${seller.goal} • ${seller.goalPct}%` : "Meta não definida"}</span>
          </div>
          <div style="height:12px; border-radius:999px; background:rgba(255,255,255,.08); overflow:hidden;">
            <div style="
              height:100%;
              width:${progressWidth}%;
              background:linear-gradient(90deg, #3b82f6 0%, #22c55e 100%);
              border-radius:999px;
              transition:width .35s ease;
            "></div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-bottom:14px;">
          <div style="padding:12px; border:1px solid var(--border-light); border-radius:16px; background:rgba(255,255,255,.03);">
            <div style="color:var(--muted); font-size:11px; font-weight:900; text-transform:uppercase;">Total de leads</div>
            <div style="font-size:22px; font-weight:900; margin-top:6px;">${seller.total}</div>
          </div>

          <div style="padding:12px; border:1px solid var(--border-light); border-radius:16px; background:rgba(255,255,255,.03);">
            <div style="color:var(--muted); font-size:11px; font-weight:900; text-transform:uppercase;">Compras</div>
            <div style="font-size:22px; font-weight:900; margin-top:6px;">${seller.won}</div>
          </div>

          <div style="padding:12px; border:1px solid var(--border-light); border-radius:16px; background:rgba(255,255,255,.03);">
            <div style="color:var(--muted); font-size:11px; font-weight:900; text-transform:uppercase;">Leads ativos</div>
            <div style="font-size:22px; font-weight:900; margin-top:6px;">${seller.active}</div>
          </div>

          <div style="padding:12px; border:1px solid var(--border-light); border-radius:16px; background:rgba(255,255,255,.03);">
            <div style="color:var(--muted); font-size:11px; font-weight:900; text-transform:uppercase;">Parados +3 dias</div>
            <div style="font-size:22px; font-weight:900; margin-top:6px;">${seller.stopped}</div>
          </div>

          <div style="padding:12px; border:1px solid var(--border-light); border-radius:16px; background:rgba(255,255,255,.03);">
            <div style="color:var(--muted); font-size:11px; font-weight:900; text-transform:uppercase;">Etapa que pede atenção</div>
            <div style="font-size:18px; font-weight:900; margin-top:6px;">${escapeHtml(seller.attentionStage)}</div>
            <div style="margin-top:4px; color:var(--muted); font-size:12px;">
              ${seller.attentionStageCount} leads • média ${formatHMS(seller.attentionStageAvgAgeSec)}
            </div>
          </div>

          <div style="padding:12px; border:1px solid var(--border-light); border-radius:16px; background:rgba(255,255,255,.03);">
            <div style="color:var(--muted); font-size:11px; font-weight:900; text-transform:uppercase;">Comparação com equipe</div>
            <div style="font-size:18px; font-weight:900; margin-top:6px;">
              ${isAboveTeam ? "Acima da média" : "Abaixo da média"}
            </div>
            <div style="margin-top:4px; color:${isAboveTeam ? "#22c55e" : "#ef4444"}; font-size:12px; font-weight:900;">
              ${diffTeam >= 0 ? "+" : ""}${diffTeam}% vs média geral (${teamAvg}%)
            </div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1.2fr .8fr; gap:14px; margin-bottom:14px;">
          <div style="padding:14px; border:1px solid var(--border-light); border-radius:16px; background:rgba(255,255,255,.03);">
            <div style="margin-bottom:10px; color:var(--muted); font-size:11px; font-weight:900; letter-spacing:.6px; text-transform:uppercase;">
              Mini gráfico por etapa
            </div>
            ${buildMiniStageBars(seller)}
          </div>

          <div style="padding:14px; border:1px solid var(--border-light); border-radius:16px; background:rgba(255,255,255,.03);">
            <div style="margin-bottom:10px; color:var(--muted); font-size:11px; font-weight:900; letter-spacing:.6px; text-transform:uppercase;">
              Resumo rápido
            </div>
            <div style="display:grid; gap:8px; font-size:13px; font-weight:800;">
              <div>Conversão: <span style="color:#fff;">${seller.convRate}%</span></div>
              <div>Links enviados: <span style="color:#fff;">${seller.linkEnviado}</span></div>
              <div>Tempo médio ativo: <span style="color:#fff;">${formatHMS(seller.avgAgeSec)}</span></div>
              <div>Meta mensal: <span style="color:#fff;">${seller.goal || "—"}</span></div>
            </div>
          </div>
        </div>

<div class="stage-distribution-block">
  <div class="stage-distribution-header">
    <div class="stage-distribution-title">Distribuição dos leads por etapa</div>
    <div class="stage-distribution-subtitle">Visão percentual da carteira deste vendedor</div>
  </div>

  <div class="stage-distribution-list">
    ${stagesHtml || `<div style="color:var(--muted);">Sem etapas</div>`}
  </div>
</div>
      </div>
    `;
  }).join("");
}
function buildWaLink(phone){
let s = String(phone || '').replace(/\D/g,'');
if(!s || s.length < 10) return '';
@@ -3386,3 +4105,4 @@ window.renderPvSend = renderPvSend;
window.pvCreateAndSendLead = pvCreateAndSendLead;
window.clearPvSendForm = clearPvSendForm;
window.generateReport = generateReport;
window.renderPerformance = renderPerformance;
