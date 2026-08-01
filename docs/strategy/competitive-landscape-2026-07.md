# Paysage concurrentiel d'Inspectrum — juillet 2026

État : analyse stratégique fondée sur des sources consultées le 30 juillet
2026. Les capacités actuelles sont des faits sourcés ; les projections à 12 et
24 mois sont des inférences explicitement signalées.

## Résumé de décision

La contre-analyse réfute la promesse générique d'Inspectrum :
**« demander une seconde opinion à un autre modèle » est déjà une commodité**.
Un développeur peut la reproduire avec un skill, un hook et deux appels
headless en un à trois jours. Les harnais natifs proposent déjà sous-agents,
équipes, revue, hooks, sorties structurées et traces. Les SDK rendent
« reviewers parallèles + juge » banal. Les produits de pull request possèdent
la distribution, les annotations et l'apprentissage qu'Inspectrum n'a pas.

Le seul espace qui mérite encore une expérience est plus étroit :
**un checkpoint de revue portable et mesuré à une frontière de risque**, qui
conserve la provenance, le désaccord, les budgets, les échecs et la décision
humaine. Même cet espace n'est pas un moat aujourd'hui. Il ne le devient que si
des données réelles montrent quels reviewers trouvent quels défauts
supplémentaires à budget égal, et si ces données réduisent le bruit et les
retours arrière.

Conséquences :

- revue de plan : créneau expérimental principal, sous condition de preuve ;
- revue de changements : extension d'expérience, pas prochaine « version
  évidente » ;
- commit et pull request : repousser ; marché saturé et fonctions natives
  fortes ;
- pair programming : abandonner comme produit autonome ;
- discussion multi-modèles : abandonner le débat libre ; conserver seulement
  un comparateur de désaccords en un tour.

## Méthode et niveau de preuve

Le registre contient [198 sources](evidence/competitive-source-ledger.csv) :
90 documentations officielles, 15 releases, 9 lignes classées
`peer-reviewed paper`, plus 2 pages de prépublication d'articles évalués par
les pairs, des préprints, dépôts, prix, issues et communautés. Les signaux
communautaires couvrent notamment 22 pages Reddit, 6 fils Hacker News,
31 pages GitHub et 2 vidéos YouTube. Ce volume décrit la largeur de collecte,
pas la force d'une conclusion.

Ces comptes descriptifs se recouvrent : « page GitHub » est un domaine, pas une
classe de preuve. Une normalisation mutuellement exclusive des `source_type`
donne exactement **135 sources produit/standard primaires, 25 sources de
recherche et 38 sources communautaires**, soit 198.
Les identifiants ne sont volontairement pas continus après fusion des vagues
de recherche ; le nombre de lignes du registre, pas le dernier numéro, fait
foi.

Le contrôle automatisé du 30 juillet 2026 atteint directement 193 URL sur 198
(réponse HTTP 2xx/3xx). Deux pages OpenAI répondent 403, deux fils Hacker News
429, et la page Sonar Review répond 404 au client direct alors que son contenu
reste indexé par la recherche officielle. Ces cinq exceptions sont des limites
d'accès ou de stabilité, pas des preuves négatives sur les produits. Le CSV
contient 145 lignes classées de qualité haute, 41 moyenne ou moyenne-haute et
12 basse ou basse-moyenne ; cette auto-classification facilite le triage mais
ne remplace pas l'examen de la méthode de chaque source.

Les 12 lignes basses ou basses-moyennes ne soutiennent que des anecdotes
signalées comme telles : confusion des surfaces de configuration, règle
ignorée, friction MCP, pertes de handoff, coût/observabilité multi-agent,
traitement du désaccord et du juge, cadrage confidentialité, un finding
CodeRabbit et une démonstration vidéo. Aucun seuil, choix de wedge ou argument
de moat ne dépend seul de ces lignes.

Chaque source porte une affirmation, un signal, une qualité et ses limites.
Les règles suivantes s'appliquent :

- documentation et code : preuve de capacité, jamais de qualité ;
- papier ou mesure reproductible : preuve limitée à son protocole ;
- benchmark fournisseur : affirmation du fournisseur, pas classement
  indépendant ;
