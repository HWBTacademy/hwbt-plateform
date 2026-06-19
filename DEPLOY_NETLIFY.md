# HWBT Academy - Netlify

## Ce que contient ce dossier

- `index.html` : la plateforme HWBT.
- `netlify/functions/state.mts` : l'API `/api/state` qui sauvegarde joueurs, seances, evaluations, photos, retours et priorites.
- `netlify.toml` : configuration Netlify.
- `package.json` : dependances Netlify Functions + Blobs.

## Reglages Netlify

Dans Netlify, utilise ces reglages:

- Build command: vide
- Publish directory: `.`
- Functions directory: `netlify/functions`

Netlify doit aussi installer les dependances de `package.json`.

## Methode conseillee: GitHub + Netlify

Pour garder la memoire en ligne, Netlify doit deployer aussi la fonction `/api/state`.
La methode la plus propre est donc GitHub connecte a Netlify.

1. Cree un repo GitHub pour HWBT Academy.
2. Envoie tout ce dossier dans ce repo.
3. Dans Netlify, clique `Add new site` puis `Import an existing project`.
4. Choisis GitHub puis le repo HWBT.
5. Mets les reglages ci-dessus.
6. Clique `Deploy`.
7. Chaque changement pousse sur GitHub redeploie le site sans effacer les donnees.

## Alternative: Netlify CLI

Si tu as Node.js installe sur ton PC:

1. Ouvre PowerShell dans `C:\Users\demar\OneDrive\Documents\hwbt plateform`.
2. Lance `npm install`.
3. Lance `npx netlify login`.
4. Lance `npx netlify deploy --prod`.

## A eviter

Ne fais pas un simple drag-and-drop de `index.html` seul dans Netlify.
Le site peut s'afficher, mais la memoire en ligne ne fonctionnera pas car la fonction `/api/state` ne sera pas deployee.

## Test de la memoire

1. Ouvre l'URL Netlify.
2. Connecte-toi en coach : `coach / hwbt`.
3. Cree un joueur ou modifie une priorite.
4. Attends 1 seconde.
5. Recharge la page.
6. La modification doit rester.
7. Ouvre le site sur un autre appareil avec la meme URL Netlify.
8. La modification doit aussi apparaitre.

## Comment fonctionne la sauvegarde

- Le navigateur garde une copie locale de secours dans `localStorage`.
- En ligne, chaque changement est envoye vers `/api/state`.
- `/api/state` sauvegarde dans Netlify Blobs:
  - `state/current.json` : etat actuel de la plateforme.
  - `state/backups/YYYY-MM-DD.json` : sauvegarde journaliere.
- Tu peux redeployer une nouvelle version du site sans effacer les joueurs, seances et evaluations deja crees.

## Important

Ne redeploie pas uniquement `index.html` si tu veux la memoire en ligne. Il faut redeployer tout le dossier avec:

- `index.html`
- `netlify.toml`
- `package.json`
- `netlify/functions/state.mts`
