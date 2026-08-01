# Roadmap post-0.2.2 orientée résultats, wedge et moat

État : décision d'exécution du 30 juillet 2026, mise à jour le 1er août 2026.
`inspectrum@0.2.2`, la release GitHub, la fiche MCP Registry et la fiche Glama
sont publiques. La soumission Claude Community est en attente et Inspectrum
n'est pas référencé par PulseMCP. Cette roadmap est active ; elle n'autorise ni
nouvelle publication, ni extension de portée sans la porte correspondante.

Les investissements fondés sur un gain inter-fournisseurs restent gouvernés
par le [protocole de preuve](evidence-protocol-post-0.2.2.md). Le
positionnement et la Phase B à faible regret avancent en parallèle ; les
Phases D et E exigent un `GO` du protocole.

## Cap

### Catégorie à posséder

**Assurance indépendante des changements agentiques à risque.**

Inspectrum se concentre sur une frontière précise : le moment avant qu'un agent
prenne une action difficile à annuler. Les comités de modèles, bots de pull
request et harnais généralistes restent hors de cette catégorie.

### Positionnement

> **Inspectrum est le contrôle pré-vol indépendant avant qu'un agent exécute
> un changement difficile à annuler. Il garde les preuves, désaccords et
> échecs visibles. L'humain décide.**

Version courte :

> **Independent pre-flight review for risky coding-agent changes.**

« Indépendant » signifie ici un reviewer distinct du modèle auteur, exécuté
séparément sans voir sa sortie. Le terme ne prétend jamais que leurs erreurs
sont statistiquement indépendantes.

### Wedge

Le wedge, c'est-à-dire le premier usage étroit qui ouvre le marché, reste
`ExitPlanMode` dans Claude Code :

- l'utilisateur prépare une migration, une modification d'authentification, un
  paiement, une rupture d'interface, un déploiement ou une refonte coûteuse ;
- Inspectrum déclenche un reviewer indépendant une fois ;
- le résultat distingue constat, preuve, désaccord et échec ;
- l'utilisateur garde l'approbation finale.

Le nom durable de la frontière est **avant décision difficile à inverser**. La
sortie de plan est la première intégration, pas la définition définitive du
produit.

### Moat à construire

Le moat visé, c'est-à-dire l'avantage durable difficile à reproduire,
combinerait quatre actifs :

1. cas réels consentis avec défaut et issue confirmés ;
2. calibration par modèle, version, classe de risque, coût et latence ;
3. routage qui appelle le bon reviewer et n'escalade que si cela vaut son coût ;
4. protocole neutre de preuve et d'état dégradé réutilisable entre harnais.

Chaque fonction isolée reste copiable. Leur historique vérifié, leur méthode
publique et la confiance acquise forment l'actif défendable potentiel.

**Au 1er août 2026, ni le gain net de fiabilité ni ce moat potentiel ne sont
prouvés.** Aucune porte P1, P2 ou P3 n'a encore réussi.

## Règles de construction

1. **Un noyau.** Un serveur local, un outil MCP `review_plan`, un contrat de
   preuve et des adaptateurs minces.
2. **Aucune infrastructure propriétaire.** Pas de serveur HTTPS, base distante,
   compte Inspectrum ou télémétrie cachée.
3. **Une seule nouvelle frontière à la fois.** Claude Code d'abord ; les autres
   harnais consomment le même contrat.
4. **Preuve avant spectacle.** Pas de débat multi-tours, de vote ou de nombre de
   modèles affiché comme score de confiance.
5. **Le cas utilisateur produit l'actif.** Chaque usage peut, avec consentement,
   devenir un cas assaini, une entrée de calibration et une preuve publique.
6. **Budget de complexité fixe.** Toute capacité nouvelle nomme ce qu'elle
   remplace ou supprime. Pas de backend ajouté uniquement pour afficher un logo.
7. **Compatibilité avant vitesse.** Les changements de contrat ont version,
   migration, fixture et test.

## Étoile polaire et mesures

L'étoile polaire produit est :

> **Nombre mensuel de checkpoints à risque terminés avec statut exact,
> disposition humaine et issue vérifiable.**

Sans télémétrie, elle est mesurée par cas volontairement exportés, pilotes,
issues consenties et retours structurés. Les étoiles GitHub mesurent la
distribution et la confiance publique ; elles ne remplacent jamais l'usage.

Mesures secondaires :

- installation publique vers premier `doctor` vert en moins de 10 minutes ;
- première revue réussie, partielle ou échouée correctement nommée ;
- findings majeurs acceptés puis confirmés ;
- minutes de triage par finding confirmé ;
- deuxième utilisation lorsqu'une nouvelle tâche à risque se présente ;
- exports assainis et cas réutilisables ;
- étoiles, forks, contributeurs externes et installations qualifiées ;
- coût et latence par checkpoint.

## Séquence sur douze mois

