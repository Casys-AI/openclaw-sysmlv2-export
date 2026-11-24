# Proposition : un Doctor que l'agent de chacun peut faire tourner

Statut : proposition de produit, pas de code. Écrite à partir de la branche
`main` au commit `b4eeef4`. Les chiffres de coût sont des estimations, à
confirmer par un prototype.

## 0. Ce dont on part

Ce qui existe déjà et sur quoi tout le reste s'appuie :

| Pièce                                                   | Où                                                                         | Ce qu'elle garantit                                                                                                       |
| ------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Collecteur OpenClaw → snapshot `openclaw-snapshot/5`    | `src/adapters/out/openclaw/collector.ts`                                   | Faits lus dans la configuration, selon la sémantique documentée d'OpenClaw ; ce qui est ambigu devient une note (`ambiguities`). |
| Émetteur snapshot → SysML                               | `src/adapters/out/sysml/emitter.ts`, `library.ts` (`OpenClawImport`)       | Sortie déterministe, octet pour octet (SPEC §13, décision 10).                                                            |
| Bibliothèque Assembly copiée                            | `sysml/core.sysml`, `cases.sysml`, `skills.sysml`                          | `SoftwareOperator`, `ExecutableCapability`, `CaseType`, `InitialSkill` : un vocabulaire déjà neutre.                       |
| Compilation par le Toolkit épinglé (wasm, 0.10.10)      | `src/adapters/out/sysml-toolkit/`                                          | Le modèle est du SysML v2 valide ; diagnostics avec fichier, ligne, colonne (`worker.ts`).                               |
| Projection RDF + moteur SHACL/SPARQL sur Oxigraph       | `src/adapters/out/oxigraph/`, `src/adapters/out/shacl/`                    | Règles exécutées sur le graphe compilé, sans repli TypeScript.                                                            |
| 5 vues APE + 3 règles APE                               | `rules/ape/ape.ttl`                                                        | `APE_GRANT_WIDENS_PARENT` (A4), `APE_LINK_CYCLE` (B3), `APE_UNREACHABLE_OPERATOR`.                                       |
| 17 codes OpenClaw (21 formes SHACL)                     | `rules/openclaw/openclaw.ttl`                                              | Citent OpenClaw 2026.10.9 et, pour la plupart, un principe ou un pattern (A3, A7, C1, G1, G5, 2.1).                       |
| Commande `diagnose`                                     | `src/composition/cli.ts`, `deno task diagnose --export DIR --toolkit DIR`  | Lit **tous les `.sysml` d'un dossier**, compile, exécute les règles, imprime un JSON canonique. N'écrit rien.            |
| Modèle SysML écrit à la main qui passe dans le Doctor   | `test/fixtures/ape-trial.sysml` (5 agents, ~4 Ko)                          | Preuve qu'un modèle qui ne vient pas du collecteur est déjà diagnostiquable, s'il parle `OpenClawImport`.                 |
| Viewer hors ligne, Doctor, vues System et Reach         | `src/adapters/out/viewer/page.ts`, `src/domain/model/views.ts`             | Page statique `file://`, constats groupés, références principe/pattern en infobulle (`codeOf`, page.ts:1536).            |
| Inférence avec le LLM de l'opérateur (`--infer`)        | `src/adapters/out/llm/`, SPEC §9                                           | Propositions séparées (`OpenClawInferred`), jamais admises automatiquement, réponses masquées.                            |

Deux constats sur le code changent la forme de la proposition :

1. **Les règles « portables » ne le sont pas encore au niveau du vocabulaire.**
   Les cinq vues de `ape.ttl` reconnaissent un agent par
   `"OpenClawImport::OpenClawAgent"` et son attribut `id`, la délégation par
   `OpenClawImport::DelegationRule` / `DelegationPolicy`, et l'exec par
   `toolId "exec"`, `ToolOrigin::builtin` et les valeurs OpenClaw de
   `ExecutionPosture` (`gateway`, `full`, `off`). La logique des trois règles
   est générale (un graphe d'agents, de délégations et d'entrées) ; leurs vues
   d'entrée ne le sont pas.
2. **Le viewer est construit à partir du snapshot, pas du SysML.** Les vues
   (`systemView`, `toolsView`, `schedulesView` dans `views.ts`) prennent un
   `Snapshot`. Un modèle écrit par un agent n'a pas de snapshot : aujourd'hui,
   il aurait des constats mais aucune carte sur laquelle les poser.

