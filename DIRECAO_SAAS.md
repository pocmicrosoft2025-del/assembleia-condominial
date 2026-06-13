# QuorumHub - Direcao SaaS da Plataforma de Assembleias Condominiais

Este documento registra as decisoes de produto, arquitetura e evolucao do sistema. A ideia e evitar que o projeto se perca conforme novas funcionalidades forem surgindo.

## Nome do Produto

O nome de mercado escolhido para o produto e **QuorumHub**.

O nome comunica a ideia de uma central de assembleias, quorum, votacao, atas, documentos e registros. A expressao "Sindico Digital" podera ser usada como linguagem comercial ou conceito de marketing, mas nao como marca principal.

Descricao curta:

**QuorumHub - Do quorum a ata, tudo em um so lugar.**

## Contexto do Projeto

Este projeto nasceu da necessidade de criar uma ferramenta para apoiar a apuracao de votos em assembleias condominiais.

No cenario original, o problema era simples de explicar, mas delicado de resolver:

- uma assembleia possui pautas a serem votadas;
- cada unidade deve ter direito a apenas um voto por pauta;
- um condomino pode representar mais de uma unidade;
- um inquilino ou representante pode votar se tiver procuracao valida;
- a procuracao precisa ser anexada e auditavel;
- o resultado precisa ser exportado para registro e conferencia.

Com a evolucao da ideia, ficou claro que o produto nao deveria ser apenas uma tela de votacao. Ele deve se tornar uma plataforma de apoio a assembleias condominiais, cobrindo desde a preparacao da reuniao ate a geracao da ata final.

## O Que E o App

O app e uma plataforma digital para gestao, conducao, votacao, registro e documentacao de assembleias condominiais.

Ele combina:

- cadastro de assembleias;
- cadastro de unidades;
- cadastro de votantes autorizados;
- controle de procuracoes;
- controle de presenca;
- abertura e fechamento de pautas;
- votacao por unidade;
- apuracao em tempo real;
- calculo de quorum;
- painel administrativo;
- tela de votacao para participantes;
- modo de projecao;
- exportacao de resultados;
- geracao de ata;
- historico e rastreabilidade.

Na visao SaaS, cada cliente podera administrar seus condominios e assembleias dentro da mesma plataforma, com isolamento de dados, usuarios, permissoes e historico proprio.

## Seguranca e Privacidade by Design

Seguranca nao e um acabamento posterior do QuorumHub. Como o produto trata dados pessoais, documentos, CPFs, procuracoes, presencas, votos, registros de assembleia e futuramente gravacoes/transcricoes, toda evolucao deve ser pensada com seguranca e privacidade desde o desenho.

Uma aplicacao visualmente excelente, mas insegura, nao serve para este projeto.

Diretrizes obrigatorias:

- Coletar apenas os dados necessarios para conduzir e registrar a assembleia.
- Proteger dados pessoais por padrao, evitando exposicao desnecessaria de CPF, documentos e arquivos.
- Mascarar ou reduzir dados sensiveis em telas, logs e auditorias sempre que o dado completo nao for indispensavel.
- Garantir isolamento entre condominios, usuarios e assembleias antes de qualquer uso em producao.
- Exigir autenticacao real, sessoes seguras e papeis/permissoes antes de tratar o produto como SaaS comercial.
- Registrar eventos relevantes sem transformar logs em vazamento de dados pessoais.
- Tratar procuracoes, atas, relatorios, gravacoes e transcricoes como informacoes sensiveis.
- Planejar backups, restauracao, controle de acesso e criptografia antes de ambiente web definitivo.
- Nunca integrar Daily/OpenAI ou qualquer servico externo enviando dados sensiveis sem controle claro de finalidade, custo, retencao e acesso.
- Considerar LGPD, minimizacao de dados, necessidade, finalidade, transparencia e seguranca como premissas do produto.

Decisao de projeto: quando houver conflito entre velocidade e protecao de dados pessoais, a protecao prevalece. Podemos acelerar desenvolvimento, mas nao normalizar atalhos inseguros.

## Finalidade

A finalidade do produto e reduzir falhas, discussoes e retrabalho em assembleias condominiais.

O sistema deve ajudar o sindico, administradora ou condutor da assembleia a responder perguntas importantes:

- quem podia votar?
- quem estava presente?
- qual unidade foi representada por quem?
- havia procuracao?
- a unidade ja votou nesta pauta?
- qual foi o resultado?
- o quorum foi atingido?
- a ata reflete corretamente o que foi deliberado?
- existe registro para auditoria posterior?

O produto tambem busca transformar uma reuniao muitas vezes confusa e manual em um fluxo mais organizado, transparente e confiavel.

## Publico-Alvo

O publico inicial do produto e formado por:

- sindicos profissionais;
- sindicos moradores;
- administradoras de condominios;
- condominios de pequeno e medio porte;
- condominios que realizam assembleias presenciais, hibridas ou online;
- condutores de assembleia que precisam registrar votos, atas e documentos.

No futuro, o produto pode atender tambem administradoras com varios condominios, exigindo recursos de multi-conta, permissoes e relatorios por carteira.

## Problemas Que o Produto Resolve

### Voto duplicado

Uma unidade nao pode votar duas vezes na mesma pauta. O sistema deve bloquear duplicidade por unidade, mesmo que a pessoa tente recarregar a pagina, entrar novamente ou fazer uma requisicao manual.

### Representacao por procuracao