| Phase | Période après 0.2.2 | Résultat utilisateur | Actif candidat, non prouvé |
|---|---:|---|---|
| A : posséder la catégorie | J0–J30 | comprendre, installer et voir une vraie revue en moins de 10 minutes | aucun ; positionnement seulement |
| B : rendre la garantie tangible | M1–M2 | savoir exactement ce qui a été revu, échoué et décidé | enveloppe de preuve et disposition humaine |
| C : lancer la boucle de preuves | M2 jusqu'au `GO`, premier passage ≤18 semaines, plafond absolu 26 semaines | comparer les reviewers sur des cas confirmés | premier corpus et première calibration publique |
| D : devenir portable sans grossir | à partir du `GO`, jamais avant M6 | réutiliser la même garantie depuis trois harnais | contrat commun et adaptateurs communautaires |
| E : transformer les données en produit | à partir du `GO`, jamais avant M6 | obtenir le bon niveau de revue au bon coût | routage calibré, historique et confiance neutre |

Les objectifs GitHub vivent uniquement dans la
[boucle de croissance](github-star-growth-loop.md). Ils ne sont jamais un
critère de sortie d'une phase produit.

## Phase A : posséder la catégorie

### Résultat attendu

Un développeur comprend en trente secondes le risque traité, installe en deux
commandes et voit un statut honnête en moins de dix minutes.

### Livrables

- README centré sur le contrôle pré-vol, avec l'alternative skill expliquée ;
- démonstration réelle de 60 à 90 secondes, sans montage trompeur ;
- un cas positif, un résultat nul et un échec visible ;
- tableau « skill maison / revue native / Inspectrum » sur les garanties ;
- `doctor` et message d'activation sans ambiguïté ;
- pages de catalogue cohérentes avec le même positionnement ;
- modèles d'issue pour cas, friction d'installation et faux positif.

### Garde-fous

- aucune promesse de meilleure exactitude ;
- aucun cas artificiel présenté comme usage réel ;
- aucune demande d'étoile avant d'avoir montré la valeur ;
- aucune fonctionnalité majeure pendant les 48 premières heures publiques.

### Décision

Si l'installation publique ou le premier checkpoint échoue, corriger
l'activation avant tout travail de moat ou de croissance.

## Phase B : rendre la garantie tangible

### Résultat attendu

L'utilisateur peut répondre à cinq questions : qui a relu, avec quelle version,
qu'est-ce qui a réussi, qu'est-ce qui a échoué et qu'ai-je décidé ?

### Portée produit

- provenance exacte du reviewer : fournisseur, modèle, version, effort, durée ;
- états `reviewed`, `partial`, `unreviewed` sans conversion d'un échec en vert ;
- séparation `claim`, `evidence`, `dissent` et `uncertainty` ;
- disposition humaine : `accepted`, `rejected`, `duplicate`, `out_of_scope`,
  `unverified` ;
- export local assaini et volontaire ;
- schéma de preuve versionné avec fixtures de migration ;
- juge optionnel et éditorial, jamais compteur de votes.
- instrumentation p50/p95 sur la baseline avant P3, sans changer modèle,
  prompt, effort ou délai du reviewer.

### Simplicité

Ces informations restent dans les fichiers de session. Aucun tableau de bord,
compte, synchronisation ou base distante.

### Résultat de qualité

Cent pour cent des fixtures de panne affichent le bon état ; aucun reviewer ne
peut muter le dépôt ; les anciennes sessions restent lisibles.

## Phase C : lancer la boucle de preuves

### Résultat attendu

Chaque constat important peut être relié à une issue confirmée ou rester
explicitement non vérifié.

### Livrables

- protocole public minimal de soumission consentie ;
- 10 premiers cas publiables, positifs ou négatifs ;
- jeu de cas versionné couvrant migration, données, authentification, paiement
  et compatibilité ;
- rapport trimestriel de résultats par modèle/version : défauts uniques, faux
  positifs, triage, coût, latence et échecs ; ce rapport publie des mesures,
  pas un kit ou framework de calibration réutilisable ;
- comparaison avec le meilleur skill/hook simple, pas avec l'absence de revue ;
- résultats négatifs conservés.

### Forme soutenable

Le registre commence en CSV/Markdown et se reconstruit par script. Une
contribution passe par pull request et validation automatique. Pas de service
de collecte permanent.

### Décision

Les dix premiers cas publiables sont un actif de transparence, pas une preuve
statistique ni un moat. La décision suit P1, P2 et P3 du
[protocole de preuve](evidence-protocol-post-0.2.2.md).

`GO` vers les Phases D et E seulement si P1, P2 et P3 rendent tous `GO` selon
les critères complets du
[protocole de preuve](evidence-protocol-post-0.2.2.md). Toute issue `STOP
PRODUIT` maintient Inspectrum comme utilité locale et interdit routage calibré
et plateforme.

Au terme du premier passage de 18 semaines, moins de dix cas publiables
abandonnent l'hypothèse de moat de données. Ce résultat n'allonge pas le
protocole et n'est pas compensé par des cas choisis après coup.

## Phase D : devenir portable sans grossir

Cette phase ne démarre que si la Phase C et le protocole de preuve rendent
`GO`.

### Résultat attendu

Le même contrat de preuve fonctionne depuis Claude Code, Codex et un troisième
harnais choisi par demande observée.

### Architecture

