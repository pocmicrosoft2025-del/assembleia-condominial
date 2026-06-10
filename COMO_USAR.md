# QuorumHub — Assembleias Condominiais

## Requisitos

- **Node.js** versão 18 ou superior  
  Download: https://nodejs.org/pt-br/download (escolha "LTS")

---

## Instalação (apenas na primeira vez)

1. **Delete a pasta `node_modules`** (se ela existir na pasta `PROJETO_QUORUM_HUB`) — selecione e pressione Delete no Windows Explorer
2. Abra o **Prompt de Comando** nesta pasta  
   _(dica: na barra de endereço do Explorer, digite `cmd` e pressione Enter)_
3. Execute:
   ```
   npm install
   ```

---

## Como iniciar o sistema

```
node server.js
```

O terminal mostrará algo como:
```
✅  Servidor rodando em http://localhost:3000
💾  Persistência: data.json local ou PostgreSQL
🔑  Senha do administrador configurada por ADMIN_PASSWORD
```

---

## Acessando o sistema

### No computador do administrador:
- Abra o navegador e acesse: **http://localhost:3000**
- Clique em **"Acesso do Administrador"**
- Senha padrão: `admin123`

### Participantes (na mesma rede Wi-Fi):
1. Descubra o IP da máquina onde o servidor está rodando:
   - Windows: abra o Prompt de Comando e digite `ipconfig`
   - Anote o "Endereço IPv4" (ex: `192.168.1.100`)
2. Participantes acessam pelo celular/notebook: `http://192.168.1.100:3000`
3. Clicam em **"Participar da Assembleia"** e inserem o código fornecido pelo admin

---

## Fluxo da Assembleia

### Administrador:

1. **Condomínio** — Revise ou preencha os dados do condomínio ativo
2. **Assembleia** — Preencha o nome, data, local e descrição
3. **Unidades** — Cadastre cada unidade com número, proprietário e CPF
   _(ou importe um CSV com colunas: `numero,proprietario,cpf`)_
4. **Pautas** — Adicione cada item da ordem do dia
5. **Iniciar** — Clique em "Abrir Assembleia" e compartilhe o código de acesso
6. **Painel ao vivo** — Abra/feche a votação de cada pauta individualmente
7. Ao final, exporte os resultados em **PDF** e/ou **Excel**

### Participantes:

1. Acessam o link pelo celular/navegador
2. Inserem o código da assembleia e o CPF autorizado pelo administrador
3. Confirmam a(s) unidade(s) que irão representar
   - Se **inquilino** ou **representante**, a procuração deve ter sido anexada pelo administrador
4. Votam em cada pauta quando ela for aberta pelo administrador

---

## Procuração (inquilinos e representantes)

- O arquivo deve ser assinado pelo proprietário
- Formatos aceitos: **PDF, JPG, PNG** (máximo 10 MB)
- O administrador pode visualizar o documento enviado pelo painel
- O voto fica marcado como "com procuração" no relatório final

---

## Alterar a senha do administrador

Edite o arquivo `server.js` e altere a linha:
```js
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
```
Ou defina a variável de ambiente `ADMIN_PASSWORD` antes de iniciar:
```
ADMIN_PASSWORD=minhaSenha node server.js
```

---

## Atenção

- Os dados são salvos em `data.json` no uso local ou em PostgreSQL quando `DATABASE_URL` estiver configurada.
- Mantenha o computador ligado e conectado à rede durante toda a assembleia.
- Recomenda-se usar uma conexão Wi-Fi estável ou rede local cabeada.