- Reddit, Hacker News, forum, issue ou vidéo : anecdote, pas fréquence ni
  volonté de payer ;
- étoiles, téléchargements et sponsoring : exclus comme preuve de valeur.

Trois lots indépendants ont mené deux vagues tardives chacun. Ils ont ajouté
des noms — Windsurf, Warp, Korbit, Kodus, Cubic, Ellipsis, Sonar Review — mais
plus aucune catégorie matérielle. La recherche est arrêtée par **saturation de
catégories**, pas par quota. Les accès automatisés bloqués en 403/429, pages
vivantes sans date et transcripts absents sont consignés dans le ledger.

## Taxonomie des substituts

| Famille | Exemple minimal | Ce qu'elle remplace | Limite qui peut rester utile à Inspectrum |
|---|---|---|---|
| Instruction ou skill | `AGENTS.md` / `SKILL.md` demandant une revue fraîche | prompt, rôle, format et étape volontaire | déclenchement et conformité restent probabilistes |
| Sous-agent ou mode reviewer | agent lecture seule, modèle et outils dédiés | contexte frais, spécialisation, attribution basique | schémas et garanties diffèrent par harnais |
| Script ou intégration continue | deux interfaces en ligne de commande + JSON + fichier | fan-out, validation, timeout, journal | maintenance des identités, versions, quotas et erreurs |
| Hook natif | sortie de plan, `Stop`, avant commit ou push | déclenchement déterministe et blocage/réessai | événements et UX non portables |
| Serveur MCP générique | outil `review_plan` ou « council » | invocation typée et portée multi-client | le client peut ne jamais l'appeler ; nouvelle surface de confiance |
| Équipe ou Oracle natif | Claude/Codex/Cline teams, Amp Oracle | parallèle, débat et second fournisseur | coût, contexte et erreurs corrélées |
| SDK d'agents | graphe reviewer → critique → juge | reprise, budgets, tracing et humain dans la boucle | ce sont des primitives, pas une preuve de meilleure décision |
| Contrôle déterministe | tests, schémas, policy-as-code, analyse statique | invariants vérifiables avec faible bruit | ne comprend pas l'intention métier |
| Produit de pull request | bot natif ou spécialiste | installation, inline, historique et workflow d'équipe | bruit, confidentialité, coût par push |

L'alternative de référence n'est donc pas « ne rien faire ». C'est :

```text
skill portable
  → hook natif
  → deux appels headless indépendants
  → schéma JSON + délai + artefacts
  → validation humaine
```

Cette pile est inspectable, utilise des abonnements existants et évite une
nouvelle dépendance. Son coût initial est faible ; sa maintenance sur 90 jours
est moyenne. Inspectrum doit battre ce témoin, pas une copie manuelle naïve.

## Harnais de codage : matrice de substitution

Les cellules décrivent les capacités documentées au 30 juillet 2026.