Sur Assembly : ce dépôt n'en contient que la bibliothèque, copiée de
`apps/live-builder/models/` (commit `02657dae`). Le nom suggère un constructeur
qui écrit du SysML, mais je n'ai pas pu le lire depuis cette session. Ce qui est
dit plus bas d'Assembly est donc une piste à vérifier, pas un acquis.

## 1. Intégration en local

### Les trois options

**A. Application seule, déterministe.** Ce qui existe : collecteur, émetteur,
Toolkit, règles, viewer. Aucun LLM. Couvre OpenClaw, et tout modèle SysML qu'un
humain écrit contre `OpenClawImport`. Ne couvre aucun autre système sans qu'on
écrive un collecteur par système.

**B. CLI + fichier d'instructions (`SKILL.md` / `AGENTS.md`).** Un binaire
`casys-doctor` qui ne fait que du déterministe, et un fichier qui dit à l'agent
quoi lire, quoi écrire et quelle commande lancer. L'agent fait la partie non
déterministe avec ses propres outils de lecture et son propre LLM.

**C. Serveur MCP local en stdio.** Les mêmes fonctions exposées comme outils
typés (`doctor_contract`, `doctor_inventory`, `doctor_check`,
`doctor_explain`).

### Ce que chaque option couvre réellement

À revérifier au moment de construire : ces intégrations bougent vite.

| Agent                               | Lance un CLI (shell)        | Lit `SKILL.md`                     | Lit `AGENTS.md`              | MCP stdio |
| ----------------------------------- | --------------------------- | ---------------------------------- | ---------------------------- | --------- |
| Claude Code                         | oui                         | oui (`.claude/skills/`, plugins)   | via `CLAUDE.md` (`@AGENTS.md`) | oui     |
| Codex CLI                           | oui                         | oui, format Agent Skills (à vérifier selon version) | oui (natif)  | oui       |
| Hermes Agent                        | oui                         | oui, format Agent Skills (à vérifier) | à vérifier                | oui       |
| Cursor, Gemini CLI, OpenCode…       | oui                         | variable                           | oui pour la plupart          | oui       |
| Claude Desktop, Cowork (sans shell) | non                         | skills selon l'offre               | non                          | **oui**   |
| OpenClaw                            | déjà couvert par le plugin  | oui (skills OpenClaw)              | oui                          | oui       |

Lecture : **le CLI couvre tout agent qui a un shell**, ce qui est le cas de
tous les agents de code. Le fichier d'instructions est la partie la moins
portable (emplacement, format, chargement) mais aussi la moins chère : c'est du
texte, et il peut exister en deux copies (`SKILL.md` et une section
`AGENTS.md`) générées depuis la même source. **MCP n'ajoute réellement que les
agents sans shell** (Desktop, Cowork) et des erreurs structurées plutôt que du
texte. Il a un coût fixe : les schémas d'outils sont chargés dans le contexte à
chaque session, que le Doctor serve ou non.

### Recommandation

1. **D'abord B**, sur la base de A : le binaire déterministe et un `SKILL.md`.
   C'est presque ce qui existe (`diagnose` imprime déjà du JSON canonique).
   C'est le chemin le plus court vers la preuve de l'idée, et il couvre
   Claude Code, Codex et Hermes.
2. **Ensuite C**, comme enveloppe mince des mêmes fonctions, quand on vise
   Claude Desktop/Cowork ou l'application de bureau (qui pourra embarquer le
   serveur MCP). Pas de logique propre au serveur MCP : il appelle le même cœur
   que le CLI, sinon les deux divergeront.
3. **A reste le socle** et le produit pour OpenClaw ; il n'est pas remplacé.

Ce qui serait trop lourd : écrire et maintenir une intégration spécifique par
agent (extension VS Code, plugin Codex, plugin Hermes…). Le couple CLI + skill
évite ce travail.

## 2. Rétro-ingénierie par l'agent

### 2.1 Qui fait quoi

Il y a deux cibles différentes, qu'il ne faut pas confondre :

- **Le harnais de l'agent lui-même** (Claude Code, Codex : permissions, MCP,
  hooks, sous-agents). Ses formats de configuration sont documentés et peu
  nombreux. Un collecteur déterministe y est plus fiable et moins cher qu'un
  LLM, exactement comme pour OpenClaw.
- **Le système agentique que l'utilisateur construit** (une application
  LangGraph, un pipeline maison, des agents définis dans du code). Il n'y a
  pas de format, donc pas de collecteur possible : c'est là que la
  rétro-ingénierie par l'agent a un sens.

Partage proposé :

