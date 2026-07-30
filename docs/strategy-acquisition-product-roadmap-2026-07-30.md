# Stratégie d'acquisition et feuille de route produit

État vérifié au 30 juillet 2026.

## Décision en une page

Inspectrum a un bon point d'entrée produit : une revue automatique d'un plan
Claude Code par Codex, avant l'approbation humaine. Le produit public n'a
cependant pas encore une distribution ni une fiabilité suffisantes pour lancer
une campagne large.

Les deux objectifs doivent être poursuivis dans cet ordre :

1. rendre le parcours public installable, démontrable et mesurable ;
2. obtenir les premières utilisations répétées par une petite cohorte ciblée ;
3. transformer les preuves de cette cohorte en contenu et en distribution ;
4. rendre la revue de plan réellement bidirectionnelle et résiliente ;
5. étendre le même noyau à la revue de changements, puis aux commits et aux
   pull requests.

La priorité immédiate n'est pas une nouvelle fonction. C'est la publication du
candidat 0.2.2, l'alignement des versions, une preuve réelle du parcours
principal, puis le référencement dans les catalogues qui apportent une
découverte native.

La promesse publique recommandée est :

> **A second model reviews your coding agent before you approve the work.**
>
> Plans first. Diffs next. Local evidence, explicit fallbacks, human final say.

Les étoiles GitHub sont un indicateur retardé, pas la valeur produite. La
métrique principale doit être le nombre de personnes ayant obtenu au moins une
revue réelle, puis le nombre qui en obtiennent une nouvelle la semaine
suivante. Sans activation, une campagne d'étoiles produit un pic sans usage.

## 1. État réel du projet

### 1.1 Produit public et candidat local

| Élément | État vérifié |
|---|---|
| Dépôt public | `yannmenec/inspectrum`, branche principale à la version 0.2.1 |
| Paquet npm public | 0.2.1 |
| Dernière release GitHub publique | 0.2.1, publiée le 14 juillet 2026 |
| Branche locale | `chore/growth-combined-validation`, candidat consolidé et corrigé après revues réelles |
| Candidat local | 0.2.2, avec manifeste MCP Registry, preuves synthétiques, guide, actifs de marque, dépendances corrigées, kit de soumission, plugin Codex et compatibilité Claude Code 2.1.145 |
| Plugin Claude Code actif sur cette machine | 0.2.0 |
| Serveur MCP configuré dans Codex sur cette machine | 0.1.5 |
| Binaire local/global observé | 0.2.2 |

Cette dérive de versions est le principal risque d'activation. Un utilisateur
qui reproduit l'état actuel peut croire tester la dernière version alors que le
hook, le serveur MCP et le binaire exécutent trois versions différentes.

Le candidat local contient déjà une grande partie du travail de préparation à
la croissance : un meilleur README, un benchmark synthétique publié, des
images, un manifeste `server.json`, des tests de distribution et un pipeline de
release plus sûr. Ce travail n'a pas encore d'effet public tant qu'il n'est ni
fusionné, ni publié, ni réinstallé depuis une source publique.

### 1.2 Visibilité et usage observables

Les données GitHub authentifiées disponibles sur les quatorze derniers jours
indiquent :

- 2 étoiles, dont une appartient au mainteneur ;
- 0 fork ;
- 9 visiteurs uniques et 10 vues ;
- 8 cloneurs uniques et 10 clones ;
- aucun référent externe détecté.

Le paquet npm a enregistré 422 téléchargements sur les trente jours terminant
le 28 juillet, dont 304 les 13 et 14 juillet, au moment des releases. Il reste
60 téléchargements du 16 au 28 juillet et 36 sur les sept derniers jours de la
période. npm ne fournit pas ici des utilisateurs uniques ; les installations du
mainteneur, les tests et l'automatisation peuvent gonfler le total. Il ne faut
donc pas présenter ces téléchargements comme 422 utilisateurs.

Les assets MCPB publics cumulent 15 téléchargements sur les releases 0.2.0 et
0.2.1. Ce chiffre est un signal de curiosité, pas une preuve d'activation.

Sources de mesure :