| Harnais | Instructions / skills | Reviewer ou équipe | Hook / politique | Headless / contrat | Menace principale |
|---|---|---|---|---|---|
| [Claude Code](https://code.claude.com/docs/en/features-overview) | `CLAUDE.md`, rules, skills, plugins | sous-agents, teams, `/review`, `/code-review`, `/ultrareview` | hooks bloquants, événements agent et outils | print + JSON Schema, coût/usage | peut emballer presque tout le flux dans un plugin natif |
| [Codex](https://learn.chatgpt.com/docs/agent-configuration/subagents) | `AGENTS.md`, skills, plugins | sous-agents natifs, `/review`, revue GitHub | hooks, permissions, sandbox | exécution non interactive et sortie structurée | revue locale de working tree/base/commit déjà native |
| [Gemini CLI](https://geminicli.com/docs/hooks/reference/) | `GEMINI.md`, `AGENTS.md`, extensions, skills | sous-agents en préversion | hooks JSON et policy engine | headless / JSON | `AfterAgent` peut refuser une sortie et relancer |
| [OpenCode](https://opencode.ai/docs/agents) | rules, commands, skills | agent reviewer lecture seule | permissions ordonnées et plugins | oui | recette reviewer déjà documentée |
| [Cursor](https://docs.cursor.com/en/cli/using) | `.cursor/rules`, `AGENTS.md` | modes, agents en arrière-plan, Bugbot | guardrails ; hooks moins complets dans les sources | print JSON, mais accès en écriture à surveiller | possède éditeur, contexte et revue avant push |
| [GitHub Copilot](https://docs.github.com/en/copilot/concepts/agents/code-review) | instructions, `AGENTS.md`, skills multi-chemins | agent code review natif | hooks CLI/cloud | GitHub Actions, IDE et CLI | distribution GitHub et revue automatique |
| [Aider](https://aider.chat/docs/usage/modes.html) | conventions et contexte manuel | architect + editor | lint/test/git | scriptable | le pair planning/exécution existe depuis longtemps |
| [Continue](https://docs.continue.dev/cli/headless-mode) | rules et prompts | séparation de modes | politiques par outil | CLI headless ; recette hook Git | `git diff | reviewer` est déjà documenté |
| [Cline](https://docs.cline.bot/features/subagents) | rules, `AGENTS.md`, skills | sous-agents et teams CLI | huit types de hooks | JSON et coûts enfants | contrôle de coût/lecture seule déjà visible |
| [Roo Code](https://docs.roocode.com/features/boomerang-tasks) | règles par mode | Orchestrator / Boomerang | groupes d'outils et approbations | partiel | summaries perdent une partie de la preuve |
| [Kilo Code](https://kilo.ai/docs/customize/custom-subagents) | rules et skills | reviewer spécialisé, PR review | permissions et sandbox | oui | reviewer à modèle/étapes/permissions configurables |
| [goose](https://block.github.io/goose/) | skills et recettes YAML | sous-agents, adversary reviewer | permissions et sandbox | recettes CI et API | offre déjà un reviewer modèle-neutre |
| [Amp](https://ampcode.com/manual) | `AGENTS.md` et règles | review agent et Oracle cross-vendor | permissions SDK | CLI/plugin API | exemple direct d'avis cross-vendor ; le rend lent/cher et optionnel |
| [OpenHands](https://docs.openhands.dev/openhands/usage/cli/command-reference) | repository skills | composition SDK | sandbox, approbations, sécurité | JSONL | orchestration ouverte, plus lourde à installer |
| [Windsurf](https://docs.windsurf.com/de/windsurf/cascade/hooks) | rules et `AGENTS.md` | modes Cascade | hooks système/utilisateur/workspace | partiel | ajoute blocage et audit d'appels MCP |
| [Warp](https://docs.warp.dev/agent-platform/capabilities/rules) | reconnaît huit formats de règles | plateforme agent | rules/policies | oui | étend la convergence des formats, pas une nouvelle catégorie |

Lecture : la capacité est banalisée. La différence possible se déplace vers la
qualité mesurée, la politique de panne portable et l'historique de décisions.

## Orchestration : « plusieurs agents + juge » n'est pas un moat

### Le bon « Hermes »

Le projet pertinent est
[NousResearch/Hermes Agent](https://github.com/NousResearch/hermes-agent/blob/main/AGENTS.md),
observé en release `v2026.7.20`, et non le modèle Hermes 3 ni d'autres
homonymes. Hermes Agent expose délégation isolée, concurrence et profondeur
bornées, plusieurs fournisseurs, mixture-of-agents, skills et MCP
[OD-HERMES-001 à 003]. Il remplace directement un « comité de reviewers »
configurable pour ses utilisateurs.

### SDK et frameworks

| Famille | Produits observés | Primitives déjà disponibles | Conséquence |
|---|---|---|---|
| SDK fournisseurs | [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview), [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/multi_agent/) | sous-agents, hooks, MCP, sorties typées, handoffs, agents-outils, guardrails, sessions, tracing et parallèle | une boucle reviewers + juge tient dans peu de code |
| Microsoft | [Agent Framework](https://learn.microsoft.com/en-us/agent-framework/overview/), AutoGen, Semantic Kernel | graphes typés, checkpoints, approbations, sessions, group chat, Magentic | la garantie opérationnelle générique devient bibliothèque |
| Graphes / workflows | [LangGraph](https://langchain-ai.github.io/langgraph/concepts/multi_agent/), [Mastra](https://mastra.ai/ai-workflows), [Pydantic AI](https://pydantic.dev/docs/ai/guides/multi-agent-applications/) | parallèle, branche, boucle, reprise, interruptions, idempotence, durable execution | Inspectrum ne possède pas ces primitives |
| Équipes | [CrewAI](https://docs.crewai.com/), [CAMEL](https://docs.camel-ai.org/key_modules/workforce), [Agno](https://docs.agno.com/teams/overview), [smolagents](https://huggingface.co/docs/smolagents/main/en/tutorials/building_good_agents) | crews/workforces, sorties structurées, humain, mémoire et métriques | un comité est une configuration |
| Plateformes cloud | [Google ADK](https://adk.dev/workflows/), [Strands/harness-sdk](https://strandsagents.com/docs/user-guide/concepts/multi-agent/graph/) | séquence, boucle, parallèle, A2A, délais, statuts, traces et évaluations | copie rapide par fournisseurs majeurs |
| Sociétés logicielles | [MetaGPT](https://github.com/FoundationAgents/MetaGPT), [ChatDev](https://github.com/OpenBMB/ChatDev) | rôles spécialisés et procédures de développement | le récit « agents qui discutent » est ancien et reproductible |

Le prototype [llm-council](https://github.com/karpathy/llm-council) suffit à
montrer la barrière technique : plusieurs avis via OpenRouter, classement
anonymisé et « président » dans une application locale. Son statut de
prototype non maintenu ne crée pas un moat pour le concept.

## Produits de revue : marché saturé

### Spécialistes

| Produit | Surface / garantie | Prix public observé | Menace pour Inspectrum |
|---|---|---:|---|
| [CodeRabbit](https://docs.coderabbit.ai/management/plans) | PR incrémentale, règles, sévérité, fixes, multi-dépôt, MCP | 24–30 $/développeur/mois Pro | large distribution et apprentissage ; bruit mesuré |
| [Qodo / PR-Agent](https://docs.qodo.ai/code-review) | agents spécialisés + juge, multi-forge, BYOK/entreprise | crédits ; montant simple non trouvé | architecture presque identique à « reviewers + juge » |
| [Greptile](https://www.greptile.com/docs/introduction) | graphe de dépôt, P0–P2, apprentissage, fixes | 30 $/développeur actif + dépassement | contexte et apprentissage, mais coût par revue |
| [Graphite Agent](https://graphite.com/docs/billing-plans) | revue dans stacked PR, règles, métriques d'acceptation | 20–40 $/siège/mois | avantage de distribution du workflow |
| [Bito](https://docs.bito.ai/help/billing-and-plans/overview) | Git/IDE/CLI, incrémental, plusieurs forges, self-hosted | 12–25 $/siège/mois | offre large à bas prix |
| [Sourcery](https://docs.sourcery.ai/Code-Review/Code-Reviews-on-Pull-Requests/Overview/) | PR/MR, IDE, règles, sécurité, interaction | prix privé exact non trouvé | promet une revue de collègue, admet ne pas encore l'égaler |
| [Cubic](https://www.cubic.dev/pricing-plans) | PR, CLI, agents personnalisés, wiki | 30–40 $/développeur/mois dans la source relevée | vend déjà le « faible bruit » |
| [Korbit](https://www.korbit.ai/index.html) | multi-forge, règles supérieures, on-prem | 12–15 $/utilisateur/mois dans la source relevée | pression prix forte |
| [Ellipsis](https://www.ellipsis.dev/pricing) | agents définis au dépôt, budgets, BYOK/private cloud | exemple vendeur ≈ 0,74 $/revue | orchestration programmable et budgétable |
| [Kodus](https://kodus.io/pricing/) | open source, hosted/self-hosted, BYOK, mémoire/MCP | 10 $/développeur + jetons | portabilité et BYOK déjà peu chers |

### Revue native

| Plateforme | Surface actuelle | Menace |
|---|---|---|
| Claude Code | revue locale, plugin quatre agents, ultrareview cloud, revue PR managée | très forte ; parallèle, vérification, budgets et check run natifs |
| OpenAI Codex | working tree, base, commit, GitHub `@codex review` et automatique | couvre exactement la revue de commit envisagée |
| GitHub Copilot | GitHub, CLI, mobile, IDE, automatique, effort, skills/MCP | distribution dominante ; modèle interne non exposé |
| Cursor Bugbot | GitHub/GitLab, `/review` avant push, règles et MCP | possède l'activation dans l'éditeur |
| GitLab Duo | merge request, CI, contexte projet, modèle sélectionnable, self-managed | prix annoncé de 0,25 $/revue et intégration native |
| Amazon Q | `/q review`, GitHub et IDE, règles et fixes | forte pour les clients AWS |

### Hybrides déterministes + IA

[Snyk/DeepCode](https://docs.snyk.io/scan-with-snyk/snyk-code),
[DeepSource](https://deepsource.com/),
[Sonar Review](https://docs.sonarsource.com/sonarqube-cloud/ai-capabilities)
et [Codacy](https://docs.codacy.com/codacy-ai/codacy-ai/)
combinent règles, analyse de flux, portes de branche et génération. Pour
sécurité, conformité et conventions explicites, leur échec est plus
interprétable qu'un vote de modèles.

## Ce que la recherche scientifique autorise à dire

### Résultats favorables, limités

- ReConcile rapporte jusqu'à `+11,4` points sur sept benchmarks et attribue une
  partie du gain à la diversité [OD-RES-001].
- Mixture-of-Agents rapporte `65,1 %` contre `57,5 %` pour GPT-4 Omni sur
  AlpacaEval 2.0 ; l'hétérogénéité bat des échantillons répétés dans son
  ablation [OD-RES-002].
- PairCoder rapporte `91,0 % pass@1`, jusqu'à `+20,3` points et `40–70 %` de
  tokens en moins que ses baselines multi-agents, mais seulement sur HumanEval,
  pas sur un dépôt réel [OD-RES-016].

### Résultats qui réfutent un bénéfice général

- Une étude Nature Machine Intelligence du 24 juillet 2026 trouve, sur six
  benchmarks et cinq architectures, un effet de `+80,8 %` à `-70,0 %` selon
  tâche/topologie, **0,0 % de gain agrégé moyen**, une légère dégradation sur
  SWE-bench et une saturation avec un agent fort. Son exploration de
  modèles hétérogènes reste préliminaire ; ce n'est pas une étude de revue de
  plan [OD-RES-004].
- MAST trouve `41 %` à `86,7 %` de traces multi-agents en échec selon les
  systèmes et tâches [OD-RES-005].
- Le débat n'aide que si le critique classe mieux que le juge et si le juge
  vérifie ses affirmations ; un seul tour réponse → critique → juge capture
  l'essentiel du gain [OD-RES-006].
- Sur des tâches de natural-language inference et RewardBench — pas de revue de
  code — neuf juges de sept familles représentent environ deux votes
  indépendants ; le meilleur juge seul égale ou bat le panel [OD-RES-008].
- Même entre fournisseurs, les erreurs sont corrélées sur un corpus de
  classements généralistes : parmi plus de 350 modèles, deux modèles qui se
  trompent donnent la même mauvaise réponse 60 % du temps. Ce chiffre est
  propre au dataset et ne mesure pas la revue de plan [OD-RES-009].
- La critique mono-modèle avec outils externes est un témoin sérieux. Tests,
  compilateurs, analyse statique et localisation d'erreur passent avant le
  nombre de logos [OD-RES-010 à 013].

Conclusion : **l'accord n'est pas une preuve, le désaccord n'est pas
automatiquement utile, et le juge est un risque**. Le produit doit conserver
les opinions et preuves séparées, puis mesurer l'erreur marginale. Le juge peut
éditer une synthèse ; il ne doit pas masquer la minorité ni simuler un vote
indépendant.

## Demande, vécu et volonté de payer

### Douleur crédible

Plusieurs communautés décrivent le même déplacement de coût : le code se
génère vite, mais un reviewer senior doit reconstruire intention et contexte.
Une anecdote estime `30–40 %` de temps économisé quand l'IA pré-trie avant
revue humaine [RMD-051] ; une autre décrit une fuite de confidentialité rare
détectée par CodeRabbit après qu'un reviewer humain a manqué l'interaction
[RMD-064]. Ce sont des tâches à accomplir plausibles, pas une mesure de marché.

### Bruit mesuré

- L'étude CodeRabbit sur `31 073` paires de revue/retour observe `56,3 %` de
  rejets et `36,4 %` d'acceptations ; faux positifs, redondance et hors-périmètre
  dominent [RMD-045].
- SWE-PRBench plafonne le meilleur système étudié à `31 %` de détection, avec
  `0,193–0,417` de faux positifs ; davantage de contexte plat dégrade les huit
  modèles du protocole [RMD-046].
- Les communautés répètent les mêmes mécanismes : nouvelle vague de findings
  après correction, contexte ignoré, sévérité erronée, plusieurs cycles de
  triage et alertes progressivement ignorées [RMD-050, 053–055, 060, 065].

Le bon objectif n'est pas le nombre de commentaires, mais les **défauts majeurs
confirmés uniques par minute de triage humain**.

### Paiement et quotas

Les prix montrent une catégorie financée, mais pas une volonté de payer pour
Inspectrum. Les anecdotes acceptent 15–25 $ pour authentification, paiement ou
données à haut risque ; elles refusent souvent un abonnement supplémentaire
quand Codex, Claude ou Copilot est déjà payé [RMD-050, 057–059]. Le coût par
push de Bugbot peut rendre la revue continue prohibitive [RMD-056].

Hypothèse de paiement : une équipe paiera pour un risque ou du temps senior
évité, pas pour « deux modèles ont parlé ». Elle doit être testée par pilote,
jamais inférée des tarifs concurrents.

### Confidentialité

« Local » décrit l'orchestrateur et le journal, pas le transit. Le plan ou le
code quitte la machine vers chaque reviewer cloud. CodeRabbit documente un
partage avec OpenAI/Anthropic ; Bito clone puis transmet du contexte ; Claude
Code Review managé est indisponible en Zero Data Retention ; plusieurs outils
proposent opt-out, BYOK ou moteur local [RMD-003, 014, 020, 028, 032].

Une promesse honnête doit séparer :

1. stockage du journal ;
2. transit du contenu ;
3. rétention et entraînement par fournisseur ;
4. possibilité de routage local ;
5. multiplication du périmètre avec chaque reviewer.

## Coût de substitution et garanties

| Garantie | Skill seul | Hook + script | SDK / produit spécialisé | Inspectrum aujourd'hui | Différentiel non prouvé |
|---|---|---|---|---|---|
| déclenchement | volontaire/probabiliste | déterministe par hôte | déterministe | déterministe sur `ExitPlanMode` Claude | portabilité réelle entre hôtes |
| contrat de sortie | convention | JSON possible | typé courant | Zod + structured MCP | stabilité sémantique et migrations |
| attribution | faible | complète si journalisée | agents/traces | reviewer attribué | modèle/version/effort au niveau du finding |
| trace | chat/fichier | artefact complet | tracing/checkpoints | session Markdown locale | replay, disposition humaine et historique calibré |
| échec | implicite | à coder | retries/branches | fail-open du gate | politique adaptée au risque et état partiel normalisé |
| budget | prompt | délai/coût/process | limites natives | timeout et tours | escalade adaptative à valeur marginale mesurée |
| reproductibilité | faible | moyenne | moyenne | hash/cache partiels | variance et fixtures réalistes versionnées |
| humain | manuel | explicite | interruptions/checks | approbation finale conservée | présentation qui réduit le temps de décision |

Le produit actuel combine utilement plusieurs cases. Mais chaque case est
copiable ; seule leur performance historique, mesurée sur des cas réels, peut
devenir coûteuse à reproduire.

Aucune source du ledger ne prouve qu'un système unique réunit déjà ces
garanties sur plusieurs harnais, ni qu'Inspectrum les exécute mieux. La
« garantie portable » est donc une **hypothèse intégrée à tester**, construite à
partir de primitives disponibles séparément — pas un différentiel actuel
validé.

## Risques de substitution à 12 et 24 mois

### Prévision à 12 mois — juillet 2027

**Inférences, confiance moyenne à forte :**

- skills et instructions multi-clients convergent davantage ; la copie du
  workflow devient moins chère ;
- hooks, sorties typées, sous-agents et revues de diff/PR deviennent standards
  dans les grands harnais ;
- OpenAI, Anthropic, GitHub, Cursor et GitLab ajoutent budgets, provenance et
  filtres anti-bruit à leurs revues ;
- les SDK absorbent reprise, approbation et observabilité ; aucune valeur
  durable dans un graphe reviewer/juge ;
- les seconds avis cross-vendor restent optionnels et activés par risque, comme
  l'Oracle d'Amp, car coût et latence empêchent un déclenchement universel ;
- MCP/A2A améliorent la portabilité mais élargissent les risques de confiance et
  de supply chain.

Fonctions copiables rapidement : nouveau backend, juge, agents parallèles,
sortie JSON, timeout, hook, résumé, stockage Markdown et plugin.

Actifs encore plausiblement défendables : corpus de défauts confirmés,
calibration par modèle/version/tâche, mesure de corrélation, historique de
disposition humaine et routage coût/qualité basé sur ces données.

### Prévision à 24 mois — juillet 2028

**Inférences, confiance moyenne :**

- le « plan » discret peut reculer face aux agents continus et aux exécutions
  longues ; un produit lié uniquement à `ExitPlanMode` risque l'obsolescence ;
- la frontière durable se déplace du nom de l'artefact vers un **point de
  décision risqué** : avant migration, mutation de données, déploiement,
  paiement, authentification ou merge ;
- les plateformes natives peuvent copier provenance, budget et replay ; elles
  possèdent l'UX et la distribution ;
- une couche indépendante ne survit que si elle prouve une calibration
  inter-fournisseurs supérieure, une politique commune multi-harnais ou un
  dossier de conformité/audit que les plateformes ne veulent pas partager ;
- sans données et usage récurrent, Inspectrum devient au mieux une petite
  utilité open source ; sans gain net mesuré, il doit être maintenu en mode
  minimal ou arrêté.

## Comparaison avec la roadmap héritée

Cette section est un constat historique sur la roadmap antérieure ; elle
n'autorise aucun travail. Les décisions actives vivent uniquement dans la
[thèse](moat-thesis.md), la
[roadmap d'exécution](outcome-moat-roadmap-post-0.2.2.md) et le
[protocole de preuve](evidence-protocol-post-0.2.2.md).

La roadmap locale observée sur
`chore/growth-combined-validation` au commit `2f1561b` choisissait déjà la revue
de plan Claude→Codex, puis proposait résilience, changements, gates locaux et
pull requests. Elle avait correctement identifié l'attribution, le fail-open,
le fallback et la validation humaine.

Cette recherche modifie trois décisions :

1. **Le créneau plan n'est plus présumé valide.** Il doit battre le témoin
   skill + hook + un modèle fort avec outils, à budget égal.
2. **La revue de code/commit/PR n'est plus la suite automatique.** Codex couvre
   le commit ; Claude/Copilot/Cursor/GitLab et les spécialistes dominent les PR.
3. **Le moat n'est pas l'arbitrage multi-fournisseur.** C'est, au mieux, la
   donnée de calibration et l'assurance mesurée accumulée à travers versions et
   harnais.

Le travail de distribution 0.2.2 reste séparé et n'est ni modifié ni
cherry-pické. Cette contre-analyse porte uniquement sur l'après-publication.

## Signaux historiques repris par les décisions actives

Cette synthèse est explicative, pas normative. Les seuils et horloges vivent
uniquement dans le
[protocole de preuve](evidence-protocol-post-0.2.2.md) ; les règles de
portefeuille vivent uniquement dans la
[roadmap d'exécution](outcome-moat-roadmap-post-0.2.2.md).

Les signaux de risque identifiés par la recherche sont :

- un harnais majeur fournit une revue de plan cross-vendor native avec preuve,
  budget et humain final ;
- le second fournisseur n'ajoute pas de défauts majeurs confirmés à budget égal
  face à un modèle fort + outils ;
- la réutilisation parmi les utilisateurs réellement réexposés échoue à la
  porte P3 ;
- le temps de triage ajouté dépasse le rework évité ;
- le plan cesse d'être une étape distincte dans les usages cibles ;
- un substitut de moins de 100 lignes produit une utilité statistiquement
  indistinguable.

Ces critères ont rendu la suite falsifiable. Le créneau actif et l'expérience
la moins coûteuse pour le réfuter sont maintenant définis dans les trois
documents de décision liés ci-dessus.
