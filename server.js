const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 10 * 1024 * 1024 }); // 10MB

// ─── Configurações ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// ─── Estado em memória ────────────────────────────────────────────────────────
let state = {
  assembly: null,   // { id, name, date, description, accessCode, status }
  units: [],        // [{ id, number, ownerName, ownerCpf?, ownerEmail? }]
  pautas: [],       // [{ id, order, title, description, quorum, status }]
  voters: {},       // { voterId: { id, name, unitIds: [{ unitId, isOwner, proxyFile? }] } }
  votes: {},        // { pautaId: { unitId: { vote, voterId, hasProxy, timestamp } } }
  proxies: {},      // { unitId: { fileName, mimeType, data (base64), uploadedBy } }
  adminSockets: new Set(),
};

// ─── Upload (memória) ─────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Formato não permitido. Use PDF, JPG ou PNG.'));
  },
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function isAdmin(req) {
  return req.headers['x-admin-token'] === 'admin-authenticated';
}

function computeResults() {
  const results = {};
  state.pautas.forEach(p => {
    const pVotes = state.votes[p.id] || {};
    const sim = [], nao = [], abstencao = [];
    Object.values(pVotes).forEach(v => {
      if (v.vote === 'Sim') sim.push(v);
      else if (v.vote === 'Não') nao.push(v);
      else abstencao.push(v);
    });
    const total = sim.length + nao.length + abstencao.length;
    results[p.id] = {
      pautaId: p.id,
      title: p.title,
      status: p.status,
      sim: sim.length,
      nao: nao.length,
      abstencao: abstencao.length,
      total,
      votes: pVotes,
    };
  });
  return results;
}

function broadcastResults() {
  io.emit('results_update', computeResults());
}

function broadcastState() {
  const publicState = {
    assembly: state.assembly,
    units: state.units,
    pautas: state.pautas,
  };
  io.emit('state_sync', publicState);
}

// ─── API Admin ────────────────────────────────────────────────────────────────

// Login admin
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true, token: 'admin-authenticated' });
  } else {
    res.status(401).json({ error: 'Senha incorreta' });
  }
});

// Configurar assembleia
app.post('/api/assembly', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  const { name, date, description } = req.body;
  if (!name || !date) return res.status(400).json({ error: 'Nome e data são obrigatórios' });

  state.assembly = {
    id: uuidv4(),
    name,
    date,
    description: description || '',
    accessCode: generateCode(),
    status: 'setup',
    createdAt: new Date().toISOString(),
  };
  state.units = [];
  state.pautas = [];
  state.voters = {};
  state.votes = {};
  state.proxies = {};

  broadcastState();
  res.json(state.assembly);
});

// Atualizar assembleia
app.put('/api/assembly', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  if (!state.assembly) return res.status(404).json({ error: 'Assembleia não criada' });
  const { name, date, description } = req.body;
  if (name) state.assembly.name = name;
  if (date) state.assembly.date = date;
  if (description !== undefined) state.assembly.description = description;
  broadcastState();
  res.json(state.assembly);
});

// Regenerar código de acesso
app.post('/api/assembly/regenerate-code', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  if (!state.assembly) return res.status(404).json({ error: 'Assembleia não criada' });
  state.assembly.accessCode = generateCode();
  broadcastState();
  res.json({ accessCode: state.assembly.accessCode });
});

// Abrir assembleia para participantes
app.post('/api/assembly/open', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  if (!state.assembly) return res.status(404).json({ error: 'Assembleia não criada' });
  state.assembly.status = 'open';
  broadcastState();
  res.json({ status: 'open' });
});

// Encerrar assembleia
app.post('/api/assembly/close', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  if (!state.assembly) return res.status(404).json({ error: 'Assembleia não criada' });
  state.assembly.status = 'closed';
  // Fechar todas as pautas abertas
  state.pautas.forEach(p => { if (p.status === 'open') p.status = 'closed'; });
  broadcastState();
  broadcastResults();
  res.json({ status: 'closed' });
});