| Étape                                                        | Qui                | Pourquoi                                                                                   |
| ------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------ |
| Inventaire des fichiers candidats et des signatures (grep)   | **déterministe**   | Sert de liste de contrôle contre l'omission, et évite à l'agent d'explorer à l'aveugle.     |
| Lecture du code et rédaction des **faits**, avec citations   | **agent**          | Seul le LLM sait lire une construction de graphe d'agents dans du code arbitraire.          |
| Vérification des citations, de la couverture, du schéma      | **déterministe**   | C'est ce qui rend l'écriture « validée ».                                                   |
| Faits → SysML                                                | **déterministe**   | Même principe que l'émetteur actuel : l'agent n'écrit pas la syntaxe.                       |
| Compilation Toolkit, projection RDF, règles                  | **déterministe**   | Existe.                                                                                      |
| Interprétation des constats pour l'utilisateur               | agent, facultatif  | L'agent explique et propose des corrections ; il ne change pas les constats.                |

**Recommandation forte : l'agent écrit des faits en JSON, pas du SysML.**
Raisons :

- Le Toolkit valide la syntaxe et le typage, **pas le contrat des vues**. Un
  agent `OpenClawAgent` sans `attribute :>> id` compile, n'entre pas dans la
  vue `agents`, et ne produit **aucun constat** : un faux « propre ». Avec un
  schéma JSON, l'absence d'`id` est une erreur nommée.
- Un JSON est deux à trois fois plus court que le SysML équivalent
  (redéfinitions `:>>`, `part def` par agent, paquets), donc moins de tokens à
  écrire et à corriger.
- Les erreurs JSON se localisent par pointeur (`/agents/2/grants/1`), que
  l'agent sait corriger sans relire le fichier.
- L'émetteur garde la maîtrise des noms SysML, des identifiants stables
  (`agent:<id>`) et de la forme exacte attendue par les règles.

Le SysML direct reste possible en « mode expert » (c'est ce que fait déjà
`ape-trial.sysml`), pour les utilisateurs d'Assembly. Il passe alors par les
mêmes contrôles de contrat (§2.3), en SHACL sur le graphe.

### 2.2 Le contrat du modèle

Aujourd'hui, le contrat implicite est : `OpenClawImport` (dans `library.ts`)
plus les formes que lisent les cinq vues APE. Pour un système quelconque il
faut un vocabulaire neutre. Proposition, à placer dans un paquet
`AgentSystem` (nom provisoire) qui spécialise la bibliothèque Assembly comme
`OpenClawImport` le fait déjà (SPEC §13, décision 2) :

```sysml
package AgentSystem {
    private import ScalarValues::*;
    part def Agent :> AssemblyCore::SoftwareOperator {
        attribute id : String;
        attribute model : String [0..1];
    }
    enum def ToolKind { builtin; mcp; cli; http; code; }
    part def Tool :> AssemblyCore::ExecutableCapability {
        attribute toolId : String; attribute kind : ToolKind;
        attribute provider : String [0..1];
        attribute runsCommands : Boolean [0..1];   // exécute des commandes arbitraires
    }
    item def ToolGrant { ref tool : Tool; attribute layer : String [0..1]; }
    part def ExecutionBoundary {
        attribute onHost : Boolean [0..1];          // absent = inconnu
        attribute approvalRequired : Boolean [0..1];
        attribute sandboxed : Boolean [0..1];
    }
    connection def Delegation { end fromAgent : Agent; end toAgent : Agent; }
    part def MessagingPolicy {
        attribute enabled : Boolean; attribute wildcardTargets : Boolean;
        ref part targets : Agent [0..*];
    }
    enum def EntryKind { human; channel; schedule; webhook; api; }
    part def Entry { attribute kind : EntryKind; ref part targetAgent : Agent [0..1]; }
    part def ScheduledEntry :> AssemblyCases::CaseType { ref part targetAgent : Agent [0..1]; }
    attribute def Evidence { attribute file : String; attribute lines : String; attribute sha256 : String; }
}
```

Puis `OpenClawAgent :> AgentSystem::Agent`, `DelegationRule :>
AgentSystem::Delegation`, etc., et les vues APE réécrites sur les noms
`AgentSystem::*` en suivant la spécialisation de façon transitive (la vue
`agents` le fait déjà pour le type d'agent ; les vues `delegation`, `messaging`,
`entries` comparent aujourd'hui un `qualifiedName` exact et devront suivre
`ownedSpecialization/general*`). La vue `exec` deviendrait :
`unapprovedHostExec = onHost ∧ ¬approvalRequired` sur un outil
`runsCommands`, la traduction depuis `gateway/full/off` restant du côté
d'OpenClaw. Point important à garder : **inconnu n'est pas faux**. La vue
actuelle n'émet aucun booléen quand la posture est inconnue (`ape/README.md`,
« an unknown posture emits neither boolean ») ; le schéma JSON doit permettre
`null`, et le `SKILL.md` doit dire à l'agent de l'utiliser plutôt que de
deviner.

