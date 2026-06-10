# QuorumHub — Guia do Desenvolvedor

> **Última atualização:** junho de 2026  
> **Status do projeto:** Em desenvolvimento ativo  
> **Onde o projeto parou:** Backend e frontend base 100% funcionais. Próxima grande feature: perfil **Condutor** com vídeo (Daily.co), transcrição (Whisper) e geração de ata por IA (GPT-4o).

---

## 1. Visão Geral do Produto

O **QuorumHub** é uma plataforma web para gestão completa de assembleias condominiais. Cobre todo o fluxo: cadastro de unidades e votantes → abertura da assembleia → votação em tempo real → cálculo de quórum → exportação de ata e resultados.

O slogan: **"Do quorum à ata, tudo em um só lugar."**

Documentos de contexto de produto:
- `DIRECAO_SAAS.md` — visão de produto, público-alvo, decisões de negócio
- `COMO_USAR.md` — manual do usuário final (administrador e participantes)

---

## 2. Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js 18+ + Express 4 |
| WebSocket | Socket.io 4 |
| Persistência | JSON local (`data.json`) OU PostgreSQL (via `DATABASE_URL`) |
| Upload de arquivos | Multer (procurações, memória/base64) |
| Frontend | HTML/CSS/JS puro — SPA em arquivo único (`public/index.html`) |
| UI Kit | Bootstrap 5 + Bootstrap Icons |
| QR Code | QRCode.js (CDN) |
| PDF de ata | jsPDF + jspdf-autotable (CDN) |
| Excel | SheetJS/xlsx (CDN) |
| Deploy | Railway.app (auto-deploy via push no branch `main` do GitHub) |
| IDs únicos | uuid v4 |

---

## 3. Estrutura de Arquivos

```
PROJETO_QUORUM_HUB/
│
├── server.js              # Backend completo (~957 linhas)
├── package.json           # Dependências Node
├── package-lock.json
├── data.json              # Persistência local (gerado em runtime)
├── .gitignore             # node_modules, data.json
│
├── public/
│   └── index.html         # Frontend SPA completo (~2.300 linhas)
│
├── COMO_USAR.md           # Manual do usuário final
├── DIRECAO_SAAS.md        # Visão de produto e decisões estratégicas
└── README_DEVELOPER.md    # Este arquivo
```

---

## 4. Variáveis de Ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `PORT` | `3000` | Porta HTTP. Railway define automaticamente. |
| `ADMIN_PASSWORD` | `admin123` | Senha do administrador. **Alterar em produção.** |
| `DATABASE_URL` | _(vazio)_ | Connection string PostgreSQL. Se vazio, usa `data.json`. |
| `PGSSLMODE` | _(vazio)_ | `require` para forçar SSL no PostgreSQL (Railway exige). |
| `DAILY_API_KEY` | _(ainda não usado)_ | API key da Daily.co para vídeo. **A implementar.** |
| `OPENAI_API_KEY` | _(ainda não usado)_ | API key OpenAI (Whisper + GPT-4o). **A implementar.** |

> No Railway: Settings → Variables → adicionar cada variável.

---

## 5. Como Rodar Localmente

```bash
# Clone o repositório
git clone https://github.com/SEU_USUARIO/quorumhub.git
cd quorumhub

# Instale as dependências
npm install

# Inicie o servidor (desenvolvimento)
npm run dev       # com nodemon (reinicia ao salvar)
# ou
node server.js    # sem reload automático

# Acesse
# http://localhost:3000
# Senha admin padrão: admin123
```

Para testar com dados mock, acesse a tela inicial e clique em **"Demo"** — isso chama `POST /api/admin/seed` com código `DEMO01` e popula o sistema com uma assembleia de exemplo.

---

## 6. Modelo de Dados (Estado em Memória)

O estado completo fica em um único objeto `state` no `server.js`. É persistido em `data.json` (local) ou PostgreSQL (produção) a cada mutação.

