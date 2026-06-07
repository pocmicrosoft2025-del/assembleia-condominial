const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const multer  = require('multer');
const { v4: uuidv4 } = require('uuid');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { maxHttpBufferSize: 10 * 1024 * 1024 });

const PORT           = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DATA_FILE      = path.join(__dirname, 'data.json');
const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000;
const ADMIN_LOGIN_MAX_ATTEMPTS = 5;
const ADMIN_LOGIN_LOCK_MS = 15 * 60 * 1000;

// ─── Estado em memória ────────────────────────────────────────────────────────
// units[]:  { id, number, ownerName, ownerCpf,
//             authorizedVoter: { name, cpf, isOwner, hasProxy } }
// pautas[]: { id, order, title, description, quorum, timerMinutes,
//             status, timerEnd, result, resultDetail }
// voters{}:  voterId → { id, name, cpf, unitIds:[{unitId,isOwner,hasProxy}] }
// votes{}:   pautaId → { unitId: { vote, voterId, hasProxy, unitNumber,
//                                  voterName, timestamp } }
// proxies{}: unitId  → { fileName, mimeType, data(base64), uploadedAt }

let state = {
  assembly    : null,
  units       : [],
  pautas      : [],
  voters      : {},
  votes       : {},
  proxies     : {},
  adminSockets: new Set(),
  pautaTimers : {},
  adminSessions: new Map(),
  adminLoginAttempts: new Map(),
};

// ─── Persistência ─────────────────────────────────────────────────────────────
function saveState() {
  try {
    const { adminSockets, pautaTimers, adminSessions, ...toSave } = state;
    fs.writeFileSync(DATA_FILE, JSON.stringify(toSave, null, 2));
  } catch (e) { console.error('Erro ao salvar estado:', e.message); }
}

function loadState() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      Object.assign(state, data);
      console.log('✅  Estado anterior carregado de data.json');
    }
  } catch (e) { console.error('Erro ao carregar estado:', e.message); }
}
loadState();

// ─── Multer ───────────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits : { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = ['application/pdf','image/jpeg','image/png','image/jpg'];
    ok.includes(file.mimetype) ? cb(null, true)
      : cb(new Error('Formato não permitido. Use PDF, JPG ou PNG.'));
  },
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}
function createAdminToken() {
  const token = crypto.randomBytes(32).toString('hex');
  state.adminSessions.set(token, Date.now() + ADMIN_SESSION_MS);
  return token;
}
function isAdmin(req) {
  const token = req.headers['x-admin-token'];
  if (!token || !state.adminSessions.has(token)) return false;
  const expiresAt = state.adminSessions.get(token);
  if (expiresAt < Date.now()) {
    state.adminSessions.delete(token);
    return false;
  }
  state.adminSessions.set(token, Date.now() + ADMIN_SESSION_MS);
  return true;
}
function normCpf(cpf) {
  return (cpf || '').replace(/\D/g, '');
}
function isAdminToken(token) {
  if (!token || !state.adminSessions.has(token)) return false;
  const expiresAt = state.adminSessions.get(token);
  if (expiresAt < Date.now()) {
    state.adminSessions.delete(token);
    return false;
  }
  state.adminSessions.set(token, Date.now() + ADMIN_SESSION_MS);
  return true;
}
function getClientKey(req) {
  const forwarded = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket.remoteAddress || req.ip || 'unknown';
}
function getLoginAttempt(key) {
  const current = state.adminLoginAttempts.get(key);
  if (!current) return { count: 0, lockedUntil: 0 };
  if (current.lockedUntil && current.lockedUntil <= Date.now()) {
    state.adminLoginAttempts.delete(key);
    return { count: 0, lockedUntil: 0 };
  }
  return current;
}
function formatRemainingLock(ms) {
  const minutes = Math.ceil(ms / 60000);
  return `${minutes} minuto${minutes === 1 ? '' : 's'}`;
}
function publicUnits() {
  return state.units.map(u => ({
    id: u.id,
    number: u.number,
  }));
}
function publicPautas() {
  return state.pautas.map(p => ({ ...p }));
}
function publicAssembly() {
  return state.assembly ? { ...state.assembly } : null;
}
function statePayload(includePrivate = false) {
  return {
    assembly: publicAssembly(),
    units   : includePrivate ? state.units : publicUnits(),
    pautas  : publicPautas(),
  };
}
function getPresentUnitIds() {
  const ids = new Set();
  Object.values(state.voters || {}).forEach(voter => {
    (voter.unitIds || []).forEach(u => ids.add(u.unitId));
  });
  return ids;
}
function getExistingVotesForUnits(unitIds) {
  const unitIdSet = new Set(unitIds);
  const existing = {};
  Object.entries(state.votes || {}).forEach(([pautaId, votesByUnit]) => {
    Object.entries(votesByUnit || {}).forEach(([unitId, vote]) => {
      if (unitIdSet.has(unitId)) {
        if (!existing[pautaId]) existing[pautaId] = {};
        existing[pautaId][unitId] = vote.vote;
      }
    });
  });
  return existing;
}
function getMissingProxyUnits() {
  return state.units.filter(u => u.authorizedVoter?.isOwner === false && !state.proxies[u.id]);
}
function resultPayload(includePrivate = false) {
  const results = {};
  state.pautas.forEach(p => {
    const pVotes    = state.votes[p.id] || {};
    const vals      = Object.values(pVotes);
    const sim       = vals.filter(v => v.vote === 'Sim').length;
    const nao       = vals.filter(v => v.vote === 'Não').length;
    const abstencao = vals.filter(v => v.vote === 'Abstenção').length;
    results[p.id]   = {
      pautaId     : p.id,
      title       : p.title,
      quorum      : p.quorum,
      status      : p.status,
      result      : p.result      || null,
      resultDetail: p.resultDetail || null,
      timerEnd    : p.timerEnd    || null,
      sim, nao, abstencao,
      total       : sim + nao + abstencao,
    };
    if (includePrivate) results[p.id].votes = pVotes;
  });
  return results;
}