Le fichier de faits correspondant (extrait) :

```json
{
  "schema": "casys-agent-facts/1",
  "root": ".",
  "agents": [
    { "id": "planner", "model": "claude-sonnet",
      "grants": [{ "tool": "shell", "evidence": [{ "file": "app/agents.py", "lines": "40-44", "quote": "tools=[search, shell]" }] }],
      "execution": { "onHost": true, "approvalRequired": null, "sandboxed": false,
                     "evidence": [{ "file": "app/tools/shell.py", "lines": "12-15", "quote": "subprocess.run(cmd, shell=True)" }] } }
  ],
  "tools": [{ "id": "shell", "kind": "code", "runsCommands": true, "evidence": [ ... ] }],
  "delegations": [{ "from": "planner", "to": "coder", "evidence": [ ... ] }],
  "entries": [{ "kind": "webhook", "target": "planner", "evidence": [ ... ] }],
  "reviewed": [{ "hit": "inv:17", "reason": "test only" }]
}
```

À construire : le paquet neutre, le schéma JSON, l'émetteur faits → SysML,
la réécriture des vues APE, la mise à jour des goldens et du test de parité
OpenSysML (`test:opensysml`). C'est le chantier technique principal de la V1.

### 2.3 La boucle de validation, et des erreurs qui la rendent courte

```
casys-doctor inventory .          → inventory.json (fichiers, empreintes, signatures)
agent lit, écrit facts.json
casys-doctor check facts.json     → erreurs compactes, ou constats
agent corrige uniquement les pointeurs signalés ; recommence (2-3 tours visés)
```

`check` enchaîne cinq contrôles, et **s'arrête au premier étage en échec** pour
ne pas noyer l'agent :

1. **Schéma** (JSON Schema) : pointeur, attendu, reçu.
2. **Références internes** : un `to` de délégation qui ne nomme aucun agent.
   L'actuel `UNRESOLVED_AGENT_REFERENCE` (G1) fait déjà ce travail côté SysML.
3. **Citations** : le fichier existe sous `root`, les lignes existent, la
   citation (normalisée : espaces) figure dans ces lignes. L'empreinte SHA-256
   du fichier est enregistrée, comme l'export le fait déjà pour les fichiers
   d'instructions.
4. **Couverture** : chaque signature de l'inventaire est citée par un fait ou
   listée dans `reviewed` avec une raison.
5. **Émission, compilation Toolkit, contrat, règles.** Une erreur du Toolkit à
   ce stade est un bug de l'émetteur, pas de l'agent : elle ne doit jamais lui
   être renvoyée telle quelle.

Forme des messages : une ligne par erreur, au plus dix, triées, avec ce qu'il
faut faire. Jamais de recopie du modèle.

```
E CITATION_NOT_FOUND /agents/0/grants/0/evidence/0  "tools=[search, shell]" absent de app/agents.py:40-44 ; la ligne 42 contient "tools=[search, run_shell]".
E UNKNOWN_AGENT      /delegations/0/to  "coder" ; agents connus : planner, reviewer.
W COVERAGE_UNREVIEWED inv:9 app/tools/shell.py:12 subprocess.run(...) : citer dans un fait ou ajouter à "reviewed".
3 erreurs, 1 avertissement. Corriger seulement ces pointeurs.
```

Une fois les contrôles passés, la sortie est le résumé des constats (code,
sujet, principe, une ligne), pas le JSON complet : celui-ci est écrit sur
disque pour le viewer.

### 2.4 Ordre de grandeur des tokens

Repères mesurés dans le dépôt : `ape-trial.sysml`, 5 agents, ~4 Ko, soit
~1 200 tokens ; `test/golden/OpenClawInstance.sysml`, ~135 Ko, soit ~35 à
40 000 tokens, mais surtout des empreintes et des attributs que l'agent n'aura
pas à écrire. Estimation pour un système de 5 à 15 agents :

| Poste                                             | Tokens (estimation)                       |
| ------------------------------------------------- | ----------------------------------------- |
| `SKILL.md` + contrat résumé                       | 2 000 à 3 000, une fois                   |
| Inventaire (sortie compacte)                      | 1 000 à 3 000                             |
| Lecture ciblée des fichiers désignés              | 10 000 à 40 000 (dépend du code)          |
| Écriture de `facts.json`                          | 2 000 à 6 000                             |
| Boucle de correction (2-3 tours)                  | 1 000 à 3 000                             |
| **Total d'un premier diagnostic**                 | **~15 000 à 55 000**                      |
| Re-diagnostic (seuls les faits périmés)           | quelques milliers                          |

