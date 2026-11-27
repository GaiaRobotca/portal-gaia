/* Attendance data and reporting helpers shared by the portal and offline tests. */
const GaiaAttendance = (() => {
  const dateFormat = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  });

  function today(now = new Date()) {
    const parts = Object.fromEntries(dateFormat.formatToParts(now).map(p => [p.type, p.value]));
    return parts.year + '-' + parts.month + '-' + parts.day;
  }

  function validDate(value) {
    if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
  }

  function monthsAgo(end, months) {
    const date = new Date(end + 'T00:00:00Z');
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - months);
    const last = new Date(date);
    last.setUTCMonth(last.getUTCMonth() + 1, 0);
    date.setUTCDate(Math.min(day, last.getUTCDate()));
    return date.toISOString().slice(0, 10);
  }

  function period(kind, start, end, records, now = new Date()) {
    if (['1', '6', '12'].includes(kind)) {
      end = today(now);
      start = monthsAgo(end, Number(kind));
    } else if (kind === 'all') {
      const dates = records.map(a => a.date).filter(validDate).sort();
      start = dates[0] || today(now);
      end = dates.at(-1) || start;
    } else if (kind !== 'custom') {
      throw new Error('Selecione um período.');
    }
    if (!validDate(start) || !validDate(end) || start > end) {
      throw new Error('Informe um intervalo válido, com a data inicial até a data final.');
    }
    return { start, end };
  }

  function register(data, record) {
    if (!data?.members) return;
    const admin = data.members.find(m => m?.id === record.byId);
    if (!admin?.isAdmin) return;
    const attendance = data.attendance || [];
    if (attendance.some(a => a.id === record.id)) return data;
    const roster = new Map(data.members.filter(Boolean).map(m => [m.id, m]));
    const memberIds = [...new Set(record.members)];
    if (!memberIds.length || memberIds.some(id => !roster.has(id))) return;
    const participants = memberIds.map(id => {
      const m = roster.get(id);
      return { id, name: m.name, team: m.team || '', role: m.role || '' };
    });
    const saved = { ...record, by: admin.name, members: memberIds, participants,
      memberNames: participants.map(m => m.name) };
    const selected = new Set(memberIds);
    return {
      ...data,
      members: data.members.map(m => m && selected.has(m.id)
        ? { ...m, hours: (Number(m.hours) || 0) + record.hours } : m),
      attendance: [...attendance, saved],
      hoursLog: [...(data.hoursLog || []), ...participants.map(m => ({
        attendanceId: record.id, memberId: m.id, memberName: m.name, op: 'add',
        delta: record.hours, reason: 'Presença: ' + (record.desc || record.date),
        date: record.date, by: admin.name
      }))]
    };
  }

  function report(records, roster, { start, end }, label) {
    const current = new Map(roster.map(m => [m.id, m]));
    const members = new Map();
    const details = [];
    const activities = [];
    const seen = new Set();
    const sorted = records.filter(a => validDate(a.date) && a.date >= start && a.date <= end)
      .sort((a, b) => a.date.localeCompare(b.date));
    for (const a of sorted) {
      const hours = Number(a.hours);
      if (!Number.isFinite(hours) || hours <= 0 || (a.id && seen.has(a.id))) continue;
      if (a.id) seen.add(a.id);
      const snapshot = new Map((a.participants || []).map(m => [m.id, m]));
      const ids = [...new Set((a.members || []).filter(Boolean))];
      const description = a.desc || 'Reunião';
      for (const id of ids) {
        const history = snapshot.get(id);
        const active = current.get(id);
        const name = history?.name || a.memberNames?.[a.members.indexOf(id)] || active?.name || id;
        const team = active?.team || history?.team;
        const previous = members.get(id);
        members.set(id, {
          name: active?.name || name, id, team: team ? label(team) : previous?.team || '',
          role: active?.role || history?.role || previous?.role || '',
          count: (previous?.count || 0) + 1, hours: (previous?.hours || 0) + hours
        });
        details.push([a.date, description, name, id, hours, a.by || '', a.id || '']);
      }
      activities.push([a.date, description, hours, ids.length, hours * ids.length, a.by || '']);
    }
    const summary = [...members.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id)
    ).map(m => [m.name, m.id, m.team, m.role, m.count, m.hours, start, end]);
    return { summary, details, activities };
  }

  function workbook(ExcelJS, data) {
    const book = new ExcelJS.Workbook();
    function sheet(name, headers, widths, dates, rows) {
      const tab = book.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
      tab.columns = headers.map((header, i) => ({ header, width: widths[i] }));
      const heading = tab.getRow(1);
      heading.height = 26;
      heading.eachCell((cell, column) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid',
          fgColor: { argb: column === 1 ? 'FF007A3F' : 'FF001A7F' } };
      });
      for (const row of rows) {
        tab.addRow(row.map((value, i) => dates.includes(i + 1) ? new Date(value + 'T00:00:00Z') : value));
      }
      for (const col of dates) tab.getColumn(col).numFmt = 'dd/mm/yyyy';
      tab.autoFilter = { from: { row: 1, column: 1 }, to: { row: tab.rowCount, column: headers.length } };
    }
    sheet('Resumo de horas', ['Nome completo', 'ID do membro', 'Setor', 'Cargo', 'Presenças',
      'Total de horas', 'Data inicial', 'Data final'], [36, 23, 20, 25, 14, 17, 16, 16], [7, 8], data.summary);
    sheet('Histórico detalhado', ['Data da atividade', 'Descrição', 'Participante', 'ID do participante',
      'Horas', 'Responsável', 'ID do registro'], [21, 48, 36, 23, 12, 32, 30], [1], data.details);
    sheet('Resumo das atividades', ['Data', 'Descrição', 'Duração (h)', 'Participantes',
      'Horas-pessoa', 'Responsável'], [16, 48, 16, 17, 17, 32], [1], data.activities);
    return book;
  }

  return { today, validDate, period, register, report, workbook };
})();
if (typeof module === 'object' && module.exports) module.exports = GaiaAttendance;
