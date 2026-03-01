
    /*********************** GLOBAL ERROR CAPTURE **********************/
    // Mantém o design e evita "tela vermelha total" sem contexto.
    window.onerror = function(msg, url, line, col, err) {
      console.error("JS Error:", { msg, url, line, col, err });
      try{
        showToast("Erro de Javascript", `${msg} (linha ${line})`, "error", 6000);
      }catch(_){}
      return false;
    };
 
    /*********************** TOAST *************************************/
    function showToast(title, desc = "", type = "info", timeout = 3200){
      const wrap = document.getElementById("toastWrap");
      if(!wrap) return;

      const el = document.createElement("div");
      el.className = "toast " + type;

      const iconMap = {
        success: "ph-check-circle",
        error: "ph-warning-circle",
        info: "ph-info",
        warn: "ph-warning"
      };
      const ic = iconMap[type] || iconMap.info;

      el.innerHTML = `
        <div class="ic"><i class="ph ${ic}"></i></div>
        <div class="txt">
          <div class="t">${escapeHtml(title)}</div>
          ${desc ? `<div class="d">${escapeHtml(desc)}</div>` : ""}
        </div>
      `;
      wrap.appendChild(el);

      setTimeout(() => {
        el.style.opacity = "0";
        el.style.transform = "translateY(10px)";
        setTimeout(() => el.remove(), 180);
      }, timeout);
    }

    // compat com seu código antigo
    function toast_(msg, type="info", sub=""){
      const map = { success:"success", error:"error", warn:"warn", info:"info" };
      showToast(msg, sub || "", map[type] || "info");
    }

    /*********************** SUPABASE CONFIG ***************************/
    const SUPABASE_URL = "https://jzeodgbaquiwgnbnjwkw.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZW9kZ2JhcXVpd2duYm5qd2t3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxOTA5ODQsImV4cCI6MjA4Nzc2Njk4NH0.WtB6dRdhbKXHnH2KOZ3_qUenXU_5mchWfrA2936AzwA";
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    /*********************** KANBAN CONFIG *****************************/
    const KANBAN = {
      TABLE: "Leads-Geral1",
      STAGES: ['Inicial', 'A02', 'A03', 'A04', 'Link-Enviado', 'Parabéns'],
      SLA: { warnMin: 30, dangerMin: 60 }
    };

    /*********************** CHART GLOBALS *****************************/
    Chart.defaults.color = '#9aa7b4';
    Chart.defaults.borderColor = 'rgba(255,255,255,0.10)';
    Chart.defaults.font.family = 'Plus Jakarta Sans, Inter, sans-serif';

    /*********************** STATE *************************************/
    let STATE = { stages: [], cards: [], filters: { responsaveis: [], origens: [] }, meta: {} };
    let SEARCH_QUERY = "";
    let FILTER_RESP = "";
    let FILTER_ORIG = "";
    let TIMER_HANDLE = null;
    let AUTO_REFRESH_HANDLE = null;
    let MODAL = { open: false, card: null, mode: "edit" }; // "edit" | "create"
    let charts = { funil: null, consultor: null, sla: null, links: null, conversao: null, funilVendedor: null };
    let VIEW = "kanban";
    let AUTH = {
  session: null,
  atendente: null,
  isAdmin: false,
};

    // settings locais
    const SETTINGS = {
      refreshSec: 30,
      slaWarnMin: KANBAN.SLA.warnMin,
      slaDangerMin: KANBAN.SLA.dangerMin,
      compact: false
    };

    document.addEventListener('DOMContentLoaded', async () => {
      setupListeners();
      await protectWithAuth();
      await reload();
      setAutoRefresh(true);
      syncSettingsUI();
      setupPreVendasListeners();
    });

    /*********************** AUTH **************************************/