// ─── Units ────────────────────────────────────────────────────────────────────

app.get('/api/units', (req, res) => res.json(state.units));

app.post('/api/units', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  const { number, ownerName, ownerCpf, ownerEmail } = req.body;
  if (!number || !ownerName) return res.status(400).json({ error: 'Número e nome do proprietário são obrigatórios' });
  if (state.units.find(u => u.number.toLowerCase() === number.toLowerCase()))
    return res.status(400).json({ error: 'Unidade já cadastrada' });

  const unit = { id: uuidv4(), number, ownerName, ownerCpf: ownerCpf || '', ownerEmail: ownerEmail || '' };
  state.units.push(unit);
  broadcastState();
  res.json(unit);
});

// Import em lote (CSV processado no cliente)
app.post('/api/units/batch', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  const { units } = req.body;
  if (!Array.isArray(units)) return res.status(400).json({ error: 'Formato inválido' });

  const added = [];
  const skipped = [];
  units.forEach(u => {
    if (!u.number || !u.ownerName) { skipped.push(u); return; }
    if (state.units.find(x => x.number.toLowerCase() === u.number.toLowerCase())) { skipped.push(u); return; }
    const unit = { id: uuidv4(), number: u.number, ownerName: u.ownerName, ownerCpf: u.ownerCpf || '', ownerEmail: u.ownerEmail || '' };
    state.units.push(unit);
    added.push(unit);
  });

  broadcastState();
  res.json({ added: added.length, skipped: skipped.length });
});

app.delete('/api/units/:id', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  state.units = state.units.filter(u => u.id !== req.params.id);
  broadcastState();
  res.json({ success: true });
});

// ─── Pautas ───────────────────────────────────────────────────────────────────

app.get('/api/pautas', (req, res) => res.json(state.pautas));

app.post('/api/pautas', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  const { title, description, quorum } = req.body;
  if (!title) return res.status(400).json({ error: 'Título é obrigatório' });

  const pauta = {
    id: uuidv4(),
    order: state.pautas.length + 1,
    title,
    description: description || '',
    quorum: quorum || 'simples',
    status: 'pending',
  };
  state.pautas.push(pauta);
  broadcastState();
  res.json(pauta);
});

app.put('/api/pautas/:id', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  const pauta = state.pautas.find(p => p.id === req.params.id);
  if (!pauta) return res.status(404).json({ error: 'Pauta não encontrada' });
  const { title, description, quorum } = req.body;
  if (title) pauta.title = title;
  if (description !== undefined) pauta.description = description;
  if (quorum) pauta.quorum = quorum;
  broadcastState();
  res.json(pauta);
});

app.delete('/api/pautas/:id', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  state.pautas = state.pautas.filter(p => p.id !== req.params.id);
  state.pautas.forEach((p, i) => p.order = i + 1);
  broadcastState();
  res.json({ success: true });
});

// Abrir votação de uma pauta
app.post('/api/pautas/:id/open', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  const pauta = state.pautas.find(p => p.id === req.params.id);
  if (!pauta) return res.status(404).json({ error: 'Pauta não encontrada' });
  pauta.status = 'open';
  if (!state.votes[pauta.id]) state.votes[pauta.id] = {};
  broadcastState();
  broadcastResults();
  io.emit('pauta_opened', { pautaId: pauta.id, title: pauta.title });
  res.json(pauta);
});

// Fechar votação de uma pauta
app.post('/api/pautas/:id/close', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  const pauta = state.pautas.find(p => p.id === req.params.id);
  if (!pauta) return res.status(404).json({ error: 'Pauta não encontrada' });
  pauta.status = 'closed';
  broadcastState();
  broadcastResults();
  io.emit('pauta_closed', { pautaId: pauta.id, title: pauta.title });
  res.json(pauta);
});

