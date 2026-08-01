# Protocole de preuve post-0.2.2

État : protocole expérimental défini le 30 juillet 2026, état contrôlé le
1er août 2026. **Aucune porte P1, P2 ou P3 n'a encore réussi ; le gain net de
fiabilité inter-fournisseurs et le moat fondé sur les preuves restent non
prouvés.** Ce document contient uniquement
les trois portes qui autorisent ou arrêtent les investissements fondés sur un
gain inter-fournisseurs. La
[roadmap d'exécution](outcome-moat-roadmap-post-0.2.2.md) reste l'unique source
pour le produit, le calendrier et la croissance.

Le positionnement public et les travaux à faible regret de la Phase B peuvent
avancer sans attendre ces portes. P1 et P2 utilisent une baseline 0.2.2 figée
et versionnée. P3 mesure le build de Phase B publié, puis figé et versionné
avant le premier utilisateur. Une capacité développée en parallèle n'entre pas
silencieusement dans un bras mesuré.

L'horloge commence à l'ouverture écrite de la Phase C. Le premier passage P1 à
P3 tient dans 18 semaines. Une seule reprise par porte est autorisée et le
protocole entier s'arrête au plus tard à 26 semaines. Au-delà, la décision est
`STOP` ou `MAINTENANCE`, jamais une prolongation silencieuse.

## Définitions

- **Cas admissible :** tâche à risque dont l'issue peut être établie par un
  test rouge, un rollback, un incident, un correctif causal, un invariant
  déterministe ou une adjudication indépendante.
- **Cas apparié :** même paquet de plan, contexte, tests et preuves présenté
  aux deux conditions comparées.
- **Cas adjudiqué :** cas dont les constats ont été codés par un reviewer
  non-auteur selon la grille pré-enregistrée.
- **Cas publiable :** cas admissible, assaini et partagé avec consentement.

Un cas peut être admissible à l'expérience sans être publiable. Les volumes de
30 à 50 cas en P1, 120 à 150 cas en P2 et 12 utilisateurs en P3 répondent à des
questions différentes ; ils ne s'additionnent pas en un « data moat ».

## P1 : test de décorrélation plan

Objectif : tuer rapidement l'hypothèse « autre fournisseur = angle mort
utile ».

### Jeu de cas

- 30 à 50 plans historiques à issue connue ;
- inclure seulement les plans satisfaisant au moins un déclencheur de risque
  pré-enregistré ;
- privilégier migrations, authentification, paiement, données et
  compatibilité ;
- conserver original, issue ex post et transformation assainie ;
- inclure des plans corrects pour mesurer les faux positifs ;
- exclure les plans dont l'issue ne peut pas être établie.

Une opinion du créateur du plan ne suffit pas comme vérité terrain.

La préparation peut prendre jusqu'à deux semaines avant les deux jours
d'exécution. Si 30 cas admissibles et adjudicables ne sont pas disponibles, P1
est `STOP`, sans prolongation indéfinie.

Deux évaluateurs sont sélectionnés avant les sorties pour leur expérience du
domaine. Ils déclarent leurs conflits, n'ont écrit ni Inspectrum ni le
protocole et restent aveugles à l'identité du bras. Ils codent indépendamment
au moins 20 % des cas ; accord brut et kappa de Cohen sont publiés.

`κ < 0,60` interdit tout calcul de décision. La seule révision autorisée,
pré-enregistrée avant les sorties, porte sur une catégorie que les deux
évaluateurs ont indépendamment marquée ambiguë ; elle ne change ni seuil ni
sévérité. Le lot entier est alors recodé une fois, avec un nouvel échantillon
double-codé. Si `κ` reste inférieur à 0,60, P1 est `STOP`. Les désaccords
restants au-dessus du seuil vont à un troisième arbitre indépendant.

### Protocole

Un test purement opérationnel, sans cas d'issue ni mesure de qualité, doit
d'abord montrer qu'une configuration atteint la cible de latence P3. Cette
configuration est ensuite pré-enregistrée et ne change plus. Si aucune
configuration ne tient la cible, P1 est `STOP` avant collecte.

1. pré-enregistrer prompts, modèles, versions, effort, budget, classes de
   défaut et grille de sévérité ;
2. lancer Claude et Codex séparément, sans voir l'autre sortie ;
3. randomiser l'ordre de présentation aux évaluateurs ;
4. faire normaliser manuellement les constats, indépendamment, par les deux
   évaluateurs non-auteurs avec une grille figée ; l'arbitre tranche les
   désaccords, sans juge qui vote ni kit de calibration produit ;
5. mesurer recouvrement, erreurs confirmées uniques, faux positifs, minutes de
   triage, latence et échecs ;
6. publier méthode et résultats négatifs avec les cas qui peuvent l'être.

Cette porte est directionnelle : elle ne permet pas d'affirmer une précision
universelle.

### Décision

`GO P2` seulement si :

- recouvrement des objections confirmées inférieur ou égal à 70 % ;
- au moins 10 % des cas reçoivent une contribution marginale confirmée ;
- au moins 15 % des défauts utiles sont supplémentaires ;
- les intervalles bootstrap pré-enregistrés à 90 % excluent zéro gain pour ces
  deux mesures ;
- faux positifs et triage ne rendent pas l'utilité nette négative.

`STOP` si :

- recouvrement supérieur à 70 % sans utilité marginale ;
- aucun défaut majeur unique confirmé ;
- objections non falsifiables ;
- coût du test supérieur au rework historique plausible.

Si P1 s'arrête, Inspectrum reste une utilité locale de seconde opinion. Les
Phases D et E de la roadmap ne démarrent pas.

## P2 : comparaison à budget égal

Objectif : battre le meilleur substitut raisonnable, pas une absence de revue.

### Porte de faisabilité

P2 ne démarre que lorsque 120 cas admissibles au minimum sont inventoriés,
dédupliqués et auditables. Les sources permises sont :

- cas historiques privés avec consentement du propriétaire ;
- issues, correctifs, pull requests ou post-mortems publics sous licence
  compatible ;
- cas contribués volontairement avec droit d'usage explicite.

Les cas utilisés en P1 sont exclus de P2 et du test court qui choisit la
baseline. P2 utilise des sessions fraîches sur un lot distinct pour éviter une
sélection influencée par les résultats du premier test.

La provenance et l'ordre d'éligibilité sont pré-enregistrés pour empêcher la
sélection favorable. Deux évaluateurs non-auteurs et un arbitre de désaccord
sont engagés avant le premier run ; leur rémunération, leurs conflits et leur
disponibilité sont documentés. Aucun travail gratuit n'est supposé.

L'étude P1 à P3 dispose d'une enveloppe ponctuelle distincte du budget de
maintenance et de croissance : au plus 100 heures d'opération, 100 heures
cumulées d'évaluation externe, 10 000 euros de rémunération externe et 1 000
euros de modèles ou d'infrastructure.
Les minutes attendues par cas sont pré-enregistrées. Chaque plafond est un
maximum, pas un budget à consommer ; son épuisement pendant l'étude produit
`STOP`, sans rallonge. Si les cas, les évaluateurs ou le financement ne sont
pas sécurisés dans l'horloge de 18 semaines, la décision est aussi `STOP`, sans
construire d'automatisation pour compenser.

### Deux bras seulement

Sur environ 120 à 150 cas appariés :

- **A, meilleur substitut :** meilleure configuration du même fournisseur
  parmi second passage critique, sous-agent en lecture seule avec outils et
  tests, ou déclenchement par skill, hook ou intégration continue ;
- **B, Inspectrum :** second passage d'un autre fournisseur sur le même paquet
  de preuves figé, avec le skill ou hook 0.2.2 inchangé.

Les deux bras reçoivent le même plan, contexte, sorties de tests et artefacts
déterministes. Aucun ne produit de nouveau test pendant la mesure principale ;
l'effet de tests supplémentaires est mesuré séparément.

« Même budget » signifie, par cas, un plafond pré-enregistré identique de coût
fournisseur équivalent, de contexte et de temps opérateur. La latence murale
reste une mesure. Les quotas d'abonnement reçoivent un prix implicite publié.

La configuration A est choisie avant P2 par un test court sur des cas de
calibration exclus de l'analyse, avec la même grille d'utilité. Une seule
configuration gagnante entre dans les deux bras.

Ces configurations sont des artefacts jetables d'expérience : elles ne sont
ni distribuées ni réutilisées comme produit. Recette, version et résultats
assainis sont archivés pour reproductibilité.

Pas de comité à quatre bras, de débat ou de juge obligatoire. Un troisième
bras exige un calcul de puissance et une nouvelle pré-inscription.

### Mesures

Mesures principales :

- défauts majeurs confirmés uniques ;
- précision utile : constats acceptés et confirmés / constats triés ;
- minutes de triage par constat confirmé ;
- coût marginal par défaut confirmé ;
- rework évité selon une grille pré-enregistrée ;
- taux de runs échoués, partiels ou sautés.

Mesures secondaires :

- accord ou corrélation par classe de tâche ;
- variance entre répétitions ;
- latence p50 et p95 ;
- capacité d'un test ou outil déterministe à remplacer le reviewer.

Le suivi principal dure deux à quatre semaines, puis une fenêtre de maturation
de deux semaines capte correctifs, rollbacks et rework tardifs. Preuves,
prompts, hook, versions et séparation de l'effet des tests sont figés avant le
premier cas.

### Décision

`GO P3` seulement si B produit une utilité nette positive et un gain matériel
pré-enregistré sur A :

- au moins 10 % des cas avec défaut majeur marginal ;
- au moins 15 % de défauts utiles supplémentaires ;
- intervalles bootstrap à 90 % excluant zéro gain ;
- aucune hausse supérieure du triage.

`REVISE` une fois si le protocole découvre un défaut de mesure corrigeable sans
changer la question. Une seconde reprise est interdite.

`STOP` si :

- les intervalles restent compatibles avec aucun gain utile ;
- triage ou latence annule le rework évité ;
- tests ou outils déterministes expliquent le gain ;
- le résultat dépend d'un seul modèle ou disparaît à la version suivante ;
- la baseline skill ou hook est indistinguable.

### Couture P2 vers P3

Avant le premier utilisateur P3, le build publié de Phase B est rejoué sur
l'ensemble du corpus P2 figé. Les modèles, prompts, efforts, délais et entrées
reviewer restent identiques ; seuls l'enveloppe de preuve, les états et la
disposition humaine peuvent différer.

Le replay doit conserver les seuils de gain et d'utilité nette de P2, nommer
exactement chaque état dégradé et mesurer p50/p95. Toute modification de
modèle, prompt, effort ou délai invalide le protocole courant et produit
`STOP`, sans consommer ni créer une reprise. Si la qualité régresse ou si la
latence P3 reste hors seuil, la décision est aussi `STOP`. Aucun réglage n'est
effectué après le gel du build P3.

## P3 : pilote comportemental et commercial

Objectif : vérifier que l'effet mesuré devient un comportement récurrent sans
affaiblir la vigilance humaine.

### Cohorte et parcours

- 12 utilisateurs externes ciblés ;
- gratuit pendant six semaines ;
- autorité et consentement sur les plans utilisés ;
- tâches à haut risque sélectionnées explicitement ;
- support d'installation sans collecte silencieuse ;
- au plus six contacts existants et au moins six recrutements froids, avec
  résultats rapportés séparément.

```text
invitation ciblée
  -> installation publique
  -> doctor
  -> première session verte
  -> disposition de chaque constat
  -> confirmation ex post
  -> nouvelle exposition à une tâche risquée
  -> deuxième utilisation ou skip explicite
```

### Mesures

Activation :

- au moins 70 % des accompagnés atteignent une session verte ;
- médiane installation vers valeur inférieure à 10 minutes ;
- moins de 20 % d'échecs opérationnels.

Usage :

- au moins huit utilisateurs sont réexposés à une tâche à risque ;
- au moins 50 % des réexposés réutilisent le checkpoint sous six semaines et
  la borne basse unilatérale de Wilson à 80 % reste au moins à 20 % ;
- le skip volontaire est suivi ;
- p50 inférieur ou égal à 45 secondes et p95 inférieur ou égal à 120 secondes.

Vigilance :

- demander une décision de risque avant la revue ;
- ne jamais afficher un vert sans preuve et statut complet ;
- comparer temps et justification d'approbation avant et après ;
- faire coder les décisions par un tiers non impliqué, aveugle au bras lorsque
  les traces le permettent ;
- arrêter si, dans au moins deux cas confirmés ou 10 % des cas observables, le
  vert accélère l'acceptation sans vérification ou augmente la confiance alors
  que l'exactitude baisse.

Valeur :

- défauts majeurs confirmés uniques ;
- rework évité avec preuve ex post ;
- minutes de triage ;
- cas exportés volontairement.

Paiement :

- après trois usages ou à la sixième semaine, présenter une offre réelle ;
- prix exploratoire de 10 à 20 euros par mois ou pilote équipe payé ;
- servir l'offre manuellement avec la baseline gelée, sans automatisation
  nouvelle, et rembourser si la garantie annoncée n'est pas tenue ;
- le paiement pour une seconde opinion générique valide seulement cette
  utilité, pas le moat de confiance ;
- comparer à prix égal seconde opinion générique et garantie inter-fournisseurs
  avec provenance, échec visible, cas adjudiqués et calibration publique.

### Décision

`GO` vers les Phases D et E seulement si qualité, comportement et vigilance
passent.

`REVISE` une fois si moins de huit utilisateurs sont réexposés à la sixième
semaine.

`STOP PRODUIT` si :

- récurrence inférieure à 20 % sur au moins huit réexposés ;
- fausse confiance au seuil défini ;
- activation inférieure à 40 %.

La décision commerciale est indépendante :

- `OFFRE PAYANTE` seulement si au moins cinq personnes ont réellement accepté
  de payer et au moins trois préfèrent la garantie inter-fournisseurs ;
- `OPEN SOURCE` si ce seuil manque : aucune offre payante ni automatisation
  commerciale, sans annuler un éventuel `GO` produit ;
- un pilote équipe isolé ne suffit pas sans cinq décisions payantes
  individuelles.

## Tableau go/no-go complet

| Signal | Go | Revise | Stop ou maintenance |
|---|---|---|---|
| version publique | alignée, parcours réel vert | blocage d'activation corrigeable | dérive ou échec silencieux |
| décorrélation | ≤70 % + deux seuils marginaux + intervalles >0 | protocole ambigu | >70 % sans gain ou un seuil absent |
| qualité face à la baseline | gain pré-enregistré, utilité nette positive | mesure corrigeable une fois | indistinguable ou négative |
| activation | ≥70 %, <10 min | 40 à 69 % | <40 % ou >20 min |
| récurrence exposée | ≥50 %, n≥8, borne Wilson ≥20 % | n<8 ou signal incertain | <20 % avec n≥8 |
| vigilance | stable ou améliorée | signal ambigu | fausse confiance |
| latence | p50 ≤45 s, p95 ≤120 s | défaut de mesure corrigeable avant le gel | cible manquée après le gel |
| paiement et garantie | offre payante si ≥5 payants dont ≥3 préfèrent la garantie | paiement générique ou pilote seul | aucune offre payante ; maintien open source |