async function protectWithAuth(){
  try{
    const { data: { session }, error } = await sb.auth.getSession();
    if(error) throw error;

    if (!session) {
      window.location.href = "./login.html";
      return;
    }

    AUTH.session = session;

    const userInfo = document.getElementById("userInfo");
    if(userInfo) userInfo.textContent = "Logado como: " + session.user.email;

    const { data: atendente, error: e2 } = await sb
      .from("atendentes")
      .select("id, nome, manychat_name, ativo, is_admin, auth_user_id")
      .eq("auth_user_id", session.user.id)
      .maybeSingle();

    if(e2) throw e2;

    AUTH.atendente = atendente || null;
    AUTH.atendenteId = atendente?.id || null;
    AUTH.isAdmin = Boolean(atendente?.is_admin);

    if (!AUTH.isAdmin && session.user.email === "vinicius@italianofacil.com") {
      AUTH.isAdmin = true;
    }

    const btnLogout = document.getElementById("btnLogout");
    if (btnLogout) btnLogout.addEventListener("click", async () => {
      await sb.auth.signOut();
      window.location.href = "./login.html";
    });

  }catch(err){
    console.error(err);
    showToast("Falha ao validar sessão", String(err.message || err), "error", 4500);
  }

  // ✅ fora do try/catch, mas dentro da função
  const navUn = document.getElementById("navUnassigned");
  if (navUn) navUn.classList.toggle("hidden", !AUTH.isAdmin);
}

    async function renderPreVendas(){
  const wrap = document.getElementById("prevendasWrap");
  const countEl = document.getElementById("pvCount");
  if(!wrap) return;

  // leads disponíveis: aqui você define a regra.
  // Sugestão: pré-vendas trabalha com Inicial/A02 (ajuste se quiser)
const base = getPreVendasCards();

  const cards = base
    .filter(c => !PV.stage || String(c.fluxo) === String(PV.stage))
    .filter(c => {
      if(!PV.search) return true;
      const hay = `${c.name||""} ${c.phone||""} ${c.origem||""}`.toLowerCase();
      return hay.includes(PV.search);
    })
    .sort((a,b)=> b.sortTs - a.sortTs);

  if(countEl) countEl.textContent = String(cards.length);

  // carrega comercial
  let comercial = [];
  try{
    comercial = await loadAtendentesComercial();
  }catch(e){
    console.warn(e);
  }

  if(!cards.length){
    wrap.innerHTML = `<div style="color:var(--muted); font-weight:900;">Nenhum lead para pré-vendas agora 🎯</div>`;
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Lead</th>
          <th>Telefone</th>
          <th>Etapa</th>
          <th>Enviar para</th>
          <th>Anotações</th>
          <th>Ação</th>
        </tr>
      </thead>
      <tbody>
        ${cards.map(c => `
          <tr>
            <td>
              <b>${escapeHtml(c.name)}</b>
              <div style="color:var(--muted); font-size:12px;">ID: ${escapeHtml(String(c.id))}</div>
            </td>
            <td>${escapeHtml(c.phone || "—")}</td>
            <td><span class="pill-mini">${escapeHtml(c.fluxo || "—")}</span></td>

            <td>
              <select class="input" style="width:220px" id="pv-to-${c.id}">
                <option value="">Selecionar atendente…</option>
                ${comercial.map(a => `
                  <option value="${escapeHtml(String(a.id))}">${escapeHtml(a.nome)}</option>
                `).join("")}
              </select>
            </td>

            <td>
              <input class="input" style="width:320px"
                     id="pv-note-${c.id}"
                     placeholder="O que o lead quer? Contexto, urgência, perfil…" />
            </td>

            <td>
              <button class="btn primary" type="button" onclick="sendToComercial('${c.id}')">
                <i class="ph ph-paper-plane-tilt"></i> Enviar
              </button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}
    async function sendToComercial(leadId){
  const sel = document.getElementById(`pv-to-${leadId}`);
  const noteEl = document.getElementById(`pv-note-${leadId}`);

  const paraId = sel?.value;
  const nota = (noteEl?.value || "").trim();

  if(!paraId){
    showToast("Falta atendente", "Selecione quem vai receber no comercial", "warn");
    return;
  }
  if(!nota){
    showToast("Falta anotação", "Escreva o que o lead quer (contexto)", "warn");
    return;
  }

  showToast("Enviando…", "Criando handoff", "info", 1600);

  try{
    const payload = {
      lead_id: leadId,
      de_atendente_id: AUTH.atendenteId,
      para_atendente_id: paraId,
      nota: nota,
      status: "pendente"
    };

    const { error } = await sb.from("lead_handoffs").insert(payload);
    if(error) throw error;

    // opcional: limpar campo
    if(noteEl) noteEl.value = "";

    showToast("Enviado ✅", "Pré-vendas → Comercial (pendente)", "success", 2400);

  }catch(err){
    showToast("Falha ao enviar", String(err.message || err), "error", 5200);
  }
}

async function pvCreateLead(){
  const nome = (document.getElementById("pvNome")?.value || "").trim();
  const telefone = (document.getElementById("pvTelefone")?.value || "").trim();
  const origem = (document.getElementById("pvOrigem")?.value || "").trim();
  const fluxo = (document.getElementById("pvFluxo")?.value || "Inicial").trim();
  const motivo = (document.getElementById("pvMotivo")?.value || "").trim();

  // (opcional) escolher pra qual atendente vai — hoje você não está usando isso no create
  // const paraAtendenteId = document.getElementById("pvParaAtendente")?.value || "";

  if(!nome){
    showToast("Nome obrigatório", "Digite o nome do lead", "warn");
    return;
  }

  showToast("Cadastrando…", nome, "info", 1600);

  try{
    // aqui o responsavel vira "—" (não atribuído) ou pode ser o próprio pré-vendas
    const responsavelNome = "—"; // ou: (AUTH.atendente?.manychat_name || AUTH.atendente?.nome || "—")

    const created = await createLead({
      nome,
      telefone,
      fluxo,
      responsavel: responsavelNome,
      origem: origem || "—",
      motivo,
      createdRole: "prevendas"
    });

    // limpa campos
    ["pvNome","pvTelefone","pvMotivo"].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.value = "";
    });

    // mantém selects como estão (origem/fluxo), se quiser limpar também, inclua ids acima
    await reload();
    setView("prevendas");

    showToast("Lead criado ✅", `ID: ${created?.id ?? "—"}`, "success", 2400);
  }catch(err){
    showToast("Falha ao criar", String(err?.message || err), "error", 5200);
  }
}
    function toggleView(){
  const order = ["kanban","prevendas","dashboard","reports","settings"];
  const idx = order.indexOf(VIEW);
  const next = order[(idx + 1) % order.length];
  setView(next);
}
    async function rejectHandoff(id){
  const { error } = await sb
    .from("lead_handoffs")
    .update({
      status: "recusado",
      respondido_em: new Date().toISOString()
    })
    .eq("id", id);

  if(error){
    showToast("Erro ao recusar", error.message, "error");
    return;
  }

  closeModal();
  reload();
}
    /*********************** VIEW **************************************/
async function setView(which){
  VIEW = which;

  const prevendas = document.getElementById('prevendas');
  const board = document.getElementById('board');
  const dash = document.getElementById('dashboard');
  const reports = document.getElementById('reports');
  const settings = document.getElementById('settings');
  const unassigned = document.getElementById('unassigned');

  ['navKanban','navDash','navReports','navSettings','navUnassigned','navPreVendas']
    .forEach(id => document.getElementById(id)?.classList.remove('active'));

  board?.classList.add('hidden');
  dash?.classList.add('hidden');
  reports?.classList.add('hidden');
  settings?.classList.add('hidden');
  unassigned?.classList.add('hidden');
  prevendas?.classList.add('hidden');

  if(which === 'dashboard'){
    dash?.classList.remove('hidden');
    document.getElementById('navDash')?.classList.add('active');
    renderDashboard();
    return;
  }

  if(which === 'prevendas'){
    prevendas?.classList.remove('hidden');
    document.getElementById('navPreVendas')?.classList.add('active');
    try { await fillPvAtendentes(); } catch(e){ console.warn(e); }
    renderPreVendas();
    return;
  }

  if(which === 'reports'){
    reports?.classList.remove('hidden');
    document.getElementById('navReports')?.classList.add('active');
    renderReports();
    return;
  }

  if(which === 'settings'){
    settings?.classList.remove('hidden');
    document.getElementById('navSettings')?.classList.add('active');
    syncSettingsUI();
    return;
  }

  if(which === 'unassigned'){
    if(!AUTH.isAdmin){
      showToast("Acesso negado", "Apenas admin", "error");
      return setView("kanban");
    }
    unassigned?.classList.remove('hidden');
    document.getElementById('navUnassigned')?.classList.add('active');
    renderUnassigned();
    return;
  }

  // default: kanban
  board?.classList.remove('hidden');
  document.getElementById('navKanban')?.classList.add('active');
  renderBoard();
}
    /*********************** LISTENERS *********************************/
    function setupListeners(){
      document.getElementById('search')?.addEventListener('input', (e) => {
        SEARCH_QUERY = (e.target.value || "").toLowerCase().trim();
        if(VIEW === "kanban") renderBoard();
        if(VIEW === "reports") renderReports();
      });

      document.getElementById('filterResponsavel')?.addEventListener('change', (e) => {
        FILTER_RESP = e.target.value;
        if(VIEW === "kanban") renderBoard();
        if(VIEW === "reports") renderReports();
      });

      document.getElementById('filterOrigem')?.addEventListener('change', (e) => {
        FILTER_ORIG = e.target.value;
        if(VIEW === "kanban") renderBoard();
        if(VIEW === "reports") renderReports();
      });

      document.getElementById('autoRefresh')?.addEventListener('change', (e) => setAutoRefresh(e.target.checked));

      document.getElementById('modalOverlay')?.addEventListener('click', (e) => {
        if(e.target.id === 'modalOverlay') closeModal();
      });

      document.addEventListener('keydown', (e) => {
        if(e.key === 'Escape' && MODAL.open) closeModal();
      });

      const btnExp = document.getElementById('btnExportMetrics');
      if (btnExp) btnExp.addEventListener('click', () => exportMetrics());
    }

    async function loadAtendentes(){
  const { data, error } = await sb
    .from("atendentes")
    .select("id, nome, ativo")
    .eq("ativo", true)
    .order("nome", { ascending: true });

  if(error) throw error;
  return data || [];
}

    /*********************** AUTO REFRESH ******************************/
    function setAutoRefresh(on){
      const label = document.getElementById('autoRefreshLabel');
      if(label) label.textContent = on ? `on (${SETTINGS.refreshSec}s)` : "off";

      if(AUTO_REFRESH_HANDLE){
        clearInterval(AUTO_REFRESH_HANDLE);
        AUTO_REFRESH_HANDLE = null;
      }
      if(!on) return;

      AUTO_REFRESH_HANDLE = setInterval(() => {
        reload().catch(err => showToast("Auto-refresh falhou", String(err.message || err), "error", 4500));
      }, Math.max(10, SETTINGS.refreshSec) * 1000);
    }

    /*********************** RELOAD ************************************/
async function reload(){
  const board = document.getElementById('board');
  if(STATE.stages.length === 0 && board){
    board.innerHTML = '<div style="padding:20px; color:var(--muted); font-size:14px; font-weight:900;"><i class="ph ph-hourglass-medium"></i> Sincronizando...</div>';
  }

  const res = await getKanbanData();
  if(res && res.error){
    showError(res.error);
    return;

  }

  // ✅ primeiro seta o STATE com os dados do kanban
  STATE = res || STATE;

  // ✅ depois carrega atendentes (e não perde mais)
  if (AUTH.isAdmin) {
    try {
      STATE.atendentes = await loadAtendentes();
    } catch (e) {
      console.warn("Falha ao carregar atendentes:", e);
      STATE.atendentes = [];
    }
  }
  await checkHandoffPopup();
  updateMetrics();
  populateFilters();

  if(VIEW === "dashboard") renderDashboard();
  else if(VIEW === "reports") renderReports();
  else if(VIEW === "settings") syncSettingsUI();
  else if(VIEW === "unassigned") renderUnassigned();
  else renderBoard();

  startLiveTimers();
  showToast("Atualizado", "Dados sincronizados com sucesso", "success", 2200);
}
    async function loadHandoffsPendentes() {
  if (!AUTH.atendenteId) return [];

  const { data, error } = await sb
    .from("lead_handoffs")
    .select("*")
    .eq("para_atendente_id", AUTH.atendenteId)
    .eq("status", "pendente");

  if (error) {
    console.error("Erro ao buscar handoffs:", error);
    return [];
  }

  return data || [];
}
    async function checkHandoffPopup() {
  const pendentes = await loadHandoffsPendentes();

  if (!pendentes.length) return;

  const handoff = pendentes[0];

  openHandoffModal(handoff);
}

    function showError(msg){
      const board = document.getElementById('board');
      if(board){
        board.innerHTML =
          '<div style="padding:20px; border:1px solid rgba(239,68,68,0.35); background:rgba(239,68,68,0.10); border-radius:16px; color:#fecaca; font-weight:900;">' +
          '<h3 style="margin-bottom:8px;"><i class="ph ph-warning-circle"></i> Erro de Conexão</h3>' +
          '<p style="color:#ffd4d4; font-weight:800; margin-bottom:12px;">' + escapeHtml(msg) + '</p>' +
          '<button class="btn" onclick="reload()"><i class="ph ph-arrows-clockwise"></i> Tentar novamente</button>' +
          '</div>';
      }
      showToast("Erro de conexão", msg, "error", 5000);
    }

    async function loadAtendentesComercial(){
  const { data, error } = await sb
    .from("atendentes")
    .select("id, nome, ativo, departamento")
    .eq("ativo", true)
    .order("nome", { ascending: true });

  if(error) throw error;

  const all = data || [];

  // se existir departamento, tenta filtrar Comercial
  const hasDept = all.some(a => a.departamento !== undefined && a.departamento !== null);
  const filtered = hasDept
    ? all.filter(a => String(a.departamento || "").toLowerCase().includes("comercial"))
    : all;

  // não mandar para si mesmo
  return filtered.filter(a => String(a.id) !== String(AUTH.atendenteId));
}

    function updateMetrics(){
      const upd = document.getElementById('updatedAt');
      if(upd) upd.textContent = 'Atualizado: ' + new Date().toLocaleTimeString('pt-BR');

      const totalEl = document.getElementById('mTotal');
      if(totalEl) totalEl.textContent = String(STATE.meta?.total || 0);

      const slaEl = document.getElementById('mSla');
      if(slaEl) slaEl.textContent = '> ' + (STATE.meta?.sla?.dangerMin ?? SETTINGS.slaDangerMin) + 'm';
    }

    function populateFilters(){
      // Responsável
      const sel = document.getElementById('filterResponsavel');
      if(sel){
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">Todos Responsáveis</option>';
        (STATE.filters?.responsaveis || []).forEach(r => {
          const opt = document.createElement('option');
          opt.value = r;
          opt.textContent = r;
          sel.appendChild(opt);
        });
        sel.value = currentVal;
      }

      // Origem
      const selO = document.getElementById('filterOrigem');
      if(selO){
        const cur = selO.value;
        selO.innerHTML = '<option value="">Todas Origens</option>';
        (STATE.filters?.origens || []).forEach(o => {
          const opt = document.createElement('option');
          opt.value = o;
          opt.textContent = o;
          selO.appendChild(opt);
        });
        selO.value = cur;
      }
    }

    /*********************** DATA LAYER ********************************/

async function createLead({ nome, telefone, fluxo, responsavel, origem, motivo, createdRole = null }){
  if(!KANBAN.STAGES.includes(fluxo)) fluxo = "Inicial";

  const now = new Date();

  const payload = {
    nome,
    telefone,
    "fluxo-id": fluxo,
    "responsavel-id": responsavel || "—",
    "origem-id": origem || "—",
    "Motivo": motivo || "",
    "Data": now.toLocaleDateString("pt-BR"),
    "Hora-entrada": now.toLocaleTimeString("pt-BR"),
    "Data da mudança do fluxo": now.toLocaleDateString("pt-BR"),
    "Hora da mudança do fluxo": now.toLocaleTimeString("pt-BR"),
    created_by_auth: AUTH.session?.user?.id || null,
    created_by_atendente_id: AUTH.atendenteId || null,
    created_by_role: createdRole || null,
  };

  const { data, error } = await sb
    .from(KANBAN.TABLE)
    .insert(payload)
    .select("id")
    .single();

  if(error) throw error;
  return data;
}
    async function updateLeadCore(id, { nome, telefone, fluxo }){
  const payload = {};
  if(nome !== undefined) payload["nome"] = nome;
  if(telefone !== undefined) payload["telefone"] = telefone;
  if(fluxo !== undefined) payload["fluxo-id"] = fluxo;

  const now = new Date();
  if(fluxo !== undefined){
    payload["Data da mudança do fluxo"] = now.toLocaleDateString("pt-BR");
    payload["Hora da mudança do fluxo"] = now.toLocaleTimeString("pt-BR");
  }

  const { error } = await sb.from(KANBAN.TABLE).update(payload).eq("id", id);
  if(error) throw error;
}

    async function getKanbanData(){
      try{
        let allData = [];
        let page = 0;
        const pageSize = 1000;
        let fetchMore = true;

        while(fetchMore){
let q = sb
  .from(KANBAN.TABLE)
  .select("*");

if (!AUTH.isAdmin) {
  if (!AUTH.atendenteId) {
    // não tem vínculo com atendente -> não carrega nada e mostra erro amigável
    return { error: "Seu usuário não está vinculado a um atendente (auth_user_id). Fale com o admin para vincular." };
  }
q = q.eq("responsavel-id", AUTH.atendente?.manychat_name || AUTH.atendente?.nome || "");
}

const { data, error } = await q.range(page * pageSize, (page + 1) * pageSize - 1);

          if(error) throw error;

          if(data && data.length > 0){
            allData = allData.concat(data);
            if(data.length < pageSize) fetchMore = false;
            else page++;
          }else{
            fetchMore = false;
          }
        }

        const nowMs = Date.now();
        const stats = {};
        for(const s of KANBAN.STAGES) stats[s] = { count:0, sumSec:0 };

        const responsaveisSet = new Set();
        const origensSet = new Set();
        const cards = [];

        for(const row of allData){
          if(!row.nome || String(row.nome).trim() === '') continue;

          const fluxoRaw = String(row['fluxo-id'] || '').trim();
          const stage = KANBAN.STAGES.includes(fluxoRaw) ? fluxoRaw : 'Inicial';

          const horaEntrada = row['Hora-entrada'] || row['Hora entrada'];
          const entryTs  = buildTs(row['Data'], horaEntrada);
          const changeTs = buildTs(row['Data da mudança do fluxo'], row['Hora da mudança do fluxo']);

          const stageTs = (stage === 'Inicial') ? entryTs : (changeTs || entryTs);
          const sortTs  = changeTs || entryTs;
          const ageSec  = stageTs ? Math.max(0, Math.floor((nowMs - stageTs) / 1000)) : 0;

          stats[stage].count += 1;
          stats[stage].sumSec += ageSec;

          const resp = safe_(row['responsavel-id'], '—');
          const orig = safe_(row['origem-id'], '—');
          if(resp !== '—' && resp !== '') responsaveisSet.add(resp);
          if(orig !== '—' && orig !== '') origensSet.add(orig);

          cards.push({
            id: row['id'],
            name: safe_(row.nome, '(Sem nome)'),
            phone: safe_(row.telefone, ''),
            origem: orig,
            responsavel: resp,
            manychat: safe_(row['Manychat_id'], ''),
            motivo: safe_(row['Motivo'], ''),
            fluxo: stage,
            horaLabel: formatHora_(horaEntrada),
            stageTs: stageTs || 0,
            sortTs: sortTs || 0,
            ageSec,
            created_by_auth: row.created_by_auth,
created_by_atendente_id: row.created_by_atendente_id,
created_by_role: row.created_by_role,
          });
        }

        const stageAverages = {};
        for(const s of KANBAN.STAGES){
          stageAverages[s] = stats[s].count ? Math.round(stats[s].sumSec / stats[s].count) : 0;
        }

        return {
          stages: KANBAN.STAGES,
          cards,
          filters: {
            responsaveis: Array.from(responsaveisSet).sort(),
            origens: Array.from(origensSet).sort()
          },
          meta: {
            updatedAt: new Date().toISOString(),
            total: cards.length,
            stageAverages,
            sla: { warnMin: SETTINGS.slaWarnMin, dangerMin: SETTINGS.slaDangerMin }
          }
        };
      }catch(err){
        return { error: String(err.message || err) };
      }
    }
    function getPreVendasCards(){
  const uid = AUTH.session?.user?.id;
  return (STATE.cards || []).filter(c => String(c.created_by_auth || "") === String(uid));
}
    async function fillAtendentesSelect(){
  const sel = document.getElementById("fResponsavel");
  if(!sel) return;

  // se não for admin, deixa ele mesmo (ou vazio) – você decide
  const atendentes = AUTH.isAdmin ? (STATE.atendentes || []) : (AUTH.atendente ? [AUTH.atendente] : []);

  sel.innerHTML = `<option value="">Selecionar atendente…</option>` + atendentes.map(a => {
    const nome = a.manychat_name || a.nome || "";
    return `<option value="${escapeHtml(nome)}">${escapeHtml(nome)}</option>`;
  }).join("");
}
    async function fillPvAtendentes(){
  const sel = document.getElementById("pvParaAtendente");
  if(!sel) return;

  const comercial = await loadAtendentesComercial(); // você já tem
  sel.innerHTML = `<option value="">Selecionar atendente…</option>` +
    comercial.map(a => `<option value="${escapeHtml(String(a.id))}">${escapeHtml(a.nome)}</option>`).join("");
}
    

    async function updateCardStage(id, newStage){
      if(!KANBAN.STAGES.includes(newStage)) throw new Error('Stage inválido.');

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

      if(error) throw error;
      return { ok:true };
    }
    

    async function updateCardFields(id, fields){
      const payload = {};
      if(fields.responsavel !== undefined) payload['responsavel-id'] = fields.responsavel;
      if(fields.origem !== undefined) payload['origem-id'] = fields.origem;
      if(fields.motivo !== undefined) payload['Motivo'] = fields.motivo;

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
      if(!board) return;
      board.innerHTML = '';

      const sla = STATE.meta?.sla || { warnMin: SETTINGS.slaWarnMin, dangerMin: SETTINGS.slaDangerMin };
      const warnSec = sla.warnMin * 60;
      const dangerSec = sla.dangerMin * 60;

      STATE.stages.forEach(stage => {
        const col = document.createElement('section');
        col.className = 'col';

        const cardsInStage = (STATE.cards || [])
          .filter(c => c.fluxo === stage)
          .filter(c => {
            const matchSearch = (!SEARCH_QUERY ||
              (c.name || "").toLowerCase().includes(SEARCH_QUERY) ||
              (c.responsavel || "").toLowerCase().includes(SEARCH_QUERY) ||
              (c.origem || "").toLowerCase().includes(SEARCH_QUERY)
            );
            const matchResp = (!FILTER_RESP || c.responsavel === FILTER_RESP);
            const matchOrig = (!FILTER_ORIG || c.origem === FILTER_ORIG);
            return matchSearch && matchResp && matchOrig;
          })
          .sort((a,b) => b.sortTs - a.sortTs);

        const avgSec = Number(STATE.meta?.stageAverages?.[stage] || 0);
        const avgLabel = avgSec > 0 ? 'Média: ' + formatHMS(avgSec) : 'Média: —';

        col.innerHTML = `
          <div class="col-header">
            <div>
              <div class="col-title">${escapeHtml(stage)}</div>
              <div class="col-sub">${escapeHtml(avgLabel)}</div>
            </div>
            <div class="pill">${cardsInStage.length}</div>
          </div>
          <div class="stack" data-stage="${escapeHtml(stage)}"
            ondragover="onDragOver(event)"
            ondragleave="onDragLeave(event)"
            ondrop="onDrop(event)">
            <div class="drop-hint"><i class="ph ph-cursor-click"></i> Mover para <span style="font-weight:1000;">${escapeHtml(stage)}</span></div>
          </div>
        `;

        const stack = col.querySelector('.stack');

        cardsInStage.forEach(c => {
          const cardEl = document.createElement('div');
          cardEl.className = 'card';
          cardEl.draggable = true;

          // SLA styling
          let timerClass = '';
          if (c.ageSec >= dangerSec) { timerClass = 'danger'; cardEl.classList.add('sla-danger'); }
          else if (c.ageSec >= warnSec) { timerClass = 'warn'; cardEl.classList.add('sla-warn'); }

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

            <div class="c-meta">
              <span class="tag accent"><i class="ph ph-user"></i> ${escapeHtml(c.responsavel)}</span>
              <span class="tag"><i class="ph ph-map-pin"></i> ${escapeHtml(c.origem)}</span>
            </div>
          `;

          // Click opens modal
          cardEl.addEventListener('click', () => openModal(c.id));

          // Drag & drop: visual improvements
          cardEl.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(c.id));
            setTimeout(() => cardEl.classList.add('dragging'), 0);
          });
          cardEl.addEventListener('dragend', () => cardEl.classList.remove('dragging'));

          stack.appendChild(cardEl);
        });

        board.appendChild(col);
      });
    }

    /*********************** QUICK WIN *********************************/
    async function quickWin(id){
      const card = (STATE.cards || []).find(x => String(x.id) === String(id));
      if(!card) return;

      if(String(card.fluxo || '').toLowerCase() === 'parabéns'){
        showToast("Já está em Parabéns", card.name, "info");
        return;
      }

      const oldStage = card.fluxo;

      // otimista
      card.fluxo = 'Parabéns';
      card.stageTs = Date.now();
      card.ageSec = 0;

      if(VIEW === "kanban") renderBoard();
      showToast("Marcado como Parabéns", card.name, "success");

      try{
        await updateCardStage(card.id, 'Parabéns');
        if(VIEW !== "kanban") { /* mantém coerência */}
      }catch(err){
        card.fluxo = oldStage;
        if(VIEW === "kanban") renderBoard();
        showToast("Falha ao atualizar", String(err.message || err), "error", 5200);
      }
    }
    function getUnassignedCards(){
  return (STATE.cards || []).filter(c => {
    const respTxt = String(c.responsavel || '').trim();
    return (!respTxt || respTxt === '—' || respTxt.toLowerCase() === 'nao atribuido' || respTxt.toLowerCase() === 'não atribuído');
  });
}