function calculatePautaResult(pauta) {
  const pVotes     = state.votes[pauta.id] || {};
  const vals       = Object.values(pVotes);
  const sim        = vals.filter(v => v.vote === 'Sim').length;
  const nao        = vals.filter(v => v.vote === 'Não').length;
  const abstencao  = vals.filter(v => v.vote === 'Abstenção').length;
  const total      = sim + nao + abstencao;
  const totalUnits = state.units.length;
  let approved = false, needed = 0, criterion = '';

  switch (pauta.quorum) {
    case 'simples':
      needed    = Math.floor((sim + nao) / 2) + 1;
      approved  = sim > nao;
      criterion = 'Maioria simples (Sim > Não)';
      break;
    case '2/3':
      needed    = Math.ceil(totalUnits * 2 / 3);
      approved  = sim >= needed;
      criterion = `2/3 das unidades (mín. ${needed} de ${totalUnits})`;
      break;
    case 'unanimidade':
      needed    = totalUnits;
      approved  = sim === totalUnits && nao === 0 && abstencao === 0;
      criterion = `Unanimidade (${totalUnits} de ${totalUnits})`;
      break;
  }
  return {
    result      : approved ? 'aprovado' : 'rejeitado',
    resultDetail: { sim, nao, abstencao, total, needed, quorumType: pauta.quorum, criterion },
  };
}

function computeResults() {
  return resultPayload(true);
}

function broadcastResults() {
  io.emit('results_update', resultPayload(false));
  state.adminSockets.forEach(sid => io.to(sid).emit('results_update', resultPayload(true)));
}
function broadcastState()   {
  io.emit('state_sync', statePayload(false));
  state.adminSockets.forEach(sid => io.to(sid).emit('state_sync', statePayload(true)));
}

