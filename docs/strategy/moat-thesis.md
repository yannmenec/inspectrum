# Thèse de créneau et d'avantage défendable

État : thèse stratégique post-0.2.2, mise à jour le 1er août 2026 et fondée sur le
[paysage concurrentiel](competitive-landscape-2026-07.md) et son
[registre de 198 sources](evidence/competitive-source-ledger.csv), consultées
le 30 juillet 2026.

## Décision en une phrase

**Créneau principal à tester : un checkpoint d'assurance avant l'exécution
d'une tâche agentique à haut risque, activé aujourd'hui à la sortie du plan,
qui montre les preuves et désaccords d'un reviewer indépendant sans supprimer
la décision humaine.**

Ce créneau utilise l'actif déjà construit sans prétendre que le « plan » ou le
« multi-modèle » est durable. Son avantage actuel est une intégration pratique,
pas un moat. Un avantage potentiel serait une position de tiers neutre et un
historique de calibration : quels reviewers, versions et politiques trouvent
quels défauts confirmés, à quel coût et avec quelle corrélation. À la taille
actuelle, ce n'est pas encore un actif défendable.

## Décision d'exécution du 30 juillet 2026

La publication de 0.2.2 est vérifiée sur npm et GitHub ; le MCP Registry et
Glama exposent aussi Inspectrum. Le positionnement est donc adopté sans
attendre les expériences de gain marginal ou le pilote commercial :

> **Inspectrum est le contrôle pré-vol indépendant avant qu'un agent exécute
> un changement difficile à annuler. Il garde les preuves, désaccords et
> échecs visibles. L'humain décide.**

Cette décision change le positionnement, pas le niveau de preuve. Le moat reste
une cible, jamais une affirmation publique. Au 1er août 2026, aucune porte du
protocole n'a réussi et les expériences n'ont pas prouvé de gain net de
fiabilité. Si elles sont lancées, elles alimenteront le corpus, la calibration
et le routage qui pourraient rendre la cible défendable.

Trois documents transforment cette décision en exécution :

