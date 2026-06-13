# QuorumHub - Seguranca e Privacidade by Design

Este documento define a postura minima de seguranca do QuorumHub.

O produto trata dados pessoais e informacoes sensiveis de assembleias condominiais: nomes, CPFs, unidades, procuracoes, presencas, votos, atas, relatorios e futuramente gravacoes/transcricoes. Portanto, seguranca nao e um detalhe final; e requisito de produto, arquitetura e operacao.

## Principio Central

Uma aplicacao bonita e funcional, mas insegura, nao esta pronta para uso real.

Quando houver conflito entre velocidade de entrega e protecao de dados pessoais, a protecao prevalece.

## Dados Sensíveis

Devem ser tratados como sensiveis:

- CPF de proprietarios, representantes e participantes.
- Nome de moradores, proprietarios, inquilinos e procuradores.
- Relacao entre unidade e votante autorizado.
- Procuracoes anexadas.
- Presenca em assembleia.
- Votos registrados.
- Atas, PDFs e planilhas exportadas.
- Logs de auditoria.
- Futuras gravacoes, transcricoes e atas geradas por IA.

## Regras de Desenho

- Coletar apenas o necessario.
- Exibir apenas o necessario.
- Mascarar CPF quando o dado completo nao for indispensavel.
- Validar autorizacao no servidor, nao apenas no navegador.
- Separar dados por condominio e assembleia.
- Registrar auditoria sem expor dados sensiveis em excesso.
- Evitar dados pessoais em mensagens de erro, logs tecnicos e console.
- Proteger anexos e relatorios como documentos sensiveis.
- Revisar impacto de seguranca antes de integrar servicos externos.

## Antes de Uma Feature Ser Considerada Pronta

Toda feature nova deve responder:

- Quais dados pessoais ela coleta, mostra, altera ou exporta?
- Quem pode acessar esses dados?
- A permissao e validada no servidor?
- O dado aparece em tela, log, auditoria, PDF ou Excel?
- O dado precisa aparecer completo ou pode ser mascarado?
- O dado fica salvo? Onde? Por quanto tempo?
- Existe risco de um condominio acessar dados de outro?
- Existe risco de participante acessar informacao administrativa?
- Existe auditoria suficiente sem vazamento desnecessario?

## Baseline Antes de Piloto Real

Antes de usar dados reais de terceiros em piloto:

- Autenticacao real por usuario.
- Sessoes seguras.
- Papeis e permissoes.
- Isolamento multi-condominio.
- Revisao de exposicao de CPF e procuracoes.
- Backup e restore testados.
- Politica minima de retencao/exclusao de dados.
- Revisao LGPD basica.
- Registro claro de quem operou a assembleia.

## Baseline Antes de Ambiente Web

Antes de expor fora da maquina local:

- HTTPS obrigatorio.
- Senhas e secrets fora do codigo.
- `ADMIN_PASSWORD` configurada por ambiente.
- Banco protegido e com backup.
- Arquivos sensiveis fora de pasta publica.
- Logs sem dados pessoais excessivos.
- Controle de acesso testado.
- Rotas administrativas bloqueadas sem token/sessao valida.

## Daily/OpenAI

Antes de ativar recursos Daily/OpenAI:

- Mapear quais dados serao enviados a terceiros.
- Validar finalidade de uso.
- Validar custo, retencao e acesso aos arquivos.
- Permitir revisao humana de transcricao e ata.
- Evitar enviar mais dados do que o necessario.
- Documentar claramente o fluxo de gravacao, transcricao e geracao de ata.

## Estado Atual

Ja existe:

- Validacao server-side de CPF autorizado.
- Bloqueio de voto duplicado por unidade/pauta.
- Login administrativo por usuario, e-mail e senha com hash PBKDF2 + salt.
- Token de sessao admin vinculado ao usuario logado.
- Base inicial de papeis: `owner`, `admin`, `operator` e `participant`.
- Limite de tentativas de login admin.
- Procuracao obrigatoria para representante.
- Auditoria operacional basica.

Ainda falta antes de piloto real:

- Tela de gestao de usuarios.
- Recuperacao/troca de senha.
- Permissoes granulares por perfil.
- Isolamento real multi-tenant.
- Modelo de dados normalizado.
- Politica de retencao de dados.
- Revisao LGPD.