// ─── Admin: login ─────────────────────────────────────────────────────────────
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const clientKey = getClientKey(req);
  const attempt = getLoginAttempt(clientKey);

  if (attempt.lockedUntil && attempt.lockedUntil > Date.now()) {
    const remainingMs = attempt.lockedUntil - Date.now();
    return res.status(429).json({
      error: `Muitas tentativas incorretas. Tente novamente em ${formatRemainingLock(remainingMs)}.`,
      locked: true,
      retryAfterMs: remainingMs,
    });
  }

  if (password === ADMIN_PASSWORD) {
    state.adminLoginAttempts.delete(clientKey);
    res.json({ success: true, token: createAdminToken() });
  } else {
    const nextCount = attempt.count + 1;
    const lockedUntil = nextCount >= ADMIN_LOGIN_MAX_ATTEMPTS ? Date.now() + ADMIN_LOGIN_LOCK_MS : 0;
    state.adminLoginAttempts.set(clientKey, { count: nextCount, lockedUntil });

    if (lockedUntil) {
      return res.status(429).json({
        error: `Senha incorreta. Limite de tentativas atingido. Tente novamente em ${formatRemainingLock(ADMIN_LOGIN_LOCK_MS)}.`,
        locked: true,
        attemptsRemaining: 0,
        retryAfterMs: ADMIN_LOGIN_LOCK_MS,
      });
    }

    res.status(401).json({
      error: `Senha incorreta. Tentativas restantes: ${ADMIN_LOGIN_MAX_ATTEMPTS - nextCount}.`,
      attemptsRemaining: ADMIN_LOGIN_MAX_ATTEMPTS - nextCount,
    });
  }
});

app.get('/api/assembly', (req, res) => {
  if (isAdmin(req)) return res.json(state.assembly);
  res.json(publicAssembly());
});

// ─── Assembleia ───────────────────────────────────────────────────────────────
app.post('/api/assembly', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  const { name, date, description, location, quorumInstall } = req.body;
  if (!name || !date)
    return res.status(400).json({ error: 'Nome e data são obrigatórios' });

  // Cancela timers pendentes
  Object.values(state.pautaTimers).forEach(t => clearTimeout(t));

  state.assembly = {
    id           : uuidv4(),
    name, date,
    description  : description  || '',
    location     : location     || '',
    quorumInstall: quorumInstall || 25,
    accessCode   : generateCode(),
    status       : 'setup',
    createdAt    : new Date().toISOString(),
  };
  state.units = []; state.pautas = []; state.voters = {};
  state.votes = {}; state.proxies = {}; state.pautaTimers = {};

  broadcastState(); saveState();
  res.json(state.assembly);
});

app.put('/api/assembly', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  if (!state.assembly) return res.status(404).json({ error: 'Assembleia não criada' });
  const { name, date, description, location, quorumInstall } = req.body;
  if (name)                          state.assembly.name          = name;
  if (date)                          state.assembly.date          = date;
  if (description  !== undefined)    state.assembly.description   = description;
  if (location     !== undefined)    state.assembly.location      = location;
  if (quorumInstall !== undefined)   state.assembly.quorumInstall = quorumInstall;
  broadcastState(); saveState();
  res.json(state.assembly);
});

app.post('/api/assembly/regenerate-code', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  if (!state.assembly) return res.status(404).json({ error: 'Assembleia não criada' });
  state.assembly.accessCode = generateCode();
  broadcastState(); saveState();
  res.json({ accessCode: state.assembly.accessCode });
});

app.post('/api/assembly/open', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  if (!state.assembly) return res.status(404).json({ error: 'Assembleia não criada' });

  const missingProxyUnits = getMissingProxyUnits();
  if (missingProxyUnits.length) {
    return res.status(400).json({
      error: `Há representante sem procuração anexada: unidade(s) ${missingProxyUnits.map(u => u.number).join(', ')}.`,
      missingProxyUnits: missingProxyUnits.map(u => ({ id: u.id, number: u.number })),
    });
  }

  const present     = getPresentUnitIds().size;
  const minRequired = Math.ceil(state.units.length * (state.assembly.quorumInstall / 100));

  if (present < minRequired && state.units.length > 0) {
    return res.status(400).json({
      error   : `Quórum de instalação não atingido. Necessário: ${minRequired} unidades presentes. Presentes: ${present}.`,
      required: minRequired,
      present,
      quorumWarning: true,
    });
  }
  state.assembly.status = 'open';
  broadcastState(); saveState();
  res.json({ status: 'open' });
});