function renderUnassigned(){
  if(!AUTH.isAdmin) return;

  const wrap = document.getElementById("unassignedWrap");
  if(!wrap) return;

  const cards = getUnassignedCards().sort((a,b)=> b.sortTs - a.sortTs);
  const atendentes = STATE.atendentes || [];

  if(!cards.length){
    wrap.innerHTML = `<div style="color:var(--muted); font-weight:900;">Nenhum lead não atribuído 🎯</div>`;
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Lead</th>
          <th>Telefone</th>
          <th>Origem</th>
          <th>Motivo</th>
          <th>Fluxo</th>
          <th>Atribuir para</th>
          <th>Ação</th>
        </tr>
      </thead>
      <tbody>
        ${cards.map(c => `
          <tr>
            <td><b>${escapeHtml(c.name)}</b><div style="color:var(--muted); font-size:12px;">ID: ${escapeHtml(String(c.id))}</div></td>
            <td>${escapeHtml(c.phone || "—")}</td>

            <td>
              <input class="input" style="width:180px" id="ua-origem-${c.id}" value="${escapeHtml(c.origem || '')}" />
            </td>

            <td>
              <input class="input" style="width:220px" id="ua-motivo-${c.id}" value="${escapeHtml(c.motivo || '')}" />
            </td>

            <td>
              <select class="input" style="width:160px" id="ua-fluxo-${c.id}">
                ${KANBAN.STAGES.map(s => `
                  <option value="${escapeHtml(s)}" ${String(c.fluxo)===String(s) ? "selected":""}>${escapeHtml(s)}</option>
                `).join("")}
              </select>
            </td>

            <td>
              <select class="input" style="width:200px" id="ua-at-${c.id}">
                <option value="">Selecionar atendente…</option>
                ${atendentes.map(a => `
                  <option value="${escapeHtml(String(a.id))}">${escapeHtml(a.nome)}</option>
                `).join("")}
              </select>
            </td>

            <td>
              <button class="btn primary" type="button" onclick="assignLead('${c.id}')">
                <i class="ph ph-check"></i> Atribuir
              </button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}
    async function assignLead(leadId){
  if(!AUTH.isAdmin){
    showToast("Acesso negado", "Apenas admin", "error");
    return;
  }

  const selAt = document.getElementById(`ua-at-${leadId}`);
  const origemEl = document.getElementById(`ua-origem-${leadId}`);
  const motivoEl = document.getElementById(`ua-motivo-${leadId}`);
  const fluxoEl  = document.getElementById(`ua-fluxo-${leadId}`);

  const atendenteId = selAt?.value;
  const origem = (origemEl?.value || "—").trim() || "—";
  const motivo = (motivoEl?.value || "").trim();
  const fluxo = (fluxoEl?.value || "Inicial").trim();

  if(!atendenteId){
    showToast("Falta atendente", "Selecione um atendente", "warn");
    return;
  }

  const atendente = (STATE.atendentes || []).find(a => String(a.id) === String(atendenteId));
  const atendenteNome = atendente?.nome || "—";

  const now = new Date();

  // ✅ Ajuste os campos conforme teu banco REAL:
  // - responsavel_id (id do atendente)
  // - 'responsavel-id' (nome do atendente) -> teu front usa isso
  // - 'origem-id', 'Motivo', 'fluxo-id'
  const payload = {
    responsavel_id: atendenteId,
    "responsavel-id": atendenteNome,
    "origem-id": origem,
    "Motivo": motivo,
    "fluxo-id": fluxo,
    "Data da mudança do fluxo": now.toLocaleDateString('pt-BR'),
    "Hora da mudança do fluxo": now.toLocaleTimeString('pt-BR')
  };

  showToast("Atribuindo…", `${atendenteNome}`, "info", 1600);

  try{
    const { error } = await sb
      .from(KANBAN.TABLE)
      .update(payload)
      .eq("id", leadId);

    if(error) throw error;

    // Atualiza STATE localmente (sem reload total)
    const card = (STATE.cards || []).find(c => String(c.id) === String(leadId));
    if(card){
      card.responsavel = atendenteNome;
      card.origem = origem;
      card.motivo = motivo;
      card.fluxo = fluxo;
      card.sortTs = Date.now();
      card.stageTs = Date.now();
      card.ageSec = 0;
    }

    populateFilters();
    updateMetrics();

    // Re-renderiza a lista e o kanban
    renderUnassigned();
    if(VIEW === "kanban") renderBoard();

    showToast("Atribuído ✅", `${card?.name || "Lead"} → ${atendenteNome}`, "success", 2400);
  }catch(err){
    showToast("Falha ao atribuir", String(err.message || err), "error", 5200);
  }
}
let PV = { search: "", stage: "" };

function setupPreVendasListeners(){
  document.getElementById("pvSearch")?.addEventListener("input", (e)=>{
    PV.search = (e.target.value || "").toLowerCase().trim();
    renderPreVendas();
  });

  document.getElementById("pvFilterStage")?.addEventListener("change", (e)=>{
    PV.stage = e.target.value || "";
    renderPreVendas();
  });
}
    /*********************** UI RENDER: DASH ****************************/
    function renderDashboard(){
      if(!document.getElementById('funilChart')) return;

      renderMetricsGrid();

      // FUNIL
      const funilLabels = STATE.stages || [];
      const funilData = funilLabels.map(s => (STATE.cards || []).filter(c => c.fluxo === s).length);

      if (charts.funil) charts.funil.destroy();
      charts.funil = new Chart(document.getElementById('funilChart'), {
        type: 'bar',
        data: { labels: funilLabels, datasets: [{ label: 'Qtd de Leads', data: funilData, backgroundColor: 'rgba(34,197,94,0.85)', borderRadius: 10 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
      });

      // CONSULTORES
      const respMap = {};
      (STATE.cards || []).forEach(c => {
        const r = (c.responsavel && c.responsavel !== '—') ? c.responsavel : 'Sem Dono';
        if(!respMap[r]) respMap[r] = { ativos: 0, convertidos: 0 };
        if(String(c.fluxo || '').toLowerCase() === 'parabéns') respMap[r].convertidos++;
        else respMap[r].ativos++;
      });

      const consLabels = Object.keys(respMap).sort();
      const consAtivos = consLabels.map(r => respMap[r].ativos);
      const consConvertidos = consLabels.map(r => respMap[r].convertidos);

      if (charts.consultor) charts.consultor.destroy();
      charts.consultor = new Chart(document.getElementById('consultorChart'), {
        type: 'bar',
        data: {
          labels: consLabels,
          datasets: [
            { label: 'Leads Ativos', data: consAtivos, backgroundColor: 'rgba(245,158,11,0.85)', borderRadius: 8 },
            { label: 'Convertidos (Parabéns)', data: consConvertidos, backgroundColor: 'rgba(34,197,94,0.85)', borderRadius: 8 }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });

      // SLA
      const slaLabels = (STATE.stages || []).filter(s => String(s).toLowerCase() !== 'parabéns');
      const slaData = slaLabels.map(s => Math.round((STATE.meta?.stageAverages?.[s] || 0) / 60));
      const limiteSLA = STATE.meta?.sla?.dangerMin || SETTINGS.slaDangerMin;

      if (charts.sla) charts.sla.destroy();
      charts.sla = new Chart(document.getElementById('slaChart'), {
        type: 'bar',
        data: {
          labels: slaLabels,
          datasets: [{
            label: 'Minutos Médios na Etapa',
            data: slaData,
            backgroundColor: slaData.map(m => m >= limiteSLA ? 'rgba(239,68,68,0.85)' : 'rgba(34,197,94,0.85)'),
            borderRadius: 10
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
      });

      // LINKS ENVIADOS
      const linksMap = {};
      (STATE.cards || []).forEach(c => {
        if (String(c.fluxo || '').toLowerCase() === 'link-enviado') {
          const r = c.responsavel && c.responsavel !== '—' ? c.responsavel : null;
          if (r) { if (!linksMap[r]) linksMap[r] = 0; linksMap[r]++; }
        }
      });

      const linksLabels = Object.keys(linksMap).sort((a, b) => linksMap[b] - linksMap[a]);
      const linksData = linksLabels.map(r => linksMap[r]);

      if (charts.links) charts.links.destroy();
      charts.links = new Chart(document.getElementById('linksChart'), {
        type: 'bar',
        data: { labels: linksLabels, datasets: [{ label: 'Leads atualmente em Link-Enviado', data: linksData, backgroundColor: 'rgba(59,130,246,0.85)', borderRadius: 10 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
      });

      // CONVERSÃO POR VENDEDOR
      const convMap = {};
      (STATE.cards || []).forEach(c => {
        const r = (c.responsavel && c.responsavel !== '—') ? c.responsavel : null;
        if (!r) return;
        if (!convMap[r]) convMap[r] = { total: 0, convertidos: 0 };
        convMap[r].total++;
        if (String(c.fluxo || '').toLowerCase() === 'parabéns') convMap[r].convertidos++;
      });

      const convArr = [];
      Object.keys(convMap).forEach(r => {
        const st = convMap[r];
        if (st.total > 0) convArr.push({ nome: r, taxa: Number(((st.convertidos / st.total) * 100).toFixed(1)) });
      });

      convArr.sort((a,b) => b.taxa - a.taxa);
      const labelsOrdenadas = convArr.map(x => x.nome);
      const dataOrdenada = convArr.map(x => x.taxa);

      if (charts.conversao) charts.conversao.destroy();
      charts.conversao = new Chart(document.getElementById('conversaoChart'), {
        type: 'bar',
        data: { labels: labelsOrdenadas, datasets: [{ label: 'Taxa de Conversão', data: dataOrdenada, backgroundColor: 'rgba(34,197,94,0.85)', borderRadius: 10 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (v) => v + "%" } } }
        }
      });

      // FUNIL POR VENDEDOR (EMPILHADO)
      const repsSet = new Set();
      (STATE.cards || []).forEach(c => { if (c.responsavel && c.responsavel !== '—') repsSet.add(c.responsavel); });
      const sellersArray = Array.from(repsSet).sort();

      const stageColors = [
        'rgba(34,197,94,0.85)',
        'rgba(59,130,246,0.85)',
        'rgba(245,158,11,0.85)',
        'rgba(239,68,68,0.85)',
        'rgba(168,85,247,0.85)',
        'rgba(20,184,166,0.85)'
      ];

      const datasetsFunilVendedor = (STATE.stages || []).map((stage, index) => ({
        label: stage,
        data: sellersArray.map(seller => (STATE.cards || []).filter(c => c.fluxo === stage && c.responsavel === seller).length),
        backgroundColor: stageColors[index % stageColors.length],
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.25)'
      }));

      if (charts.funilVendedor) charts.funilVendedor.destroy();
      charts.funilVendedor = new Chart(document.getElementById('funilVendedorChart'), {
        type: 'bar',
        data: { labels: sellersArray, datasets: datasetsFunilVendedor },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: true, position: 'bottom' } },
          scales: { x: { stacked: true }, y: { stacked: true } }
        }
      });
    }

    /*********************** REPORTS (NOVA ABA) *************************/
    function renderReports(){
      const repWrap = document.getElementById("repTableWrap");
      const oriWrap = document.getElementById("originTableWrap");
      const auditBox = document.getElementById("auditBox");
      if(!repWrap || !oriWrap || !auditBox) return;

      const M = computeMetrics();

      // tabelas
      repWrap.innerHTML = buildTable_(
        ["Vendedor","Total","Ativos","Compras","Conv.%"],
        M.repsRank.slice(0, 12).map(r => [r.rep, r.total, r.active, r.won, r.conv.toFixed(1)])
      );

      oriWrap.innerHTML = buildTable_(
        ["Origem","Total","Compras","Conv.%"],
        M.originRank.slice(0, 12).map(o => [o.orig, o.total, o.won, o.conv.toFixed(1)])
      );

      // auditoria rápida (ex.: sem responsável, sem origem, sem telefone)
      const cards = (STATE.cards || []);
      const noResp = cards.filter(c => !c.responsavel || c.responsavel === '—').length;
      const noOrig = cards.filter(c => !c.origem || c.origem === '—').length;
      const noPhone = cards.filter(c => !String(c.phone || '').replace(/\D/g,'')).length;

      auditBox.innerHTML = `
        <div style="display:grid; gap:8px;">
          <div><i class="ph ph-user-minus"></i> Sem responsável: <b>${noResp}</b></div>
          <div><i class="ph ph-map-pin-line"></i> Sem origem: <b>${noOrig}</b></div>
          <div><i class="ph ph-phone-x"></i> Sem telefone: <b>${noPhone}</b></div>
        </div>
      `;
    }

    function buildTable_(headers, rows){
      const thead = `<tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
      const tbody = rows.map(r=>`<tr>${r.map(c=>`<td>${escapeHtml(String(c))}</td>`).join("")}</tr>`).join("");
      return `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
    }
    function openCreateLead(){
  MODAL.open = true;
  MODAL.mode = "create";
  MODAL.card = null;

  const overlay = document.getElementById('modalOverlay');
  const modalTitle = document.getElementById('modalTitle');
  const modalSub   = document.getElementById('modalSub');

  const fNome = document.getElementById('fNome');
  const fTelefone = document.getElementById('fTelefone');
  const fFluxo = document.getElementById('fFluxo');
  const fResp = document.getElementById('fResponsavel');
  const fOrig = document.getElementById('fOrigem');
  const fMotivo = document.getElementById('fMotivo');

  if(!overlay || !modalTitle || !modalSub || !fNome || !fTelefone || !fFluxo || !fResp || !fOrig || !fMotivo){
    showToast("Modal incompleto", "Faltam IDs no HTML do modal", "error", 5200);
    return;
  }

  modalTitle.textContent = "Novo Lead";
  modalSub.textContent = "Preencha os dados e clique em Salvar";

  fNome.value = "";
  fTelefone.value = "";
  fFluxo.value = "Inicial";
  fResp.value = "";
  fOrig.value = "";
  fMotivo.value = "";

  // WhatsApp não faz sentido no “novo”
  const waBtn = document.getElementById('waBtn');
  if(waBtn) waBtn.classList.add('hidden');

  overlay.classList.remove('hidden');
}

    /*********************** DRAG & DROP *******************************/
    function onDragOver(e){
      e.preventDefault();
      const stack = e.currentTarget;
      const col = stack.closest('.col');
      stack.classList.add('drop-hover');
      if(col) col.classList.add('drag-over');
    }

    function onDragLeave(e){
      const stack = e.currentTarget;
      const col = stack.closest('.col');
      stack.classList.remove('drop-hover');
      if(col) col.classList.remove('drag-over');
    }

    async function onDrop(e){
      e.preventDefault();
      const stack = e.currentTarget;
      const col = stack.closest('.col');
      stack.classList.remove('drop-hover');
      if(col) col.classList.remove('drag-over');

      const draggedId = e.dataTransfer.getData('text/plain');
      if(!draggedId) return;

      const newStage = stack.dataset.stage;
      const card = (STATE.cards || []).find(c => String(c.id) === String(draggedId));
      if(!card || card.fluxo === newStage) return;

      const oldStage = card.fluxo;

      // Update otimista
      card.fluxo = newStage;
      card.stageTs = Date.now();
      card.ageSec = 0;
      if(VIEW === "kanban") renderBoard();

      showToast("Lead movido", `${card.name} → ${newStage}`, "success", 2400);

      try{
        await updateCardStage(card.id, newStage);
      }catch(err){
        card.fluxo = oldStage;
        if(VIEW === "kanban") renderBoard();
        showToast("Falha ao mover", String(err.message || err), "error", 5200);
      }
    }

    /*********************** TIMERS ************************************/
    function startLiveTimers(){
      if(TIMER_HANDLE) clearInterval(TIMER_HANDLE);

      const tick = () => {
        const now = Date.now();
        document.querySelectorAll('.js-timer').forEach(el => {
          const ts = Number(el.dataset.stagets || 0);
          el.textContent = ts ? formatHMS(Math.max(0, Math.floor((now - ts) / 1000))) : '--:--:--';
        });
      };

      tick();
      TIMER_HANDLE = setInterval(tick, 1000);
    }

    /*********************** MODAL *************************************/
    function openModal(id) {
      MODAL.mode = "edit";
      const card = (STATE.cards || []).find(c => String(c.id) === String(id));
      if (!card) return;

      const modalTitle = document.getElementById('modalTitle');
      const modalSub   = document.getElementById('modalSub');
      const fResp      = document.getElementById('fResponsavel');
      const fOrig      = document.getElementById('fOrigem');
      const fMotivo    = document.getElementById('fMotivo');
      const overlay    = document.getElementById('modalOverlay');
      const waBtn      = document.getElementById('waBtn');

      if (!modalTitle || !modalSub || !fResp || !fOrig || !fMotivo || !overlay) {
        console.warn("Modal não encontrado. Verifique IDs do modal.");
        showToast("Modal não encontrado", "IDs do modal não existem no HTML", "error", 5200);
        return;
      }

      MODAL.open = true;
      MODAL.card = card;

      modalTitle.textContent = card.name || 'Lead';
      modalSub.textContent = 'Fluxo: ' + card.fluxo + ' • ID: ' + card.id;
      document.getElementById('fNome').value = card.name || '';
document.getElementById('fTelefone').value = card.phone || '';
document.getElementById('fFluxo').value = card.fluxo || 'Inicial';

      fResp.value = card.responsavel !== '—' ? (card.responsavel || '') : '';
      fOrig.value = card.origem !== '—' ? (card.origem || '') : '';
      fMotivo.value = card.motivo || '';

      if (waBtn) {
        const link = buildWaLink(card.phone);
        if (link) { waBtn.href = link; waBtn.classList.remove('hidden'); }
        else { waBtn.classList.add('hidden'); }
      }

      overlay.classList.remove('hidden');
    }
    async function acceptHandoff(id) {

  const { error } = await sb
    .from("lead_handoffs")
    .update({
      status: "aceito",
      respondido_em: new Date().toISOString()
    })
    .eq("id", id);

  if (error) {
    showToast("Erro ao aceitar", error.message, "error");
    return;
  }

  closeModal();
  reload();
}

    function closeModal(){
      const overlay = document.getElementById('modalOverlay');
      if(overlay) overlay.classList.add('hidden');
      MODAL.open = false;
      MODAL.card = null;
    }
function openHandoffModal(handoff) {
  const overlay = document.getElementById("modalOverlay");
  const modal = overlay?.querySelector(".modal"); // ✅ pega pelo class

  if(!overlay || !modal){
    showToast("Erro", "Modal não encontrado no HTML", "error");
    return;
  }

  overlay.classList.remove("hidden");

  modal.innerHTML = `
    <div class="modal-header">
      <div>
        <div class="modal-title">Novo Lead do Pré-vendas</div>
        <div class="modal-sub">Encaminhamento pendente</div>
      </div>
      <button class="iconbtn" type="button" onclick="closeModal()"><i class="ph ph-x"></i></button>
    </div>

    <div class="modal-body">
      <div class="field">
        <label>Nota</label>
        <textarea rows="5" readonly>${escapeHtml(handoff.nota || "")}</textarea>
      </div>
    </div>

    <div class="modal-footer">
      <div></div>
      <div class="modal-right">
        <button class="btn danger" onclick="rejectHandoff('${handoff.id}')">Recusar</button>
        <button class="btn primary" onclick="acceptHandoff('${handoff.id}')">Aceitar</button>
      </div>
    </div>
  `;
}
async function deleteFromModal(){
  if(!MODAL.card){
    showToast("Nenhum lead selecionado", "", "error");
    return;
  }

  const card = MODAL.card;

  const ok = confirm(
    `Excluir este lead?\n\n` +
    `${card.name}\n` +
    `ID: ${card.id}\n\n` +
    `Essa ação NÃO pode ser desfeita.`
  );
  if(!ok) return;

  // Fecha modal pra não ficar preso na tela
  closeModal();

  // otimista: remove da UI imediatamente
  const oldCards = STATE.cards.slice();
  STATE.cards = STATE.cards.filter(x => String(x.id) !== String(card.id));

  if(VIEW === "kanban") renderBoard();
  if(VIEW === "dashboard") renderDashboard();
  if(VIEW === "reports") renderReports();

  showToast("Excluindo…", card.name, "info", 1800);

  try{
    await deleteLead(card.id);

    updateMetrics();
    populateFilters();

    showToast("Excluído", card.name, "success", 2400);
  }catch(err){
    // rollback
    STATE.cards = oldCards;

    if(VIEW === "kanban") renderBoard();
    if(VIEW === "dashboard") renderDashboard();
    if(VIEW === "reports") renderReports();

    showToast("Falha ao excluir", String(err.message || err), "error", 5200);
  }
}

async function deleteLead(id){
  const { error } = await sb
    .from(KANBAN.TABLE)
    .delete()
    .eq('id', id);

  if(error) throw error;
  return { ok: true };
}
async function saveModal(){
  const fNome = document.getElementById('fNome');
  const fTelefone = document.getElementById('fTelefone');
  const fFluxo = document.getElementById('fFluxo');
  const fResp = document.getElementById('fResponsavel');
  const fOrig = document.getElementById('fOrigem');
  const fMotivo = document.getElementById('fMotivo');

  const nome = (fNome.value || "").trim();
  const telefone = (fTelefone.value || "").trim();
  const fluxo = (fFluxo.value || "Inicial").trim();

const newFields = {
  responsavel: (fResp.value || '').trim() || '—',
  origem: (fOrig.value || '').trim() || '—',
  motivo: (fMotivo.value || '').trim()
};

  // ===== MODO CRIAR =====
  if(MODAL.mode === "create"){
    if(!nome){
      showToast("Nome obrigatório", "Digite o nome do lead", "warn");
      return;
    }

    closeModal();
    showToast("Criando…", nome, "info", 1800);

    try{
const created = await createLead({
  nome,
  telefone,
  fluxo,
  responsavel: newFields.responsavel,
  origem: newFields.origem,
  motivo: newFields.motivo,
  createdRole: "prevendas"
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

      showToast("Lead criado", nome, "success", 2400);
    }catch(err){
      showToast("Falha ao criar", String(err.message || err), "error", 5200);
    }
    return;
  }

  // ===== MODO EDITAR =====
  if(!MODAL.card) return;

  const card = MODAL.card;
  const old = { responsavel: card.responsavel, origem: card.origem, motivo: card.motivo };

  // atualiza local (otimista)
  card.name = nome;
  card.phone = telefone;
  card.fluxo = fluxo;
  card.responsavel = newFields.responsavel;
  card.origem = newFields.origem;
  card.motivo = newFields.motivo;

  closeModal();
  if(VIEW === "kanban") renderBoard();
  if(VIEW === "dashboard") renderDashboard();
  if(VIEW === "reports") renderReports();

  showToast("Salvando…", card.name, "info", 1800);

  try{
    // atualiza campos + fluxo (se quiser)
    await updateCardFields(card.id, newFields);
    await updateCardStage(card.id, fluxo);
    await updateLeadCore(card.id, { nome, telefone, fluxo });

    showToast("Atualizado", "Dados do lead salvos", "success", 2200);
    populateFilters();
  }catch(err){
    // rollback
    card.responsavel = old.responsavel;
    card.origem = old.origem;
    card.motivo = old.motivo;
    showToast("Falha ao salvar", String(err.message || err), "error", 5200);
  }
}

    /*********************** SETTINGS (NOVA ABA) ************************/
    function syncSettingsUI(){
      const rs = document.getElementById("cfgRefreshSec");
      const sw = document.getElementById("cfgSlaWarn");
      const sd = document.getElementById("cfgSlaDanger");
      if(rs) rs.value = String(SETTINGS.refreshSec);
      if(sw) sw.value = String(SETTINGS.slaWarnMin);
      if(sd) sd.value = String(SETTINGS.slaDangerMin);
    }

    function applySettings(){
      const rs = document.getElementById("cfgRefreshSec");
      const sw = document.getElementById("cfgSlaWarn");
      const sd = document.getElementById("cfgSlaDanger");

      const refreshSec = Math.max(10, Number(rs?.value || SETTINGS.refreshSec));
      const slaWarnMin = Math.max(1, Number(sw?.value || SETTINGS.slaWarnMin));
      const slaDangerMin = Math.max(slaWarnMin, Number(sd?.value || SETTINGS.slaDangerMin));

      SETTINGS.refreshSec = refreshSec;
      SETTINGS.slaWarnMin = slaWarnMin;
      SETTINGS.slaDangerMin = slaDangerMin;

      // aplica em meta (sem mexer no banco)
      if(STATE.meta?.sla){
        STATE.meta.sla.warnMin = SETTINGS.slaWarnMin;
        STATE.meta.sla.dangerMin = SETTINGS.slaDangerMin;
      }

      // atualiza label do auto-refresh e reinicia timer se estiver ligado
      const auto = document.getElementById("autoRefresh");
      setAutoRefresh(Boolean(auto?.checked));

      updateMetrics();
      if(VIEW === "dashboard") renderDashboard();
      if(VIEW === "reports") renderReports();
      if(VIEW === "kanban") renderBoard();

      showToast("Configurações aplicadas", `Auto-refresh: ${SETTINGS.refreshSec}s • SLA: ${SETTINGS.slaWarnMin}/${SETTINGS.slaDangerMin}m`, "success", 3200);
    }

    function resetSettings(){
      SETTINGS.refreshSec = 30;
      SETTINGS.slaWarnMin = KANBAN.SLA.warnMin;
      SETTINGS.slaDangerMin = KANBAN.SLA.dangerMin;

      if(STATE.meta?.sla){
        STATE.meta.sla.warnMin = SETTINGS.slaWarnMin;
        STATE.meta.sla.dangerMin = SETTINGS.slaDangerMin;
      }

      syncSettingsUI();
      const auto = document.getElementById("autoRefresh");
      setAutoRefresh(Boolean(auto?.checked));
      updateMetrics();

      if(VIEW === "dashboard") renderDashboard();
      if(VIEW === "reports") renderReports();
      if(VIEW === "kanban") renderBoard();

      showToast("Resetado", "Voltou para o padrão", "info", 2600);
    }

    /*********************** COMPACT MODE (opção nova) ******************/
    function toggleCompact(){
      SETTINGS.compact = !SETTINGS.compact;
      document.body.classList.toggle("compact", SETTINGS.compact);
      showToast(SETTINGS.compact ? "Modo compacto" : "Modo normal", "", "info", 1800);
    }

    /*********************** HELPERS ***********************************/
    function safe_(v, fallback){
      const s = String(v ?? '').trim();
      return s ? s : fallback;
    }

    function buildTs(dateValue, timeValue){
      const d = normalizeDate_(dateValue);
      if(!d) return 0;

      const secs = normalizeTimeToSeconds_(timeValue);
      const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
      dt.setSeconds(secs);
      return dt.getTime();
    }

    function normalizeDate_(value){
      if(!value) return null;
      if(value instanceof Date && !isNaN(value)) return value;

      const s = String(value).trim();

      const mBR = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if(mBR) return new Date(Number(mBR[3]), Number(mBR[2]) - 1, Number(mBR[1]));

      const mUS = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if(mUS) return new Date(Number(mUS[1]), Number(mUS[2]) - 1, Number(mUS[3]));

      const d = new Date(s);
      return isNaN(d) ? null : d;
    }

    function normalizeTimeToSeconds_(value){
      if(!value) return 0;
      if(value instanceof Date && !isNaN(value)) return value.getHours() * 3600 + value.getMinutes() * 60 + value.getSeconds();

      const s = String(value).trim();
      const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if(!m) return 0;
      return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0);
    }

    function formatHora_(value){
      if(!value) return '—';
      if(value instanceof Date && !isNaN(value)){
        const hh = String(value.getHours()).padStart(2,'0');
        const mm = String(value.getMinutes()).padStart(2,'0');
        return `${hh}:${mm}`;
      }
      const s = String(value).trim();
      const m = s.match(/^(\d{1,2}):(\d{2})/);
      return m ? `${String(m[1]).padStart(2, '0')}:${m[2]}` : '—';
    }

    function formatHMS(sec){
      return String(Math.floor(sec/3600)).padStart(2,'0') + ':' +
             String(Math.floor((sec%3600)/60)).padStart(2,'0') + ':' +
             String(sec%60).padStart(2,'0');
    }

    function escapeHtml(s){
      return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    }

    function buildWaLink(phone){
      let s = String(phone || '').replace(/\D/g,'');
      if(!s || s.length < 10) return '';
      if(s.length <= 11) s = '55' + s;
      return 'https://wa.me/' + s + '?text=Ol%C3%A1!%20Vi%20seu%20cadastro%20%F0%9F%99%82';
    }

    /*********************** METRICS + EXPORT **************************/
    function isWon_(card){
      return String(card?.fluxo || '').toLowerCase() === 'parabéns';
    }
    function avg_(arr){
      const v = arr.filter(x => typeof x === 'number' && !isNaN(x));
      if(!v.length) return 0;
      return v.reduce((s,n)=>s+n,0) / v.length;
    }
    function median_(arr){
      const v = arr.filter(x => typeof x === 'number' && !isNaN(x)).sort((a,b)=>a-b);
      if(!v.length) return 0;
      const mid = Math.floor(v.length/2);
      return v.length % 2 ? v[mid] : (v[mid-1]+v[mid])/2;
    }
    function percentile_(arr, p){
      const v = arr.filter(x => typeof x === 'number' && !isNaN(x)).sort((a,b)=>a-b);
      if(!v.length) return 0;
      const idx = Math.min(v.length - 1, Math.max(0, Math.ceil((p/100)*v.length) - 1));
      return v[idx];
    }

    function computeMetrics(){
      const cards = STATE.cards || [];
      const total = cards.length;
      const won = cards.filter(isWon_);
      const wonCount = won.length;
      const activeCount = total - wonCount;
      const convRate = total ? (wonCount / total) * 100 : 0;

      const sla = STATE.meta?.sla || { warnMin: SETTINGS.slaWarnMin, dangerMin: SETTINGS.slaDangerMin };
      const warnSec = sla.warnMin * 60;
      const dangerSec = sla.dangerMin * 60;

      const activeCards = cards.filter(c => !isWon_(c));
      const slaOk = activeCards.filter(c => (c.ageSec || 0) < warnSec).length;
      const slaWarn = activeCards.filter(c => (c.ageSec || 0) >= warnSec && (c.ageSec || 0) < dangerSec).length;
      const slaDanger = activeCards.filter(c => (c.ageSec || 0) >= dangerSec).length;

      const ageMinutesActive = activeCards.map(c => Math.round((c.ageSec || 0)/60));

      const byStage = {};
      (STATE.stages || []).forEach(s => byStage[s] = 0);
      cards.forEach(c => { byStage[c.fluxo] = (byStage[c.fluxo] || 0) + 1; });

      const repMap = {};
      cards.forEach(c=>{
        const rep = (c.responsavel && c.responsavel !== '—') ? c.responsavel : 'Sem dono';
        if(!repMap[rep]) repMap[rep] = { total:0, won:0, active:0 };
        repMap[rep].total++;
        if(isWon_(c)) repMap[rep].won++;
        else repMap[rep].active++;
      });

      const repsRank = Object.entries(repMap)
        .map(([rep, st]) => ({
          rep,
          total: st.total,
          active: st.active,
          won: st.won,
          conv: st.total ? (st.won/st.total)*100 : 0
        }))
        .sort((a,b)=> b.won - a.won || b.conv - a.conv);

      const originMap = {};
      cards.forEach(c=>{
        const o = (c.origem && c.origem !== '—') ? c.origem : 'Sem origem';
        if(!originMap[o]) originMap[o] = { total:0, won:0 };
        originMap[o].total++;
        if(isWon_(c)) originMap[o].won++;
      });
      const originRank = Object.entries(originMap)
        .map(([orig, st]) => ({ orig, total: st.total, won: st.won, conv: st.total ? (st.won/st.total)*100 : 0 }))
        .sort((a,b)=> b.conv - a.conv || b.won - a.won);

      const busiest = repsRank.slice().sort((a,b)=> b.active - a.active)[0]?.rep || '—';
      const maxLoad = repsRank.slice().sort((a,b)=> b.active - a.active)[0]?.active ?? 0;

      return {
        summary: {
          total,
          activeCount,
          wonCount,
          convRate,
          slaOk,
          slaWarn,
          slaDanger,
          avgAgeActiveMin: avg_(ageMinutesActive),
          p90AgeActiveMin: percentile_(ageMinutesActive, 90),
          medianAgeActiveMin: median_(ageMinutesActive),
          busiest,
          maxLoad,
        },
        byStage,
        repsRank,
        originRank
      };
    }

    function renderMetricsGrid(){
      const grid = document.getElementById('metricsGrid');
      if(!grid) return;

      const M = computeMetrics();
      const s = M.summary;

      const metricCard = (label, value, sub='') => {
        const el = document.createElement('div');
        el.style.border = "1px solid var(--border-light)";
        el.style.borderRadius = "16px";
        el.style.padding = "12px 14px";
        el.style.background = "rgba(255,255,255,0.03)";
        el.innerHTML = `
          <div style="color:var(--text-muted); font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.5px;">${escapeHtml(label)}</div>
          <div style="font-size:18px; font-weight:900; margin-top:6px;">${escapeHtml(String(value))}</div>
          ${sub ? `<div style="color:var(--text-muted); font-size:12px; margin-top:4px;">${escapeHtml(sub)}</div>` : ``}
        `;
        return el;
      };

      grid.innerHTML = '';
      grid.appendChild(metricCard('Total de leads', s.total));
      grid.appendChild(metricCard('Ativos (em atendimento)', s.activeCount));
      grid.appendChild(metricCard('Compras (Parabéns)', s.wonCount));
      grid.appendChild(metricCard('Conversão geral', `${s.convRate.toFixed(1)}%`));
      grid.appendChild(metricCard('SLA OK / Alerta / Crítico', `${s.slaOk} / ${s.slaWarn} / ${s.slaDanger}`, `Baseado em ${STATE.meta?.sla?.warnMin ?? SETTINGS.slaWarnMin}m e ${STATE.meta?.sla?.dangerMin ?? SETTINGS.slaDangerMin}m`));
      grid.appendChild(metricCard('Idade média (ativos)', `${Math.round(s.avgAgeActiveMin)} min`));
      grid.appendChild(metricCard('Mediana (ativos)', `${Math.round(s.medianAgeActiveMin)} min`));
      grid.appendChild(metricCard('P90 (ativos)', `${Math.round(s.p90AgeActiveMin)} min`));
      grid.appendChild(metricCard('Mais carregado', s.busiest, `${s.maxLoad} leads ativos`));

      const topOrigin = M.originRank[0];
      const topRep = M.repsRank.slice().sort((a,b)=>b.won-a.won)[0];
      if(topOrigin) grid.appendChild(metricCard('Melhor origem (conv.)', `${topOrigin.orig}`, `${topOrigin.conv.toFixed(1)}% • ${topOrigin.won}/${topOrigin.total}`));
      if(topRep) grid.appendChild(metricCard('Top vendedor (compras)', `${topRep.rep}`, `${topRep.won} compras • ${topRep.conv.toFixed(1)}%`));
    }

    function exportMetrics(){
      const M = computeMetrics();

      const resumo = [{
        atualizado_em: new Date().toISOString(),
        total_leads: M.summary.total,
        ativos: M.summary.activeCount,
        compras_parabens: M.summary.wonCount,
        conversao_pct: Number(M.summary.convRate.toFixed(2)),
        sla_ok: M.summary.slaOk,
        sla_alerta: M.summary.slaWarn,
        sla_critico: M.summary.slaDanger,
        idade_media_ativos_min: Math.round(M.summary.avgAgeActiveMin),
        idade_mediana_ativos_min: Math.round(M.summary.medianAgeActiveMin),
        idade_p90_ativos_min: Math.round(M.summary.p90AgeActiveMin),
        vendedor_mais_carregado: M.summary.busiest,
        carga_max_ativos: M.summary.maxLoad
      }];

      const etapas = Object.keys(M.byStage).map(stage => ({
        etapa: stage,
        quantidade: M.byStage[stage]
      }));

      const vendedores = M.repsRank.map(r => ({
        vendedor: r.rep,
        total: r.total,
        ativos: r.active,
        compras: r.won,
        conversao_pct: Number(r.conv.toFixed(2))
      }));

      const origens = M.originRank.map(o => ({
        origem: o.orig,
        total: o.total,
        compras: o.won,
        conversao_pct: Number(o.conv.toFixed(2))
      }));

      if(window.XLSX){
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "Resumo");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(etapas), "Etapas");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(vendedores), "Vendedores");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(origens), "Origens");
        XLSX.writeFile(wb, `italiano-facil-crm-metricas-${new Date().toISOString().slice(0,10)}.xlsx`);
        showToast("Métricas exportadas", "Arquivo XLSX gerado", "success");
        return;
      }

      showToast("XLSX indisponível", "Não foi possível exportar", "error", 5200);
    }

    /*********************** EXPORT LEADS (opção nova) ******************/
    function exportLeadsXlsx(){
      const cards = (STATE.cards || []).map(c => ({
        id: c.id,
        nome: c.name,
        telefone: c.phone,
        origem: c.origem,
        responsavel: c.responsavel,
        fluxo: c.fluxo,
        motivo: c.motivo,
        stageTs: c.stageTs,
        sortTs: c.sortTs
      }));

      if(!window.XLSX){
        showToast("XLSX indisponível", "Biblioteca não carregou", "error", 5200);
        return;
      }
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cards), "Leads");
      XLSX.writeFile(wb, `italiano-facil-crm-leads-${new Date().toISOString().slice(0,10)}.xlsx`);
      showToast("Leads exportados", "Arquivo XLSX gerado", "success");
    }

// ===== EXPOSE FUNCTIONS TO HTML (onclick / ondrop etc) =====
window.sendToComercial = sendToComercial;
window.pvCreateLead = pvCreateLead;

window.onDrop = onDrop;
window.onDragOver = onDragOver;
window.onDragLeave = onDragLeave;

window.openModal = openModal;
window.closeModal = closeModal;
window.openCreateLead = openCreateLead;
window.saveModal = saveModal;
window.deleteFromModal = deleteFromModal;

window.quickWin = quickWin;
window.assignLead = assignLead;

window.rejectHandoff = rejectHandoff;
window.acceptHandoff = acceptHandoff;

window.applySettings = applySettings;
window.resetSettings = resetSettings;

window.exportMetrics = exportMetrics;
window.exportLeadsXlsx = exportLeadsXlsx;

window.toggleView = toggleView;
window.setView = setView;
window.toggleCompact = toggleCompact;
window.openCreateLead = openCreateLead;
window.reload = reload;
window.toggleView = toggleView;

window.pvCreateLead = pvCreateLead;

window.exportLeadsXlsx = exportLeadsXlsx;

window.closeModal = closeModal;
window.saveModal = saveModal;
window.deleteFromModal = deleteFromModal;

window.assignLead = assignLead;
window.sendToComercial = sendToComercial;
window.acceptHandoff = acceptHandoff;
window.rejectHandoff = rejectHandoff;