// ─── Procurações ──────────────────────────────────────────────────────────────

app.post('/api/proxy/:unitId', upload.single('proxy'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });
  const { unitId } = req.params;
  const unit = state.units.find(u => u.id === unitId);
  if (!unit) return res.status(404).json({ error: 'Unidade não encontrada' });

  state.proxies[unitId] = {
    fileName: req.file.originalname,
    mimeType: req.file.mimetype,
    data: req.file.buffer.toString('base64'),
    uploadedAt: new Date().toISOString(),
  };

  // Notificar admin
  state.adminSockets.forEach(sid => {
    io.to(sid).emit('proxy_uploaded', { unitId, unitNumber: unit.number, fileName: req.file.originalname });
  });

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

// ─── Votação ──────────────────────────────────────────────────────────────────

app.post('/api/vote', (req, res) => {
  const { pautaId, unitId, voterId, vote } = req.body;
  if (!['Sim', 'Não', 'Abstenção'].includes(vote))
    return res.status(400).json({ error: 'Voto inválido' });

  const pauta = state.pautas.find(p => p.id === pautaId);
  if (!pauta || pauta.status !== 'open')
    return res.status(400).json({ error: 'Pauta não está aberta para votação' });

  const unit = state.units.find(u => u.id === unitId);
  if (!unit) return res.status(404).json({ error: 'Unidade não encontrada' });

  if (!state.votes[pautaId]) state.votes[pautaId] = {};

  const hasProxy = !!state.proxies[unitId];

  state.votes[pautaId][unitId] = {
    vote,
    voterId,
    hasProxy,
    unitNumber: unit.number,
    timestamp: new Date().toISOString(),
  };

  broadcastResults();
  res.json({ success: true });
});

// ─── Resultados ───────────────────────────────────────────────────────────────

app.get('/api/results', (req, res) => res.json(computeResults()));

app.get('/api/voters', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Não autorizado' });
  res.json(Object.values(state.voters));
});

// ─── Socket.io ────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  // Enviar estado atual ao conectar
  socket.emit('state_sync', {
    assembly: state.assembly,
    units: state.units,
    pautas: state.pautas,
  });
  socket.emit('results_update', computeResults());

  // Admin se identifica
  socket.on('admin_connect', ({ token }) => {
    if (token === 'admin-authenticated') {
      state.adminSockets.add(socket.id);
      socket.emit('admin_state', {
        voters: Object.values(state.voters),
        proxies: Object.keys(state.proxies).map(uid => ({
          unitId: uid,
          fileName: state.proxies[uid].fileName,
          uploadedAt: state.proxies[uid].uploadedAt,
        })),
      });
    }
  });

  // Participante se registra
  socket.on('register_voter', ({ name, accessCode, unitIds }) => {
    if (!state.assembly || state.assembly.accessCode !== accessCode) {
      socket.emit('error', { message: 'Código de acesso inválido' });
      return;
    }
    if (state.assembly.status !== 'open') {
      socket.emit('error', { message: 'A assembleia não está aberta' });
      return;
    }

    const voter = {
      id: socket.id,
      name,
      unitIds: unitIds || [],
      registeredAt: new Date().toISOString(),
    };
    state.voters[socket.id] = voter;

    // Notificar admins
    state.adminSockets.forEach(sid => {
      io.to(sid).emit('voter_registered', voter);
    });

    socket.emit('registration_ok', { voterId: socket.id });
  });

  socket.on('disconnect', () => {
    state.adminSockets.delete(socket.id);
    // Mantém voter no registro mesmo após desconexão (voto já foi registrado)
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅  Servidor rodando em http://localhost:${PORT}`);
  console.log(`🔑  Senha do administrador: ${ADMIN_PASSWORD}`);
  console.log(`\n   Para acessar de outros dispositivos na mesma rede:`);
  console.log(`   Descubra o IP desta máquina e acesse http://SEU_IP:${PORT}\n`);
});