// Abre mesmo sem quórum (decisão do admin)
app.post('/api/assembly/force-open', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  if (!state.assembly) return res.status(404).json({ error: 'Assembleia não criada' });
  state.assembly.status = 'open';
  broadcastState(); saveState();
  res.json({ status: 'open' });
});

app.post('/api/assembly/close', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  if (!state.assembly) return res.status(404).json({ error: 'Assembleia não criada' });

  state.assembly.status = 'closed';
  state.pautas.forEach(p => {
    if (p.status === 'open') {
      if (state.pautaTimers[p.id]) {
        clearTimeout(state.pautaTimers[p.id]);
        delete state.pautaTimers[p.id];
      }
      p.status   = 'closed';
      p.timerEnd = null;
      const r    = calculatePautaResult(p);
      p.result   = r.result; p.resultDetail = r.resultDetail;
    }
  });
  broadcastState(); broadcastResults(); saveState();
  res.json({ status: 'closed' });
});

// ─── Unidades ─────────────────────────────────────────────────────────────────
app.get('/api/units', (req, res) => {
  res.json(isAdmin(req) ? state.units : publicUnits());
});

app.post('/api/units', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  const { number, ownerName, ownerCpf, voterName, voterCpf, isOwner } = req.body;
  if (!number || !ownerName || !ownerCpf)
    return res.status(400).json({ error: 'Número, nome e CPF do proprietário são obrigatórios' });
  if (state.units.find(u => u.number === String(number)))
    return res.status(400).json({ error: `Unidade ${number} já cadastrada` });

  const ownerIsVoter = isOwner !== false;
  if (!ownerIsVoter && (!voterName || !voterCpf))
    return res.status(400).json({ error: 'Nome e CPF do representante são obrigatórios' });
  const unit = {
    id: uuidv4(),
    number   : String(number),
    ownerName, ownerCpf,
    authorizedVoter: {
      name    : ownerIsVoter ? ownerName : (voterName || ''),
      cpf     : ownerIsVoter ? ownerCpf  : (voterCpf  || ''),
      isOwner : ownerIsVoter,
      hasProxy: false,
    },
  };
  state.units.push(unit);
  broadcastState(); saveState();
  res.json(unit);
});

app.put('/api/units/:id', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  const unit = state.units.find(u => u.id === req.params.id);
  if (!unit) return res.status(404).json({ error: 'Unidade não encontrada' });

  const { ownerName, ownerCpf, voterName, voterCpf, isOwner } = req.body;
  if (ownerName) unit.ownerName = ownerName;
  if (ownerCpf)  unit.ownerCpf  = ownerCpf;

  const ownerIsVoter = isOwner !== false;
  unit.authorizedVoter = {
    name    : ownerIsVoter ? (ownerName || unit.ownerName) : (voterName || unit.authorizedVoter.name),
    cpf     : ownerIsVoter ? (ownerCpf  || unit.ownerCpf)  : (voterCpf  || unit.authorizedVoter.cpf),
    isOwner : ownerIsVoter,
    hasProxy: unit.authorizedVoter.hasProxy,
  };
  broadcastState(); saveState();
  res.json(unit);
});

app.post('/api/units/batch', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  const { units } = req.body;
  if (!Array.isArray(units)) return res.status(400).json({ error: 'Formato inválido' });
  let added = 0;
  const created = [];
  units.forEach(u => {
    if (!u.numero || !u.proprietario || !u.cpf) return;
    if (state.units.find(e => e.number === String(u.numero))) return;
    const unit = {
      id: uuidv4(),
      number   : String(u.numero),
      ownerName: u.proprietario,
      ownerCpf : u.cpf,
      authorizedVoter: { name: u.proprietario, cpf: u.cpf, isOwner: true, hasProxy: false },
    };
    state.units.push(unit);
    created.push(unit);
    added++;
  });
  broadcastState(); saveState();
  res.json({ added, units: created });
});