Écrire du SysML directement doublerait au moins le poste d'écriture et
allongerait la boucle (erreurs de syntaxe, redéfinitions). Le levier principal
est la lecture : l'inventaire désigne les fichiers et les lignes, l'agent n'a
pas à parcourir le dépôt. Second levier : garder `facts.json` versionné dans le
dépôt de l'utilisateur ; `casys-doctor stale` liste les faits dont un fichier
cité a changé d'empreinte, et l'agent ne relit que ceux-là.

### 2.5 Ni invention, ni omission

**Contre l'invention** (un droit ou un lien qui n'existe pas) : toute
affirmation positive (une permission, une délégation, une entrée,
`onHost: true`) doit porter au moins une citation vérifiée. Sans citation, le
fait est refusé, ou accepté seulement s'il est marqué `"asserted": true` et
alors affiché comme tel. La citation prouve que le texte existe, **pas** que
l'agent l'a bien compris (un outil déclaré mais jamais branché) : c'est une
limite à dire, pas à cacher.

**Contre l'omission** : l'inventaire déterministe (motifs de type
`subprocess`, `child_process`, `exec(`, `tools=`, déclarations MCP, routes
HTTP, cron, appels d'un agent par un autre, selon le langage) est la liste
de contrôle. Une signature ni citée ni revue donne `COVERAGE_UNREVIEWED`. Un
grep ne voit pas tout (enregistrement dynamique d'outils, configuration
chargée à l'exécution) : la couverture est **bornée par l'inventaire**, et le
rapport doit le dire.

**Ce qui reste vrai d'un constat.** Les règles portent déjà la distinction
utile : `ape:finding "present"` ou `"absent"`.

| Provenance du modèle       | Constat « présent » (cycle, élargissement de droits, exec sans approbation)                                 | Constat « absent » (`APE_UNREACHABLE_OPERATOR`)                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Collecteur (OpenClaw)      | Vrai de la configuration enregistrée, selon la sémantique documentée (diagnostics.md, introduction).        | Vrai de la configuration enregistrée.                                              |
| Agent, faits cités         | Vrai **si** les lignes citées ont le sens que l'agent leur donne. Chaque lien du constat est vérifiable.     | Fragile : une omission suffit à le produire. Rétrogradé en « à confirmer » tant que la couverture n'est pas complète. |
| Agent, faits affirmés      | Hypothèse à vérifier.                                                                                        | Hypothèse à vérifier.                                                              |

Concrètement : chaque constat reçoit un champ `provenance`
(`collector`, `agent-cited`, `agent-asserted`) et la liste des faits dont il
dépend (les champs `related` et `subject` existent déjà ; il faut y ajouter
les citations). Le Doctor affiche la provenance. **Un diagnostic produit par
un agent n'est jamais présenté comme un audit** : c'est une lecture
structurée, reproductible à faits égaux (les étapes après `facts.json` sont
pures), dont chaque affirmation se vérifie en un clic.

## 3. Portabilité des règles

Classement d'après la sémantique documentée de chaque code
(`docs/diagnostics.md`), pas d'après une relecture de chaque requête :

| Règle                                   | Portable telle quelle | Généralisable                             | Propre à OpenClaw |
| --------------------------------------- | :-------------------: | :---------------------------------------: | :---------------: |
| `APE_LINK_CYCLE` (B3)                   | logique oui, vues non | renommer les vues                         |                   |
| `APE_GRANT_WIDENS_PARENT` (A4)          | logique oui, vues non | vue `exec` neutre (`onHost`, `approvalRequired`) |           |
| `APE_UNREACHABLE_OPERATOR`              | logique oui, vues non | vue `entries` neutre (`Entry`, `EntryKind`) |                 |
| `EXEC_WITHOUT_APPROVAL` (A3, 2.1)       |                       | **oui**, cas particulier de la vue `exec` |                   |
| `AGENT_WITHOUT_SANDBOX` (A3)            |                       | **oui** (`sandboxed`)                     |                   |
| `EXEC_ALLOWLIST_WILDCARD` (A3)          |                       | oui (liste de commandes avec `*`)         |                   |
| `AGENT_TO_AGENT_WILDCARD` (A3)          |                       | **oui** (`wildcardTargets`)               |                   |
| `PLAINTEXT_CREDENTIAL` (C1)             |                       | oui, mais exige des citations de fichiers de secrets : à traiter avec soin (§4.4) | |
| `UNRESOLVED_AGENT_REFERENCE` (G1)       |                       | **oui** (intégrité du modèle)             |                   |
| `PROSE_NOT_ENFORCED` (G5)               |                       | **oui, et très parlant** : « `CLAUDE.md` interdit X, la configuration le permet » | |
| `MEMORY_SESSIONS_INDEXED`, `MEMORY_REMOTE_EMBEDDINGS` (C1) |    | oui, comme « données envoyées à un tiers » |                  |
| `MCP_SANDBOX_GATE` (A7)                 |                       | partiellement                             | en partie         |
| `EXTERNAL_BIND_SOURCES`                 |                       |                                           | oui (binds Docker du bac à sable OpenClaw) |
| `SAFE_BIN_INTERPRETER_UNPROFILED` (A3)  |                       |                                           | oui (`safeBins`)  |
| `BINDING_ACCOUNT_UNAVAILABLE`, `UNRESOLVED_BINDING_REFERENCE` |  |                                           | oui (comptes de canaux) |
| `WORKSPACE_UNVERSIONED`, `MALFORMED_SKILLS_DIR`, `MANUAL_CONFIG_BACKUPS` |  |                                  | oui               |

Ce qu'il faut généraliser, par ordre d'intérêt :

1. **Les cinq vues APE**, sur `AgentSystem::*` (§2.2). Sans cela, aucune règle
   ne tourne sur un modèle qui n'est pas OpenClaw.
2. **Un jeu de règles « harnais »** dérivé des règles OpenClaw : exec sans
   approbation, absence de bac à sable, jokers d'exec et de messagerie,
   référence non résolue, consigne non appliquée. Elles seraient écrites une
   fois sur le vocabulaire neutre ; OpenClaw y accède par spécialisation et
   garde ses règles propres dans `openclaw.ttl`.
3. **Des règles de contrat** (`MODEL_CONTRACT_*`) : au moins un agent dans la
   vue `agents`, chaque `ToolGrant` a un outil, chaque `Delegation` a ses deux
   bouts. Elles éliminent le faux « propre » décrit en §2.1.

`PROSE_NOT_ENFORCED` mérite une note : chez OpenClaw, il croise une règle
inférée par `--infer` avec la configuration. Chez un agent de code, l'agent
de l'utilisateur fait cette lecture lui-même (il lit `CLAUDE.md`), avec la
même règle de prudence qu'aujourd'hui : ce sont des propositions séparées,
jamais admises automatiquement (SPEC §13, décision 11).

## 4. Produit

### 4.1 Application de bureau ou CLI

**CLI d'abord, par `deno compile`**, en un seul binaire par plateforme, qui
embarque le Toolkit (~20 Mo, déjà vérifié par SHA-256 à chaque chargement),
Oxigraph (wasm), les règles et le viewer. À vérifier dans un prototype : le
chargement du wasm du Toolkit dans un worker depuis un binaire compilé
(`--include` des fichiers), et la taille finale (le runtime Deno seul pèse
plusieurs dizaines de Mo).

**Application de bureau ensuite, et seulement si la licence ou le public
l'exigent.** Le viewer est déjà une page statique qui s'ouvre en `file://` :
c'est déjà le tableau de bord. Une enveloppe Tauri avec le CLI en « sidecar »
apporterait le choix du dossier, l'historique des versions, l'activation de
licence et un serveur MCP embarqué. Elle coûte des builds signés par
plateforme (notarisation macOS, signature Windows) et une mise à jour à
maintenir. Éviter un serveur HTTP local pour remplacer `file://` : il ajoute
une surface d'attaque sans rien apporter au diagnostic.

### 4.2 Tableau de bord

Ce qui existe : Overview, System, Reach, Tools, Scheduled tasks, Behaviour,
avec le Doctor, l'inspecteur et les changements. Tout est construit à partir du
snapshot OpenClaw.

À construire pour un modèle venu d'un agent :

- **Une vue Reach générique**, construite non pas du snapshot mais des graphes
  RDF des vues APE (`agents`, `delegation`, `messaging`, `entries`, `exec`) :
  ils contiennent exactement ce qu'elle montre. C'est la vue la moins chère et
  la plus utile, car les trois règles APE y vivent (le cycle s'y allume déjà
  depuis le Doctor).
- **Une vue System simplifiée** (agents, outils accordés, entrées).
- **Les constats posés sur la carte** : un point rouge (losange pour une
  erreur, triangle pour un avertissement, comme le Doctor actuel) sur
  l'élément `subject`, avec la provenance (§2.5) et, au clic, les citations
  qui le fondent.

Trop lourd pour une V1 : les vues Tools (matrice d'allocation), Scheduled
tasks et Behaviour sur des modèles arbitraires. Elles dépendent de détails que
l'agent ne fournira pas de façon fiable.

### 4.3 Licence

État : tout est MIT (`LICENSE`) ; le Toolkit est Apache 2.0, sa bibliothèque
standard SysML et elkjs EPL 2.0. Ces licences permettent une distribution
commerciale, avec leurs notices (déjà rassemblées dans
`plugin/THIRD_PARTY_NOTICES.md`).

Recommandation : **garder ouverts le moteur, le vocabulaire et les règles**.
La valeur d'un diagnostic tient à ce qu'on peut le vérifier ; une règle
fermée affaiblit l'argument « déterministe et vérifiable », qui est
précisément l'argument du conseil Casys. Faire payer ce qui ne touche pas la
vérité du constat : l'application de bureau, le rapport exportable (PDF
d'audit, comparaison de versions), des paquets de règles par cadre (LangGraph,
CrewAI…) si la demande existe, et surtout la formation et le conseil. Si une
licence est vendue, la vérifier hors ligne (fichier signé, vérification
Ed25519 locale), sans appel réseau, pour rester local. Le code déjà publié
sous MIT le reste ; un changement de licence ne vaudrait que pour du code
nouveau (vérifier les contributions externes avant, `CONTRIBUTING.md`).

### 4.4 Confidentialité

L'export OpenClaw garde la structure et jamais les secrets (README,
« Privacy » ; deux couches : projection par liste blanche puis
`@logtape/redaction`). Il contient néanmoins des **noms** (agents, outils,
comptes) et des **droits** : c'est une carte d'attaque. À conserver et à
étendre :

- **Le Doctor n'envoie rien.** Aucun appel réseau, comme aujourd'hui. Le seul
  LLM est celui de l'agent de l'utilisateur, qui lit déjà ce code : le Doctor
  n'ajoute aucun destinataire (même logique que `--infer`, SPEC §13,
  décision 11).
