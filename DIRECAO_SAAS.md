# Direcao SaaS - Plataforma de Assembleias Condominiais

Este documento registra as decisoes de produto, arquitetura e evolucao do sistema. A ideia e evitar que o projeto se perca conforme novas funcionalidades forem surgindo.

## Visao do Produto

O sistema deixa de ser apenas um app local de votacao e passa a ser tratado como uma plataforma SaaS para assembleias condominiais digitais.

O objetivo comercial e oferecer aos sindicos e administradoras uma ferramenta completa para:

- organizar assembleias;
- cadastrar unidades e votantes autorizados;
- validar procuracoes;
- controlar presenca e quorum;
- impedir voto duplicado por unidade;
- apurar resultados em tempo real;
- gerar ata formal;
- gravar a reuniao;
- transcrever a reuniao;
- gerar ata assistida por IA;
- manter historico e provas da assembleia.

## Diferencial Principal

O grande diferencial do produto sera o fluxo completo:

1. Reuniao online integrada.
2. Gravacao da assembleia.
3. Captura do audio dos participantes.
4. Transcricao automatica.
5. Geracao de ata por IA.
6. Vinculo entre ata, votos, procuracoes e resultados.

Por isso, Daily/OpenAI fazem parte da visao final do produto. Eles nao serao tratados como "extra opcional" de baixo valor, mas como recurso premium e diferencial competitivo.

Mesmo assim, a implementacao sera feita depois da fundacao SaaS estar pronta, para evitar retrabalho.

## Estrategia de Infraestrutura Inicial

Para a primeira fase comercial, a estrategia preferida e comecar simples e com custo controlado.

### Ambiente Inicial Recomendado

- 1 VPS Linux.
- App Node.js.
- PostgreSQL na propria VPS.
- Armazenamento local para arquivos.
- Proxy HTTPS com Caddy ou Nginx.
- Backup automatico diario.
- Docker ou Docker Compose para facilitar instalacao e manutencao.

Essa abordagem reduz custo, simplifica operacao e permite validar clientes antes de migrar para servicos gerenciados.

### Evolucao Futura

Quando houver clientes e receita recorrente, poderemos migrar gradualmente:

- PostgreSQL local -> banco gerenciado.
- Arquivos locais -> S3, Cloudflare R2 ou similar.
- Logs simples -> monitoramento centralizado.
- Processamento direto -> filas/background jobs.
- Daily/OpenAI -> pipeline completo de reuniao, gravacao, transcricao e ata.

## Decisoes Arquiteturais

### Curto Prazo

- Manter o app funcional localmente.
- Manter fallback com `data.json` para desenvolvimento.
- Usar PostgreSQL quando `DATABASE_URL` existir.
- Preparar o banco para evoluir de `JSONB` para tabelas normalizadas.

### Medio Prazo

Criar estrutura SaaS multi-condominio:

- usuarios;
- condominios;
- permissoes;
- assembleias;
- unidades;
- votantes autorizados;
- pautas;
- votos;
- procuracoes;
- presencas;
- atas;
- logs de auditoria.

### Longo Prazo

Adicionar recursos premium:

- sala Daily integrada;
- gravacao em nuvem;
- processamento de gravacao;
- transcricao por OpenAI;
- geracao de ata por IA;
- revisao e aprovacao da ata;
- armazenamento seguro de anexos;
- cobranca por assinatura e/ou por assembleia.

## Roadmap Proposto

### Fase 1 - Fundacao SaaS

- Criar modelo multi-condominio.
- Criar login real por usuario.
- Criar papeis: dono da conta, sindico, operador/condutor, participante.
- Isolar dados por condominio.
- Normalizar o PostgreSQL.
- Criar logs de auditoria.

### Fase 2 - Operacao em VPS

- Criar Docker Compose.
- Rodar app + PostgreSQL.
- Configurar HTTPS.
- Configurar backup automatico.
- Criar manual de operacao.
- Criar procedimento de restore.

### Fase 3 - Produto Comercial Inicial

- Painel do cliente.
- Cadastro de condominios.
- Cadastro/importacao de unidades.
- Cadastro de votantes autorizados.
- Gestao de procuracoes.
- Assembleias, pautas, quorum, votos e ata formal.
- Historico de assembleias.

### Fase 4 - Daily/OpenAI

- Integrar Daily para videoconferencia.
- Criar sala por assembleia.
- Controlar papel do condutor.
- Iniciar/parar gravacao.
- Recuperar gravacao.
- Enviar audio/video para transcricao.
- Gerar ata por IA com base na transcricao e resultados.
- Permitir revisao humana antes de exportar.

### Fase 5 - Monetizacao

- Definir planos.
- Criar limites por plano.
- Integrar meio de pagamento.
- Criar tela de assinatura.
- Criar controle de uso de IA/gravação.

## Politica de Custos

No inicio, o produto deve evitar dependencia de muitos servicos pagos.

Custos iniciais previstos:

- VPS mensal.
- Dominio.
- Eventual backup externo barato.

Custos premium futuros:

- Daily para reuniao/gravacao.
- OpenAI para transcricao/geracao de ata.
- Storage externo, se necessario.

Daily/OpenAI devem ser precificados dentro do plano premium ou cobrados como uso adicional, para que o custo variavel nao comprometa a margem.

## Principios do Projeto

- Nao complicar antes de validar.
- Nao abrir mao de seguranca juridica e rastreabilidade.
- Cada voto deve pertencer a uma unidade.
- Uma unidade nao pode votar duas vezes na mesma pauta.
- Procuracao deve ser validada antes da assembleia.
- Toda acao relevante deve ser auditavel.
- Toda evolucao importante deve ser documentada.
- O produto deve ser simples para o sindico, mesmo que a engenharia por tras seja cuidadosa.

## Proxima Acao Recomendada

A proxima etapa tecnica deve ser transformar o banco em estrutura SaaS real, com tabelas normalizadas e suporte a multiplos condominios.

Antes de implementar Daily/OpenAI, precisamos garantir que a base multi-condominio esteja correta, pois gravacoes, transcricoes e atas precisam pertencer a um condominio e a uma assembleia especifica.