app.delete('/api/units/:id', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  state.units = state.units.filter(u => u.id !== req.params.id);
  delete state.proxies[req.params.id];
  Object.values(state.votes || {}).forEach(votesByUnit => delete votesByUnit[req.params.id]);
  Object.values(state.voters || {}).forEach(v => {
    v.unitIds = (v.unitIds || []).filter(u => u.unitId !== req.params.id);
  });
  broadcastState(); saveState();
  res.json({ ok: true });
});

// ─── Procurações ──────────────────────────────────────────────────────────────
app.post('/api/proxy/:unitId', upload.single('proxy'), (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  const unit = state.units.find(u => u.id === req.params.unitId);
  if (!unit) return res.status(404).json({ error: 'Unidade não encontrada' });

  state.proxies[req.params.unitId] = {
    fileName  : req.file.originalname,
    mimeType  : req.file.mimetype,
    data      : req.file.buffer.toString('base64'),
    uploadedAt: new Date().toISOString(),
  };
  if (unit.authorizedVoter) unit.authorizedVoter.hasProxy = true;
  io.emit('proxy_uploaded', {
    unitId: unit.id,
    unitNumber: unit.number,
    fileName: req.file.originalname,
  });
  broadcastState(); saveState();
  res.json({ success: true, fileName: req.file.originalname });
});

app.get('/api/proxy/:unitId', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  const proxy = state.proxies[req.params.unitId];
  if (!proxy) return res.status(404).json({ error: 'Procuração não encontrada' });
  const buf = Buffer.from(proxy.data, 'base64');
  res.setHeader('Content-Type', proxy.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${proxy.fileName}"`);
  res.send(buf);
});

// ─── Pautas ───────────────────────────────────────────────────────────────────
app.get('/api/pautas', (req, res) => res.json(state.pautas));

app.post('/api/pautas', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  const { title, description, quorum, timerMinutes } = req.body;
  if (!title) return res.status(400).json({ error: 'Título obrigatório' });
  const pauta = {
    id          : uuidv4(),
    order       : state.pautas.length + 1,
    title, description: description || '',
    quorum      : quorum || 'simples',
    timerMinutes: timerMinutes || null,
    status      : 'pending',
    timerEnd    : null,
    result      : null,
    resultDetail: null,
  };
  state.pautas.push(pauta);
  broadcastState(); saveState();
  res.json(pauta);
});

app.put('/api/pautas/:id', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  const p = state.pautas.find(p => p.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Pauta não encontrada' });
  const { title, description, quorum, timerMinutes } = req.body;
  if (title)                      p.title        = title;
  if (description !== undefined)  p.description  = description;
  if (quorum)                     p.quorum       = quorum;
  if (timerMinutes !== undefined) p.timerMinutes = timerMinutes;
  broadcastState(); saveState();
  res.json(p);
});

app.delete('/api/pautas/:id', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  state.pautas = state.pautas.filter(p => p.id !== req.params.id);
  broadcastState(); saveState();
  res.json({ ok: true });
});

app.post('/api/pautas/:id/open', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  const pauta = state.pautas.find(p => p.id === req.params.id);
  if (!pauta) return res.status(404).json({ error: 'Pauta não encontrada' });

  // Fecha qualquer pauta aberta
  state.pautas.forEach(p => {
    if (p.status === 'open' && p.id !== pauta.id) {
      if (state.pautaTimers[p.id]) { clearTimeout(state.pautaTimers[p.id]); delete state.pautaTimers[p.id]; }
      p.status = 'closed'; p.timerEnd = null;
      const r = calculatePautaResult(p);
      p.result = r.result; p.resultDetail = r.resultDetail;
      io.emit('pauta_closed', { pautaId: p.id, title: p.title, result: p.result });
    }
  });

  pauta.status = 'open'; pauta.result = null; pauta.resultDetail = null;

  const timerMin = req.body.timerMinutes != null ? req.body.timerMinutes : pauta.timerMinutes;
  if (timerMin) {
    pauta.timerEnd = new Date(Date.now() + timerMin * 60 * 1000).toISOString();
    state.pautaTimers[pauta.id] = setTimeout(() => {
      const p = state.pautas.find(x => x.id === pauta.id);
      if (p && p.status === 'open') {
        p.status = 'closed'; p.timerEnd = null;
        const r = calculatePautaResult(p);
        p.result = r.result; p.resultDetail = r.resultDetail;
        broadcastState(); broadcastResults(); saveState();
        io.emit('pauta_closed', { pautaId: p.id, title: p.title, result: p.result });
      }
    }, timerMin * 60 * 1000);
  } else {
    pauta.timerEnd = null;
  }

  broadcastState(); broadcastResults(); saveState();
  io.emit('pauta_opened', { pautaId: pauta.id, title: pauta.title });
  res.json(pauta);
});

