function unfoldLines(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const lines = [];
  for (const line of raw) {
    if (!line) continue;
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function parseLocalDateTime(compact) {
  // YYYYMMDDTHHMMSS or YYYYMMDDTHHMM
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/.exec(compact);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6] || '0');
  return new Date(year, month, day, hour, minute, second);
}

function parseDateOnly(compact) {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(compact);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  return new Date(year, month, day, 0, 0, 0);
}

function toPgTimestampLocal(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function parseDateValue(v) {
  const value = String(v || '').trim();
  if (!value) return { date: null, isAllDay: false };

  if (value.endsWith('Z') && value.includes('T')) {
    const d = new Date(value.replace(/^(\d{4})(\d{2})(\d{2})T/, '$1-$2-$3T'));
    if (Number.isNaN(d.getTime())) return { date: null, isAllDay: false };
    return { date: toPgTimestampLocal(d), isAllDay: false };
  }

  if (value.includes('T')) {
    const d = parseLocalDateTime(value);
    if (!d) return { date: null, isAllDay: false };
    return { date: toPgTimestampLocal(d), isAllDay: false };
  }

  const d = parseDateOnly(value);
  if (!d) return { date: null, isAllDay: false };
  return { date: toPgTimestampLocal(d), isAllDay: true };
}

function parseProp(line) {
  const idx = line.indexOf(':');
  if (idx === -1) return null;
  const left = line.slice(0, idx);
  const value = line.slice(idx + 1);
  const [name] = left.split(';');
  return { name: name.toUpperCase(), value };
}

export function parseIcs(text) {
  const lines = unfoldLines(text);
  const events = [];

  let current = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current && current.uid && current.dtstart) {
        events.push(current);
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const prop = parseProp(line);
    if (!prop) continue;

    switch (prop.name) {
      case 'UID':
        current.uid = prop.value.trim();
        break;
      case 'SUMMARY':
        current.summary = prop.value.trim();
        break;
      case 'DESCRIPTION':
        current.description = prop.value.trim();
        break;
      case 'DTSTART': {
        const { date, isAllDay } = parseDateValue(prop.value);
        current.dtstart = date;
        if (isAllDay) current.isAllDay = true;
        break;
      }
      case 'DTEND': {
        const { date, isAllDay } = parseDateValue(prop.value);
        current.dtend = date;
        if (isAllDay) current.isAllDay = true;
        break;
      }
      default:
        break;
    }
  }

  return events.map((e) => ({
    external_uid: e.uid,
    title: e.summary || 'Imported event',
    description: e.description || null,
    start_datetime: e.dtstart,
    end_datetime: e.dtend || e.dtstart,
    is_all_day: Boolean(e.isAllDay),
  }));
}