Representantes e inquilinos nao devem se autodeclarar autorizados. O votante autorizado deve ser cadastrado previamente pelo administrador, e a procuracao deve ser anexada antes da assembleia.

### Apuracao manual

Contagem manual de votos e sujeita a erro. O sistema deve apurar votos em tempo real e mostrar placares claros.

### Quorum

O sistema deve ajudar a verificar quorum de instalacao e quorum de aprovacao por pauta.

### Ata e registro

O produto deve reduzir a necessidade de escrever ata manualmente depois da reuniao. A meta e gerar ata formal com base em pautas, votos, presenca, procuracoes e, futuramente, transcricao.

### Rastreabilidade

Toda acao relevante precisa deixar rastro: abertura da assembleia, entrada de participante, voto, fechamento de pauta, resultado e exportacao.

## Recursos Existentes no Protótipo Atual

O prototipo atual ja contempla:

- servidor Node.js com Express;
- comunicacao em tempo real com Socket.io;
- interface web em HTML/CSS/JavaScript;
- login administrativo com senha;
- limite de tentativas de login administrativo;
- cadastro de assembleia;
- cadastro de unidades;
- cadastro de votante autorizado por unidade;
- upload de procuracao;
- cadastro de pautas;
- abertura e fechamento de votacao por pauta;
- voto unico por unidade em cada pauta;
- suporte a condomino representando mais de uma unidade;
- calculo de resultado por tipo de quorum;
- painel administrativo;
- tela de votacao do participante;
- modo de projecao;
- QR Code/codigo de acesso;
- exportacao em PDF;
- exportacao em Excel;
- dados demo para simulacao;
- persistencia local em `data.json`;
- suporte inicial a PostgreSQL via `DATABASE_URL`;
- fallback local quando nao ha banco configurado.

## Recursos Planejados

Os recursos planejados para a evolucao SaaS incluem:

- contas de usuario;
- multiplos condominios;
- permissoes por papel;
- banco PostgreSQL normalizado;
- armazenamento de anexos em disco/servico de arquivos;
- logs de auditoria;
- historico completo de assembleias;
- painel do cliente;
- planos e assinatura;
- cobranca por uso de IA/gravação;
- integracao Daily para reuniao online;
- gravacao da assembleia;
- transcricao por OpenAI;
- geracao de ata por IA;
- revisao humana da ata;
- exportacao e armazenamento da ata final;
- manual operacional;
- documentacao tecnica completa.

## Inicio, Meio e Fim do Produto

### Inicio

O produto comeca como uma ferramenta para preparar e conduzir votacoes condominiais com seguranca minima:

- cadastrar unidades;
- definir votantes autorizados;
- anexar procuracoes;
- votar por pauta;
- impedir duplicidade;
- exportar resultado.

### Meio

O produto evolui para uma plataforma SaaS operavel:

- varios condominios;
- usuarios e permissoes;
- historico;
- banco estruturado;
- backups;
- hospedagem em VPS;
- painel administrativo;
- primeira oferta comercial.

### Fim Desejado

O produto se torna uma plataforma completa de assembleias digitais:

- reuniao online integrada;
- gravacao;
- transcricao;
- ata por IA;
- trilha de auditoria;
- documentos vinculados;
- cobranca recorrente;
- uso por sindicos e administradoras;
- operacao comercial sustentavel.

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

## Estrategia de Infraestrutura

Para a primeira fase de desenvolvimento e demonstracao, a estrategia preferida e continuar local-first pelo maior tempo pratico possivel. A VPS deve ser postergada ate existir uma necessidade concreta de acesso externo estavel, piloto remoto ou validacao com clientes fora da maquina local.

Essa decisao reduz custo recorrente antes da hora e protege o caixa do projeto enquanto ainda estamos lapidando produto, fluxo e proposta comercial.

### Ambiente Web Recomendado Quando Chegar a Hora

- 1 VPS Linux.
- App Node.js.
- PostgreSQL na propria VPS.
- Armazenamento local para arquivos.
- Proxy HTTPS com Caddy ou Nginx.
- Backup automatico diario.
- Docker ou Docker Compose para facilitar instalacao e manutencao.

Essa abordagem deve ser usada quando a VPS fizer sentido. Nesse momento, ela reduz custo em comparacao a servicos gerenciados, simplifica operacao inicial e permite validar clientes antes de migrar para uma arquitetura mais distribuida.

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
- Postergar contratacao/configuracao de VPS ate o limite pratico do desenvolvimento local.
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

- Iniciado em 10/06/2026: o app agora possui metadados de condominio ativo, tela administrativa de condominio e vinculo inicial de assembleia, unidades e pautas ao condominio atual.
- Em 13/06/2026: primeira versao de autenticacao real criada, com usuario administrativo por e-mail, senha hasheada, sessao vinculada ao usuario e base inicial de papeis.
- Criar modelo multi-condominio.
- Criar login real por usuario.
- Criar papeis: dono da conta, sindico, operador/condutor, participante.
- Isolar dados por condominio.
- Normalizar o PostgreSQL.
- Criar logs de auditoria.
- Definir baseline de seguranca e privacidade by design.

### Fase 2 - Operacao em VPS

Esta fase fica deliberadamente postergada ate o produto local exigir demonstracao externa estavel, piloto remoto ou ambiente web de validacao.

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
- Segurança e privacidade devem nascer com cada funcionalidade, nao depois dela.
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