app.post('/api/pautas/:id/close', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  const pauta = state.pautas.find(p => p.id === req.params.id);
  if (!pauta) return res.status(404).json({ error: 'Pauta não encontrada' });

  if (state.pautaTimers[pauta.id]) { clearTimeout(state.pautaTimers[pauta.id]); delete state.pautaTimers[pauta.id]; }
  pauta.status = 'closed'; pauta.timerEnd = null;
  const r = calculatePautaResult(pauta);
  pauta.result = r.result; pauta.resultDetail = r.resultDetail;
  broadcastState(); broadcastResults(); saveState();
  io.emit('pauta_closed', { pautaId: pauta.id, title: pauta.title, result: pauta.result });
  res.json(pauta);
});

// ─── Validação de participante por CPF ────────────────────────────────────────
app.post('/api/participant/validate', (req, res) => {
  const { accessCode, cpf } = req.body;
  if (!state.assembly || state.assembly.accessCode !== accessCode)
    return res.status(400).json({ error: 'Código de acesso inválido.' });
  if (state.assembly.status === 'closed')
    return res.status(400).json({ error: 'Esta assembleia já foi encerrada.' });

  const nc = normCpf(cpf);
  if (!nc) return res.status(400).json({ error: 'CPF inválido.' });

  const authorizedUnits = state.units.filter(u =>
    normCpf(u.authorizedVoter?.cpf) === nc
  );
  if (!authorizedUnits.length)
    return res.status(403).json({
      error: 'CPF não encontrado como votante autorizado nesta assembleia. Verifique com o administrador.',
    });

  // Verifica se já está registrado (mesmo CPF em sessão ativa)
  const already = Object.values(state.voters).find(v => normCpf(v.cpf) === nc);

  res.json({
    valid      : true,
    voterName  : authorizedUnits[0].authorizedVoter.name,
    cpf,
    units      : authorizedUnits.map(u => ({
      unitId  : u.id,
      number  : u.number,
      ownerName: u.ownerName,
      isOwner : u.authorizedVoter.isOwner,
      hasProxy: !!state.proxies[u.id],
    })),
    alreadyRegistered: !!already,
  });
});

// ─── Votação ──────────────────────────────────────────────────────────────────
app.post('/api/vote', (req, res) => {
  const { pautaId, unitId, voterId, vote } = req.body;
  if (!['Sim','Não','Abstenção'].includes(vote))
    return res.status(400).json({ error: 'Voto inválido' });

  const pauta = state.pautas.find(p => p.id === pautaId);
  if (!pauta || pauta.status !== 'open')
    return res.status(400).json({ error: 'Pauta não está aberta para votação' });

  const unit = state.units.find(u => u.id === unitId);
  if (!unit) return res.status(404).json({ error: 'Unidade não encontrada' });

  if (!state.votes[pautaId]) state.votes[pautaId] = {};
  if (state.votes[pautaId][unitId])
    return res.status(409).json({ error: `A unidade ${unit.number} já registrou voto nesta pauta.` });

  const voter = state.voters[voterId];
  if (!voter) return res.status(403).json({ error: 'Participante não registrado.' });
  const voterUnit = voter.unitIds.find(u => u.unitId === unitId);
  if (!voterUnit)
    return res.status(403).json({ error: 'Não autorizado a votar por esta unidade.' });
  if (!voterUnit.isOwner && !state.proxies[unitId])
    return res.status(403).json({ error: `A unidade ${unit.number} possui representante sem procuração anexada.` });

  state.votes[pautaId][unitId] = {
    vote, voterId,
    hasProxy   : !!state.proxies[unitId],
    unitNumber : unit.number,
    voterName  : voter.name,
    timestamp  : new Date().toISOString(),
  };
  broadcastResults(); saveState();
  res.json({ success: true });
});

