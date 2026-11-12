# HWBT Marketing Agent — préparation

Le cœur de l'agent est dans `netlify/functions/_lib/marketing-agent.mts`. Il prépare un briefing, un brouillon ou une révision ; il ne publie pas et ne modifie pas l'agenda. L'endpoint privé `POST /api/marketing-agent` est réservé aux coachs authentifiés et exige le jeton CSRF existant. Il lit l'état Netlify et ne transmet au modèle que les dates, heures et lieux des activités futures ; les fiches et noms de joueurs ne sont pas inclus automatiquement. Les instructions saisies librement sont transmises au service IA : ne pas y entrer de données confidentielles inutilement.

Exemple de corps JSON : `{"mode":"brief","request":"Prépare le plan de contenu du jour"}`. Les modes sont `brief`, `draft`, `revise` ; pour une révision, fournir aussi `draft` et les instructions dans `request`. Le résultat est une proposition structurée en statut `draft`, à valider par le coach. L'API ne sauvegarde pas la proposition ni les validations ; le futur client doit le faire via le stockage existant avec contrôle de version.

Configuration serveur à fournir par l'administrateur : `OPENAI_API_KEY` et `HWBT_MARKETING_MODEL` (un modèle compatible Responses et Structured Outputs). Ne jamais placer la clé dans le navigateur, Git ou ce fichier. L'absence de configuration renvoie une erreur explicite. `store: false` est transmis à l'API.

Tests locaux : `node --test tests/marketing-agent.test.mjs`. Ils utilisent un service simulé, ne transmettent aucune donnée réelle et ne valident pas l'accès à un fournisseur réel.

L’interface locale appelle désormais cet endpoint et conserve les propositions dans l’état existant. Les images et noms doivent être ajoutés volontairement après vérification.

Pas encore inclus : consentement et photos/vidéos, analyse Metricool, historique des révisions, programmation quotidienne, notifications et publication. Aucun déploiement n'est effectué. Une exécution planifiée devra accéder de manière sécurisée au stockage, gérer l'heure belge et le changement d'heure, les doublons, les erreurs et les notifications ; ne pas réutiliser une session interactive ou une clé en clair. Vérifier l'autorisation pour les images de mineurs avant toute diffusion.

## Briefing matinal préparé

`marketing-morning.mts` est une fonction planifiée, désactivée par défaut tant que `HWBT_AUTOBRIEF_ENABLED` n'est pas exactement `true`. Elle est programmée à 06 h et 07 h UTC et ne travaille qu'à 08 h à Bruxelles, été comme hiver. Elle lit l'agenda enregistré, appelle l'agent, puis conserve un brouillon distinct par date. Une écriture conditionnelle limite les doublons. `GET /api/marketing-briefing` permet au coach authentifié de lire le briefing du jour dans l'interface. Il n'y a pas encore de notification active : le coach doit ouvrir la plateforme. Les erreurs sont journalisées sans données personnelles, et un échec ne produit aucun briefing.

Avant activation : configurer le modèle et la clé serveur, vérifier les limites/coûts, tester sur un environnement isolé, décider du canal de notification, puis activer explicitement. Les tests utilisent des simulations et ne prouvent ni la qualité réelle du modèle ni la réception d'une notification. La récupération automatique des statistiques Meta/Metricool et l'analyse des médias ne sont pas connectées.
