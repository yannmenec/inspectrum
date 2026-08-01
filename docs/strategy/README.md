# Stratégie post-0.2.2

État public vérifié le 1er août 2026. Ce dossier est la source de vérité pour
les décisions produit prises après Inspectrum 0.2.2.

## Décision active

Inspectrum est un **contrôle indépendant avant un changement agentique
difficile à annuler**. Sa première intégration est le point de sortie du mode
plan (`ExitPlanMode`) dans Claude Code. L'utilisateur garde la décision finale.

« Indépendant » signifie qu'un reviewer distinct du modèle auteur est invoqué
séparément. Cela ne signifie pas que leurs erreurs sont statistiquement
indépendantes. **Ni le gain net de fiabilité, ni un avantage durable difficile
à reproduire ne sont prouvés à ce jour.** Aucune porte du protocole de preuve
n'a encore réussi.

## Documents normatifs

- [Roadmap orientée résultats](outcome-moat-roadmap-post-0.2.2.md) : portée,
  séquence et portefeuille autorisé.
- [Protocole de preuve](evidence-protocol-post-0.2.2.md) : expériences et portes
  d'arrêt qui peuvent autoriser les investissements conditionnels.
- [Thèse de créneau et d'avantage défendable](moat-thesis.md) : raisonnement,
  contre-thèse et hypothèses à réfuter.

Documents d'appui :

- [paysage concurrentiel daté de juillet 2026](competitive-landscape-2026-07.md)
  et son [registre de sources](evidence/competitive-source-ledger.csv) ;
- [boucle de croissance GitHub](github-star-growth-loop.md), qui gouverne la
  distribution sans servir de preuve produit.

L'[ancienne roadmap post-0.2.2](roadmap-post-0.2.2.md) est remplacée et ne donne
plus d'autorité d'exécution.

## État de distribution

| Canal | État au 1er août 2026 |
|---|---|
| npm | disponible en version 0.2.2 |
| GitHub | dépôt et release 0.2.2 disponibles |
| MCP Registry | version 0.2.2 disponible |
| Glama | fiche Inspectrum disponible |
| Claude Community | soumission en attente |
| PulseMCP | aucune fiche Inspectrum observée |

## Portefeuille fermé

La revue de code, la revue de pull request et le pair programming ne sont pas
des extensions autorisées. Ils restent hors portefeuille tant que les portes
de preuve n'ont pas réussi ; leur succès ne les ouvrirait pas automatiquement,
car une décision de roadmap explicite resterait nécessaire.