- **Les citations sont courtes et filtrées.** `facts.json` contient des
  extraits de code : appliquer le même masquage que pour l'inférence
  (`SENSITIVE` dans `src/adapters/out/llm/inference.ts` : e-mails, JWT,
  chaînes longues), refuser une citation qui ressemble à un secret, et pour
  `PLAINTEXT_CREDENTIAL` ne garder que le chemin et le nom de variable.
- **Un mode de partage pseudonymisé** (`casys-doctor share`) : noms remplacés
  par des pseudonymes stables, citations retirées, empreintes conservées.
  C'est ce qu'un client remettrait à un consultant Casys.

### 4.5 Lien avec casys.ai

- **Fiches des principes.** Les codes sont déjà dans chaque constat
  (`principle`, `pattern`) et affichés en infobulle. Ajouter un lien vers la
  fiche, ouvert dans le navigateur au clic seulement ; embarquer dans l'outil
  un résumé de deux lignes par principe pour que la page reste lisible hors
  ligne.
- **Questionnaire d'auto-évaluation.** Le Doctor voit la structure, pas
  l'organisation (qui supervise, qui valide une mise en production). Les deux
  se complètent : rattacher chaque question du questionnaire aux codes qui y
  répondent structurellement, pré-remplir ces réponses depuis le dernier
  diagnostic, et laisser les autres à l'utilisateur. Les réponses restent
  locales ; un résumé s'exporte pour un rendez-vous.