// ─── Resultados / Participantes ───────────────────────────────────────────────
app.get('/api/results', (req, res) => res.json(resultPayload(isAdmin(req))));
app.get('/api/voters',  (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  res.json(Object.values(state.voters));
});

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  socket.emit('state_sync', statePayload(false));
  socket.emit('results_update', resultPayload(false));

  socket.on('admin_connect', ({ token }) => {
    if (!isAdminToken(token)) return;
    state.adminSockets.add(socket.id);
    socket.emit('state_sync', statePayload(true));
    socket.emit('results_update', resultPayload(true));
    socket.emit('admin_state', {
      voters : Object.values(state.voters),
      proxies: Object.keys(state.proxies).map(uid => ({
        unitId    : uid,
        fileName  : state.proxies[uid].fileName,
        uploadedAt: state.proxies[uid].uploadedAt,
      })),
    });
  });

  // Participante se registra via CPF (validado pelo servidor)
  socket.on('register_voter', ({ accessCode, cpf }) => {
    if (!state.assembly || state.assembly.accessCode !== accessCode) {
      socket.emit('error', { message: 'Código de acesso inválido.' }); return;
    }
    const nc = normCpf(cpf);
    const authorizedUnits = state.units.filter(u => normCpf(u.authorizedVoter?.cpf) === nc);
    if (!authorizedUnits.length) {
      socket.emit('error', { message: 'CPF não autorizado nesta assembleia.' }); return;
    }

    Object.entries(state.voters || {}).forEach(([id, voter]) => {
      if (id !== socket.id && normCpf(voter.cpf) === nc) delete state.voters[id];
    });

    const unitIds = authorizedUnits.map(u => ({
      unitId  : u.id,
      isOwner : u.authorizedVoter.isOwner,
      hasProxy: !!state.proxies[u.id],
    }));
    const voter = {
      id    : socket.id,
      name  : authorizedUnits[0].authorizedVoter.name,
      cpf,
      unitIds,
      registeredAt: new Date().toISOString(),
    };
    state.voters[socket.id] = voter;
    state.adminSockets.forEach(sid => io.to(sid).emit('voter_registered', voter));
    saveState();
    socket.emit('registration_ok', {
      voterId: socket.id,
      voter,
      existingVotes: getExistingVotesForUnits(unitIds.map(u => u.unitId)),
    });
  });

  socket.on('disconnect', () => {
    state.adminSockets.delete(socket.id);
  });
});