- [roadmap orientée résultats et moat](outcome-moat-roadmap-post-0.2.2.md) ;
- [protocole de preuve et portes d'arrêt](evidence-protocol-post-0.2.2.md) ;
- [boucle de croissance GitHub](github-star-growth-loop.md).

Les travaux à faible regret peuvent commencer après 0.2.2 : positionnement,
activation, contrat de preuve, provenance, états dégradés, disposition humaine,
export assaini. Aucun nouvel adaptateur d'hôte ne démarre avant le `GO` du
protocole. Les extensions pull request, pair programming et débat multi-tours
restent hors portefeuille.

## Contre-thèse la plus forte

Un développeur compétent n'a pas besoin d'Inspectrum. Il peut écrire :

```text
AGENTS.md / SKILL.md
  → hook natif de fin de plan ou Stop
  → un modèle fort avec tests/outils
  → éventuellement un second appel headless
  → JSON + délai + artefacts
  → décision humaine
```

Cette solution demande environ quelques heures pour une revue volontaire et un
à trois jours pour un gate journalisé. Elle utilise les abonnements et les
interfaces déjà installés, évite une nouvelle configuration et s'adapte mieux
au harnais principal. Amp offre déjà un Oracle d'un autre fournisseur ; Claude,
Codex, Copilot, Gemini, Cline et Windsurf offrent les briques de hook, review ou
sous-agent. Les SDK offrent graphes, budgets, reprise et traces.

La recherche ne prouve pas non plus le mécanisme causal vendu par le produit :

- fournisseur différent ne signifie pas erreur indépendante ;
- le meilleur juge seul peut égaler un panel sur des tâches hors revue de code ;
- l'étude multi-agent la plus actuelle trouve 0,0 % de gain agrégé moyen sur
  six benchmarks et cinq architectures, avec forte variation ;
- tests et critique mono-modèle outillée peuvent produire le même gain à
  moindre coût ;
- la revue de code actuelle souffre déjà de faux positifs et de fatigue.

Conclusion honnête : **l'utilité de réduire le copier-coller est réelle ; le
gain de fiabilité net ne l'est pas encore.** Si l'expérience ne mesure pas ce
gain, Inspectrum doit rester une petite utilité open source ou cesser
d'élargir son produit.

## Utilisateurs et tâches à accomplir

### Segment initial

Développeur indépendant, mainteneur ou petite équipe qui :

- utilise déjà Claude Code et Codex, ou deux harnais de fournisseurs distincts ;
- fait des changements où une erreur de plan entraîne migration ratée,
  corruption de données, faille d'authentification, incident de paiement,
  rupture de compatibilité ou plusieurs heures de rework ;
- garde une approbation humaine et accepte une latence supplémentaire seulement
  sur les tâches à risque ;
- peut partager volontairement un résumé assaini du résultat pour un pilote.

Ce n'est pas le bon produit pour une petite correction évidente, une équipe
mono-harnais satisfaite de sa revue native ou une organisation qui interdit
l'envoi du même contenu à plusieurs fournisseurs.

### Tâche à accomplir principale

> Avant d'autoriser mon agent à exécuter une décision coûteuse à inverser,
> donne-moi un second signal borné, attribué et vérifiable, puis montre-moi
> clairement ce qui a échoué ou divergé pour que je décide vite.

### Tâches secondaires

- conserver une preuve minimale de ce qui a été relu, par quel modèle et à
  quelle version ;
- éviter de repayer une revue inchangée ;
- savoir quand la revue n'a pas eu lieu ou n'est que partielle ;
- apprendre quels reviewers valent leur latence sur les tâches réelles du
  projet.

## Les cinq surfaces, décidées séparément

### 1. Revue de plan entre modèles — créneau principal expérimental

| Dimension | Décision |
|---|---|
| Douleur | une hypothèse erronée validée avant implémentation peut provoquer un rework disproportionné |
| Alternative native/bricolée | skill + appel headless ; hook `ExitPlanMode`/`Stop` ; sous-agent reviewer ; Amp Oracle |
| Valeur différentielle | activation certaine au bon moment, état d'échec visible, input hashé, preuves/désaccords, attribution, humain final |
| Coût de substitution | <2 h volontaire ; 1–3 jours pour hook + JSON + logs ; maintenance récurrente moyenne |
| Latence/coût | une inférence supplémentaire ; effort maximal observé ici entre 126 et 226 s sur prompts bornés, et deux échecs à 10 min ; produit cible bien plus court |
| Confidentialité | plan transmis à chaque provider cloud ; journal local n'élimine pas le transit |
| Produit minimum désirable | un reviewer indépendant, un tour, activation par risque, sortie « must fix / information / dissent », skip/failure explicite, pas de juge opaque |
| Preuve requise | défauts majeurs confirmés uniques **ex post**, rework évité, triage, latence, coût, vigilance humaine et réutilisation par exposition |
| Dépendances | cas historiques à issue connue, test/rollback/correctif/incident ou adjudication indépendante, capture modèle/version/effort, baseline skill/hook |
| Abandon | échec d'une porte du protocole, fausse confiance ou disparition du plan discret |

Pourquoi principal : le produit et sa distribution existent déjà ; la frontière
avant exécution est claire ; l'expérience peut se faire sans nouvelle
architecture. Pourquoi seulement expérimental : le hook est copiable et la
demande récurrente n'est pas prouvée.

### 2. Revue de changements entre modèles — instrumentation, pas extension produit

| Dimension | Décision |
|---|---|
| Douleur | contexte d'auteur, erreurs inter-fichiers et logique non couverte par tests |
| Alternative native/bricolée | Codex `/review`, Claude `/review`, Copilot/Kilo, `git diff` vers deux CLIs |
| Valeur différentielle | findings ancrés, déduplication, provenance, tests/reproduction, feedback humain |
| Coût de substitution | environ un jour pour script local ; 2–5 jours pour CI robuste |
| Latence/coût/confidentialité | contexte plus large, risque d'exfiltration accru, faux positifs coûteux |
| Produit minimum désirable | fixture locale sans publication : diff exact, statut non validé, accepted/rejected/duplicate/out-of-scope |
| Preuve requise | vérité terrain pour relier une objection de plan à un défaut de changement confirmé |
| Dépendances | changements/bugs historiques, lignes stables, tests et adjudication |
| Abandon | aucun bug unique matériel confirmé, triage net plus long ou substitut simple équivalent |

Cette surface n'est pas une version à construire après le plan. Elle sert
d'instrumentation au protocole : le diff, le test ou le correctif ex post peut
confirmer ou réfuter une objection formulée sur le plan.

### 3. Revue commit et pull request — repousser

| Dimension | Décision |
|---|---|
| Douleur | gate d'équipe, commentaires ancrés, politique de branche et audit |
| Alternative native/bricolée | Codex commit/GitHub, Claude Code Review, Copilot, Bugbot, GitLab Duo, CodeRabbit, Qodo, Greptile, GitHub Action |
| Valeur différentielle | politique inter-fournisseurs et preuve portable, encore hypothétique |
| Coût de substitution | faible pour commit local ; élevé pour application multi-forge fiable |
| Latence/coût/confidentialité | chaque push multiplie facture et bruit ; secrets/identités de forge ; contexte cloud |
| Produit minimum désirable | aucun avant preuve locale ; au plus export d'un dossier de findings acceptés |
| Preuve requise | gain clair face au meilleur natif/spécialiste et demande d'une politique cross-forge |
| Dépendances | distribution forge, identités, permissions, sécurité CI, SLA |
| Abandon | plateforme native offre provenance/budget/désaccord, ou équipe refuse un check de plus |

Le marché est saturé, les plateformes contrôlent l'activation et GitLab annonce
0,25 $ par revue. Inspectrum ne doit pas devenir un bot de pull request
généraliste.

### 4. Pair programming entre modèles — abandon produit

| Dimension | Décision |
|---|---|
| Douleur | séparer planification, exécution et critique |
| Alternative native/bricolée | Aider architect/editor, Amp Oracle, équipes et sous-agents, changement manuel de modèle |
| Valeur différentielle | aucune démontrée ; les harnais possèdent contexte, éditeur et boucle |
| Coût de substitution | nul à quelques heures |
| Latence/coût/confidentialité | tours répétés, contextes dupliqués, plusieurs providers |
| Produit minimum désirable | aucune nouvelle surface ; au plus un seul checkpoint reviewer dans l'expérience plan |
| Preuve requise | temps total de tâche plus court ou moins de rework à budget égal |
| Dépendances | benchmark de dépôt longue durée inexistant |
| Abandon | déjà satisfait : absence de preuve et substitution native immédiate |

PairCoder justifie une expérience bornée auteur → reviewer → tests → révision,
pas un produit de discussion continue.

### 5. Raisonnement, désaccord et discussion — abandon du débat libre

| Dimension | Décision |
|---|---|
| Douleur | hypothèses cachées et confiance excessive |
| Alternative native/bricolée | council, agent team, trois appels réponse/critique/juge |
| Valeur différentielle | conserver la minorité, preuve et arrêt humain ; pas faire « parler » les agents |
| Coût de substitution | <1 jour prototype ; semaines pour calibration fiable |
| Latence/coût/confidentialité | pire surface : plusieurs tours et copies de contexte |
| Produit minimum désirable | comparaison déterministe d'opinions indépendantes en un tour |
| Preuve requise | meilleure décision que reviewers indépendants sans discussion |
| Dépendances | oracle et mesure de corrélation |
| Abandon | consensus augmente confiance sans exactitude ou discussion augmente bruit/latence |

Le juge reste un éditeur optionnel. Il ne compte jamais les reviewers comme des
votes indépendants et ne doit pas effacer le dissent.

## Trois créneaux candidats

| Rang provisoire | Candidat | Utilisateur / activation | Pourquoi maintenant | Menace principale | Décision |
|---:|---|---|---|---|---|
| 1 | checkpoint avant exécution d'une tâche à haut risque | solo/petite équipe ; sortie du plan | produit existant, activation claire, expérience peu coûteuse | hook + skill natif ; plan peut disparaître | **wedge principal à tester** |
| 2 | dossier local de preuves pour diff/commit | mainteneur ; après exécution | seule vérité terrain ancrée disponible pour le plan | revues Codex/Claude natives, bruit PR | **instrumentation du candidat 1, aucun budget produit** |
| 3 | kit de calibration open source pour reviewers | mainteneur de harnais/équipe plateforme ; changement de modèle/version | pourrait matérialiser une neutralité publique | autre utilisateur, demande inconnue, bénéficie aussi aux concurrents | **gelé pendant le pilote** |

Le troisième candidat n'est pas une option active. Créer un framework
d'évaluation sans cas réels serait une architecture sans demande et publierait
la capacité au bénéfice d'acteurs disposant de beaucoup plus de données.

## Moat : présent, potentiel et érosion

### Moat actuel

**Aucun.**

- le MCP, le prompt, le juge, le hook, le stockage Markdown et les backends sont
  copiables ;
- la portabilité est un avantage d'acquisition, pas une barrière ;
- le fail-open est une bonne décision de sécurité, pas un moat ;
- la marque et les catalogues peuvent aider la découverte, pas empêcher la
  copie ;
- aucune donnée de rétention, précision ou volonté de payer n'existe encore.

### Avantage potentiel — pas encore un moat

Un avantage défendable demanderait quatre couches cumulées :

1. **Corpus consenti de défaillances réelles** : plan, issue connue,
   transformation assainie, oracle, disposition humaine.
2. **Calibration longitudinale** : modèle/version/effort/prompt, classe de tâche,
   erreur marginale, corrélation, faux positifs, variance et coût.
3. **Politique adaptative** : un seul reviewer par défaut, escalade seulement
   quand risque ou désaccord historique le justifie.
4. **Neutralité et confiance opérationnelle** : déclenchement observé, état dégradé exact,
   replay, compatibilité multi-harnais et rapport exploitable par un humain.

À 12 utilisateurs et quelques dizaines de cas, le corpus est une preuve de
concept, pas un moat. Les fournisseurs disposent de volumes très supérieurs et
les données se périment à chaque changement de modèle. La seule asymétrie
structurelle possible est la neutralité : Anthropic n'a pas intérêt à calibrer
Codex, ni OpenAI à calibrer Claude. Cette position devient crédible seulement
avec méthode publique, audit externe, mises à jour régulières et usage
récurrent. Elle reste un moat de confiance/standard, non un monopole de données.

### Risques d'érosion

- Anthropic/OpenAI/Cursor/GitHub ajoutent revue cross-vendor ou provenance
  complète ;
- les règles/skills/hooks deviennent parfaitement portables ;
- le plan disparaît comme artefact ;
- changements de politiques interdisent la réutilisation des abonnements par un
  produit tiers ;
- les modèles convergent et l'erreur marginale tombe ;
- absence de télémétrie empêche d'apprendre, tandis qu'une collecte intrusive
  détruirait la promesse locale ;
- peu d'utilisateurs acceptent de partager des cas ;
- un meilleur modèle avec outils bat toujours le comité à budget égal.

## Hypothèses et critères d'abandon

La thèse dépend de sept observations : douleur avec rework vérifiable, utilité
marginale face au meilleur substitut, utilité nette après triage et latence,
vigilance humaine préservée, activation et réutilisation, absence de parité
native à coût inférieur, et demande commerciale distincte de la curiosité.

Les seuils, échantillons et issues autorisées vivent uniquement dans le
[protocole de preuve](evidence-protocol-post-0.2.2.md). La règle de substitution
native vit uniquement dans les conditions de recentrage de la
[roadmap d'exécution](outcome-moat-roadmap-post-0.2.2.md). La thèse ne duplique
aucun nombre normatif.

### Protocole de preuve

Les expériences, leur numérotation, leurs seuils et leur calendrier vivent
uniquement dans le
[protocole de preuve post-0.2.2](evidence-protocol-post-0.2.2.md). La thèse
explique pourquoi ces portes existent ; elle ne constitue pas une seconde
source d'exécution.

## Positionnement recommandé

Ne pas dire :

> Plusieurs modèles débattent et rendent votre plan correct.

Dire :

> Avant une tâche risquée, Inspectrum fait passer le plan par un checkpoint
> indépendant, conserve ce qui a été trouvé ou échoué, et vous laisse décider.

La preuve publique doit montrer une entrée, un finding confirmé, la décision
humaine, le coût et la limite. Un échec ou un faux positif documenté vaut mieux
qu'un taux de « confiance » sans oracle.

## Acquisition et activation

### Acquisition

Après la publication 0.2.2, cibler les personnes qui possèdent déjà Claude Code et
Codex et publient des tâches de migration, auth, paiements ou données. Les
canaux utiles sont les catalogues natifs, dépôts/communautés des deux harnais,
le premier cas éligible pré-enregistré et consentant, résultat positif ou nul,
et des invitations directes. Les refus de publication restent comptés. Une
campagne large ou des étoiles avant preuve créeraient de la curiosité, pas de
rétention.

Avantages de distribution existants :

- plugin Claude Code et parcours à deux commandes ;
- MCP local réutilisable par plusieurs hôtes ;
- npm, GitHub, MCP Registry et Glama déjà publics ; Claude Community en attente
  et PulseMCP absent au 1er août 2026 ;
- preuve locale exportable sans compte Inspectrum.

Ils facilitent l'essai mais seront copiés. Le vrai canal organique potentiel est
le cas de défaut confirmé partageable : « ce changement semblait sûr ; voici
l'hypothèse trouvée avant exécution ».

### Activation

Moment d'activation :

1. l'utilisateur marque ou accepte une tâche comme risquée ;
2. la sortie de plan déclenche une revue unique ;
3. le résultat nomme reviewer, durée, statut et preuves ;
4. l'utilisateur accepte/rejette chaque finding ;
5. l'agent revient au plan ou à l'approbation humaine ;
6. un résumé assaini peut être exporté volontairement.

Indicateurs d'usage récurrent :

- première session verte ;
- deuxième utilisation parmi les personnes réellement réexposées à une tâche
  à risque sous six semaines ;
- taux de skip volontaire par niveau de risque ;
- findings majeurs acceptés et uniques ;
- minutes de triage par finding accepté ;
- rework évité déclaré puis vérifié quand possible ;
- taux d'échec/partiel et p50/p95 ;
- export volontaire d'un cas.

### Volonté de payer

Elle est **absente pour Inspectrum**. Les prix concurrents et anecdotes montrent
seulement que certaines équipes paient pour du temps senior ou des bugs évités.
Elles ne fixent ni prix, ni demande, ni porte pour Inspectrum.

Si personne ne paie malgré une utilité répétée, maintenir l'outil open source
léger peut rester rationnel ; cela invalide le SaaS, pas nécessairement
l'utilité.

Le test doit distinguer paiement pour une seconde opinion générique et paiement
pour la garantie inter-fournisseurs. Le protocole P3 fixe seul le moment, les
seuils et les issues commerciales ; la roadmap fixe seule la forme autorisée
d'une éventuelle offre de Phase E.

## Décision de portefeuille

- **Principal :** checkpoint de plan haut risque, borné et mesuré.
- **Instrumentation :** diff/commit local uniquement comme vérité terrain, pas
  comme produit.
- **Avantage potentiel :** neutralité, corpus et calibration ; aucun moat tant
  que volume, rétention et audit n'existent pas.
- **Gelé :** kit de calibration public pendant le pilote.
- **Repoussé :** intégration pull request/multi-forge.
- **Abandonné :** pair programming continu et débat libre.
- **À retirer du message :** « plus de modèles = plus fiable » et « local =
  aucune donnée ne quitte la machine ».

La [roadmap d'exécution](outcome-moat-roadmap-post-0.2.2.md) fixe les résultats
et le portefeuille ; le
[protocole de preuve](evidence-protocol-post-0.2.2.md) fixe les portes d'arrêt ;
la [boucle GitHub](github-star-growth-loop.md) fixe la distribution. Aucun de
ces documents ne peut autoriser seul une extension du produit.
