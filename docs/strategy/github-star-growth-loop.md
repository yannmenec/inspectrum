# Boucle de croissance GitHub d'Inspectrum

État : plan post-publication 0.2.2, mis à jour le 1er août 2026. Les chiffres
sont des instantanés datés, pas des preuves de qualité, de fiabilité ou de moat.

## Point de départ

| Signal | Valeur observée | Lecture |
|---|---:|---|
| étoiles GitHub | 2 | découverte presque inexistante |
| visiteurs uniques sur 14 jours | 9 | trop peu pour mesurer une conversion |
| cloneurs uniques sur 14 jours | 8 | signal faible, mais plus proche de l'essai |
| référents GitHub visibles | 0 | aucun canal organique identifié |
| téléchargements npm sur 30 jours | 430 | concentrés autour des releases, donc non assimilables à des utilisateurs |
| téléchargements de l'actif MCPB 0.2.1 | 7 | usage Desktop encore marginal |

Sources :

- <https://github.com/yannmenec/inspectrum>
- <https://api.npmjs.org/downloads/range/last-month/inspectrum>
- API de trafic GitHub du dépôt, visible par son propriétaire.

Ordres de grandeur concurrents observés le même jour : PR-Agent dépasse
12 000 étoiles, Roo Code 24 000, Aider 47 000, Cline 65 000, OpenHands 82 000,
OpenCode 191 000 et Hermes Agent 222 000. Ces nombres mesurent surtout leur
distribution ; l'avantage produit d'Inspectrum reste à démontrer.

## Rôle des étoiles

Une étoile GitHub signifie : « je veux retrouver, suivre ou soutenir ce
projet ». Elle ne prouve ni installation, ni activation, ni rétention.

La hiérarchie des mesures est :

1. checkpoint à risque avec statut exact et décision humaine ;
2. installation externe réussie ;
3. cas, retour ou contribution externe ;
4. étoile GitHub ;
5. impression, vue ou téléchargement brut.

Une campagne est saine seulement si les niveaux 1 à 3 progressent avec les
étoiles.

## Boucle composée

```text
tâche réelle à risque
  → checkpoint Inspectrum
  → preuve ou échec visible
  → cas assaini et consentant
  → benchmark / comparaison / démonstration
  → découverte GitHub
  → étoile qualifiée
  → installation
  → nouvelle tâche réelle à risque
```

La boucle peut produire simultanément distribution et actif candidat. Un
article sans cas réel crée une pointe de trafic ; un cas confirmé peut aussi
enrichir la calibration. Aucun de ces effets n'est encore prouvé.

## Ce qui mérite une étoile

La page d'accueil doit répondre, dans cet ordre :

1. quel risque est évité ;
2. quand Inspectrum intervient ;
3. pourquoi un skill seul peut être insuffisant ;
4. ce qui se passe si la revue échoue ;
5. quelle donnée quitte la machine ;
6. comment obtenir une première preuve en moins de 10 minutes ;
7. quel cas réel confirme ou réfute la valeur.

Actifs nécessaires :

- démonstration réelle de 60 à 90 secondes ;
- schéma animé ou capture du checkpoint ;
- cas positif, résultat nul et panne visible ;
- comparaison honnête avec skill/hook, Amp Oracle et revue native ;
- commande d'installation copiée une seule fois ;
- exemple de session lisible sans installer ;
- badges limités à version, tests, couverture, sécurité et licence ;
- `CONTRIBUTING.md` avec une contribution de moins de 30 minutes.

## Jalons

| Horizon | Repère de distribution | Preuve qui doit accompagner les étoiles |
|---|---:|---|
| 14 jours | 15 étoiles | 5 installations externes, 3 retours distincts |
| 30 jours | 25 | 10 installations, 3 cas ou issues utiles |
| 90 jours | 100 | 25 activations, 10 cas, 3 contributeurs externes |
| 6 mois | 250 | 50 activations, 30 cas, 5 contributeurs |
| 12 mois | 500 | 100 activations, résultat du protocole publié, 10 contributeurs |

Ces repères dimensionnent seulement le budget de distribution à partir d'une
base trop faible pour établir une prévision. Aucune cible d'étoiles n'est un
critère de sortie d'une phase produit. Elle n'autorise ni spam, ni achat, ni
concours sans rapport avec le produit.

## Séquence de lancement

### État public au 1er août 2026

- npm 0.2.2 et la release GitHub sont disponibles ;
- le MCP Registry et Glama référencent Inspectrum ;
- la soumission Claude Community est en attente ;
- PulseMCP ne référence pas encore Inspectrum ;
- la capture terminal reste une preuve 0.2.1 et ne doit pas être présentée
  comme une preuve 0.2.2.

### J0 à J2

- vérifier `doctor` et un checkpoint depuis un environnement vide avec la
  version npm publique ;