// ─── Seed / Demo ──────────────────────────────────────────────────────────────
app.post('/api/admin/seed', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  Object.values(state.pautaTimers || {}).forEach(t => clearTimeout(t));

  const mkUnit = (number, ownerName, ownerCpf, voterName, voterCpf, isOwner) => ({
    id: uuidv4(), number, ownerName, ownerCpf,
    authorizedVoter: {
      name    : voterName || ownerName,
      cpf     : voterCpf  || ownerCpf,
      isOwner : isOwner !== false,
      hasProxy: !isOwner && !!voterName,
    },
  });

  const units = [
    mkUnit('101','Ana Paula Rodrigues',    '111.222.333-01'),
    mkUnit('102','Carlos Eduardo Lima',    '111.222.333-02'),
    mkUnit('201','Mariana Fonseca',        '111.222.333-03'),
    mkUnit('202','Roberto Alves Santos',   '111.222.333-04'),
    mkUnit('301','Fernanda Costa Melo',    '111.222.333-05'),
    mkUnit('302','Thiago Pereira da Cruz', '111.222.333-06'),
    mkUnit('401','Juliana Martins',        '111.222.333-07'),
    mkUnit('402','Paulo Henrique Gomes',   '111.222.333-08',
           'Diego Mendes (inquilino)',     '111.222.333-99', false),
    mkUnit('501','Sandra Oliveira',        '111.222.333-09'),
    mkUnit('502','Eduardo Nascimento',     '111.222.333-10'),
    mkUnit('601','Luciana Brito',          '111.222.333-11'),
    mkUnit('602','Marcelo Torres',         '111.222.333-12'),
  ];

  const p1 = uuidv4(), p2 = uuidv4(), p3 = uuidv4();
  const pautas = [
    { id: p1, order: 1, title: 'Aprovação das contas do exercício 2025',
      description: 'Prestação de contas da administração referente ao ano de 2025, incluindo receitas, despesas e saldo final.',
      quorum: 'simples', timerMinutes: null, status: 'closed', timerEnd: null,
      result: 'aprovado',
      resultDetail: { sim: 8, nao: 2, abstencao: 2, total: 12, needed: 5, quorumType: 'simples', criterion: 'Maioria simples (Sim > Não)' } },
    { id: p2, order: 2, title: 'Reajuste da taxa de condomínio — 8%',
      description: 'Proposta de reajuste de 8% na taxa mensal a partir de julho/2026 em razão do aumento dos custos operacionais.',
      quorum: 'simples', timerMinutes: 3, status: 'open', timerEnd: null,
      result: null, resultDetail: null },
    { id: p3, order: 3, title: 'Reforma da área de lazer',
      description: 'Aprovação de orçamento de R$ 45.000,00 para reforma da piscina, academia e salão de festas. Verba rateada em 12 meses.',
      quorum: '2/3', timerMinutes: null, status: 'pending', timerEnd: null,
      result: null, resultDetail: null },
  ];

  const votes = {};
  votes[p1] = {};
  ['Sim','Sim','Sim','Sim','Sim','Sim','Sim','Sim','Não','Não','Abstenção','Abstenção'].forEach((v, i) => {
    votes[p1][units[i].id] = { vote: v, voterId: 'demo-'+i, hasProxy: i===7,
      unitNumber: units[i].number, voterName: units[i].authorizedVoter.name,
      timestamp: new Date().toISOString() };
  });
  votes[p2] = {};
  ['Sim','Não','Sim','Sim','Não','Abstenção','Sim'].forEach((v, i) => {
    votes[p2][units[i].id] = { vote: v, voterId: 'demo-'+i, hasProxy: i===7,
      unitNumber: units[i].number, voterName: units[i].authorizedVoter.name,
      timestamp: new Date().toISOString() };
  });

  const voters = {};
  units.slice(0, 8).forEach((u, i) => {
    voters['demo-'+i] = { id: 'demo-'+i, name: u.authorizedVoter.name, cpf: u.authorizedVoter.cpf,
      unitIds: [{ unitId: u.id, isOwner: u.authorizedVoter.isOwner, hasProxy: u.authorizedVoter.hasProxy }],
      registeredAt: new Date().toISOString() };
  });

  state = {
    assembly: { id: uuidv4(), name: 'Assembleia Geral Ordinária — Ed. Solar das Acácias',
      date: new Date().toISOString().split('T')[0],
      description: 'Salão de Festas — 19h30',
      location: 'Rua das Palmeiras, 120', quorumInstall: 25,
      accessCode: 'DEMO01', status: 'open', createdAt: new Date().toISOString() },
    units, pautas, voters, votes, proxies: {},
    adminSockets: state.adminSockets,
    pautaTimers : {},
    adminSessions: state.adminSessions,
  };
  broadcastState(); broadcastResults(); saveState();
  res.json({ ok: true, message: 'Demo carregado! Código de acesso: DEMO01' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅  Servidor rodando em http://localhost:${PORT}`);
  console.log(`🔑  Senha do administrador configurada por ADMIN_PASSWORD${ADMIN_PASSWORD === 'admin123' ? ' (usando padrão local)' : ''}`);
  console.log(`\n   Para acessar de outros dispositivos na mesma rede:`);
  console.log(`   Descubra o IP desta máquina e acesse http://SEU_IP:${PORT}\n`);
});
