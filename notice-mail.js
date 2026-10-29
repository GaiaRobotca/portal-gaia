(function (root) {
  "use strict";
  const emailApi = typeof module === 'object' ? require('./email-queue.js') : root.GaiaEmail;
  const sectors = {
    adm: "ADM",
    gestao: "Gestão",
    estrutura: "Estrutura",
    eletronica: "Eletrônica",
    programacao: "Programação",
    marketing: "Marketing",
    trainees: "Trainees",
  };
  function matches(m, sector) {
    if (!m || m.active === false) return false;
    if (["all", "both"].includes(sector)) return true;
    if (sector === "adm") return m.isAdmin === true || m.team === "adm";
    if (sector === "trainees") return m.isTrainee === true;
    return (Array.isArray(m.sectors) ? m.sectors : [m.team]).includes(sector);
  }
  function summary(deliveries = {}) {
    const result = {
      sent: 0,
      failed: 0,
      missing: 0,
      unknown: 0,
      sending: 0,
      duplicate: 0,
    };
    for (const d of Object.values(deliveries))
      if (d.status in result) result[d.status]++;
    return result;
  }
  async function deliver({
    notice,
    members,
    update,
    send,
    validEmail,
    now = Date.now,
  }) {
    const seen = new Set(Object.values(notice.emailDelivery || {})
      .filter(d => ["sent", "sending", "unknown"].includes(d.status))
      .map(d => String(d.address || "").trim().toLowerCase()));
    for (const m of members.filter((m) => matches(m, notice.team))) {
      const address = String(m.email || "")
        .trim()
        .toLowerCase();
      const excluded = !validEmail(address)
        ? "missing"
        : seen.has(address)
          ? "duplicate"
          : "";
      if (!excluded) seen.add(address);
      let reserved = false;
      await update(notice.id, (n) => {
        reserved = false;
        const old = n.emailDelivery?.[m.id];
        if (old && ["sent", "sending", "unknown"].includes(old.status)) return;
        if (old?.attempts >= 3) return;
        reserved = !excluded;
        return {
          ...n,
          emailDelivery: {
            ...n.emailDelivery,
            [m.id]: {
              name: m.name,
              address,
              status: excluded || "sending",
              attempts: (old?.attempts || 0) + (excluded ? 0 : 1),
              updatedAt: now(),
            },
          },
        };
      });
      if (!reserved) continue;
      let accepted = false;
      try {
        await send(m, notice);
        accepted = true;
        await update(notice.id, (n) => ({
          ...n,
          emailDelivery: {
            ...n.emailDelivery,
            [m.id]: {
              ...n.emailDelivery[m.id],
              status: "sent",
              provider: "emailjs",
              updatedAt: now(),
            },
          },
        }));
      } catch (e) {
        const status = accepted
          ? "sent"
          : Number(e?.status) >= 400 && Number(e?.status) < 500
            ? "failed"
            : "unknown";
        await update(notice.id, (n) => ({
          ...n,
          emailDelivery: {
            ...n.emailDelivery,
            [m.id]: {
              ...n.emailDelivery[m.id],
              status,
              error: emailApi.describeError(e).message,
              errorCode: emailApi.describeError(e).code,
              provider: "emailjs",
              updatedAt: now(),
            },
          },
        }));
      }
    }
  }
  const api = { sectors, matches, summary, deliver };
  if (typeof module === "object") {
    module.exports = api;
    return;
  }
  root.GaiaNoticeMail = api;
  const escape = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  for (const id of ["no-team", "cal-alert-team"]) {
    const select = document.getElementById(id);
    if (!select) continue;
    select.multiple = false;
    select.size = 1;
    select.innerHTML =
      '<option value="all">Todos os setores</option>' +
      Object.entries(sectors)
        .map(([id, label]) => `<option value="${id}">${label}</option>`)
        .join("");
    const label = select.parentElement.querySelector("label");
    if (label) label.textContent = "Setor";
  }
  async function update(id, fn) {
    const result = await DB.child("notices").transaction((items) => {
      const list = items || [],
        index = list.findIndex((n) => n?.id === id);
      if (index < 0) throw Error("Aviso não encontrado");
      const next = fn(list[index]);
      if (next === undefined) return;
      const copy = list.slice();
      copy[index] = next;
      return copy;
    });
    if (result.snapshot) NOT = (result.snapshot.val() || []).filter(Boolean);
    if (document.getElementById("notices-list")) renderNotices();
    return result;
  }
  const queue = portalEmailQueue;
  let busy = false;
  const routeRef = id => firebase.database().ref('gaia_notice_routes/' + id);
  root.configureGmailFallback = function () {
    if (!CU?.isAdmin) return;
    const value = prompt('URL do aplicativo Apps Script do Gaia (acesso: somente a conta Gaia):', localStorage.getItem('gaiaGmailFallbackUrl') || '');
    if (value === null) return;
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(value.trim()))
      return toast('Informe uma URL válida de implantação do Apps Script, terminada em /exec.', 'err');
    localStorage.setItem('gaiaGmailFallbackUrl', value.trim());
    toast('Reserva Gmail configurada neste navegador.');
  };
  root.openGmailFallback = function (id) {
    if (!CU?.isAdmin) return;
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return toast('ID de aviso inválido.', 'err');
    const url = localStorage.getItem('gaiaGmailFallbackUrl') || '';
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url))
      return toast('Use Configurar reserva Gmail no mural primeiro.', 'warn');
    // Only the notice ID leaves the portal. Recipients/content are read on the server.
    window.open(url + '?notice=' + encodeURIComponent(id), '_blank', 'noopener,noreferrer');
  };
  root.addEventListener("beforeunload", (event) => {
    if (busy) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  root.sendNoticeMail = async function (id) {
    if (busy) throw Error("Aguarde o envio atual");
    if (!CU?.isAdmin) throw Error("Apenas administradores podem enviar avisos");
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw Error("ID de aviso inválido");
    const notice = NOT.find((n) => n.id === id);
    if (!notice) throw Error("Aviso não encontrado");
    const config = { ...ECFG };
    if (!config.serviceId || !config.templateId || !config.publicKey)
      throw Error("Configure o EmailJS antes do envio");
    busy = true;
    let routeOwned = false;
    try {
      // A permanent Gmail handoff and a primary batch must never run together.
      const route = await routeRef(id).transaction(current => {
        if (current?.provider === 'apps-script' || current?.status === 'sending') return;
        return {provider:'emailjs', status:'sending', updatedAt:Date.now()};
      });
      if (!route.committed) throw Error('Este aviso está em envio ou foi transferido ao Gmail. Confira a reserva Gmail.');
      routeOwned = true;
      await deliver({
        notice,
        members: M,
        update,
        validEmail: GaiaEmail.validEmail,
        send: (member, n) =>
          queue.enqueue(config, {
            to_email: member.email,
            to_name: member.name,
            notice_title: n.title,
            notice_body: n.body,
            notice_type: n.type,
            portal_name: "Portal Gaia · UFTM",
          }),
      });
      const totals = summary(NOT.find((n) => n.id === id)?.emailDelivery);
      console.info('[email] provider=emailjs sent=' + totals.sent + ' failed=' + totals.failed + ' missing=' + totals.missing + ' unknown=' + (totals.unknown + totals.sending));
      toast(
        !Object.keys(NOT.find(n => n.id === id)?.emailDelivery || {}).length
          ? 'Nenhum membro encontrado para o setor.'
          : !totals.sent && !totals.failed && !totals.unknown && !totals.sending
            ? 'Nenhum e-mail válido encontrado para envio.'
            : `${totals.sent} aceitos pelo serviço · ${totals.failed} falhas · ${totals.missing} sem e-mail · ${totals.unknown + totals.sending} a conferir`,
        !totals.sent || totals.failed || totals.unknown || totals.sending ? "warn" : "ok",
      );
      return totals;
    } finally {
      busy = false;
      if (routeOwned) await routeRef(id).set({provider:'emailjs', status:'idle', updatedAt:Date.now()});
      renderNotices();
    }
  };
  root.retryNoticeMail = async (id) => {
    try {
      await root.sendNoticeMail(id);
    } catch (e) {
      toast(e.message, "err");
    }
  };
  root.publishNotice = async function () {
    if (busy) return toast("Aguarde o envio atual", "warn");
    try {
      if (!CU?.isAdmin) throw Error("Sem permissão");
      const title = el("no-title").value.trim(),
        body = el("no-body").value.trim(),
        team = el("no-team").value,
        shouldEmail = el("no-email").checked;
      if (!title || !body) throw Error("Preencha título e mensagem");
      if (team !== "all" && !sectors[team])
        throw Error("Selecione um setor válido");
      const notice = {
        id: "n" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
        title,
        body,
        team,
        type: el("no-type").value,
        author: CU.name,
        createdById: CU.id,
        date: todayStr(),
        emailRequested: shouldEmail,
        emailDelivery: {},
      };
      const saved = await DB.child("notices").transaction((items) =>
        (items || []).concat(notice),
      );
      if (!saved.committed) throw Error("Não foi possível publicar o aviso");
      NOT = (saved.snapshot.val() || []).filter(Boolean);
      closeModal("modal-notice");
      el("no-title").value = "";
      el("no-body").value = "";
      renderNotices();
      toast("Aviso publicado.");
      if (shouldEmail) await root.sendNoticeMail(notice.id);
    } catch (e) {
      toast(e.message, "err");
    }
  };
  root.renderNotices = function () {
    Object.assign(el("notices-btn").style, {display:'flex', gap:'6px', flexWrap:'wrap', marginRight:'44px'});
    el("notices-btn").innerHTML = CU?.isAdmin
      ? '<button class="btn btn-blue btn-sm" onclick="openModal(\'modal-notice\')">+ Publicar</button> <button class="btn btn-sm" onclick="configureGmailFallback()">Configurar reserva Gmail</button>'
      : "";
    const member = M.find((m) => m.id === CU?.id);
    const list = NOT.filter(
      (n) => !n.deleted && (CU?.isAdmin || matches(member, n.team || "all")),
    )
      .slice()
      .reverse();
    el("notices-list").innerHTML = list.length
      ? list
          .map((n) => {
            const totals = summary(n.emailDelivery),
              ids = Object.keys(n.emailDelivery || {});
            const status = ids.length
              ? `${totals.sent} aceitos pelo serviço · ${totals.failed} falhas · ${totals.missing} sem e-mail · ${totals.unknown + totals.sending} a conferir${totals.duplicate ? " · " + totals.duplicate + " endereços repetidos" : ""}`
              : n.emailSent
                ? "Envio antigo sem confirmação por destinatário"
                : n.emailRequested
                  ? "Envio pendente"
                  : "Sem envio por e-mail";
            const details =
              CU?.isAdmin && ids.length
                ? "<details><summary>Resultado por destinatário</summary>" +
                  Object.values(n.emailDelivery)
                    .map(
                      (d) =>
                        `${escape(d.name)}: ${escape({ sent: "aceito pelo serviço", failed: "falha", missing: "sem e-mail válido", unknown: "resultado incerto", sending: "em envio / conferir resultado", duplicate: "endereço repetido" }[d.status] || d.status)}${d.provider ? ' (' + escape(d.provider) + ')' : ''}${d.error ? " — " + escape(d.error) : ""}`,
                    )
                    .join("<br>") +
                  "</details>" + (/^[A-Za-z0-9_-]{1,100}$/.test(n.id) ? `<button class="btn btn-sm" onclick="openGmailFallback('${n.id}')">Reserva Gmail</button>` : '')
                : "";
            return `<div class="notice ${["info", "evento", "geral", "urgente"].includes(n.type) ? n.type : "info"}"><span class="notice-type">${escape({ info: "Informação", evento: "Evento", geral: "Geral", urgente: "Urgente" }[n.type] || "Informação")} · ${escape(sectors[n.team] || "Todos os setores")}</span><div class="notice-title">${escape(n.title)}</div><div class="notice-body" style="white-space:pre-wrap">${escape(n.body)}</div><div class="notice-meta">Por ${escape(n.author)} · ${escape(fmtDate(n.date))}</div><p>${status}</p>${details}${CU?.isAdmin ? `<button class="btn btn-sm" onclick="retryNoticeMail('${escape(n.id)}')">Enviar pendentes</button> <button class="btn btn-sm" onclick="deleteNotice('${escape(n.id)}')">Excluir</button>` : ""}</div>`;
          })
          .join("")
      : '<div class="empty">Nenhum aviso ainda.</div>';
  };
})(typeof window === "undefined" ? globalThis : window);