- enregistrer une démonstration réelle ;
- publier la note de release centrée sur l'outcome ;
- mettre à jour description, aperçu social, sujets GitHub et README.

### J3 à J7

- soumettre aux catalogues MCP et Claude déjà préparés ;
- publier un cas réel assaini avec méthode, coût et limite ;
- contacter directement 10 à 20 mainteneurs concernés par migrations,
  authentification, paiement ou données, sans message de masse ;
- demander un essai ou un cas, jamais une étoile isolée ;
- répondre à chaque problème d'installation le jour même.

### Semaines 2 à 4

- publier le résultat nul et l'échec visible ;
- proposer une comparaison reproductible avec un skill de moins de 100 lignes ;
- contribuer un guide aux communautés Claude Code, Codex et MCP ;
- candidater aux listes « awesome » pertinentes après validation publique ;
- transformer les questions répétées en documentation, pas en réponses privées.

### Mois 2 à 3

- publier le premier rapport de calibration ;
- lancer une issue « good first case » ;
- inviter des mainteneurs externes à contester le protocole ;
- publier les corrections et résultats négatifs aussi vite que les succès ;
- refaire un lancement seulement pour un nouvel actif de preuve, pas pour une
  hausse mineure de version.

## Canaux

Priorité :

1. marketplace Claude Code, npm et registre MCP ;
2. README, release GitHub et cas reproductibles ;
3. communautés Claude Code, Codex, MCP et sécurité logicielle ;
4. Reddit, Hacker News et YouTube lorsque le cas est démontrable ;
5. listes « awesome », newsletters et mainteneurs d'outils ;
6. comparaisons recherchées : skill, hook, Oracle, revue native.

Chaque publication pointe vers un artefact précis. Aucun message générique
« découvrez mon outil ».

## Cadence soutenable

Budget normal : deux heures par semaine, hors semaine de release.
La fenêtre de lancement J0 à J14 dispose d'un budget exceptionnel maximal de
huit heures de distribution au total, puis revient au budget normal. Les
corrections produit de Phase A ont leur propre estimation et ne sont jamais
masquées dans ce budget. L'étude P1 à P3 possède l'enveloppe ponctuelle définie
dans le [protocole de preuve](evidence-protocol-post-0.2.2.md) ; aucune cible de
croissance ne suppose une adjudication gratuite.

- une preuve ou amélioration documentaire toutes les deux semaines ;
- un rapport de calibration par trimestre ;
- une seule démonstration maintenue ;
- une seule page de comparaison par alternative réellement rencontrée ;
- triage des issues deux fois par semaine ;
- aucune présence quotidienne obligatoire sur les réseaux ;
- automatiser collecte de métriques, contrôle de liens et génération des
  tableaux datés.

Le plafond de deux jours par mois dans la roadmap concerne la maintenance du
produit. Si la croissance dépasse son propre budget de deux heures par semaine
pendant deux mois, couper le canal ou l'actif le moins corrélé aux
installations.

## Tableau de bord minimal

Enregistrer chaque semaine :

- nouvelles étoiles, forks et contributeurs ;
- visiteurs et cloneurs uniques ;
- téléchargements npm et actifs de release, avec anomalies de CI séparées ;
- installations externes confirmées ;
- `doctor` verts rapportés ;
- cas soumis, acceptés, refusés et publiables ;
- temps médian vers la première valeur ;
- issues d'installation ouvertes et résolues ;
- provenance des visites lorsque GitHub la fournit.

Un CSV daté suffit. Pas de produit analytique ni de télémétrie embarquée.

Ratios utiles :

- étoiles / visiteurs uniques ;
- installations confirmées / cloneurs uniques ;
- cas utiles / installations confirmées ;
- contributeurs externes / étoiles ;
- étoiles accompagnées d'une activation / nouvelles étoiles.

Les ratios restent directionnels sur les petits volumes.

## Interdits

- acheter, échanger ou automatiser des étoiles ;
- demander une étoile avant l'essai ;
- concours et cadeaux sans rapport avec un cas produit ;
- messages privés de masse ;
- cacher les faux positifs, pannes ou résultats nuls ;
- gonfler les téléchargements npm par automatisation ;
- ajouter une intégration uniquement pour profiter du nom d'un concurrent ;
- confondre communauté et support gratuit illimité.

## Décisions

- étoiles en hausse, activations stables : corriger onboarding et message ;
- activations en hausse, étoiles faibles : améliorer preuve partageable et
  découverte ;
- étoiles seules en hausse : arrêter le canal de curiosité concerné ;
- cas et contributeurs en hausse : investir dans le protocole et les outils de
  contribution ;
- aucune installation externe après 30 jours : revenir au wedge et à la
  démonstration avant toute fonctionnalité.