- [API publique du dépôt GitHub](https://api.github.com/repos/yannmenec/inspectrum)
- [API de téléchargements npm](https://api.npmjs.org/downloads/point/last-month/inspectrum)
- GitHub `traffic/views`, `traffic/clones`, `traffic/popular/referrers`, lus le
  30 juillet 2026 avec les droits du propriétaire
- [releases GitHub](https://github.com/yannmenec/inspectrum/releases)

### 1.3 Distribution actuelle

| Canal | État | Action |
|---|---|---|
| npm | Public, 0.2.1 | Publier 0.2.2 après fusion et vérification fraîche |
| GitHub Releases / MCPB | Public, dernier asset 0.2.1 | Publier l'asset correctif 0.2.2 et supprimer la confusion créée par les brouillons obsolètes |
| Marketplace dépôt Claude Code | Fonctionnel via `yannmenec/inspectrum` | Conserver comme installation directe |
| Marketplace communautaire Claude | Absent | Soumettre après la preuve 0.2.2 |
| Marketplace officielle Anthropic | Absent | Pas de processus de candidature public ; l'inclusion reste discrétionnaire |
| MCP Registry officiel | Absent | Publier `server.json` après npm 0.2.2 |
| Plugin / marketplace Codex | Prêt dans le candidat local, pas encore public | Publier avec 0.2.2, puis exécuter le parcours installé |
| Répertoire public OpenAI, partagé par ChatGPT et Codex | Absent | Un plugin MCP public exige actuellement une URL MCP HTTPS de production ; le serveur local stdio n'est pas directement éligible |
| Smithery | Absent | Évaluer une fiche locale/MCPB sans faire transiter les plans par un service tiers |
| Glama | Absent | Soumettre le dépôt ou vérifier l'indexation après MCP Registry |
| PulseMCP | Absent | Attendre l'ingestion du MCP Registry, puis soumettre manuellement si nécessaire |
| Cursor | Absent de son marketplace | Conserver d'abord le bouton d'installation, puis préparer un plugin Cursor après la parité Codex |

Les voies vérifiées sont les suivantes :

- Claude Code accepte déjà les marketplaces Git, et la marketplace
  communautaire accueille les plugins tiers ayant passé validation et
  contrôle de sécurité. Les formulaires publics alimentent la marketplace
  communautaire, pas la marketplace officielle
  ([documentation Claude Code](https://code.claude.com/docs/en/discover-plugins)).
- Le MCP Registry accepte les paquets npm stdio et sert de source aux
  agrégateurs
  ([publication officielle](https://modelcontextprotocol.io/registry/quickstart),
  [rôle du Registry](https://modelcontextprotocol.io/registry/about)).
- OpenAI propose un répertoire universel partagé par ChatGPT et Codex, mais une
  soumission contenant un MCP doit utiliser une URL publique de production et
  inclure cinq tests positifs et trois tests négatifs
  ([soumission OpenAI](https://developers.openai.com/plugins/deploy/submission)).
- Codex peut aussi charger un plugin local ou depuis une marketplace de dépôt,
  avec un manifeste `.codex-plugin/plugin.json`, des skills, un MCP local et
  des hooks
  ([packaging OpenAI](https://developers.openai.com/plugins/build/plugins)).

### 1.4 Ce qui fonctionne réellement

#### Claude Code vers Codex

Le sens principal est implémenté :

- le plugin Claude Code intercepte `ExitPlanMode` ;
- le plan est envoyé à `review_plan` avec le reviewer configuré ;
- Codex est lancé dans un dossier temporaire, en sandbox lecture seule et en
  session éphémère ;
- un verdict `revise` ou `reject` renvoie des findings à Claude ;
- une approbation laisse apparaître le dialogue humain normal ;
- une erreur opérationnelle laisse passer le plan avec un avertissement ;
- le hash et le budget de tours empêchent les boucles infinies.

Le test d'intégration réel du reviewer Codex a été exécuté le 30 juillet 2026
sur cette machine : 1 test sur 1 réussi avec Codex connecté. Les tests
déterministes couvrent également la boucle refus, révision, approbation avec un
faux reviewer.

L'authentification Claude a été renouvelée le 30 juillet. Un appel headless
réel a ensuite réussi. La boucle du gate a également réussi dans son harnais de
bout en bout, mais ce harnais utilise encore un faux reviewer Codex
déterministe. Le reviewer Codex réel et le gate sont donc prouvés séparément ;
la boucle complète Claude Code réel vers Codex réel reste à rejouer avant d'en
faire une preuve publique.

#### Codex vers Claude

Le sens inverse fonctionne désormais à la demande, mais n'est pas encore un
gate automatique :

- Codex peut enregistrer le serveur MCP et appeler `review_plan` ;
- le plugin Codex candidat et sa skill demandent explicitement
  `reviewers: ["claude"]` et désactivent le juge ;
- l'adaptateur Claude a été exercé avec Claude Code 2.1.145 ;
- il n'existe toutefois pas encore de gate automatique de fin de plan côté
  Codex ;
- la configuration par défaut demande Codex, donc un appel sans surcharge
  ferait relire Codex par un second Codex ;
- le smoke Claude réel reste manuel et optionnel, pas un contrôle continu.

Le premier appel réel après réauthentification a découvert une incompatibilité
avec l'enveloppe de Claude Code 2.1.145 : Claude produisait bien la revue dans
`structured_output`, mais Inspectrum lisait encore le texte de `result`. Un
correctif testé accepte désormais la sortie structurée et conserve le repli
sur l'ancien champ, y compris lorsque `structured_output` vaut explicitement
`null`.

Après ce correctif, un appel réel Codex vers le serveur MCP local, avec Claude
comme seul modèle chargé de la revue, a réussi. Il a produit un verdict
`reject`, huit constats et un plan révisé, puis a écrit la session
`2026-07-30T09-45-30__caf66cac`. La revue a pris environ 90 secondes. Cela
prouve le sens Codex vers Claude à la demande ; cela ne prouve pas encore un
hook automatique en fin de plan.

#### Modèles de secours sur la machine

| Reviewer | Binaire | Appel réel | Conclusion |
|---|---|---|---|
| Codex | Présent | Réussi | Disponible |
| Claude | Présent | Réussi après réauthentification | Disponible au moment du contrôle |
| Gemini | Présent | Échec d'authentification, code 41 | Indisponible tant qu'une méthode d'authentification n'est pas configurée |
| Ollama | Absent | Non exécuté | Aucun fallback local |

Dans l'état observé, deux reviewers sont utilisables : Codex et Claude. Cette
disponibilité reste ponctuelle, car aucun des deux fournisseurs ne garantit le
quota futur. Un second processus du même fournisseur ne contournerait pas un
quota de compte épuisé.

### 1.5 Lacunes produit prioritaires

1. **Pas de repli séquentiel.** Plusieurs reviewers sont lancés en parallèle.
   Un succès partiel est toléré, mais tous les reviewers consomment
   potentiellement leur quota. Si tous échouent, le MCP retourne une erreur et
   le gate Claude laisse passer.
2. **Pas de classification des pannes.** Quota, authentification, limitation de
   débit, binaire absent, délai, réseau et sortie invalide restent des erreurs
   opérationnelles principalement textuelles.
3. **Approbation dégradée ambiguë.** Un reviewer peut échouer et un autre
   approuver ; le verdict reste `approve`. Le message du gate peut encore dire
   « codex approved » alors que le reviewer réellement réussi est un autre.
4. **Diagnostic incomplet.** `doctor` ne fait pas d'appel réel peu coûteux à
   Claude ou Gemini, ne tient pas compte de tous les reviewers propres au gate
   et ne signale pas les écarts entre versions du plugin, du MCP et du binaire.
5. **Adaptateur Claude moins isolé.** Il n'est pas lancé dans un dossier
   temporaire et ses outils ne sont pas explicitement désactivés. Le modèle
   configuré n'est pas transmis à la CLI Claude.
6. **Délai global sans annulation.** Le gate peut laisser passer après son
   délai global alors que le sous-processus continue et consomme du quota.
7. **Preuves réelles encore manuelles.** Codex et Claude ont chacun réussi un
   appel réel, et le serveur stdio a réellement exécuté Claude. Ces preuves ne
   sont pas encore des contrôles continus et la boucle complète
   Claude-Code-vers-Codex réel reste à rejouer.

## 2. Stratégie d'acquisition

### 2.1 Positionnement

Le marché contient déjà :

- la revue de code native de Codex sur GitHub ;
- la revue de code native de Claude ;
- des plugins de revue de pull requests ;
- des hooks simples de revue de plan ;
- des orchestrateurs multi-agents plus larges.

Inspectrum ne doit donc pas se positionner comme « encore un reviewer ». Son
avantage défendable est la combinaison suivante :

- reviewer d'un fournisseur différent de l'agent auteur ;
- même politique depuis plusieurs agents ;
- point de contrôle avant la dépense d'implémentation ;
- résultats attribués, structurés et conservés localement ;
- comportement borné et visible en cas de panne ;
- approbation finale toujours humaine.

Le segment initial doit rester étroit : développeur indépendant ou petite
équipe utilisant déjà Claude Code et Codex, avec des tâches assez importantes
pour justifier 20 à 60 secondes de revue.

Le message principal ne doit pas promettre qu'un second modèle rend un plan
correct. Il doit promettre un deuxième signal, un checkpoint reproductible et
une preuve consultable.

#### Collision de recherche et réponse de positionnement

La recherche GitHub exacte sur `inspectrum` place
[miek/inspectrum](https://github.com/miek/inspectrum), un analyseur de signaux
radio d'environ 2 500 étoiles, devant ce projet. Le dépôt Inspectrum de Yann
apparaît quatrième au moment de la mesure. Cette collision réduit la
mémorisation, le référencement et la capacité à posséder la requête de marque.

Le nom **Inspectrum** est conservé. La réponse recommandée ne passe donc pas
par un renommage :

- toujours accompagner le nom d'un qualificatif descriptif, par exemple
  `Inspectrum — cross-agent plan review` ;
- posséder les recherches plus spécifiques : `inspectrum mcp`,
  `inspectrum claude code`, `inspectrum codex` et `inspectrum plan review` ;
- utiliser systématiquement la même identité visuelle, le même sous-titre et
  les mêmes liens canoniques sur GitHub, npm et les marketplaces ;
- obtenir des liens depuis les catalogues MCP et les écosystèmes Claude Code
  et Codex, qui sont plus qualifiés qu'une recherche générique sur le nom.

Le suivi d'acquisition doit séparer les visites venant de la requête générique
de celles venant des requêtes qualifiées. La réussite consiste à rendre
Inspectrum identifiable dans sa catégorie sans changer son nom.

#### Ce que montrent les projets comparables

Les ordres de grandeur observés le 30 juillet ne sont pas directement
comparables entre eux, mais ils montrent les mécanismes de diffusion :

| Projet | Signal public observé | Leçon utile |
|---|---:|---|
| [OpenAI Codex plugin for Claude Code](https://github.com/openai/codex-plugin-cc) | environ 30 000 étoiles | vidéo immédiate, bénéfice concret et installation guidée |
| [claude-plan-reviewer](https://github.com/yuuichieguchi/claude-plan-reviewer) | environ 60 étoiles | la revue de plan seule est compréhensible, mais sa portée organique reste limitée |
| [claude-octopus](https://github.com/nyldn/claude-octopus) | environ 3 900 étoiles | le récit multi-modèle attire lorsque le parcours est emballé comme un produit |
| [Superpowers](https://github.com/obra/superpowers) | plus de 250 000 étoiles | une méthode de travail complète, une démonstration répétable et une communauté créent une catégorie |
| [cc-safety-net](https://github.com/Dicklesworthstone/cc-safety-net) | environ 1 500 étoiles | une promesse de sécurité étroite peut circuler rapidement |
| [PR-Agent](https://github.com/qodo-ai/pr-agent) | plus de 10 000 étoiles | l'intégration au moment de la pull request donne une fréquence et une visibilité d'équipe |

Inspectrum ne doit copier ni leur étendue ni leur ton. Il doit emprunter trois
éléments : une démonstration visible avant le défilement, une installation
guidée jusqu'au premier succès et un rituel récurrent qui produit des cas
partageables.

### 2.2 Funnel et mesures

Le funnel à piloter est :

```text
Impression qualifiée
  -> visite du dépôt
  -> installation
  -> doctor sans erreur
  -> première revue réelle
  -> deuxième revue dans les 7 jours
  -> étoile, témoignage ou cas partagé
```

Mesures recommandées :

| Étape | Mesure |
|---|---|
| Visibilité | visiteurs uniques GitHub par semaine, référents, vues des fiches de marketplace |
| Acquisition | téléchargements npm hors pics de release, téléchargements MCPB, installations déclarées par les marketplaces |
| Activation | personnes de la cohorte ayant produit une session Inspectrum réussie |
| Temps vers la valeur | durée entre le début de l'installation et la première revue réussie |
| Qualité | findings jugés utiles, faux positifs, plans approuvés ou révisés, pannes |
| Rétention | personnes ayant au moins une nouvelle session la semaine suivante |
| Plaidoyer | étoiles par personne activée, témoignages, cas reproductibles, recommandations |

Inspectrum promet actuellement l'absence de télémétrie propriétaire. Il ne faut
pas changer cela silencieusement pour faciliter le growth. Pendant les trente
premiers jours, les métriques d'activation peuvent venir d'une cohorte
consentie : dix à vingt utilisateurs accompagnés, avec export volontaire d'un
résumé assaini. Une éventuelle télémétrie anonyme et opt-in nécessite ensuite
une décision d'architecture, une politique de confidentialité mise à jour et
un kill switch.

Objectifs opératoires, qui ne sont pas des prévisions :

| Horizon | Seuil recherché |
|---|---|
| J+14 | 10 utilisateurs externes activés, 3 cas exploitables, tous les catalogues prioritaires soumis |
| J+30 | 25 utilisateurs activés, 10 utilisateurs revenus dans les 7 jours, 50 étoiles, 100 visiteurs qualifiés par semaine |
| J+60 | 75 utilisateurs activés, 25 retenus, 150 étoiles, au moins 5 témoignages ou cas publics |
| J+90 | 200 utilisateurs activés, 60 retenus, 500 étoiles, un canal organique apportant au moins 30 % des activations |

Si J+30 produit des étoiles mais moins de dix utilisateurs activés, il faut
cesser d'optimiser la visibilité et corriger l'installation ou la promesse. Si
les activations existent mais pas la rétention, il faut corriger le coût, le
bruit ou la fréquence de la revue.

### 2.3 Actions classées par impact

#### Priorité 0 — rendre le lancement honnête

1. Fusionner ou rebaser proprement les onze commits locaux et la pull request
   ouverte qui recouvre une partie du correctif.
2. Exécuter build, typecheck, lint, tests, couverture, vérification MCPB et
   installation fraîche depuis un dossier vide.
3. Publier npm 0.2.2, puis la release GitHub et son MCPB.
4. Réinstaller la version publique dans Claude Code et Codex ; vérifier que
   toutes les surfaces affichent 0.2.2.
5. Renouveler l'authentification Claude et enregistrer une boucle réelle
   assainie.
6. Corriger le README pour que chaque tableau distingue « publié »,
   « vérifié localement » et « prévu ».

Cette phase est le préalable à toute campagne. Elle doit durer quelques jours,
pas plusieurs semaines.

#### Priorité 1 — obtenir la découverte native

1. Publier 0.2.2 dans le MCP Registry avec `mcp-publisher`.
2. Soumettre le plugin à la marketplace communautaire Claude.
3. Créer un plugin Codex de dépôt :
   - `.codex-plugin/plugin.json` ;
   - skill « review this plan with Claude through Inspectrum » ;
   - MCP local pointant vers `npx -y inspectrum@0.2.2` ;
   - catalogue `.agents/plugins/marketplace.json` ;
   - cinq tests positifs et trois négatifs réutilisables.
4. Soumettre le dépôt à Glama et vérifier PulseMCP après ingestion du Registry.
5. Évaluer Smithery uniquement si l'exécution reste locale. Un gateway qui voit
   les plans contredirait le positionnement actuel et requerrait un nouveau
   consentement.
6. Réintroduire un bouton Cursor vérifié et préparer ensuite un plugin Cursor
   open source. Ne pas retarder le lancement initial pour cette voie.

Le répertoire universel OpenAI demande une décision distincte :

- **voie rapide :** soumettre un plugin skills-only qui installe ou invoque le
  serveur local, si la revue de sécurité l'accepte ;
- **voie complète :** ajouter un MCP HTTPS public. Cette voie change
  l'architecture locale, le modèle de confidentialité et potentiellement le
  coût. Elle ne doit pas être entreprise uniquement pour obtenir une fiche.

#### Priorité 2 — transformer la preuve en contenu

Créer un kit de lancement unique :

- vidéo de 45 à 60 secondes : mauvais plan, finding utile, plan révisé,
  approbation humaine ;
- GIF ou capture animée sans données privées ;
- une phrase de résultat, pas une liste de composants ;
- benchmark synthétique transparent avec ses échecs ;
- trois cas réels consentis et assainis ;
- comparaison factuelle avec le plugin Codex pour Claude Code, le reviewer de
  plan concurrent et les revues natives de pull requests.

Le meilleur récit de lancement est : « le plan paraissait plausible, le second
modèle a trouvé cette hypothèse avant l'implémentation ». Les contenus génériques
sur le multi-agent attireront moins d'utilisateurs qualifiés.

#### Priorité 3 — lancement concentré sur une semaine

Ordre recommandé :

1. GitHub release et article technique ;
2. soumissions aux catalogues et listes « awesome » ;
3. Show HN, avec démonstration reproductible ;
4. message court sur X et LinkedIn, vidéo incluse ;
5. publications adaptées aux communautés Claude Code, Codex et MCP, selon
   leurs règles ;
6. trente prises de contact personnelles avec des utilisateurs connus de
   Claude Code et Codex ;
7. permanence d'installation de 30 minutes pendant trois jours.

Chaque lien doit porter un paramètre de campagne vers une page d'installation
spécifique. Les messages ne doivent pas demander d'abord une étoile. Ils
doivent proposer un cas d'usage, une installation de deux minutes et une
demande de retour précise.

#### Priorité 4 — boucle de croissance

Chaque semaine :

1. choisir un cas ou un échec réel ;
2. publier un court compte rendu avec entrée, finding, décision et limite ;
3. convertir la leçon en test ou en amélioration produit ;
4. remercier publiquement le contributeur avec son accord ;
5. proposer une seule fois, après plusieurs revues réussies, un lien pour
   soutenir le dépôt.

Cette boucle donne une raison de revenir et rend les étoiles corrélées à la
valeur. Elle est plus durable qu'une succession de lancements.

### 2.4 Améliorations de la page GitHub

Actions immédiates :

- publier le social preview déjà préparé ;
- renseigner le champ homepage du dépôt ;
- activer GitHub Discussions seulement si un rendez-vous hebdomadaire de
  support et de partage de cas est tenu ; sinon utiliser les issues avec deux
  formulaires simples, « installation » et « finding utile » ;
- ajouter les sujets `claude-code-plugin`, `codex-plugin` et `code-review`
  lorsque ces surfaces existent réellement ;
- mettre le GIF de valeur avant le détail d'architecture ;
- conserver un quick start de deux commandes ;
- montrer un exemple de finding réel assaini ;
- afficher clairement « public 0.2.2 » ou « candidat », jamais les deux ;
- regrouper ou traiter les pull requests automatiques de dépendances qui
  encombrent la vue ;
- retirer ou fermer les brouillons de release obsolètes après vérification ;
- ouvrir des issues de roadmap publiques, petites et contributives.

Ne pas ajouter de badges sans signal utile. La preuve principale doit rester le
produit en action.

## 3. Feuille de route produit

### 3.1 Principes

- Le plan gate continue de laisser passer les erreurs opérationnelles, avec un
  avertissement.
- Une revue dégradée n'est jamais présentée comme une revue complète.
- Le reviewer est toujours isolé et ne modifie pas le projet.
- Un même contenu ne consomme pas deux fois le quota.
- Un fallback est séquentiel : le suivant n'est appelé que si nécessaire.
- Une seconde instance du même fournisseur ne compte pas comme indépendance de
  quota.
- Les contrôles déterministes restent dans les tests, le lint et l'intégration
  continue ; le modèle traite les problèmes de jugement.
- Les changements d'invariants passent par une décision d'architecture
  approuvée.

### 3.2 Version 0.2.3 — parité et résilience des plans

Objectif : pouvoir dire honnêtement qu'Inspectrum revoit les plans dans les
deux sens, avec un état dégradé explicite.

Travail :

1. rédiger une décision d'architecture limitée au routage, aux statuts de revue
   et au hook Codex expérimental ;
2. durcir le reviewer Claude :
   - dossier temporaire ;
   - outils désactivés ;
   - aucune persistance ;
   - modèle configuré transmis ;
   - stdout d'erreur conservé de façon bornée lorsque stderr est vide ;
3. ajouter des erreurs structurées :
   `not_installed`, `not_authenticated`, `quota_exhausted`, `rate_limited`,
   `timeout`, `network`, `invalid_output`, `policy_denied`, `unknown` ;
4. ajouter une cascade de secours ordonnée ;
5. ajouter `review_status: reviewed | degraded | unreviewed` et les listes de
   reviewers prévus, tentés et réussis ;
6. ajouter un circuit breaker court après quota, authentification ou panne ;
7. annuler réellement les sous-processus lorsque le délai global expire ;
8. améliorer `doctor` :
   - versions plugin, MCP et binaire ;
   - reviewers du gate ;
   - `claude auth status` plus probe réel optionnel ;
   - probe Gemini optionnel ;
   - résumé « seuls ces reviewers sont réellement disponibles » ;
9. créer le plugin et la skill Codex qui demandent explicitement Claude ;
10. expérimenter un hook Codex `Stop` en mode plan.

Codex expose aujourd'hui `Stop`, `PreToolUse` et `PostToolUse`, mais pas un
équivalent documenté d'`ExitPlanMode`. Le hook `Stop` doit donc rester
expérimental : il peut confondre un plan final et une réponse intermédiaire.

Critères d'acceptation :

- appel réel Codex vers MCP vers Claude ;
- Claude ne peut ni lire arbitrairement ni écrire dans le dépôt ;
- `revise` relance Codex avec des findings bornés ;
- `approve` ne décide pas à la place de l'utilisateur ;
- plan inchangé : aucun nouvel appel ;
- quota Claude : passage au prochain reviewer ;
- tous indisponibles : statut `unreviewed`, pas de faux `approve` ;
- message d'approbation nommant le reviewer réellement utilisé ;
- tests unitaires, contrat de hook, end-to-end avec faux reviewer et smoke réel
  optionnel pour Claude et Codex ;
- transcript public assaini avant revendication de parité.

### 3.3 Version 0.3.0 — revue locale de changements

Objectif : revoir un changement cohérent avant commit, depuis Claude Code ou
Codex, sans bloquer automatiquement.

Ne pas détourner `review_plan`. Son prompt, sa limite de 16 000 caractères et
son schéma ne conviennent pas aux diffs. La première version peut rester une
commande CLI et des skills pour préserver l'invariant de l'unique outil MCP.
Un deuxième outil nécessite une décision d'architecture.

Artefacts à supporter :

- `decision` : décision, justification, alternatives et conséquence ;
- `working_diff` ;
- `staged_diff` ;
- `commit` ;
- `branch_diff`.

Chaque session doit enregistrer :

- type et hash exact de l'artefact ;
- base et tête Git ;
- fichiers inclus, exclus, binaires ou hors budget ;
- reviewer auteur lorsque connu ;
- reviewers tentés et réussis ;
- findings avec chemin et ligne appartenant au diff ;
- statut de couverture ;
- verdict et statut de revue.

Sécurité :

- snapshot ou worktree isolé et lecture seule ;
- commandes Git passées comme tableau d'arguments, sans shell ;
- aucun contenu de diff interprété comme commande ;
- `.env*`, secrets et credentials exclus ;
- troncature jamais silencieuse ;
- tests de symlink, chemin, gros diff, rename, binaire et prompt injection.

Critères d'acceptation :

- même résultat depuis les skills Claude et Codex ;
- aucune mutation du dépôt par le reviewer ;
- hash et identifiants Git exacts dans le rapport ;
- findings ancrés sur le diff ;
- exclusions explicites ;
- cache par snapshot ;
- appel manuel simple : « review my staged changes with Inspectrum ».

### 3.4 Version 0.3.1 — gates locaux

Objectif : revoir au bon moment, pas après chaque écriture.

Une revue après chaque fichier serait lente, chère et bruyante. Le benchmark
actuel mesure déjà 27,2 secondes de médiane par appel. Le rythme recommandé est
le checkpoint :

1. décision structurante ;
2. fin d'un lot cohérent ;
3. avant commit ;
4. avant push.

Implémentation :

- `PostToolUse` marque seulement l'arbre comme modifié ;
- `Stop` revoit le diff une fois s'il a changé ;
- la skill `checkpoint` capture les décisions explicites ;
- le gate avant commit revoit uniquement le diff indexé ;
- le gate avant push revoit la branche par rapport à sa branche distante ;
- résultat mis en cache par hash ;
- une seule relance du modèle par hash ;
- erreurs opérationnelles ouvertes par défaut ;
- mode strict uniquement sur choix explicite.

Pour les commits lancés hors agent, proposer un hook Git ou Lefthook optionnel.
Ne jamais l'installer silencieusement.

### 3.5 Version 0.4.0 — pull requests

Objectif : rendre la revue visible à l'équipe et réutilisable comme contrôle de
branche.

Architecture recommandée :

- workflow GitHub Action réutilisable ou application GitHub ;
- diff fixé par les identifiants de base et de tête ;
- API keys ou identités de workload pour le cloud, jamais une session OAuth
  interactive supposée ;
- permissions minimales ;
- aucun code de pull request non fiable exécuté avec des secrets disponibles ;
- findings sous forme de check et d'annotations ;
- mode non bloquant par défaut ;
- check obligatoire seulement après mesure du taux de faux positifs, de la
  disponibilité et du coût.

Les revues natives de Claude et Codex sont des références à comparer, pas des
fonctions à recopier. La valeur d'Inspectrum doit rester l'arbitrage
multi-fournisseur, le fallback et une politique commune.

### 3.6 Plus tard — pair programming continu

N'ouvrir ce chantier qu'après mesure des revues de commit et de pull request.

Le mode pair doit :

- attendre un changement cohérent ;
- avoir un cooldown ;
- limiter les appels par session ;
- ignorer les nits pour relancer l'agent ;
- ne relancer que sur finding majeur ou bloquant ;
- conserver la dernière décision et son hash ;
- laisser le développeur suspendre le pair à tout moment.

Un second agent du même modèle apporte un contexte neuf, mais pas un quota
indépendant. Il ne doit être utilisé qu'après une sortie invalide, une panne
spécifique à un modèle ou pour une seconde opinion volontaire ; jamais comme
solution annoncée à un quota de compte épuisé.

## 4. Séquencement multi-sessions

Chaque session doit finir avec un artefact, des vérifications réelles et un
point de reprise.

| Session | Livrable | Dépendance | Terminé lorsque |
|---|---|---|---|
| S1 | Release 0.2.2 publique et versions alignées | aucune | installation fraîche et boucle principale prouvée |
| S2 | MCP Registry + soumission Claude communautaire | S1 | fiches soumises et URLs enregistrées |
| S3 | Plugin et marketplace Codex de dépôt | S1 | installation locale, 5 tests positifs, 3 négatifs |
| S4 | Cohorte de 10 utilisateurs | S1-S3 | 10 activations, 3 cas, obstacles classés |
| S5 | Kit de lancement et campagne | S4 | vidéo, article, posts, liens mesurés |
| S6 | Décision d'architecture 0.2.3 | apprentissages S4 | décision approuvée |
| S7 | Reviewer Claude durci et smokes réels | S6 | Claude et Codex passent les smokes |
| S8 | Routage de secours et statut dégradé | S7 | matrice de pannes couverte |
| S9 | Parité Codex expérimentale | S8 | boucle Codex vers Claude prouvée |
| S10 | Décision et noyau de revue de diff | S9 | CLI manuelle et rapport ancré |
| S11 | Gates locaux | S10 | checkpoint, commit et push vérifiés |
| S12 | Pull request non bloquante | S10-S11 | check attaché à la bonne tête Git |

Les sessions S2, S3 et la préparation de S4 peuvent avancer en parallèle après
S1. La revue de code ne doit pas démarrer avant la validation du modèle de
fallback : dupliquer deux systèmes de routage créerait une dette évitable.

### État d'exécution

| Session | État au 30 juillet 2026 | Preuve ou blocage |
|---|---|---|
| S1 | Candidat technique prêt ; publication non réalisée | zéro vulnérabilité, contrôles verts, Claude réauthentifié, sens Codex vers Claude réel réussi ; boucle complète Claude Code vers Codex réel encore non publiée |
| S2 | Terminée localement | kit de soumission et garde public validés ; aucune soumission avant npm 0.2.2 |
| S3 | Terminée localement | plugin Codex, cinq cas positifs et trois négatifs, version alignée sur 0.2.2, parcours MCP vers Claude prouvé |
| S4-S5 | Non commencées | dépendent de la publication et d'utilisateurs réels |
| S6 | Proposition terminée, non approuvée | décision d'architecture isolée sur `agent/propose-review-resilience` |
| S7 | Partiellement commencée | compatibilité de sortie Claude corrigée ; isolation, diagnostic et smoke automatisé restent à faire |
| S8-S12 | Non commencées | dépendent de l'approbation de la décision et des apprentissages utilisateurs |

## 5. Risques et décisions à ne pas masquer

- Une grande campagne avant l'alignement des versions amplifierait les échecs
  d'installation.
- La marketplace officielle Anthropic n'est pas un canal sur lequel planifier
  une date : il n'existe pas de candidature publique.
- Le plugin MCP public OpenAI demanderait aujourd'hui une surface HTTPS. La
  construire modifierait la promesse locale et la confidentialité.
- Un deuxième agent sur le même abonnement ne restaure pas un quota épuisé.
- La présence d'un binaire ou un statut OAuth ne prouve pas qu'un appel réel
  fonctionnera.
- Le nombre de téléchargements npm n'est pas le nombre d'utilisateurs.
- Une revue continue après chaque modification coûterait trop cher et
  interromprait le développement.
- Un check de pull request ne doit pas devenir obligatoire avant que sa
  fiabilité opérationnelle et son bruit aient été mesurés.

## 6. Prochaine action recommandée

Terminer S1 sans publier un diff monolithique : découper le candidat en pull
requests cohérentes, intégrer d'abord le correctif Claude et la chaîne de
release, puis le plugin, les preuves et la documentation. Après fusion et
contrôles GitHub, réinstaller la version candidate depuis un environnement
propre et rejouer la boucle Claude Code vers Codex réel. Publier npm 0.2.2
seulement après ce dernier contrôle, avant la release GitHub et le registre
MCP.

Prompt de reprise :

> Reprends Inspectrum S1 sur `chore/growth-combined-validation`. Découpe le
> candidat validé en pull requests cohérentes et courtes, en commençant par le
> correctif Claude et la chaîne de release 0.2.2. Après fusion, réinstalle le
> candidat dans un environnement propre et rejoue Claude Code vers Codex réel.
> Ne publie npm 0.2.2 qu'après ce contrôle, et n'avance jamais vers le registre
> MCP avant que cette version npm soit réellement publique.