```js
state = {
  condominiums: [
    {
      id, name, document, address, city, state,
      plan, status, createdAt, updatedAt
    }
  ],
  activeCondominiumId,

  assembly: {
    id, condominiumId, name, date, description, location,
    accessCode,          // código de 6 chars que participantes usam para entrar
    status,              // 'setup' | 'open' | 'closed'
    quorumInstall,       // % mínimo de presença para instalar a assembleia (padrão 25)
    createdAt
  },

  units: [
    {
      id, condominiumId, number, ownerName, ownerCpf,
      authorizedVoter: {
        name, cpf,
        isOwner,     // true se o próprio dono vai votar
        hasProxy     // true se há procuração registrada
      }
    }
  ],

  pautas: [
    {
      id, condominiumId, order, title, description,
      quorum,         // 'simples' | 'dois_tercos' | 'unanimidade'
      timerMinutes,   // 0 = sem timer
      status,         // 'pending' | 'open' | 'closed'
      timerEnd,       // timestamp ISO quando o timer fecha automaticamente
      result,         // 'aprovado' | 'rejeitado' | null
      resultDetail    // { sim, nao, abstencao, total, percentSim }
    }
  ],

  voters: {
    [voterId]: {
      id, name, cpf,
      unitIds: [{ unitId, isOwner, hasProxy }]
    }
  },

  votes: {
    [pautaId]: {
      [unitId]: {
        vote,        // 'sim' | 'nao' | 'abstencao'
        voterId, hasProxy, unitNumber, voterName, timestamp
      }
    }
  },

  proxies: {
    [unitId]: { fileName, mimeType, data, uploadedAt }  // data = base64
  },

  // Não persistidos (runtime only):
  adminSockets: Set,
  pautaTimers: {},      // clearTimeout references
  adminSessions: Map,   // token → { expiresAt, condominiumId }
  adminLoginAttempts: Map
}
```

---

## 7. API REST — Endpoints

### Autenticação Admin
| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/admin/login` | Login. Body: `{ password }`. Retorna `{ token }`. Rate-limited (5 tentativas, lock 15 min). |

### Condomínios
| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/condominiums` | Lista condomínios conhecidos e retorna o condomínio ativo. Requer token admin. |
| `POST` | `/api/condominiums` | Cria metadados de um novo condomínio. Requer token admin. |
| `PUT` | `/api/condominiums/current` | Atualiza o condomínio ativo e vincula assembleia, unidades e pautas atuais a ele. Requer token admin. |

### Assembleia
| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/assembly` | Retorna estado da assembleia. |
| `POST` | `/api/assembly` | Cria nova assembleia. Requer token admin. |
| `PUT` | `/api/assembly` | Atualiza configurações. Requer token admin. |
| `POST` | `/api/assembly/regenerate-code` | Gera novo código de acesso. |
| `POST` | `/api/assembly/open` | Abre assembleia (verifica quórum de instalação). |
| `POST` | `/api/assembly/force-open` | Abre mesmo sem quórum mínimo. |
| `POST` | `/api/assembly/close` | Encerra a assembleia. |

### Unidades
| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/units` | Lista todas as unidades. |
| `POST` | `/api/units` | Cria unidade. |
| `PUT` | `/api/units/:id` | Atualiza unidade. |
| `DELETE` | `/api/units/:id` | Remove unidade. |
| `POST` | `/api/units/batch` | Importa várias unidades (array). |
| `POST` | `/api/proxy/:unitId` | Upload de procuração (multipart). |
| `GET` | `/api/proxy/:unitId` | Retorna procuração (base64 JSON). |

### Pautas
| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/pautas` | Lista todas as pautas. |
| `POST` | `/api/pautas` | Cria pauta. |
| `PUT` | `/api/pautas/:id` | Atualiza pauta. |
| `DELETE` | `/api/pautas/:id` | Remove pauta. |
| `POST` | `/api/pautas/:id/open` | Abre votação (inicia timer se `timerMinutes > 0`). |
| `POST` | `/api/pautas/:id/close` | Fecha votação e calcula resultado. |

### Participantes e Votação
| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/participant/validate` | Valida CPF do participante. Body: `{ accessCode, cpf }`. Retorna as unidades que ele pode representar. |
| `POST` | `/api/vote` | Registra voto. Body: `{ pautaId, unitId, vote, voterId }`. Bloqueia duplicidade. |
| `GET` | `/api/results` | Resultados. Admin vê todos os detalhes; participante vê apenas o placar. |
| `GET` | `/api/voters` | Lista votantes presentes (admin only). |

