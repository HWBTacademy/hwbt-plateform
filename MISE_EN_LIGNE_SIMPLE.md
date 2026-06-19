# HWBT Academy - Mise en ligne simple

## Le systeme le plus simple

Utilise ce circuit:

`Codex modifie l'app` -> `GitHub garde le code` -> `Netlify met le site en ligne` -> `Netlify Blobs garde les donnees`

Comme ca:

- tu peux faire evoluer l'app sans perdre les joueurs;
- les joueurs, seances, photos, evaluations et retours restent sauvegardes;
- Netlify remet le site a jour automatiquement quand le code change.

## Une seule fois: connecter le site

### 1. Creer le repo GitHub

1. Va sur GitHub.
2. Cree un nouveau repository, par exemple `hwbt-academy`.
3. Mets tout le contenu de ce dossier dedans:

`C:\Users\demar\OneDrive\Documents\hwbt plateform`

Il faut envoyer ces fichiers:

- `index.html`
- `netlify.toml`
- `package.json`
- `netlify/functions/state.mts`
- `.gitignore`
- les fichiers `.md` d'aide

### 2. Connecter GitHub a Netlify

1. Va sur Netlify.
2. Clique `Add new site`.
3. Clique `Import an existing project`.
4. Choisis GitHub.
5. Choisis le repo `hwbt-academy`.
6. Mets ces reglages:

Build command: laisser vide

Publish directory:

`.`

Functions directory:

`netlify/functions`

7. Clique `Deploy`.

## Apres: comment mettre a jour le site

Quand tu me demandes une amelioration:

1. Je modifie les fichiers dans ce dossier.
2. Tu envoies les changements vers GitHub.
3. Netlify redeploie automatiquement.
4. Les joueurs et seances restent sauvegardes.

## Test important apres mise en ligne

1. Ouvre ton URL Netlify.
2. Connecte-toi en coach:

Utilisateur:

`coach`

Mot de passe:

`hwbt`

3. Cree un joueur test.
4. Attends 2 secondes.
5. Recharge la page.
6. Le joueur doit encore etre la.
7. Ouvre l'URL sur ton GSM.
8. Le joueur doit aussi etre visible.

Si c'est le cas, la memoire fonctionne.

## Ce qu'il ne faut pas faire

Ne mets pas seulement `hwbt_academy_v3.html` sur Netlify.

Pourquoi?

Parce que la memoire a besoin aussi de:

- `netlify/functions/state.mts`
- `package.json`
- `netlify.toml`

Sans ces fichiers, le site s'affiche, mais les donnees ne sont pas sauvegardees en ligne.

## Ou sont les donnees?

Les donnees ne sont pas dans `index.html`.

Elles sont dans Netlify Blobs:

- `state/current.json` = donnees actuelles
- `state/backups/YYYY-MM-DD.json` = sauvegarde du jour

Donc tu peux changer le design, les pages, les boutons et les workflows sans perdre les joueurs.