## 5. Périmètre et étapes

### Étape 0 : preuve de la boucle, sans code nouveau

Un `SKILL.md` qui demande à l'agent d'écrire un `.sysml` contre
`OpenClawImport` (comme `ape-trial.sysml`) dans un dossier avec
`OpenClawImport.sysml` et la bibliothèque Assembly, puis de lancer
`deno task diagnose --export DIR --toolkit plugin/toolkit`. Essayé sur deux ou
trois systèmes réels (dont un de Casys).

- **Prouve** : qu'un agent sait extraire agents, délégations et exec d'un
  code réel, et que les trois règles APE y trouvent quelque chose ; mesure les
  tokens et le nombre de tours réels.
- **Coûte** : quelques jours. Limite assumée : vocabulaire OpenClaw détourné,
  pas de citations, pas de carte.

### V1 livrable : Doctor CLI + skill, pour tout agent avec un shell

- Vocabulaire `AgentSystem`, `OpenClawImport` qui le spécialise, vues APE
  réécrites, goldens et parité OpenSysML à jour.
- Schéma `casys-agent-facts/1`, `inventory`, `check` (cinq étages, erreurs
  compactes), émetteur faits → SysML, règles de contrat.
- Cinq ou six règles « harnais » généralisées (§3, point 2).
- Provenance sur chaque constat ; vue Reach générique ; points sur la carte.
- Binaire `deno compile` pour macOS arm64 et Linux amd64 (ceux que le dépôt
  supporte déjà pour ses tests), Windows ensuite.