- le serveur et `review_plan` restent le noyau ;
- le comportement automatique Claude Code reste un adaptateur ;
- Codex et le troisième harnais utilisent skill, hook ou recette mince ;
- les adaptateurs vivent hors du noyau lorsqu'ils ont un cycle de release
  différent ;
- la communauté peut maintenir un adaptateur sans modifier l'orchestrateur.

### Critère de choix du troisième harnais

Choisir entre OpenCode, Gemini CLI, Cursor ou autre à partir des issues,
installations et contributions, jamais à partir du nombre d'étoiles du
concurrent.

### Limite

Trois harnais maximum maintenus par le projet. Les suivants sont communautaires
ou documentés comme recettes.

## Phase E : transformer les données en produit

Cette phase ne démarre que si la Phase C et le protocole de preuve rendent
`GO`.

### Résultat attendu

Une tâche reçoit le reviewer, l'effort et le budget adaptés au risque, sans
comité systématique.

### Portée

- profils de risque explicites et modifiables ;
- recommandation de reviewer fondée sur la calibration observée ;
- escalade seulement quand l'historique montre une valeur marginale ;
- budget de coût et de latence avant lancement ;
- avertissement quand la calibration est absente ou périmée ;
- comparaison des versions dans le temps ;
- rapport d'assurance local exportable.

Le routage commence par des règles lisibles. Aucun apprentissage automatique
avant un volume et une qualité de données suffisants.

### Modèle soutenable

Le noyau open source reste local et gratuit. Des revenus peuvent ensuite venir
de rapports de calibration vérifiés, politiques d'assurance d'équipe, support
et audits, sans héberger le code ni les plans.

Aucune offre payante n'est construite avant la décision commerciale `OFFRE
PAYANTE` de P3 dans le
[protocole de preuve](evidence-protocol-post-0.2.2.md). Avant cette porte, la
livraison reste documentaire et manuelle, en mode concierge. Elle ne crée ni
compte, ni synchronisation d'équipe, ni automatisation propre.

## Contrat de qualité

« Qualité parfaite » devient un contrat vérifiable :

- zéro vulnérabilité de production haute ou critique à la release ;
- aucun test, typecheck, lint, couverture ou test de contrat rouge ;
- couverture maintenue au-dessus des seuils existants, jamais abaissée ;
- aucun statut vert lorsqu'un reviewer a échoué ou n'a pas répondu ;
- aucune mutation du dépôt par le reviewer ;
- versions, prompts, modèles et efforts présents dans les preuves ;
- compatibilité descendante ou migration documentée ;
- limites, coûts et confidentialité écrits dans le même changement que la
  fonctionnalité ;
- release reproductible et paquet vérifié ;
- un seul moyen recommandé d'accomplir chaque tâche importante.

Un défaut critique bloque la release. Un défaut de documentation qui change la
promesse publique est traité comme un défaut produit.

## Portefeuille explicitement fermé

Ne pas construire pendant ces douze mois :

- bot généraliste de pull request ;
- produit autonome de revue de commit ;
- pair programming continu ;
- débat libre ou multi-tours entre modèles ;
- interface Web, SaaS ou hébergement de plans ;
- base de données distante ;
- marketplace propriétaire ;
- nouveau protocole de transport ;
- orchestration d'équipe générique.

Le diff et le commit restent des instruments de confirmation ex post. Une
nouvelle frontière n'entre au portefeuille que si elle réutilise le même
contrat, les mêmes preuves et le même actif de calibration.

## Conditions de recentrage

- après 30 jours, terminer l'enveloppe de preuve de Phase B comme seul travail
  produit autorisé ; avec 1 à 4 installations externes réussies, corriger
  positionnement et activation ; avec zéro installation, suspendre tout travail
  après Phase B et revoir le wedge, la démonstration et les canaux ;
- adaptateur équivalent en moins de 100 lignes : le traiter comme canal, pas
  comme différentiel produit ;
- fonction native équivalente sur déclenchement, contrat, preuve, échec et
  portabilité, démontrée par une vérification indépendante reproductible à coût
  inférieur ou égal : déplacer Inspectrum vers le standard ouvert ou la
  maintenance ;
- coût de maintenance supérieur à deux jours par mois hors release : supprimer,
  externaliser ou geler la surface responsable.

## État au 1er août et prochains pas

1. npm, la release GitHub et les plugins publics sont alignés sur 0.2.3 ;
2. Glama est public, le MCP Registry peut encore afficher 0.2.2, Claude
   Community ne liste pas Inspectrum et PulseMCP n'a pas pu être revérifié ;
3. la preuve 0.2.3 hors checkout, la démonstration, le cas utile, le résultat
   nul et la dégradation visible sont publiés dans `docs/activation/` ;
4. exécuter le protocole d'activation externe sans inventer de participants ;
5. publier ensuite les résultats bruts et les abandons ;
6. aligner description GitHub et catalogues quand leur statut change ;
7. lancer la boucle GitHub décrite dans
   [github-star-growth-loop.md](github-star-growth-loop.md) ;
8. ouvrir le schéma de preuve de Phase B, sans autre extension.