### Utilitários
| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/admin/seed` | Carrega dados demo. Body: `{ password: 'DEMO01' }`. |

---

## 8. WebSocket — Eventos Socket.io

### Cliente → Servidor
| Evento | Payload | Descrição |
|--------|---------|-----------|
| `admin_connect` | `{ token }` | Admin se identifica; entra na room `admins`. |
| `register_voter` | `{ accessCode, cpf }` | Participante entra na assembleia. Servidor valida CPF. |

### Servidor → Cliente (broadcast)
| Evento | Quem recebe | Descrição |
|--------|-------------|-----------|
| `results_update` | Todos | Placar atualizado após voto ou fechamento de pauta. |
| `assembly_status` | Todos | Mudança no status da assembleia (open/closed). |
| `pauta_update` | Todos | Pauta aberta, fechada, ou timer atualizado. |
| `voter_joined` | Admins | Novo participante entrou. |
| `register_error` | Socket específico | CPF não encontrado ou código inválido. |

---

## 9. Frontend — Arquitetura SPA

O arquivo `public/index.html` é um SPA completo com 8 views controladas por `showView(id)`:

| View ID | Descrição |
|---------|-----------|
| `view-landing` | Tela inicial — escolha entre Admin e Participante |
| `view-admin-login` | Login do administrador |
| `view-admin-setup` | Configuração da assembleia (4 abas: Assembleia, Unidades, Pautas, Iniciar) |
| `view-admin-dashboard` | Painel ao vivo — pautas, votos, placar, botões de abertura/fechamento |
| `view-projection` | Modo projeção — tela cheia para telão, sem controles |
| `view-participant-join` | Tela de entrada do participante — CPF + código de acesso |
| `view-voting` | Tela de votação do participante |
| `view-closed` | Assembleia encerrada |

**Regra crítica de navegação:** `showView()` define `display:none` em TODAS as views antes de exibir a target. Isso evita que múltiplas views apareçam simultaneamente (bug histórico causado por CSS ID overriding inline style).

### Estado global frontend (`S`)

```js
const S = {
  token: null,         // token de admin
  voterId: null,       // ID do participante logado
  myUnitIds: [],       // unidades que o participante pode representar
  myVotes: {},         // pautaId → unitId → voto registrado
  assembly: null,      // objeto assembly do servidor
  pautas: [],
  units: [],
  voters: [],
  socket: null,        // instância Socket.io
  qrInstance: null,    // instância QRCode.js
  timerInterval: null, // ref do setInterval do countdown
};
```

### Paleta de Cores (CSS Custom Properties)

```css
--primary:    #4a5e1a   /* verde lodo escuro — fundo do header, botões primários */
--primary-dk: #354412   /* verde lodo mais escuro — hover */
--accent:     #d4a800   /* amarelo âmbar — destaques */
--accent-lt:  #f5c518   /* amarelo claro — hover do accent */
--bg:         #f2f1ec   /* bege off-white — fundo das páginas */
--text:       #1a1a1a   /* quase preto */
```

---

## 10. Segurança Implementada

- **Anti-duplicidade de voto:** servidor verifica `votes[pautaId][unitId]` e retorna 409 se já existe.
- **Validação de CPF server-side:** participante não se autodeclara. O administrador pré-cadastra o CPF do votante autorizado por unidade. O servidor cruza na entrada e em cada voto.
- **Token de sessão admin:** header `x-admin-token` em todas as rotas protegidas. Sessão expira em 8h.
- **Rate limiting no login admin:** 5 tentativas → lock de 15 minutos.
- **Procuração obrigatória:** unidades com `hasProxy: true` devem ter arquivo enviado via `/api/proxy/:unitId`.

---

## 11. O Que Está Implementado ✅

- [x] Cadastro de assembleia (nome, data, local, código de acesso)
- [x] Cadastro de unidades com votante autorizado por CPF
- [x] Upload de procuração por unidade
- [x] Importação de unidades via batch
- [x] Cadastro de pautas (tipo de quórum, timer, ordem)
- [x] Abertura e fechamento de pautas
- [x] Timer automático por pauta (server-side com `setTimeout`)
- [x] Quórum de instalação (% mínimo de presença)
- [x] Força abertura sem quórum
- [x] Votação por unidade (Sim / Não / Abstenção)
- [x] Anti-duplicidade de voto por unidade por pauta
- [x] Cálculo de resultado por tipo de quórum (simples / 2/3 / unanimidade)
- [x] Painel admin ao vivo com placar em tempo real
- [x] Modo projeção (tela cheia para telão)
- [x] QR Code de acesso para participantes
- [x] Tela de votação para participantes com timer
- [x] Exportação de ata em PDF (jsPDF com linguagem jurídica)
- [x] Exportação de resultados em Excel (3 abas: Resumo, Votos, Procurações)
- [x] Persistência em JSON local (`data.json`)
- [x] Persistência em PostgreSQL (para produção no Railway)
- [x] Base SaaS inicial com cadastro/metadados de condomínio ativo
- [x] Dados demo (seed) para testes
- [x] Deploy no Railway com auto-deploy via GitHub

---

## 12. O Que Está Pendente / A Implementar 🔲

### Feature principal: Perfil Condutor + Vídeo + Ata por IA

Esta é a maior feature pendente. O plano está definido, falta codificar.

**Contexto:** As assembleias são sempre remotas (~1/mês). É necessário gravar o vídeo com o áudio de TODOS os participantes, transcrever e gerar a ata formal automaticamente.

**Serviços escolhidos:**
- **Daily.co** — vídeo conferência + gravação (free tier: 10.000 min/mês, suficiente para 1 reunião/mês)
- **OpenAI Whisper** — transcrição de áudio (~R$ 0,72 por reunião de 2h)
- **OpenAI GPT-4o** — formatação da transcrição em ata jurídica formal

**O que precisará ser feito:**

1. **Novo perfil: Condutor**
   - Login separado (usuário/senha específicos, ex: variável `CONDUCTOR_PASSWORD`)
   - View própria no SPA: `view-conductor`
   - Acesso ao painel de controle da reunião (pode abrir/fechar pautas como admin, mas não configura a assembleia)

2. **Integração Daily.co (backend)**
   - `POST /api/conductor/room` — cria uma room via Daily.co API e retorna a URL
   - `POST /api/conductor/recording/start` — inicia gravação na room
   - `POST /api/conductor/recording/stop` — para a gravação
   - `GET /api/conductor/recording/:recordingId` — baixa/status da gravação
   - Variável de ambiente: `DAILY_API_KEY`

3. **Integração OpenAI (backend)**
   - `POST /api/conductor/transcribe` — envia o arquivo de áudio ao Whisper, retorna transcrição
   - `POST /api/conductor/generate-ata` — envia transcrição ao GPT-4o com prompt jurídico, retorna ata formatada
   - Variável de ambiente: `OPENAI_API_KEY`

4. **Frontend do Condutor**
   - Embed do iframe Daily.co na view
   - Botões: Iniciar gravação / Parar gravação
   - Pós-reunião: botão "Gerar ata" → mostra preview editável → exporta PDF

**Estimativa de custo mensal (1 reunião de 2h):**
- Daily.co: gratuito (free tier)
- Whisper: ~US$ 0,15 (R$ 0,72)
- GPT-4o: ~US$ 0,10–0,30 dependendo do tamanho da transcrição
- Railway: ~US$ 5–10/mês (plano básico)

---

### Outras features mapeadas no DIRECAO_SAAS.md

- [ ] Multi-tenant SaaS completo (vários condomínios isolados por conta)
- [ ] Painel de administradora (gerencia vários condomínios)
- [ ] Notificações por e-mail (convocação, resultado)
- [ ] Assinatura digital de procurações
- [ ] Histórico de assembleias anteriores

---

## 13. Fluxo de Deploy

```
Código local  →  git push origin main  →  Railway detecta push
→  npm install  →  node server.js  →  App live
```

**URL de produção:** https://assembleia-condominial-production.up.railway.app

**Variáveis obrigatórias no Railway:**
- `ADMIN_PASSWORD` — senha do admin em produção
- `DATABASE_URL` — fornecida automaticamente ao adicionar PostgreSQL no Railway
- `PGSSLMODE=require`
- _(futuro)_ `DAILY_API_KEY`, `OPENAI_API_KEY`, `CONDUCTOR_PASSWORD`

---

## 14. Git — Workflow Recomendado

```bash
# Ao iniciar trabalho em nova feature
git checkout -b feature/nome-da-feature