- `SKILL.md` et section `AGENTS.md` générés depuis une même source.

- **Prouve** : qu'un utilisateur de Claude Code, Codex ou Hermes obtient, en
  une session et quelques dizaines de milliers de tokens, un diagnostic dont
  chaque constat se vérifie ; qu'OpenClaw n'a rien perdu.
- **Coûte** : estimation de l'ordre de 4 à 6 semaines pour une personne qui
  connaît le code. Le gros est la généralisation des vues (et ses goldens),
  puis `check`.

### Étapes suivantes

| Étape                                                       | Prouve                                                                    | Coûte (estimation)                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------- |
| Collecteurs déterministes Claude Code et Codex (permissions, MCP, hooks, sous-agents) | Que le harnais lui-même se diagnostique sans LLM, avec la confiance d'un collecteur | 1 à 2 semaines par harnais, puis suivi de leurs formats |
| Serveur MCP stdio sur le même cœur                          | Couverture de Claude Desktop/Cowork ; erreurs structurées                 | ~1 semaine                            |
| Re-diagnostic incrémental (`stale`)                         | Que le coût récurrent tombe à quelques milliers de tokens                 | ~1 semaine                            |
| Liens casys.ai, résumés embarqués, mode `share`             | Le passage du diagnostic au conseil                                       | ~1 semaine, hors rédaction des fiches |
| Application de bureau (Tauri + sidecar), licence hors ligne | Un produit installable et vendable hors des développeurs                  | 3 à 5 semaines, puis signature et mises à jour à maintenir |
| Questionnaire relié aux codes                               | Une auto-évaluation qui mêle structure et organisation                    | Dépend du questionnaire               |
| Aller-retour avec Assembly (ouvrir `facts` ou le SysML dans Assembly) | Le chemin du diagnostic à la reconstruction                    | À évaluer après lecture d'Assembly    |

### Ce qui serait trop lourd, et à ne pas faire maintenant

- Faire écrire à l'agent le comportement complet (flux d'actions,
  exigences) d'un système arbitraire : coûteux en tokens et invérifiable.
- Un collecteur par cadre d'agents : la liste ne finit jamais ; l'inventaire
  plus l'agent couvrent la longue traîne.
- Toutes les vues du viewer sur des modèles arbitraires.
- Un tableau de bord d'équipe ou une synchronisation en ligne : contraire au
  « tout local ».
- Un LLM qui juge les constats : il casserait la reproductibilité qui fait la
  valeur du Doctor.

## Résumé

1. Socle existant : collecteur, émetteur, Toolkit, règles SHACL et `diagnose` ; un modèle écrit à la main (`ape-trial.sysml`) passe déjà.
2. Deux limites : les vues APE lisent le vocabulaire `OpenClawImport`, et le viewer se construit depuis le snapshot.
3. Intégration : d'abord CLI déterministe + `SKILL.md` (tout agent avec un shell), puis MCP stdio sur le même cœur pour Desktop/Cowork.
4. L'agent écrit des faits JSON cités ; inventaire, vérification des citations, couverture, émission SysML, compilation et règles restent déterministes.
5. Erreurs compactes par pointeur, arrêt au premier étage en échec : 2-3 tours, ~15 à 55 k tokens au premier diagnostic, quelques milliers ensuite.
6. Chaque constat porte sa provenance ; un constat « absent » reste à confirmer tant que la couverture est incomplète ; jamais présenté comme un audit.
7. Portabilité : généraliser les cinq vues APE sur un paquet neutre `AgentSystem`, puis cinq ou six règles OpenClaw (exec, bac à sable, jokers, G1, G5).
8. Produit : binaire `deno compile` d'abord, Tauri plus tard ; le viewer reste le tableau de bord, avec une vue Reach générique et des points sur la carte.
9. Licence : moteur et règles ouverts, vendre l'application, les rapports et le conseil ; licence vérifiée hors ligne ; mode de partage pseudonymisé.
10. Étape 0 en quelques jours, V1 en ~4 à 6 semaines ; trop lourd : comportement complet, collecteur par cadre, synchronisation en ligne.