# Commits frequentes
git add .
git commit -m "feat: descrição clara do que foi feito"

# Quando pronto para produção
git checkout main
git merge feature/nome-da-feature
git push origin main
# Railway faz o deploy automaticamente
```

> **Atenção no Windows:** Se aparecer erro de `index.lock`, rodar no PowerShell:
> `del .git\index.lock`

---

## 15. Referências e Documentação das Integrações Pendentes

| Serviço | Link |
|---------|------|
| Daily.co API | https://docs.daily.co/reference |
| Daily.co Recording | https://docs.daily.co/reference/cloud-recording |
| OpenAI Whisper | https://platform.openai.com/docs/guides/speech-to-text |
| OpenAI GPT-4o | https://platform.openai.com/docs/models/gpt-4o |
| Railway Deploy | https://docs.railway.app |
| Socket.io | https://socket.io/docs/v4 |
| jsPDF | https://artskydj.github.io/jsPDF/docs |

---

## 16. Contato / Contexto de Quem Iniciou o Projeto

- Produto iniciado por Flavio (`pocmicrosoft2025@gmail.com`)
- Desenvolvido com suporte do Claude (Anthropic) via Cowork mode
- Histórico de decisões de produto: ver `DIRECAO_SAAS.md`
- Histórico de decisões técnicas: ver este arquivo + commits do Git
